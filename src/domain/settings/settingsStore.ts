import { create } from 'zustand';
import { AppSettings, defaultSettings, loadSettings, saveSettings } from './settings';

export type SettingsState = AppSettings & {
  /** True once loadSettings() has completed at least once after app launch */
  _hydrated: boolean;
  /** Persist a single setting. Calls saveSettings() for AsyncStorage persistence. */
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Hydrate the store from AsyncStorage. Called once by AppThemeProvider on mount. */
  hydrate: () => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings,
  _hydrated: false,

  hydrate: async () => {
    // Guard against double hydration (e.g. Strict Mode double-mount in dev)
    if (get()._hydrated) return;
    try {
      const settings = await loadSettings();
      set({ ...settings, _hydrated: true });
    } catch {
      // On error, stay with defaults but unblock the app
      set({ _hydrated: true });
    }
  },

  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    set({ [key]: value } as Partial<SettingsState>);
    // Fire-and-forget persistence; write failures are non-critical
    saveSettings({ [key]: value }).catch(() => {});
  },
}));
