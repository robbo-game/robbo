import type { Pack } from '../../engine/model';
import { browserStorage, readRecord, writeRecord, type SafeStorage } from './storage';
export interface CampaignProgress { reached: number; selected: number; completed: boolean }
interface ProgressRecord { version: 1; active: string; campaigns: Record<string, CampaignProgress> }
const KEY = 'robbo.progress.v1';
export class CampaignStore {
  private record: ProgressRecord;
  private get defaultPack(): Pack { return this.packs.find(pack => pack.id === '01') ?? this.packs[0]; }
  constructor(private packs: Pack[], private storage = browserStorage()) {
    const raw = readRecord(storage, KEY) as Partial<ProgressRecord> | null;
    this.record = { version: 1, active: this.defaultPack.id, campaigns: {} };
    for (const pack of packs) {
      const saved = raw?.version === 1 ? raw.campaigns?.[pack.id] : undefined;
      const planet = (n: unknown) => typeof n === 'number' && Number.isInteger(n) ? Math.max(1, Math.min(pack.levels.length, n)) : 1;
      this.record.campaigns[pack.id] = { reached: planet(saved?.reached), selected: planet(saved?.selected), completed: saved?.completed === true && saved?.reached === pack.levels.length };
    }
    if (raw?.version === 1 && packs.some(p => p.id === raw.active)) this.record.active = raw.active!;
  }
  get active(): string { return this.record.active; }
  get(id: string): CampaignProgress { return { ...this.record.campaigns[id] }; }
  select(id: string, planet: number): void {
    const pack = this.packs.find(p => p.id === id);
    if (!pack || !Number.isInteger(planet) || planet < 1 || planet > pack.levels.length) throw Error('Invalid progress selection');
    this.record.active = id; this.record.campaigns[id].selected = planet; this.save();
  }
  advance(id: string, planet: number, completed: boolean): void {
    this.select(id, planet);
    const progress = this.record.campaigns[id]; progress.reached = Math.max(progress.reached, planet); progress.completed ||= completed;
    this.save();
  }
  reset(): void {
    for (const pack of this.packs) this.record.campaigns[pack.id] = { reached: 1, selected: 1, completed: false };
    this.record.active = this.defaultPack.id; this.save();
  }
  private save(): void { writeRecord(this.storage, KEY, this.record); }
}
