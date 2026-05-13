import type { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { ApiResource, VoiceActorData } from '../api/types';
import { AppDatabase } from '../db/database';

type AudioUrlRow = {
  remote_url: string;
  voice_actor_id: number | null;
};

export type VoiceActorOption = {
  id: number;
  name: string;
  gender?: string;
  description?: string;
};

type ExpoAudio = {
  createAudioPlayer: typeof createAudioPlayer;
  setAudioModeAsync: typeof setAudioModeAsync;
};
type AudioPlayer = ReturnType<typeof createAudioPlayer>;

let activePlayer: AudioPlayer | null = null;
let playbackGeneration = 0;
const lastPlayedIndexBySubject = new Map<number, number>();
let audioModulePromise: Promise<ExpoAudio | null> | null = null;

async function loadAudioModule() {
  if (!audioModulePromise) {
    audioModulePromise = import('expo-audio')
      .then((module) => ({
        createAudioPlayer: module.createAudioPlayer,
        setAudioModeAsync: module.setAudioModeAsync,
      }))
      .catch(() => null);
  }

  return audioModulePromise;
}

export async function getVocabularyAudioUrls(db: AppDatabase, subjectId: number) {
  const rows = await db.getAllAsync<AudioUrlRow>(
    `SELECT remote_url, voice_actor_id
     FROM audio_urls
     WHERE subject_id = ?
     ORDER BY
       voice_actor_id IS NULL,
       voice_actor_id,
       remote_url`,
    subjectId,
  );

  return rows;
}

export async function getVoiceActorOptions(db: AppDatabase): Promise<VoiceActorOption[]> {
  const rows = await db.getAllAsync<{ id: number; payload: string }>(
    'SELECT id, payload FROM voice_actors ORDER BY name COLLATE NOCASE',
  );

  return rows.flatMap((row) => {
    try {
      const parsed = JSON.parse(row.payload) as ApiResource<VoiceActorData>;
      return [{
        id: row.id,
        name: parsed.data.name,
        gender: parsed.data.gender,
        description: parsed.data.description,
      }];
    } catch {
      return [];
    }
  });
}

export async function playVocabularyAudio(
  db: AppDatabase,
  subjectId: number,
  options: { interruptBackgroundAudio: boolean; preferredVoiceActorId?: number | null },
) {
  const audio = await loadAudioModule();
  if (!audio) {
    return false;
  }

  const urls = await getVocabularyAudioUrls(db, subjectId);
  if (urls.length === 0) {
    return false;
  }

  const preferredUrls = options.preferredVoiceActorId
    ? urls.filter((row) => row.voice_actor_id === options.preferredVoiceActorId)
    : [];
  const playableUrls = preferredUrls.length > 0 ? preferredUrls : urls;

  const currentIndex = lastPlayedIndexBySubject.get(subjectId) ?? -1;
  const nextIndex = (currentIndex + 1) % playableUrls.length;
  const audioUrl = playableUrls[nextIndex];
  if (!audioUrl) {
    return false;
  }

  await audio.setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: options.interruptBackgroundAudio ? 'doNotMix' : 'mixWithOthers',
    shouldRouteThroughEarpiece: false,
  });

  const generation = playbackGeneration + 1;
  playbackGeneration = generation;

  if (activePlayer) {
    activePlayer.remove();
    activePlayer = null;
  }

  const player = audio.createAudioPlayer(audioUrl.remote_url);
  if (generation !== playbackGeneration) {
    player.remove();
    return false;
  }

  activePlayer = player;
  lastPlayedIndexBySubject.set(subjectId, nextIndex);
  player.play();

  player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      player.remove();
      if (activePlayer === player) {
        activePlayer = null;
      }
    }
  });

  return true;
}

export async function stopVocabularyAudio() {
  playbackGeneration += 1;
  if (!activePlayer) {
    return;
  }

  const player = activePlayer;
  activePlayer = null;
  player.remove();
}
