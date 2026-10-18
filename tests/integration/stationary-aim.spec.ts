import { describe, expect, it } from 'vitest';
import { ActionInput } from '../../src/browser/input/action-input';
import { world, level } from '../fixtures/world';
import { GameSession } from '../../src/application/game-session';
import { checkpoint, playReplay, ReplayRecorder } from '../../src/application/replay';

describe('Stationary aim and deliberate shots', () => {
  it.each([0, 9])('turns between a bomb and a wall with %i rounds without touching either', ammo => {
    const w = world(['sssss', 's...s', 'sbRss', 's...s', 'sssss']); w.ammo = ammo;
    const input = new ActionInput(); input.set('key:Shift', 'aim', true);
    for (const [direction, action] of (['right', 'down', 'left', 'up'] as const).entries()) {
      input.set('key:direction', action, true);
      const command = input.command()!; w.command(command.direction, command.fire, command.aimOnly); w.step();
      expect([w.robot.x, w.robot.y, w.robot.direction]).toEqual([2, 2, direction]);
      expect(w.ammo).toBe(ammo); expect(w.at(1, 2)?.kind).toBe('bomb');
      expect(w.at(1, 2)?.dying).toBe(0); expect(w.drainEvents().some(e => e.type === 'shoot')).toBe(false);
      w.assertConsistent();
    }
  });
  it('uses one round during a long hold and another after releasing and pressing', () => {
    const w = world(['sssssss', 's.....s', 's..R..s', 's.....s', 'sssssss']); w.ammo = 9;
    const input = new ActionInput(); input.set('pointer:fire', 'fire', true);
    const advance = () => { const c = input.command(w.robot.direction); if (c) w.command(c.direction, c.fire, c.aimOnly); w.step(); };
    for (let tick = 0; tick < 20; tick++) advance();
    expect(w.ammo).toBe(8); expect([w.robot.x, w.robot.y]).toEqual([3, 2]);
    input.set('pointer:fire', 'fire', false); input.set('pointer:fire', 'fire', true); advance();
    expect(w.ammo).toBe(7);
  });
  it('replays aim deterministically and accepts existing command records', () => {
    const pack = { id: 'aim', name: 'Aim', lastLevel: 1, levels: [level(['sssss', 's...s', 's.R.s', 's...s', 'sssss'])] };
    const session = new GameSession(pack, 7); session.start(); const recorder = new ReplayRecorder(session);
    recorder.action({ type: 'command', direction: 3, fire: false, aimOnly: true }); recorder.step();
    expect([session.world.robot.x, session.world.robot.y, session.world.robot.direction]).toEqual([2, 2, 3]);
    recorder.action({ type: 'command', direction: 0, fire: true }); recorder.step();
    expect(checkpoint(playReplay(recorder.export(), [pack]))).toBe(checkpoint(session));
    const data = JSON.parse(recorder.export()); data.frames[0].actions[0].aimOnly = 'yes';
    expect(() => playReplay(JSON.stringify(data), [pack])).toThrow('Invalid replay command');
    data.frames[0].actions[0].aimOnly = true; data.frames[0].actions[0].fire = true;
    expect(() => playReplay(JSON.stringify(data), [pack])).toThrow('Invalid replay command');
  });
});
