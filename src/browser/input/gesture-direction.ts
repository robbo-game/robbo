import type { Action } from './action-input';
/** Direction changes need a clear axis advantage so small thumb wobble cannot turn Robbo. */
export function gestureDirection(dx: number, dy: number, previous?: Action): Action | undefined {
  const x = Math.abs(dx), y = Math.abs(dy);
  if (Math.max(x, y) < 12) return;
  const horizontal = previous === 'left' || previous === 'right';
  const vertical = previous === 'up' || previous === 'down';
  if ((horizontal && y < x * 1.35) || (!vertical && x >= y) || (vertical && x > y * 1.35)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
