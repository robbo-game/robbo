import type { SavedAttempt } from '../../application/saved-attempt';
import { browserStorage, readRecord, type SafeStorage } from './storage';

const JOURNAL = 'robbo.attempt.backup.v1';
/** IndexedDB is the main store; a synchronous journal protects the last hidden-page checkpoint. */
export class AttemptStore {
  private db?: IDBDatabase;
  private readonly opened: Promise<void>;
  private latest?: SavedAttempt;
  constructor(private storage: SafeStorage | undefined = browserStorage()) {
    this.opened = new Promise(resolve => {
      let finished = false;
      const finish = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
      const timer = setTimeout(finish, 1500);
      try {
        const request = indexedDB.open('robbo-saves', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('attempts');
        request.onerror = finish; request.onblocked = finish;
        request.onsuccess = () => {
          if (finished) { request.result.close(); return; }
          this.db = request.result;
          this.db.onversionchange = () => { this.db?.close(); this.db = undefined; };
          finish();
        };
      } catch { finish(); }
    });
  }
  async load(): Promise<unknown[]> {
    await this.opened;
    let saved: unknown;
    try {
      if (this.db) saved = await new Promise((resolve, reject) => {
        const transaction = this.db!.transaction('attempts', 'readonly');
        const request = transaction.objectStore('attempts').get('current');
        request.onsuccess = () => { saved = request.result; };
        transaction.oncomplete = () => resolve(saved); transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    } catch { /* The journal can still restore a session if IndexedDB is unavailable. */ }
    const time = (value: unknown) => typeof (value as SavedAttempt)?.savedAt === 'number' ? (value as SavedAttempt).savedAt : -1;
    return [saved, readRecord(this.storage, JOURNAL)].filter(value => value != null).sort((a, b) => time(b) - time(a));
  }
  private journal(record: SavedAttempt): boolean {
    try { if (!this.storage) return false; this.storage.setItem(JOURNAL, JSON.stringify(record)); return true; } catch { return false; }
  }
  save(record: SavedAttempt, leaving = false): Promise<boolean> {
    this.latest = record;
    // This happens synchronously: an unload handler cannot rely on async work completing.
    const backedUp = leaving || !this.db ? this.journal(record) : false;
    if (!this.db) return Promise.resolve(backedUp);
    return new Promise(resolve => {
      try {
        const transaction = this.db!.transaction('attempts', 'readwrite');
        transaction.objectStore('attempts').put(record, 'current');
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = transaction.onabort = () => resolve(this.journal(this.latest ?? record));
      } catch { resolve(backedUp || this.journal(this.latest ?? record)); }
    });
  }
}
