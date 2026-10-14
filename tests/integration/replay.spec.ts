import { describe, it, expect } from 'vitest';
import { GameSession } from '../../src/application/game-session';
import { ReplayRecorder, playReplay, checkpoint } from '../../src/application/replay';
import { level } from '../fixtures/world';
import { packs } from '../../src/generated/packs';
import type { Direction } from '../../src/engine/model';
function recordPlanet20(): ReplayRecorder {
  const session = new GameSession(packs[0], 123); session.selectPlanet(20);
  const recorder = new ReplayRecorder(session);
  const go = (directions: string) => { for (const c of directions) { recorder.action({ type: 'command', direction: ({R:0,D:1,L:2,U:3} as Record<string, Direction>)[c], fire:false }); recorder.step(); while (session.world.teleportTicks) recorder.step(); } };
  const idle = (n: number) => { for (let i=0;i<n;i++) recorder.step(); };
  go('R D U L L U U'.replaceAll(' ','')); go('LLDDR');
  recorder.action({type:'command', direction:0, fire:true}); recorder.step(); idle(8);
  expect(session.world.status).toBe('playing'); expect(session.world.ammo).toBe(8);
  return recorder;
}
function recordPlanet6(seed: number): ReplayRecorder {
  const session = new GameSession(packs[0], seed); session.selectPlanet(6); const recorder = new ReplayRecorder(session);
  const mapping: Record<string, Direction> = { R:0, D:1, L:2, U:3 };
  const route = ['RR','L','R','DRD','LDL','RRRRRRRRRRRR','LLLLLLLLLLLLL','ULU','LDD','DLDRD','RLL','LUURU','ULL','R','URR','L','R','RUU','DDRDRRRR','URRRRRRRRR','DDD','LLLLLLL'];
  for (const section of route) for (const command of section) {
    recorder.action({ type:'command', direction:mapping[command], fire:false }); recorder.step();
    if (session.world.status === 'dead') {
      expect([session.world.robot.x, session.world.robot.y, session.world.tick]).toEqual([7, 16, 162]);
      return recorder;
    }
    while (session.world.teleportTicks) recorder.step();
  }
  throw Error('Expected bird contact on the formerly winning route');
}
describe('Seeded normal-API replays', () => {
  it('replays the former planet6 route ending in bird contact death', () => {
    const recorder = recordPlanet6(3);
    const replayed = playReplay(recorder.export(), packs);
    expect(replayed.world.status).toBe('dead');
    expect(checkpoint(replayed)).toBe(checkpoint(recorder.session));
  });
  it('replays a legal authored planet20 pickup/teleport/bomb route and reproduces its state/events', () => {
    const recorder = recordPlanet20();
    const replayed = playReplay(recorder.export(), packs);
    expect(checkpoint(replayed)).toBe(checkpoint(recorder.session)); expect(replayed.world.status).toBe('playing');
  });
  it('records pause boundaries and retries independently of rendering/event drains', () => {
    const session = new GameSession(packs[0], 7); session.start(); const recorder = new ReplayRecorder(session);
    recorder.action({ type: 'pause' }); recorder.step(); session.world.drainEvents();
    recorder.action({ type: 'pause' }); recorder.action({ type: 'command', direction: 0, fire: false }); recorder.step();
    session.world.drainEvents(); recorder.action({ type: 'restart' }); recorder.step();
    expect(checkpoint(playReplay(recorder.export(), packs))).toBe(checkpoint(session));
  });
  it('records the delayed death presentation retry as normal deterministic actions', () => {
    const session = new GameSession(packs[0], 7); session.start(); const recorder = new ReplayRecorder(session);
    recorder.action({ type: 'retry' });
    for (let tick = 0; tick < GameSession.deathRestartTicks; tick++) recorder.step();
    expect(session.world.status).toBe('playing');
    expect(checkpoint(playReplay(recorder.export(), packs))).toBe(checkpoint(session));
  });
  it('replays bird adjacency death with matching state and events', () => {
    const pack = { id: 'bird-contact', name: 'Bird contact', lastLevel: 1,
      levels: [level(['.......', '...s...', '.R.^...', '.......'], { '3,2': [3] })] };
    const session = new GameSession(pack, 7); session.start();
    const recorder = new ReplayRecorder(session);
    recorder.action({ type: 'command', direction: 0, fire: false }); recorder.step();
    expect(session.world.status).toBe('dead');
    expect(checkpoint(playReplay(recorder.export(), [pack]))).toBe(checkpoint(session));
    const old = JSON.parse(recorder.export()); old.engine = 'robbo-java-1';
    expect(() => playReplay(JSON.stringify(old), [pack])).toThrow('Incompatible replay');
  });
  it('rejects incompatible campaigns, malformed commands and reports first divergence', () => {
    const recorder = recordPlanet20(), data = JSON.parse(recorder.export());
    data.packHash = 'changed'; expect(() => playReplay(JSON.stringify(data), packs)).toThrow('Incompatible');
    data.packHash = recorder.data.packHash; data.frames[0].actions[0].direction = 4;
    expect(() => playReplay(JSON.stringify(data), packs)).toThrow('tick 0');
    data.frames[0].actions[0].direction = recorder.data.frames[0].actions[0].type === 'command' ? recorder.data.frames[0].actions[0].direction : 0;
    data.frames[1].checkpoint = 'wrong'; expect(() => playReplay(JSON.stringify(data), packs)).toThrow('tick 1');
  });
});
