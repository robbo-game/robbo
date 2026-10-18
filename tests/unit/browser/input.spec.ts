import { directionAt, PointerActions } from '../../../src/browser/input/touch-input';
import { describe, expect, it } from 'vitest';
import { ActionInput } from '../../../src/browser/input/action-input';
describe('Shared cardinal input', () => {
  it('prioritizes the newest held device and restores the previous direction on release', () => {
    const input = new ActionInput(); input.set('key:up', 'up', true); input.set('touch:1', 'right', true); input.set('key:ctrl', 'fire', true);
    expect(input.command()).toEqual({ direction: 0, fire: true }); input.release('touch:'); expect(input.command()).toEqual({ direction: 3, fire: false, aimOnly: true }); input.release(); expect(input.command()).toBeUndefined();
  });
  it('remaps gamepad fire and rejects button conflicts', () => {
    const input = new ActionInput(); expect(input.bindPad('fire', 9)).toBeTruthy(); expect(input.bindPad('fire', 2)).toBeUndefined();
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })); buttons[2].pressed = true; input.gamepad({ axes: [1, 0], buttons }); expect(input.command()).toEqual({ direction: 0, fire: true });
  });
  it('requires held gamepad buttons to release after a lifecycle reset', () => {
    const input = new ActionInput(); const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })); buttons[9].pressed = true;
    const pad = { axes: [0, 0], buttons }; expect(input.gamepad(pad)).toEqual(['pause']); input.release();
    expect(input.gamepad(pad)).toEqual([]); buttons[9].pressed = false; input.gamepad(pad); buttons[9].pressed = true; expect(input.gamepad(pad)).toEqual(['pause']);
  });
  it('rejects conflicts and browser keys without changing bindings', () => {
    const input = new ActionInput(); expect(input.bind('up', 'ArrowDown')).toBeTruthy(); expect(input.bind('up', 'Tab')).toBeTruthy(); expect(input.bind('up', 'w')).toBeUndefined();
  });
  it('uses one dominant axis, dead zone and rising button edges; disconnect releases', () => {
    const input = new ActionInput(); const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })); buttons[9].pressed = true;
    expect(input.gamepad({ axes: [.2, .1], buttons })).toEqual(['pause']); expect(input.command()).toBeUndefined();
    expect(input.gamepad({ axes: [.7, -.8], buttons })).toEqual(['up']); expect(input.command()?.direction).toBe(3);
    input.gamepad(null); expect(input.held.size).toBe(0);
  });
});

// The pad is digital because Robbo moves on a grid, not on analogue diagonals.
describe('Touch direction selection', () => {
  it('selects cardinal directions and resolves diagonal ties consistently', () => {
    expect(directionAt(78, 0, 156)).toBe('up');
    expect(directionAt(0, 78, 156)).toBe('left');
    expect(directionAt(156, 78, 156)).toBe('right');
    expect(directionAt(78, 156, 156)).toBe('down');
    expect(directionAt(140, 140, 156)).toBe('right');
  });
  it('stops in the centre or outside the pad', () => {
    for (const [x, y] of [[78, 78], [90, 80], [-1, 78], [157, 78], [78, -1], [78, 157]]) {
      expect(directionAt(x, y, 156)).toBeUndefined();
    }
  });
  it('releases one pointer without releasing the other thumb', () => {
    const input = new ActionInput(), pointers = new PointerActions(input);
    pointers.press(1, 'fire'); pointers.press(2, 'right');
    pointers.release(1);
    expect(input.command()).toEqual({ direction: 0, fire: false });
    pointers.press(2, 'up');
    expect(input.command()).toEqual({ direction: 3, fire: false });
    pointers.reset(); expect(input.command()).toBeUndefined();
  });
});

describe('Precise touch repeats', () => {
  it('gates movement repetition but lets the same held direction aim a shot immediately', () => {
    const input = new ActionInput(); input.set('pointer:1', 'right', true); input.defer('pointer:1', 280);
    expect(input.command(undefined, 100)).toBeUndefined();
    expect(input.command(undefined, 280)).toEqual({ direction: 0, fire: false });
    input.set('pointer:2', 'fire', true);
    expect(input.command(3, 100)).toEqual({ direction: 0, fire: true });
    input.set('pointer:1', 'right', false);
    expect(input.command(0, 100)).toBeUndefined();
    input.release(); expect(input.command(3, 300)).toBeUndefined();
  });
});


describe('Single shots and stationary aim', () => {
  it('consumes one press once even across repeated polls and retargeting', () => {
    const input = new ActionInput();
    input.set('pointer:1', 'fire', true);
    expect(input.command(2)).toEqual({ direction: 2, fire: true });
    for (let tick = 0; tick < 30; tick++) expect(input.command(2)).toBeUndefined();
    expect(input.set('pointer:1', 'fire', true)).toBe(false);
    input.set('pointer:2', 'up', true);
    expect(input.command(2)).toEqual({ direction: 3, fire: false, aimOnly: true });
    input.set('pointer:1', 'fire', false); input.set('pointer:1', 'fire', true);
    expect(input.command(3)).toEqual({ direction: 3, fire: true });
  });
  it('waits for a direction for keyboard Ctrl and does not repeat the chord', () => {
    const input = new ActionInput(); input.set('key:Control', 'fire', true);
    expect(input.command(1)).toBeUndefined();
    input.set('key:ArrowUp', 'up', true);
    expect(input.command(1)).toEqual({ direction: 3, fire: true });
    expect(input.command(3)).toEqual({ direction: 3, fire: false, aimOnly: true });
    input.set('key:ArrowUp', 'up', false); input.set('key:ArrowUp', 'up', true);
    expect(input.command(3)).toEqual({ direction: 3, fire: false, aimOnly: true });
  });
  it('requires all fire sources to release before another shot', () => {
    const input = new ActionInput(); input.set('pointer:1', 'fire', true);
    expect(input.command(0)?.fire).toBe(true);
    input.set('pad:fire', 'fire', true); input.set('pointer:1', 'fire', false);
    expect(input.command(0)).toBeUndefined();
    input.set('pad:fire', 'fire', false); input.set('pad:fire', 'fire', true);
    expect(input.command(0)?.fire).toBe(true);
  });
  it('aims in all four directions without firing and permits a deliberate shot', () => {
    const input = new ActionInput(); input.set('key:Shift', 'aim', true);
    for (const [direction, action] of (['right', 'down', 'left', 'up'] as const).entries()) {
      input.set('key:direction', action, true);
      expect(input.command()).toEqual({ direction, fire: false, aimOnly: true });
    }
    input.set('key:Control', 'fire', true);
    expect(input.command()).toEqual({ direction: 3, fire: true });
  });
  it('discards an unconsumed press on cancellation and blocks held pad fire after reset', () => {
    const input = new ActionInput(); input.set('pointer:1', 'fire', true); input.release();
    expect(input.command(0)).toBeUndefined();
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })); buttons[0].pressed = true;
    input.gamepad({ axes: [0, 0], buttons });
    expect(input.command(0)?.fire).toBe(true); input.release();
    input.gamepad({ axes: [0, 0], buttons });
    expect(input.command(0)).toBeUndefined();
  });
});
