import { describe, expect, it } from 'vitest';
import { AttemptStore } from '../../../src/browser/persistence/attempt-store';
import type { SafeStorage } from '../../../src/browser/persistence/storage';
import { saveAttempt } from '../../../src/application/saved-attempt';
import { GameSession } from '../../../src/application/game-session';
import { packs } from '../../../src/generated/packs';

describe('Save storage fallback', () => {
  it('saves to the synchronous journal when IndexedDB is unavailable', async () => {
    const data = new Map<string, string>();
    const storage: SafeStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
    const store = new AttemptStore(storage); expect(await store.load()).toEqual([]);
    const saved = saveAttempt(new GameSession(packs[0]), 10);
    expect(await store.save(saved, true)).toBe(true);
    expect(await new AttemptStore(storage).load()).toEqual([JSON.parse(JSON.stringify(saved))]);
  });
  it('tolerates denied storage and reports that saving failed', async () => {
    const storage: SafeStorage = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
    const store = new AttemptStore(storage); expect(await store.load()).toEqual([]);
    expect(await store.save(saveAttempt(new GameSession(packs[0])))).toBe(false);
  });
});
