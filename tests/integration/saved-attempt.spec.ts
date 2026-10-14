import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/application/game-session';
import { restoreAttempt, saveAttempt } from '../../src/application/saved-attempt';
import { checkpoint } from '../../src/application/replay';
import type { Pack } from '../../src/engine/model';
import { packs } from '../../src/generated/packs';
import { level } from '../fixtures/world';

function fixture(rows: string[], options: Record<string, number[]> = {}) {
  const pack: Pack = { id: 'save-test', name: 'Save test', lastLevel: 2, levels: [level(rows, options), level(rows, options)] };
  const session = new GameSession(pack, 17); session.selectPlanet(2);
  return { pack, session };
}
function roundTrip(session: GameSession, pack: Pack) {
  // Exercise both IndexedDB structured records and the JSON fallback representation.
  const restored = restoreAttempt(JSON.parse(JSON.stringify(saveAttempt(session))), [pack]);
  expect(restored.paused).toBe(true); restored.togglePause();
  expect(checkpoint(restored)).toBe(checkpoint(session));
  expect(restored.randomState).toBe(session.randomState);
  return restored;
}
describe('Full saved attempts', () => {
  it('accepts authored entity options on every shipped planet', () => {
    for (const pack of packs) for (let planet = 1; planet <= pack.levels.length; planet++) {
      const session = new GameSession(pack, 17); session.selectPlanet(planet);
      for (let i = 0; i < 8; i++) session.step();
      roundTrip(session, pack);
    }
  });
  it('restores pickups, inventory, pushed boxes, planet and a detached snapshot', () => {
    const { session, pack } = fixture(['sssssssss', "sR'%T#..s", 's.......s', 'sssssssss']);
    for (let i = 0; i < 4; i++) { session.command(0); session.step(); }
    expect(session.world.collected).toBe(1); expect(session.world.ammo).toBe(9); expect(session.world.keys).toBe(1);
    const saved = saveAttempt(session), restored = roundTrip(session, pack);
    restored.command(1); restored.step();
    expect(saved.world.robot.y).toBe(1); expect(session.world.robot.y).toBe(1);
  });

  it('continues the exact RNG stream, projectiles, cannon countdowns and laser identity', () => {
    const { session, pack } = fixture(['sssssssssss', 'sR........s', 's.........s', 's....}....s', 's.........s', 's.....^...s', 'sssssssssss'],
      { '5,3': [0, 0, 1], '6,5': [0, 0, 1] });
    for (let i = 0; i < 8; i++) session.step();
    expect(session.world.lasers.length).toBeGreaterThan(0);
    const restored = roundTrip(session, pack);
    for (let i = 0; i < 30; i++) {
      session.step(); restored.step();
      expect(checkpoint(restored)).toBe(checkpoint(session));
      expect(restored.randomState).toBe(session.randomState);
      restored.world.assertConsistent();
    }
  });

  it('restores an active bomb chain and temporary effects without replaying sound', () => {
    const { session, pack } = fixture(['R........', '.........', '....bb...', '.........']);
    session.world.damage(session.world.at(4, 2)!, 'shot'); session.step();
    const restored = roundTrip(session, pack);
    expect(restored.world.events).toEqual([]);
    for (let i = 0; i < 5; i++) { session.step(); restored.step(); expect(checkpoint(restored)).toBe(checkpoint(session)); }
  });

  it('restores teleport materialization and discards pending input', () => {
    const { session, pack } = fixture(['R&.....&..', '..........', '..........'], { '1,0': [0, 2], '7,0': [0, 100] });
    session.command(0); session.step(); expect(session.world.teleportTicks).toBe(4);
    const restored = roundTrip(session, pack);
    for (let i = 0; i < 5; i++) { session.step(); restored.step(); expect(checkpoint(restored)).toBe(checkpoint(session)); }
    session.command(1);
    const saved = restoreAttempt(saveAttempt(session), [pack]); saved.togglePause(); saved.step();
    expect(saved.world.robot.y).toBe(0);
  });

  it('continues the death lifecycle and automatic restart deterministically', () => {
    const { session, pack } = fixture(['.....', '.R^..', '.....']);
    session.step(); expect(session.world.status).toBe('dead');
    const restored = roundTrip(session, pack);
    for (let i = 0; i < GameSession.deathRestartTicks + 1; i++) {
      session.step(); restored.step(); expect(checkpoint(restored)).toBe(checkpoint(session));
    }
  });

  it('preserves a completed campaign', () => {
    const { session, pack } = fixture(['R!']);
    session.command(0); session.step(); for (let i = 0; i < 5; i++) session.step();
    expect(session.completed).toBe(true);
    const restored = restoreAttempt(saveAttempt(session), [pack]);
    expect(restored.completed).toBe(true); expect(restored.paused).toBe(false);
    expect(checkpoint(restored)).toBe(checkpoint(session));
  });

  it('rejects incompatible campaigns, rules and corrupt occupancy instead of partially restoring', () => {
    const { session, pack } = fixture(['R..', '...']);
    const saved = saveAttempt(session);
    expect(() => restoreAttempt({ ...saved, engine: 'old' }, [pack])).toThrow('Incompatible');
    expect(() => restoreAttempt({ ...saved, packHash: 'changed' }, [pack])).toThrow('Incompatible');
    expect(() => restoreAttempt({ ...saved, randomState: -1 }, [pack])).toThrow('Invalid');
    const duplicate = structuredClone(saved); duplicate.world.entities.push({ ...duplicate.world.robot });
    expect(() => restoreAttempt(duplicate, [pack])).toThrow('Invalid saved world');
    const invalid = structuredClone(saved); invalid.world.robot.x = 99;
    expect(() => restoreAttempt(invalid, [pack])).toThrow('Invalid saved world');
  });
});
