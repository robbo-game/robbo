import { expect, it } from 'vitest';
import { gestureDirection } from '../../../src/browser/input/gesture-direction';
it('ignores small thumb jitter and uses four directions', () => {
  expect(gestureDirection(5, 7)).toBeUndefined();
  expect(gestureDirection(20, 2)).toBe('right'); expect(gestureDirection(-20, 2)).toBe('left');
  expect(gestureDirection(2, 20)).toBe('down'); expect(gestureDirection(2, -20)).toBe('up');
});
it('requires a clear axis change before turning', () => {
  expect(gestureDirection(20, 24, 'right')).toBe('right');
  expect(gestureDirection(20, 29, 'right')).toBe('down');
  expect(gestureDirection(24, 20, 'up')).toBe('down');
  expect(gestureDirection(29, 20, 'up')).toBe('right');
});
