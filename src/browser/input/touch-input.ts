import { ActionInput } from './action-input';
import type { Action } from './action-input';
import type { Direction } from '../../engine/model';

/** Pointer identities are independent: releasing fire never releases a held direction. */
export class PointerActions {
  readonly pointers = new Map<number, Action>();
  constructor(readonly input: ActionInput) {}
  press(id: number, action: Action): void { this.release(id); this.pointers.set(id, action); this.input.set(`pointer:${id}`, action, true); }
  release(id: number): void { this.pointers.delete(id); this.input.set(`pointer:${id}`, 'fire', false); }
  reset(): void { for (const id of this.pointers.keys()) this.release(id); }
}

export function attachTouch(input: ActionInput, options: {
  command: (direction: Direction, fire: boolean) => void;
  pause: () => void;
  retry: () => void;
  active: () => boolean;
  start: () => void;
}): { reset: () => void } {
  const state = new PointerActions(input);
  document.getElementById('touch-restart')?.addEventListener('click', () => {
    options.retry(); document.getElementById('back-to-game')?.click();
  });
  const panel = document.createElement('section'); panel.className = 'touch-controls'; panel.setAttribute('aria-label', 'Touch game controls');
  const description = document.createElement('p'); description.textContent = 'Hold or slide across the D-pad to move. Its centre stops movement. Hold Fire with your other thumb and a direction to shoot. Release the direction first to stop in place. Release Fire while holding a direction to move again.';
  const pad = document.createElement('div'); pad.className = 'touch-dpad'; pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', 'Movement'); panel.append(pad);
  const buttons = new Map<Action, HTMLButtonElement>();
  const captures = new Map<number, HTMLButtonElement>();
  const refresh = () => { for (const [action, button] of buttons) button.setAttribute('aria-pressed', String([...state.pointers.values()].includes(action))); };
  const command = () => { const action = input.command(); if (action && options.active()) options.command(action.direction, action.fire); };
  const release = (id: number) => { state.release(id); captures.delete(id); refresh(); };
  for (const action of ['up', 'left', 'down', 'right', 'fire'] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.action = action;
    button.setAttribute('aria-label', action === 'fire' ? 'Fire (hold while aiming)' : `Move ${action}`);
    button.setAttribute('aria-pressed', 'false');
    // SVG geometry avoids platform-specific font baselines and fallback glyph sizes.
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 32 32'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
    if (action === 'fire') {
      icon.innerHTML = '<circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="16" r="3" fill="currentColor"/><path d="M16 2v6m0 16v6M2 16h6m16 0h6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>';
    } else {
      icon.innerHTML = '<path d="M16 4 28 17h-8v11h-8V17H4Z" fill="currentColor"/>';
    }
    button.append(icon);
    if (action === 'fire') { const label = document.createElement('span'); label.textContent = 'FIRE'; button.append(label); }
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); options.start(); if (!options.active()) return;
      state.press(event.pointerId, action); captures.set(event.pointerId, button); button.setPointerCapture(event.pointerId); refresh();
      if (action !== 'fire') command();
    });
    button.addEventListener('pointermove', event => {
      if (action === 'fire' || !captures.has(event.pointerId) || !options.active()) return;
      const box = pad.getBoundingClientRect();
      const next = directionAt(event.clientX - box.left, event.clientY - box.top, box.width);
      if (state.pointers.get(event.pointerId) === next) return;
      if (next) { state.press(event.pointerId, next); command(); } else state.release(event.pointerId);
      refresh();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, event => release((event as PointerEvent).pointerId));
    // Native activation provides a single step for keyboard/assistive technology.
    button.addEventListener('click', event => {
      if (event.detail !== 0 || action === 'fire') return;
      options.start(); if (!options.active()) return;
      state.press(-1, action); command(); release(-1);
    });
    button.addEventListener('keydown', event => {
      if (action !== 'fire' || (event.key !== ' ' && event.key !== 'Enter')) return;
      event.preventDefault(); if (!event.repeat && options.active()) { state.press(-2, action); refresh(); }
    });
    button.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') release(-2); });
    button.addEventListener('blur', () => release(-2));
    buttons.set(action, button); (action === 'fire' ? panel : pad).append(button);
  }
  description.id = 'touch-description'; panel.setAttribute('aria-describedby', description.id);
  panel.append(description); (document.querySelector('.game') ?? document.querySelector('main'))?.append(panel);
  const reset = () => {
    const held = [...captures]; state.reset(); captures.clear(); refresh();
    for (const [id, button] of held) if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
  };
  addEventListener('blur', reset); addEventListener('resize', reset); document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  return { reset };
}

/** A fixed four-way pad: neutral centre, dominant axis, no diagonal commands. */
export function directionAt(x: number, y: number, size: number): Action | undefined {
  const dx = x - size / 2, dy = y - size / 2;
  if (x < 0 || y < 0 || x > size || y > size || Math.hypot(dx, dy) < size / 6) return undefined;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
