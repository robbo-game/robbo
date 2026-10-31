import { describe, it, expect } from 'vitest';
import { world, steps } from '../fixtures/world';
import type { Direction } from '../../src/engine/model';
import { GameWorld } from '../../src/engine/game-world';
import { packs } from '../../src/generated/packs';

describe('Cannon options and weapons', () => {
  it.each(packs)('lets Robbo push the box beside the moving cannon on planet 45 in pack $id', pack => {
    const w = new GameWorld(pack.levels[44], () => 0.5);
    const cannon = w.at(9, 12);
    for (const e of w.entities.values()) if (e.kind === 'cannon') e.countdown = 100;
    expect(w.move(w.robot, 8, 13)).toBe(true);
    w.command(3); steps(w, 1);
    expect(w.at(8, 11).kind).toBe('box');
    expect(w.robot).toMatchObject({ x: 8, y: 12 });
    expect(cannon.direction).toBe(2);
    steps(w, 1);
    expect(w.status).toBe('playing');
    expect(cannon).toMatchObject({ x: 9, y: 12, direction: 0 });
  });
  it('bounces off Robbo without contact damage while he pushes a box', () => {
    const w = world(['sssssss', 's.....s', 's}R#..s', 's.....s', 'sssssss'], { '1,2': [3, 0, 0, 1, 0, 0] });
    const cannon = w.at(1, 2); cannon.countdown = 100;
    w.command(0); steps(w, 1);
    expect(w.status).toBe('playing');
    expect(cannon).toMatchObject({ x: 1, y: 2, direction: 2 });
    expect(w.robot).toMatchObject({ x: 3, y: 2, alive: true });
    expect(w.at(4, 2).kind).toBe('box');
    expect(w.events.some(e => e.type === 'kill')).toBe(false);
  });
  it('still kills Robbo when a moving cannon fires directly at him', () => {
    const w = world(['sssss', 's}R.s', 'sssss'], { '1,1': [0, 0, 0, 1, 0, 0] });
    w.at(1, 1).countdown = 0;
    steps(w, 1);
    expect(w.status).toBe('dead');
  });
  it('decodes all six options and applies the Java continuous-fire restrictions', () => {
    const w = world(['ssssssssss', 'sR.......s', 's.}..}...s', 's........s', 'ssssssssss'], { '2,2': [3, 2, 1, 1, 0, 0], '5,2': [1, 0, 1, 1, 1, 1] });
    expect(w.at(2, 2)).toMatchObject({ fireDirection: 3, direction: 2, fireType: 0, moving: true });
    expect(w.at(5, 2)).toMatchObject({ fireDirection: 1, fireType: 0, moving: false, rotating: true });
  });
  it.each([0, 1, 2, 3] as Direction[])('fires a single projectile facing %s', direction => {
    const w = world(['sssssssss', 'sR......s', 's.......s', 's...}...s', 's.......s', 's.......s', 'sssssssss'], { '4,3': [direction, 0, 0, 0, 0, 0] });
    const cannon = w.at(4, 3); cannon.countdown = 0; steps(w, 1);
    const projectile = [...w.entities.values()].find(e => e.kind === 'shot'); expect(projectile.direction).toBe(direction); expect(cannon.x).toBe(4);
  });
  it('moving cannons move each tick and rotating cannons use the seeded interval', () => {
    const w = world(['sssssssssss', 'sR........s', 's.}...}...s', 's.........s', 'sssssssssss'], { '2,2': [3, 0, 0, 1, 0, 0], '6,2': [0, 0, 0, 0, 1, 1] }, () => 0.75);
    const moving = w.at(2, 2), rotating = w.at(6, 2); moving.countdown = rotating.countdown = 100;
    steps(w, 1); expect(moving.x).toBe(3); expect(rotating.x).toBe(6);
    rotating.age = rotating.rotationInterval - 1; steps(w, 1); expect(rotating.fireDirection).toBe(3);
  });
  it('laser extends through empty space and retracts, then clears origin smoke', () => {
    const w = world(['ssssssssss', 'sR.......s', 's.}......s', 'ssssssssss'], { '2,2': [0, 0, 1, 0, 0, 0] });
    const cannon = w.at(2, 2); w.fire(cannon, 0, 1); cannon.countdown = 100;
    steps(w, 1); expect(w.at(3, 2).kind).toBe('beam'); steps(w, 4); expect(w.lasers[0].parts).toHaveLength(5);
    steps(w, 20); expect(w.lasers).toHaveLength(0); expect([...w.entities.values()].some(e => e.kind === 'beam')).toBe(false);
  });
  it('laser owns its cells and stops safely when its source is removed', () => {
    const w = world(['ssssssss', 'sR.....s', 's.}....s', 'ssssssss'], { '2,2': [0, 0, 1, 0, 0, 0] }); const cannon = w.at(2, 2);
    w.fire(cannon, 0, 1); cannon.countdown = 100; steps(w, 2); w.remove(cannon); steps(w, 1); expect(w.lasers).toHaveLength(0);
    expect([...w.entities.values()].some(e => e.kind === 'beam')).toBe(false);
  });
  it('flame has seven ordered parts and kills rather than silently overwriting targets', () => {
    const w = world(['ssssssssssssssss', 'sR.............s', 's.}......H.....s', 'ssssssssssssssss'], { '2,2': [0, 0, 2, 0, 0, 0] }); const cannon = w.at(2, 2); const sand = w.at(9, 2);
    cannon.countdown = 100; w.fire(cannon, 0, 2); steps(w, 6);
    const parts = [...w.entities.values()].filter(e => e.kind === 'flame'); expect(parts.map(e => e.index).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    steps(w, 20); expect(sand.alive).toBe(false); expect([...w.entities.values()].some(e => e.kind === 'flame')).toBe(false);
  });
});

describe('Ordered mirror groups', () => {
  it('tries the next group index, remembers inventory, materializes and can be used repeatedly', () => {
    const w = world(['ssssssssssss', 'sR&....&...s', 's..........s', 'ssssssssssss'], { '2,1': [7, 0], '7,1': [7, 1] }); w.ammo = 9; w.keys = 2;
    w.command(0); steps(w, 1); expect([w.robot.x, w.robot.y]).toEqual([8, 1]); expect(w.teleportTicks).toBe(4);
    w.command(0); steps(w, 4); expect(w.robot.x).toBe(8); expect(w.ammo).toBe(9); expect(w.keys).toBe(2);
    w.command(2); steps(w, 1); expect([w.robot.x, w.robot.y]).toEqual([1, 1]);
    expect([...w.entities.values()].filter(e => e.kind === 'mirror')).toHaveLength(2); expect(w.drainEvents().filter(e => e.type === 'teleport')).toHaveLength(2);
  });
  it('skips a fully blocked partner and wraps only within its group', () => {
    const w = world(['sssssssssssssss', 'sR&...s&s...&.s', 's......s......s', 'sssssssssssssss'], { '2,1': [1, 0], '7,1': [1, 1], '12,1': [1, 2] });
    w.command(0); steps(w, 1); expect([w.robot.x, w.robot.y]).toEqual([13, 1]);
  });
  it('preserves the robot if every exit is blocked, including source fallback', () => {
    const w = world(['ssssssssss', 'sR&s&s&sss', 'ssssssssss'], { '2,1': [1, 0], '4,1': [1, 1], '6,1': [2, 0] });
    w.command(0); steps(w, 1); expect(w.robot.x).toBe(1); expect(w.teleportTicks).toBe(0); expect(w.drainEvents().filter(e => e.type === 'teleport')).toHaveLength(0);
  });
  it.each([
    { start: [2, 3], entry: 3, expected: [7, 1] },
    { start: [2, 1], entry: 1, expected: [7, 3] },
    { start: [1, 2], entry: 0, expected: [8, 2] },
    { start: [3, 2], entry: 2, expected: [6, 2] }
  ])('uses the authored exit preference from $start', ({ start, entry, expected }) => {
    const rows = ['sssssssssss', 's.........s', 's.&....&..s', 's.........s', 'sssssssssss'];
    rows[start[1]] = rows[start[1]].slice(0, start[0]) + 'R' + rows[start[1]].slice(start[0] + 1);
    const w = world(rows, { '2,2': [1, 0], '7,2': [1, 1] }); w.command(entry as Direction); steps(w, 1); expect([w.robot.x, w.robot.y]).toEqual(expected);
  });
});
