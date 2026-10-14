import { describe, expect, it } from 'vitest';
import { inverse, vectors, type Direction } from '../../src/engine/model';
import { steps, world } from '../fixtures/world';

const open = () => world(['.......', '.......', '.......', '...R...', '.......', '.......', '.......']);

describe('Bird contact', () => {
  for (const shooting of [false, true]) {
    it.each([0, 1, 2, 3] as Direction[])(`kills from side %s before movement (shooting=${shooting})`, direction => {
      const w = open(); const [x, y] = w.next(w.robot, direction);
      // Even a bird facing away is deadly; Robbo cannot escape on this tick.
      w.spawn('bird', x, y, undefined, [direction, direction, Number(shooting)]);
      w.command(inverse(direction)); steps(w, 1);
      expect(w.status).toBe('dead'); expect(w.robot.alive).toBe(false);
      expect([w.robot.x, w.robot.y]).toEqual([3, 3]);
      expect(w.events.filter(e => e.type === 'kill')).toHaveLength(1);
    });
  }

  it.each([[-1, -1], [1, -1], [-1, 1], [1, 1]])('does not kill diagonally at offset %s,%s', (dx, dy) => {
    const w = open();
    const bird = w.spawn('bird', 3 + dx, 3 + dy, undefined, [0]);
    w.spawn('wall', bird.x + 1, bird.y); w.spawn('wall', bird.x - 1, bird.y);
    steps(w, 3); expect(w.status).toBe('playing');
  });

  it.each([0, 1, 2, 3] as Direction[])('kills when the bird moves into neighbouring side %s', direction => {
    const w = open(); const [dx, dy] = vectors[direction];
    w.spawn('bird', 3 + 2 * dx, 3 + 2 * dy, undefined, [inverse(direction)]);
    steps(w, 1); expect(w.status).toBe('dead');
  });

  it('kills on the same tick when Robbo walks alongside a blocked bird', () => {
    const w = world(['.......', '...s...', '.R.^...', '.......']);
    w.at(3, 2)!.direction = 3;
    w.command(0); steps(w, 1);
    expect([w.robot.x, w.robot.y]).toEqual([2, 2]);
    expect(w.status).toBe('dead');
  });

  it('does not kill across a wall or a gap', () => {
    const w = world(['.......', '.Rs^s..', '.......']);
    w.at(3, 1)!.direction = 0;
    steps(w, 3); expect(w.status).toBe('playing');
  });
});
