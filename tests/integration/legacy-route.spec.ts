import { describe, it, expect } from 'vitest';
import { packs } from '../../src/generated/packs';
import { GameWorld } from '../../src/engine/game-world';
import type { Direction } from '../../src/engine/model';

describe('Imported-map bird contact regression', () => {
  it.each(packs)('rejects the former planet 6 solution in pack $id at its bird-adjacent step', pack => {
    // A fixed RNG value produces a reproducible, legal enemy firing schedule.
    const w = new GameWorld(pack.levels[5], () => 0.5);
    const mapping: Record<string, Direction> = { R: 0, D: 1, L: 2, U: 3 };
    const go = (commands: string, x: number, y: number) => {
      for (const command of commands) {
        w.command(mapping[command]); w.step(); w.assertConsistent();
        if (w.status !== 'playing') throw Error(`Robot ${w.status} after ${command} at ${w.robot.x},${w.robot.y}, tick ${w.tick}`);
        while (w.teleportTicks) { w.step(); w.assertConsistent(); }
      }
      expect([w.robot.x, w.robot.y], commands).toEqual([x, y]);
    };
    go('RR', 8, 6); go('L', 12, 10); go('R', 5, 2);
    go('DRD', 11, 9); go('LDL', 2, 29);
    go('RRRRRRRRRRRR', 14, 29); expect(w.remaining).toBe(0);
    go('LLLLLLLLLLLLL', 8, 10); go('ULU', 14, 6);
    go('LDD', 10, 1); go('DLDRD', 4, 6); go('RLL', 10, 3);
    go('LUURU', 13, 7); go('ULL', 11, 2); go('R', 2, 3);
    go('URR', 8, 6); go('L', 12, 10); go('R', 5, 2);
    go('RUU', 2, 11); go('DDRDRRRR', 6, 14);
    go('URRRRRRRRR', 14, 13); go('DDD', 14, 16);
    go('LLLLLL', 8, 16);
    // The old route crossed above the bird and only won because birds were
    // missing from the cardinal contact check. Keep the exact failure as a regression.
    w.command(2); w.step(); w.assertConsistent();
    expect([w.robot.x, w.robot.y, w.tick]).toEqual([7, 16, 162]);
    expect(w.at(7, 17)?.kind).toBe('bird');
    expect(w.status).toBe('dead'); expect(w.collected).toBe(1); expect(w.keys).toBe(0);
  });
});
