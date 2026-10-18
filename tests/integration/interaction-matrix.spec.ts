import { describe, it, expect } from 'vitest';
import { world } from '../fixtures/world';
import type { Kind } from '../../src/engine/model';

const kinds: Kind[] = ['robot', 'wall', 'ship', 'screw', 'key', 'ammo', 'door', 'box', 'momentum', 'bomb', 'question', 'mirror', 'magnet', 'river', 'bird', 'bear', 'worm', 'eyes', 'cannon', 'sand', 'stop', 'shot', 'flame', 'beam', 'smoke', 'impact', 'blast'];
const attacks = ['shot', 'blast', 'river', 'momentum'] as const;
// Independent expected contracts, rather than assertions that simply call the implementation's predicate.
const expected = {
  shot: 'robot bear worm bird eyes river bomb question sand ammo',
  momentum: 'robot bear worm bird eyes river bomb question sand ammo',
  blast: 'robot bear worm bird eyes river bomb question sand ammo box screw key door ship stop shot flame beam',
  river: 'robot shot flame beam smoke impact blast question screw cannon bird worm bear eyes bomb momentum box key ship ammo sand stop'
};
describe('Attack/target interaction matrix', () => {
  for (const attack of attacks) for (const kind of kinds) {
    it(`${attack} ${expected[attack].split(' ').includes(kind) ? 'affects' : 'preserves'} ${kind}`, () => {
      const w = world(['R......', '.......', '.......', '.......', '.......']);
      const target = kind === 'robot' ? w.robot : w.spawn(kind, 3, 2);
      const affected = expected[attack].split(' ').includes(kind);
      expect(w.damage(target, attack)).toBe(affected);
      if (!affected) { expect(target.alive).toBe(true); expect(w.at(target.x, target.y)).toBe(target); }
      else if (kind === 'robot') expect(w.status).toBe('dead');
      else if (kind === 'river' && attack !== 'river') expect(target.dying).toBeGreaterThan(0);
      else expect(target.alive).toBe(false);
      w.assertConsistent();
    });
  }
});
