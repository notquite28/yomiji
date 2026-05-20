import { create } from 'zustand';
import type { SyncProgress } from './syncService';

export type SyncState = {
  syncProgress: SyncProgress | null;
  syncError: string | null;
  syncRevision: number;
  setSyncProgress: (progress: SyncProgress | null) => void;
  setSyncError: (error: string | null) => void;
  bumpRevision: () => void;
};

export const useSyncStore = create<SyncState>((set) => ({
  syncProgress: null,
  syncError: null,
  syncRevision: 0,
  setSyncProgress: (syncProgress) => set({ syncProgress }),
  setSyncError: (syncError) => set({ syncError }),
  bumpRevision: () => set((s) => ({ syncRevision: s.syncRevision + 1 })),
}));
