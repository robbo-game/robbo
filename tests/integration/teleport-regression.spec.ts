import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/application/game-session';
import { level, steps, world } from '../fixtures/world';

function transfer() {
  const w = world(['R&.....&..', '..........', '..........'], { '1,0': [0, 2], '7,0': [0, 100] });
  w.keys = 3; w.ammo = 18; w.command(0); steps(w, 1); return w;
}

describe('Bounded mirror transfer policies (#20)', () => {
  it('treats group zero as an ordinary Java group and accepts sparse indices at borders', () => {
    const w = transfer();
    expect([w.robot.x, w.robot.y]).toEqual([8, 0]);
    expect(w.teleportTicks).toBe(4);
    expect([w.keys, w.ammo]).toEqual([3, 18]);
    expect([...w.entities.values()].filter(e => e.kind === 'robot')).toHaveLength(1);
  });

  it('tries duplicate indices deterministically after blocked source exits', () => {
    const w = world(['ssssssssss', 'R&s...&..s', 'ss.......s'], { '1,1': [0, 4], '6,1': [0, 4] });
    w.command(0); steps(w, 1);
    expect([w.robot.x, w.robot.y]).toEqual([7, 1]);
  });

  it('permits a bounded isolated mirror fallback to a different free neighboring cell', () => {
    const w = world(['R&.', '...']); w.command(0); steps(w, 1);
    expect([w.robot.x, w.robot.y]).toEqual([2, 0]);
    expect(w.teleportTicks).toBe(4);
  });

  it('does not transfer or retain input when all available exits are occupied', () => {
    const w = world(['ssssss', 'R&s&ss', 'ssssss'], { '1,1': [0, 1], '3,1': [0, 100] });
    w.command(0); steps(w, 1); steps(w, 5);
    expect([w.robot.x, w.robot.y]).toEqual([0, 1]); expect(w.teleportTicks).toBe(0);
    expect(w.events.filter(e => e.type === 'teleport')).toHaveLength(0);
  });

  it.each(['bear', 'bird'] as const)('suppresses %s adjacency during materialization but restores it afterward', kind => {
    const w = transfer(); const bear = w.spawn(kind, 8, 1, undefined, kind === 'bird' ? [0] : []); bear.age = 0;
    // Freeze this adjacency hazard with surrounding walls and deterministic observer state.
    bear.observer = 1; bear.hand = 1;
    w.spawn('wall', 8, 2); w.spawn('wall', 7, 1); w.spawn('wall', 9, 1);
    steps(w, 4); expect(w.status).toBe('playing'); expect(w.teleportTicks).toBe(0);
    steps(w, 1); expect(w.status).toBe('dead');
  });

  it.each(['shot', 'blast'] as const)('keeps materialization vulnerable to direct %s damage', attack => {
    const w = transfer(); w.damage(w.robot, attack);
    expect(w.status).toBe('dead'); expect(w.teleportTicks).toBe(0);
  });

  it.each(['restart', 'selectPlanet'] as const)('discards transfer, effects and queued commands on %s', action => {
    const fixture = level(['R&.....&..', '..........'], { '1,0': [0, 0], '7,0': [0, 1] });
    const session = new GameSession({ id: 'test', name: 'Test', lastLevel: 2, levels: [fixture, fixture] }, 1);
    session.start(); session.command(0); session.step(); const old = session.world; const generation = session.generation;
    session.command(1);
    if (action === 'restart') session.restart(); else session.selectPlanet(2);
    expect(session.generation).toBe(generation + 1); expect(session.world).not.toBe(old);
    expect(session.world.teleportTicks).toBe(0); expect(session.world.events.map(e => e.type)).toEqual(['exit-open', 'capsule']);
    session.step(); expect([session.world.robot.x, session.world.robot.y]).toEqual([0, 0]);
    expect([...session.world.entities.values()].some(e => e.kind === 'smoke')).toBe(false);
  });
});
