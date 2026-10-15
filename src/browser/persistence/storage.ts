export interface SafeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
/** Pages previews share an origin, so each PR needs its own browser state. */
export function storageNamespace(): string {
  return typeof location === 'undefined' ? '' : location.pathname.match(/\/previews\/(pr-\d+)\//)?.[1] ?? '';
}
export function browserStorage(): SafeStorage | undefined {
  try {
    const storage = localStorage, scope = storageNamespace();
    if (!scope) return storage;
    const key = (name: string) => `robbo.preview.${scope}.${name}`;
    return { getItem: name => storage.getItem(key(name)), setItem: (name, value) => storage.setItem(key(name), value), removeItem: name => storage.removeItem(key(name)) };
  } catch { return undefined; }
}
export function readRecord(storage: SafeStorage | undefined, key: string): unknown { try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; } }
export function writeRecord(storage: SafeStorage | undefined, key: string, value: unknown): void { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional, including file URLs and private browsing. */ } }
