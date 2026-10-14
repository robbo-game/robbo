import { browserStorage, readRecord, writeRecord, type SafeStorage } from './storage';
export interface Preferences { muted: boolean; volume: number; touchFireSide: 'left' | 'right' }
const KEY = 'robbo.preferences.v1';
export const defaultPreferences: Readonly<Preferences> = { muted: false, volume: 0.6, touchFireSide: 'right' };
export class PreferenceStore {
  private value: Preferences;
  constructor(private storage: SafeStorage | undefined = browserStorage()) {
    const raw = readRecord(storage, KEY) as Record<string, unknown> | null;
    this.value = this.validate(raw?.version === 1 ? raw : {});
  }
  get current(): Preferences { return { ...this.value }; }
  // Drafts are detached: Cancel is simply discarding a draft; Apply calls this method.
  apply(draft: Partial<Preferences>): Preferences {
    this.value = this.validate({ ...this.value, ...draft });
    writeRecord(this.storage, KEY, { version: 1, ...this.value });
    return this.current;
  }
  reset(): Preferences { return this.apply(defaultPreferences); }
  private validate(raw: Record<string, unknown>): Preferences {
    return { touchFireSide: raw.touchFireSide === 'left' ? 'left' : 'right',
      muted: typeof raw.muted === 'boolean' ? raw.muted : defaultPreferences.muted,
      volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : defaultPreferences.volume };
  }
}
