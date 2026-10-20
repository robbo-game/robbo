import { describe, it, expect } from 'vitest';
import { packs } from '../../src/generated/packs';
import { symbolKinds, seededRandom } from '../../src/engine/model';
import type { Direction } from '../../src/engine/model';
import { GameWorld } from '../../src/engine/game-world';
import { GameSession } from '../../src/application/game-session';
import { frameFor } from '../../src/presentation/rendering/sprite-frames';
import { level } from '../fixtures/world';

describe('Imported campaigns', () => {
  for (const pack of packs) {
    it(`preserves all 56 maps, metadata, atlas coverage and bounded simulations in pack ${pack.id}`, () => {
      expect(pack.lastLevel).toBe(56); expect(pack.levels).toHaveLength(56);
      expect(pack.levels.reduce((n, l) => n + l.rows.join('').split('T').length - 1, 0)).toBe(pack.id === '02' ? 467 : 470);
      const symbols = new Set<string>();
      for (const [i, data] of pack.levels.entries()) {
        expect(data.number).toBe(i + 1); expect(data.width).toBe(16); expect(data.height).toBe(31);
        expect(data.rows.every(r => r.length === 16)).toBe(true);
        expect(data.rows.join('').split('R')).toHaveLength(2); expect(data.rows.join('').split('!')).toHaveLength(2);
        for (const s of data.rows.join('')) symbols.add(s);
        for (let seed = 1; seed <= 3; seed++) {
          const w = new GameWorld(data, seededRandom(seed));
          for (const e of w.entities.values()) {
            const [x, y] = frameFor(e, w); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(12); expect(y).toBeLessThan(8);
          }
          for (let tick = 0; tick < 250; tick++) {
            w.command((tick % 4) as Direction, tick % 7 === 0); w.step(); w.assertConsistent();
          }
        }
      }
      expect(symbols.size).toBe(30); for (const symbol of symbols) expect(symbol === '.' || !!symbolKinds[symbol]).toBe(true);
    });
    it(`transitions at the exit through every planet and completes without planet 57 in pack ${pack.id}`, () => {
      const session = new GameSession(pack, 1); session.start();
      for (let planet = 1; planet <= 56; planet++) {
        const w = session.world; expect(session.planet).toBe(planet); expect(w.keys).toBe(0); expect(w.ammo).toBe(0);
        const ship = [...w.entities.values()].find(e => e.kind === 'ship');
        // This test arranges the completion condition; it is not a full-map input solution.
        w.remaining = 0;
        const direction = ship.x > 0 ? 0 : 2;
        const x = ship.x + (direction === 0 ? -1 : 1), y = ship.y;
        const obstacle = w.at(x, y); if (obstacle && obstacle !== w.robot) w.remove(obstacle);
        w.move(w.robot, x, y);
        // Avoid unrelated enemies interfering with this session-lifecycle test.
        for (const e of [...w.entities.values()]) if (e !== w.robot && e !== ship) w.remove(e);
        session.command(direction); session.step(); expect(w.status).toBe('won');
        for (let tick = 0; tick < 5; tick++) session.step();
        if (planet < 56) { expect(session.world).not.toBe(w); expect(session.completed).toBe(false); }
      }
      expect(session.completed).toBe(true); expect(session.planet).toBe(56);
      session.restart(); expect(session.completed).toBe(false); expect(session.planet).toBe(56);
      session.newCampaign(); expect(session.planet).toBe(1); expect(session.world.remaining).toBeGreaterThan(0);
    });
  }
  it('filters stale metadata without changing cell layouts or valid cannon options', () => {
    expect(packs[0].levels[0].options['8,3']).toEqual([3, 0, 1, 1, 0, 0]);
    expect(packs[0].levels[0].rows[6][3]).toBe("'"); expect(packs[0].levels[0].options['3,6']).toBeUndefined();
    expect(packs[1].levels[0].rows[6][3]).toBe('.'); expect(packs[1].levels[0].options['2,10']).toBeUndefined();
  });
  it('converts GNU extra-life pickups so they cannot become impassable walls', () => {
    for (const pack of packs) {
      expect(pack.levels[12].rows[13][11]).toBe('.');
      expect(pack.levels[14].rows[22][5]).toBe('.');
      expect(pack.levels[15].rows[23][7]).toBe('.');
      expect(pack.levels[35].rows[29][13]).toBe('.');
      expect(pack.levels.every(level => !level.rows.some(row => row.includes('+')))).toBe(true);
      const w = new GameWorld(pack.levels[12], seededRandom(1));
      w.move(w.robot, 13, 13);
      for (let step = 0; step < 4; step++) { w.command(2); w.step(); }
      expect([w.robot.x, w.robot.y, w.keys]).toEqual([9, 13, 1]);
    }
  });
  it('reaches the screw beside the bomb on planet 16', () => {
    const w = new GameWorld(packs[0].levels[15], seededRandom(16));
    for (const direction of [1, 2, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1] as Direction[]) { w.command(direction); w.step(); }
    expect([w.robot.x, w.robot.y, w.remaining]).toEqual([7, 13, 15]);
  });
  it('retries the same planet with fresh state and suppresses input when paused', () => {
    const session = new GameSession(packs[0], 2); session.selectPlanet(6);
    const old = session.world; old.ammo = 20; old.keys = 2; old.killRobot();
    session.restart(); expect(session.planet).toBe(6); expect(session.world).not.toBe(old); expect(session.world.ammo).toBe(0);
    session.togglePause(); const tick = session.world.tick; session.command(0); session.step(); expect(session.world.tick).toBe(tick);
    session.togglePause(); session.step(); expect(session.world.robot.x).toBe(2);
    expect(() => session.selectPlanet(57)).toThrow();
  });
  it('completes an entire fixture campaign with legal pickups and exit movement, without arranging inventory', () => {
    const data = level(['sssssss', "sR'T!.s", 'sssssss']);
    const session = new GameSession({ id: 'test', name: 'Test', lastLevel: 2, levels: [data, { ...data, number: 2 }] }, 1); session.start();
    for (let planet = 1; planet <= 2; planet++) {
      for (let action = 0; action < 3; action++) { session.command(0); session.step(); }
      expect(session.world.status).toBe('won'); for (let tick = 0; tick < 5; tick++) session.step();
    }
    expect(session.completed).toBe(true);
  });
});
