import { describe, expect, it } from 'vitest';
import { steps, world } from '../fixtures/world';
import { GameWorld } from '../../src/engine/game-world';
import { packs } from '../../src/generated/packs';

describe('Java bomb timing contracts from C reference review (#19)', () => {
  for (const pack of packs) it(`destroys planet 12's lower door with its adjacent bomb in pack ${pack.id}`, () => {
    const w = new GameWorld(pack.levels[11], () => 0.5);
    const door = w.at(7, 19)!;
    const bomb = w.at(7, 18)!;
    expect(door.kind).toBe('door'); expect(bomb.kind).toBe('bomb');
    expect(w.damage(door, 'shot')).toBe(false);
    w.damage(bomb, 'shot'); steps(w, 1);
    expect(door.alive).toBe(false);
    expect(w.at(7, 19)).toMatchObject({ kind: 'blast' });
    steps(w, 4);
    expect(w.at(7, 19)).toBeUndefined();
    expect(w.at(14, 16)).toMatchObject({ kind: 'door' });
    expect(w.keys).toBe(0);
  });
  it('traces opposing chain triggers without detonating a bomb twice', () => {
    const w = world(['R.......', '........', '........', '........', '........', '........']);
    const left = w.spawn('bomb', 3, 3), middle = w.spawn('bomb', 4, 3), right = w.spawn('bomb', 5, 3);
    w.damage(middle, 'shot');
    const trace = () => [w.tick, left.alive, right.alive, w.blasts.length, w.events.filter(e => e.type === 'bomb').length];
    expect(trace()).toEqual([0, true, true, 1, 1]);
    steps(w, 1); expect(trace()).toEqual([1, true, false, 2, 2]);
    steps(w, 1); expect(trace()).toEqual([2, false, false, 2, 3]);
    steps(w, 1); expect(trace()).toEqual([3, false, false, 1, 3]);
    steps(w, 1); expect(trace()).toEqual([4, false, false, 0, 3]);
    steps(w, 5); expect(w.events.filter(e => e.type === 'bomb')).toHaveLength(3);
    expect([...w.entities.values()].filter(e => e.kind === 'blast')).toHaveLength(0);
  });
  it('simultaneous overlapping detonations remove a question without revealing its outcome', () => {
    const w = world(['R......', '.......', '.......', '.......', '.......', '.......']);
    const a = w.spawn('bomb', 2, 2), b = w.spawn('bomb', 4, 2), question = w.spawn('question', 3, 3);
    w.damage(a, 'shot'); w.damage(b, 'shot'); steps(w, 1);
    expect(question.alive).toBe(false);
    expect(w.at(3, 3)).toMatchObject({ kind: 'blast', after: undefined, expires: 5 });
    steps(w, 4); expect(w.at(3, 3)).toBeUndefined();
    expect(w.events.filter(e => e.type === 'bomb')).toHaveLength(2);
  });
  it('clips corner blasts and preserves the Java source while destroying its exposed beam part', () => {
    const w = world(['.....R', '......', '......', '......']);
    const cannon = w.spawn('cannon', 0, 2, undefined, [0, 0, 1]); cannon.countdown = 100;
    w.fire(cannon, 0, 1); steps(w, 1);
    const beam = w.at(1, 2)!;
    const bomb = w.spawn('bomb', 0, 1); w.damage(bomb, 'shot'); steps(w, 1);
    expect(beam.alive).toBe(false); expect(cannon.alive).toBe(true);
    steps(w, 12); expect(w.lasers).toHaveLength(0);
    expect([...w.entities.values()].some(e => e.kind === 'beam')).toBe(false);
    w.assertConsistent();
  });
});
