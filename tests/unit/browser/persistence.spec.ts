import type { SafeStorage } from '../../../src/browser/persistence/storage';
import { PreferenceStore } from '../../../src/browser/persistence/preference-store';
import { describe, it, expect } from 'vitest';
import { CampaignStore } from '../../../src/browser/persistence/campaign-store';
import { packs } from '../../../src/generated/packs';
function memory(): SafeStorage { const values = new Map<string, string>(); return { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } }; }
describe('Campaign checkpoints', () => {
  it('separates inspection, earned progress, completion and reset across campaigns', () => {
    const storage = memory(), store = new CampaignStore(packs, storage);
    store.select('02', 56); expect(store.get('02').reached).toBe(1);
    store.advance('02', 56, true); store.select('01', 7);
    const restored = new CampaignStore(packs, storage);
    expect(restored.active).toBe('01'); expect(restored.get('01').selected).toBe(7);
    expect(restored.get('02').completed).toBe(true);
    restored.reset(); expect(new CampaignStore(packs, storage).get('02')).toEqual({ reached: 1, selected: 1, completed: false });
  });
  it('falls back on malformed/denied storage and clamps shortened campaigns', () => {
    const storage = memory(); storage.setItem('robbo.progress.v1', '{');
    expect(new CampaignStore(packs, storage).active).toBe('02');
    const denied: SafeStorage = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
    expect(() => new CampaignStore(packs, denied).advance('02', 2, false)).not.toThrow();
    storage.setItem('robbo.progress.v1', JSON.stringify({ version: 1, active: 'missing', campaigns: { '02': { selected: 99, reached: 99, completed: true } } }));
    expect(new CampaignStore(packs, storage).get('02')).toEqual({ selected: 56, reached: 56, completed: false });
  });
});

describe('Player preferences', () => {
  it('clamps, ignores unsupported options and applies detached drafts', () => {
    const storage = memory(); storage.setItem('robbo.preferences.v1', JSON.stringify({ version: 1, volume: 3, muted: true, skin: 'unavailable' }));
    const store = new PreferenceStore(storage);
    expect(store.current).toEqual({ volume: 1, muted: true, touchFireSide: 'right' });
    const draft = store.current; draft.volume = 0; expect(store.current.volume).toBe(1);
    store.apply(draft); expect(new PreferenceStore(storage).current.volume).toBe(0);
    store.reset(); expect(new PreferenceStore(storage).current).toEqual({ volume: 0.6, muted: false, touchFireSide: 'right' });
  });
  it('rejects future versions and nonfinite values without blocking startup', () => {
    const storage = memory(); storage.setItem('robbo.preferences.v1', JSON.stringify({ version: 2, volume: 0, muted: true }));
    expect(new PreferenceStore(storage).current.volume).toBe(0.6);
    expect(new PreferenceStore(storage).apply({ volume: NaN }).volume).toBe(0.6);
  });
});

describe('Touch layout preferences', () => {
  it('persists a mirrored layout and resets it without losing sound settings', () => {
    const storage = memory(), store = new PreferenceStore(storage);
    store.apply({ muted: true, volume: .4, touchFireSide: 'left' });
    expect(new PreferenceStore(storage).current).toEqual({ muted: true, volume: .4, touchFireSide: 'left' });
    expect(store.reset().touchFireSide).toBe('right');
  });
  it('accepts older records and falls back from invalid layouts', () => {
    const storage = memory();
    for (const touchFireSide of [undefined, 'invalid', 5, null]) {
      storage.setItem('robbo.preferences.v1', JSON.stringify({ version: 1, muted: true, volume: .2, touchFireSide }));
      expect(new PreferenceStore(storage).current).toEqual({ muted: true, volume: .2, touchFireSide: 'right' });
    }
  });
});
