import { afterEach, expect, it, vi } from 'vitest';
import { browserStorage, storageNamespace } from '../../../src/browser/persistence/storage';
afterEach(() => vi.unstubAllGlobals());
it('isolates main and separate PR paths on the same origin', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } });
  vi.stubGlobal('location', { pathname: '/robbo/' });
  browserStorage()!.setItem('robbo.preferences.v1', 'main'); expect(storageNamespace()).toBe('');
  vi.stubGlobal('location', { pathname: '/robbo/previews/pr-16/' });
  browserStorage()!.setItem('robbo.preferences.v1', 'gesture'); expect(storageNamespace()).toBe('pr-16');
  vi.stubGlobal('location', { pathname: '/robbo/previews/pr-17/index.html' });
  expect(browserStorage()!.getItem('robbo.preferences.v1')).toBe(null);
  vi.stubGlobal('location', { pathname: '/robbo/' });
  expect(browserStorage()!.getItem('robbo.preferences.v1')).toBe('main');
});
