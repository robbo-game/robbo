import { describe, it, expect } from 'vitest';
import { world, steps } from '../fixtures/world';
import { blastTargets, shotTargets, riverTargets } from '../../src/engine/game-world';
import { Camera } from '../../src/presentation/rendering/camera';
import { frameFor } from '../../src/presentation/rendering/sprite-frames';
import type { Direction, Kind } from '../../src/engine/model';

describe('Robbo inventory, commands and authoritative occupancy', () => {
  it('collects inventory, opens a door on one tick, enters on the next and boards the active ship', () => {
    const w = world(['ssssssss', "sR'T%D!s", 'ssssssss']);
    w.command(0, true); steps(w, 1); expect(w.ammo).toBe(0); expect(w.robot.x).toBe(1);
    w.command(0); steps(w, 1); expect(w.ammo).toBe(9); expect(w.at(2, 1)).toBe(w.robot);
    w.command(0); steps(w, 1); expect(w.remaining).toBe(0); expect(w.collected).toBe(1);
    w.command(0); steps(w, 1); expect(w.keys).toBe(1);
    w.command(0); steps(w, 1); expect(w.keys).toBe(0); expect(w.robot.x).toBe(4); expect(w.at(5, 1)).toBeUndefined();
    w.command(0); steps(w, 1); expect(w.robot.x).toBe(5);
    w.command(0); steps(w, 1); expect(w.status).toBe('won'); expect(w.drainEvents().map(e => e.type)).toContain('end');
  });
  it('caps ammunition and keys, consumes one shot into a wall and preserves the wall', () => {
    const w = world(['sssss', "sR'%s", 'sssss']); w.ammo = 97; w.keys = 99;
    w.command(0); steps(w, 1); expect(w.ammo).toBe(99);
    w.command(0); steps(w, 1); expect(w.keys).toBe(99);
    w.command(0, true); steps(w, 1); expect(w.ammo).toBe(98); expect(w.at(4, 1).kind).toBe('wall');
  });
  it('last command wins without accumulating diagonal deltas and new projectiles exist before drawing', () => {
    const w = world(['sssssss', 's.....s', 's..R..s', 's.....s', 'sssssss']);
    w.command(3); w.command(0); steps(w, 1); expect([w.robot.x, w.robot.y]).toEqual([4, 2]);
    w.ammo = 1; w.command(3, true); steps(w, 1); expect(w.at(4, 1).kind).toBe('shot'); expect(w.robot.y).toBe(2);
    steps(w, 1); expect(w.at(4, 1).kind).toBe('impact'); steps(w, 2); expect(w.at(4, 1)).toBeUndefined();
  });
  it('pushes only into free cardinal space and keeps both occupants consistent', () => {
    const w = world(['sssssss', 'sR#..Ts', 'sssssss']);
    w.command(0); steps(w, 1); expect(w.robot.x).toBe(2); expect(w.at(3, 1).kind).toBe('box');
    w.command(0); steps(w, 1); expect(w.robot.x).toBe(3);
    w.command(0); steps(w, 1); expect(w.robot.x).toBe(3); expect(w.at(4, 1).kind).toBe('box');
  });
  it('keeps the ship pushable until screws are collected, and does not collect a destroyed screw', () => {
    const w = world(['ssssssss', 'sR!..T.s', 'ssssssss']);
    w.command(0); steps(w, 1); expect(w.robot.x).toBe(2); expect(w.at(3, 1).kind).toBe('ship');
    w.damage(w.at(5, 1), 'blast'); expect(w.remaining).toBe(1); expect(w.collected).toBe(0);
  });
  it('rejects occupied/out-of-bounds creation and removes by identity', () => {
    const w = world(['R..']); const original = w.spawn('box', 1, 0); w.remove(original); const next = w.spawn('screw', 1, 0);
    w.remove(original); expect(w.at(1, 0)).toBe(next); expect(() => w.spawn('bomb', 1, 0)).toThrow(); expect(() => w.spawn('shot', -1, 0)).toThrow();
    w.assertConsistent();
  });
});

describe('Combat and finite effects', () => {
  it('damages a target before its scheduled update, preventing a dead bird from firing', () => {
    const w = world(['ssssssss', 'sR..^..s', 'ssssssss'], { '4,1': [0, 2, 1] });
    const bird = w.at(4, 1); bird.countdown = 0;
    const projectile = w.spawn('shot', 3, 1); projectile.direction = 0;
    steps(w, 1); expect(bird.alive).toBe(false); expect(w.drainEvents().some(e => e.type === 'gun')).toBe(false);
    expect(w.at(4, 1).kind).toBe('smoke'); steps(w, 3); expect(w.at(4, 1)).toBeUndefined();
  });
  it('uses a staged 3×3 footprint, chains bombs once and preserves immune objects', () => {
    const w = world(['sssssssss', 'sR......s', 's...%D..s', 's..#b&..s', 's...bT..s', 's.......s', 'sssssssss']);
    const first = w.at(4, 3); w.damage(first, 'shot'); expect(w.damage(first, 'shot')).toBe(false);
    steps(w, 1); expect(w.at(4, 4).kind).toBe('blast'); expect(w.at(4, 2).kind).toBe('key'); expect(w.at(5, 3).kind).toBe('mirror');
    steps(w, 1); expect(w.at(4, 2).kind).toBe('blast'); expect(w.at(5, 2).kind).toBe('blast');
    expect(w.drainEvents().filter(e => e.type === 'bomb')).toHaveLength(2);
    steps(w, 8); expect(w.blasts).toHaveLength(0); expect([...w.entities.values()].some(e => e.kind === 'blast')).toBe(false);
  });
  it('dies once on a projectile and rejects ghost commands', () => {
    const w = world(['ssssss', 's.R..s', 'ssssss']); const shot = w.spawn('shot', 3, 1); shot.direction = 2;
    steps(w, 1); expect(w.status).toBe('dead'); expect(w.robot.alive).toBe(false); expect(w.at(2, 1).kind).toBe('smoke');
    w.command(0, true); steps(w, 8); expect(w.drainEvents().filter(e => e.type === 'kill')).toHaveLength(1); expect(w.robot.x).toBe(2);
  });
  it('turns every remaining non-wall object into a deterministic death blast', () => {
    const w = world(['sssssss', 'sR^bT.s', 's#?!..s', 'sssssss']);
    w.beginDeathPresentation(); steps(w, 1);
    expect(w.status).toBe('dead');
    expect([...w.entities.values()].filter(e => e.kind !== 'wall').every(e => ['smoke', 'blast'].includes(e.kind))).toBe(true);
    expect([...w.entities.values()].filter(e => e.kind === 'blast')).toHaveLength(6);
    steps(w, 4); expect([...w.entities.values()].some(e => e.kind === 'blast')).toBe(false);
  });
  it('handles overlapping explosions, border blasts and question replacement without orphaned objects', () => {
    const w = world(['R....', '...bb', '...?.'], {}, () => 0.999);
    w.damage(w.at(3, 1), 'shot'); w.damage(w.at(4, 1), 'shot'); steps(w, 12);
    expect(w.entities.size).toBe(1); expect(w.at(3, 2)).toBeUndefined();
  });
  it('keeps the Java shot/blast/river immunity differences explicit', () => {
    for (const kind of ['wall', 'mirror', 'magnet', 'cannon', 'momentum'] as Kind[]) expect(blastTargets.has(kind)).toBe(false);
    expect(shotTargets.has('door')).toBe(false); expect(blastTargets.has('door')).toBe(true);
    expect(shotTargets.has('screw')).toBe(false); expect(blastTargets.has('screw')).toBe(true);
    expect(riverTargets.has('cannon')).toBe(true); expect(riverTargets.has('door')).toBe(false);
  });
  it('question smoke selects a replacement once and does not enlarge the authored screw target', () => {
    const w = world(['sssssss', 'sR?.T.s', 'sssssss'], {}, () => 3.1 / 16);
    w.damage(w.at(2, 1), 'shot'); expect(w.at(2, 1).kind).toBe('smoke'); steps(w, 3);
    expect(w.at(2, 1).kind).toBe('screw'); expect(w.remaining).toBe(1);
    w.command(0); steps(w, 1); expect(w.remaining).toBe(0); expect(w.collected).toBe(1);
  });
  it('render lookups do not move entities, advance frames or change occupancy', () => {
    const w = world(['sssssss', 'sR?b!.s', 'sssssss']); w.damage(w.at(3, 1), 'shot');
    const before = JSON.stringify([...w.entities.values()]);
    for (let i = 0; i < 5; i++) for (const e of w.entities.values()) expect(frameFor(e, w)).toHaveLength(2);
    expect(JSON.stringify([...w.entities.values()])).toBe(before); w.assertConsistent();
  });
});

describe('Enemy movement and dangerous contact', () => {
  it('bird reverses at a wall and a shooting bird uses its independent fire direction', () => {
    const w = world(['sssssssss', 'sR......s', 's.....^.s', 's.......s', 'sssssssss'], { '6,2': [0, 1, 1] });
    const bird = w.at(6, 2); bird.countdown = 0; steps(w, 1);
    expect(bird.x).toBe(7); expect(w.at(6, 3).kind).toBe('shot'); expect(w.drainEvents().some(e => e.type === 'gun')).toBe(true);
    steps(w, 1); expect(bird.direction).toBe(2); expect(bird.x).toBe(7);
  });
  it.each(['@', '*', 'V'])('cardinal adjacency to %s kills; diagonals do not', symbol => {
    const nearby = world(['sssss', `sR${symbol}.s`, 'sssss']); steps(nearby, 1); expect(nearby.status).toBe('dead');
    const diagonal = world(['sssssss', 'sR....s', `s.${symbol}...s`, 's.....s', 'sssssss']);
    expect(diagonal.status).toBe('playing'); diagonal.step(); expect(diagonal.status).toBe('playing');
  });
  it('keeps the Java wall-following loop for bears and worms in open space', () => {
    const w = world(['ssssssss', 'sR.....s', 's...@..s', 's......s', 'ssssssss'], { '4,2': [0] }); const bear = w.at(4, 2);
    steps(w, 1); expect([bear.x, bear.y]).toEqual([4, 2]); expect(bear.hand).toBe(-1);
    const route: [number, number][] = [];
    for (let i = 0; i < 4; i++) { steps(w, 2); route.push([bear.x, bear.y]); }
    expect(route).toEqual([[4, 3], [3, 3], [3, 2], [4, 2]]);
    expect(bear.hand).toBe(-1);
  });
  it.each(['@', '*'])('uses the same Java wall-following cadence for %s', symbol => {
    const w = world(['ssssssss', 'sR.....s', `s...${symbol}..s`, 's......s', 'ssssssss'], { '4,2': [0] }); const follower = w.at(4, 2);
    steps(w, 8);
    expect([follower.x, follower.y]).toEqual([4, 2]);
    expect(follower.hand).toBe(-1);
  });
  it('eyes retain the Java greedy chase contract rather than GNU butterfly steering', () => {
    const w = world(['ssssssss', 'sR.....s', 's......s', 's..V...s', 's......s', 'ssssssss']); const eyes = w.at(3, 3);
    steps(w, 2); expect([eyes.x, eyes.y]).toEqual([3, 3]);
    steps(w, 1); expect([eyes.x, eyes.y]).toEqual([2, 3]);
  });
  it('eyes use Java tie order and do not choose an alternate route when closer cells are blocked', () => {
    const tie = world(['ssssssss', 's......s', 's..R...s', 's...V..s', 's......s', 'ssssssss']); const eyes = tie.at(4, 3);
    steps(tie, 3); expect([eyes.x, eyes.y]).toEqual([3, 3]);
    const blocked = world(['sssssssss', 'sR......s', 's.ss....s', 's.sV....s', 's.......s', 'sssssssss']); const trappedEyes = blocked.at(3, 3);
    steps(blocked, 3); expect([trappedEyes.x, trappedEyes.y]).toEqual([3, 3]);
  });
  it('momentum continues every second tick, stops at an obstacle and can be pushed again', () => {
    const w = world(['sssssssss', 'sR~...H.s', 'sssssssss']); const box = w.at(2, 1);
    w.command(0); steps(w, 1); expect(box.x).toBe(3); steps(w, 1); expect(box.x).toBe(4);
    steps(w, 2); expect(box.x).toBe(5); steps(w, 2); expect(box.motion).toBe(false); expect(w.at(6, 1).kind).toBe('smoke');
  });
  it('magnet locks controls, pulls Robbo and kills at its mouth', () => {
    const w = world(['ssssssss', 'sM...R.s', 'ssssssss'], { '1,1': [0] });
    w.command(0); steps(w, 1); expect(w.robot.x).toBe(4); expect(w.magnetOwner).toBeDefined();
    steps(w, 3); expect(w.status).toBe('dead'); expect(w.drainEvents().filter(e => e.type === 'magnet')).toHaveLength(1);
  });
  it('an obstruction releases magnet ownership and other orientations do not see through walls', () => {
    const w = world(['ssssssss', 'sM...R.s', 'ssssssss'], { '1,1': [0] }); steps(w, 1); w.spawn('box', 3, 1);
    w.command(0); steps(w, 1); expect(w.magnetOwner).toBeUndefined(); expect(w.robot.x).toBe(5);
  });
  it.each([0, 1, 2, 3] as Direction[])('river segments wrap and remain distinct in direction %s', direction => {
    const w = world(['sssssssss', 'sR......s', 's.......s', 's..==...s', 's.......s', 's.......s', 'sssssssss'], { '3,3': [direction], '4,3': [direction] });
    const ids = [...w.entities.values()].filter(e => e.kind === 'river').map(e => e.id);
    steps(w, 50); expect([...w.entities.values()].filter(e => e.kind === 'river').map(e => e.id)).toEqual(ids);
  });
  it('river kills Robbo without a smoke overwrite and removes shot segments only after their death animation', () => {
    const w = world(['sssssss', 's.=R..s', 'sssssss']); steps(w, 2); expect(w.status).toBe('dead'); w.assertConsistent();
    const other = world(['sssssssss', 'sR......s', 's..==...s', 'sssssssss']); const segment = other.at(3, 2); other.damage(segment, 'shot');
    steps(other, 5); expect(segment.alive).toBe(true); steps(other, 1); expect(segment.alive).toBe(false);
    expect([...other.entities.values()].filter(e => e.kind === 'river')).toHaveLength(1);
  });
});

describe('Camera', () => {
  it('follows and clamps without changing game state', () => {
    const rows = Array.from({ length: 31 }, (_, y) => y === 20 ? '...R............' : '................');
    const w = world(rows); const camera = new Camera(); for (let i = 0; i < 40; i++) camera.update(w);
    camera.reset(); camera.focus(w); expect(camera.y).toBe(12);
    expect(camera.y).toBeGreaterThan(0); expect(camera.y).toBeLessThanOrEqual(15); expect(w.tick).toBe(0);
  });
  it('returns to the authored start cell as a presentation-only transition', () => {
    const rows = Array.from({ length: 31 }, (_, y) => y === 1 ? '.R..............' : '................');
    const w = world(rows); const camera = new Camera();
    w.robot.y = 25; camera.focus(w); expect(camera.y).toBe(15);
    camera.returnToStart(w); for (let i = 0; i < 20; i++) camera.update(w);
    expect(camera.y).toBe(0); expect(w.tick).toBe(0); expect(w.robot.y).toBe(25);
  });
});
