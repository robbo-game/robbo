import type { Direction } from '../../engine/model';

export type Action = 'right' | 'down' | 'left' | 'up' | 'fire' | 'pause' | 'retry';
export const defaultBindings: Record<Action, string> = { right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft', up: 'ArrowUp', fire: 'Control', pause: 'p', retry: 'r' };
const directions: Partial<Record<Action, Direction>> = { right: 0, down: 1, left: 2, up: 3 };

/** One ordered action stream; newest held direction wins, never diagonals. */
export class ActionInput {
  private readonly blocked = new Set<string>();
  private readonly repeatAfter = new Map<string, number>();
  defer(source: string, until: number): void { this.repeatAfter.set(source, until); }
  readonly held = new Map<string, Action>();
  bindings = { ...defaultBindings };
  deadzone = 0.25;
  padBindings: Record<Action, number> = { right: 15, down: 13, left: 14, up: 12, fire: 0, pause: 9, retry: 3 };
  bindPad(action: Action, button: number): string | undefined {
    if (!Number.isInteger(button) || button < 0 || button > 31) return 'Choose a gamepad button between 0 and 31.';
    if (Object.entries(this.padBindings).some(([a, b]) => a !== action && b === button)) return 'This button is already assigned to another action.';
    this.padBindings[action] = button; this.release('pad:'); return undefined;
  }
  set(source: string, action: Action, pressed: boolean): boolean {
    if (!pressed) { this.repeatAfter.delete(source); this.held.delete(source); this.blocked.delete(source); return false; }
    if (this.blocked.has(source)) return false;
    if (this.held.get(source) === action) return false;
    this.held.delete(source); this.held.set(source, action); return true;
  }
  release(prefix = ''): void { for (const source of this.held.keys()) if (source.startsWith(prefix)) { this.blocked.add(source); this.held.delete(source); this.repeatAfter.delete(source); } }
  command(facing?: Direction, now = performance.now()): { direction: Direction; fire: boolean } | undefined {
    const held = [...this.held.entries()].reverse();
    const aimed = held.find(([, action]) => directions[action] !== undefined);
    const fire = held.some(([, action]) => action === 'fire');
    if (aimed) {
      if (!fire && now < (this.repeatAfter.get(aimed[0]) ?? 0)) return;
      return { direction: directions[aimed[1]]!, fire };
    }
    // A touch Fire button shoots where Robbo is facing; keyboard/gamepad semantics stay stable.
    if (facing !== undefined && held.some(([source, action]) => source.startsWith('pointer:') && action === 'fire')) return { direction: facing, fire: true };
    return;
  }
  bind(action: Action, key: string): string | undefined {
    key = key.length === 1 ? key.toLowerCase() : key;
    if (!key || /^F(?:[1-9]|1[0-2])$/.test(key) || ['Tab', 'Escape', 'Meta', 'Alt'].includes(key)) return 'Choose a gameplay key, not a browser or focus shortcut.';
    if (Object.entries(this.bindings).some(([a, k]) => a !== action && k === key)) return 'This key is already assigned to another action.';
    this.bindings[action] = key; this.release(); return undefined;
  }
  gamepad(pad: Pick<Gamepad, 'axes' | 'buttons'> | null): Action[] {
    const actions: Action[] = [];
    if (pad) {
      const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
      if (Math.max(Math.abs(x), Math.abs(y)) > this.deadzone) actions.push(Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up'));
      for (const action of Object.keys(this.padBindings) as Action[]) if (pad.buttons[this.padBindings[action]]?.pressed) actions.push(action);
    }
    const edges: Action[] = [];
    for (const action of Object.keys(defaultBindings) as Action[]) if (this.set(`pad:${action}`, action, actions.includes(action))) edges.push(action);
    return edges;
  }
}

export function attachInput(input: ActionInput, options: {
  command: (direction: Direction, fire: boolean) => void;
  pause: () => void;
  retry: () => void;
  active: () => boolean;
  start: () => void;
}): () => void {
  const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, select, textarea, button, [contenteditable="true"]');
  addEventListener('keydown', event => {
    if (editable(event.target) || event.altKey || event.metaKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const action = (Object.keys(input.bindings) as Action[]).find(a => input.bindings[a] === key);
    // Ctrl plus a letter remains a browser shortcut even with a custom letter binding.
    if (!action || (event.ctrlKey && key.length === 1)) return;
    event.preventDefault();
    if (!event.repeat) input.set(`key:${key}`, action, false);
    if (!input.set(`key:${key}`, action, true)) return;
    if (action === 'pause') options.pause();
    else if (action === 'retry') options.retry();
    else if (directions[action] !== undefined) {
      options.start(); const command = input.command();
      if (command && options.active()) options.command(command.direction, command.fire);
    }
  });
  addEventListener('keyup', event => input.set(`key:${event.key.length === 1 ? event.key.toLowerCase() : event.key}`, 'fire', false));
  addEventListener('gamepaddisconnected', () => input.release('pad:'));
  const panel = document.createElement('details'); panel.className = 'input-settings'; panel.innerHTML = '<summary>Input settings</summary><p>Newest held direction wins. Hold fire while aiming. Gamepad: left stick/D-pad, A fire, Start pause, Y retry.</p>';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  for (const action of Object.keys(defaultBindings) as Action[]) {
    const label = document.createElement('label'); label.textContent = `${action}: `;
    const field = document.createElement('input'); field.value = input.bindings[action]; field.readOnly = true; field.setAttribute('aria-label', `Key for ${action}`);
    field.addEventListener('keydown', event => {
      if (event.key === 'Tab' || event.key === 'Escape') return;
      event.preventDefault(); const error = event.ctrlKey || event.altKey || event.metaKey ? 'Modified browser shortcuts cannot be assigned.' : input.bind(action, event.key);
      status.textContent = error ?? `Assigned ${action} to ${input.bindings[action]}.`; field.value = input.bindings[action];
    }); label.append(field); panel.append(label);
    const padLabel = document.createElement('label'); padLabel.textContent = `${action} gamepad button: `;
    const padField = document.createElement('input'); padField.type = 'number'; padField.min = '0'; padField.max = '31'; padField.value = String(input.padBindings[action]); padField.setAttribute('aria-label', `Gamepad button for ${action}`);
    padField.addEventListener('change', () => { const error = input.bindPad(action, Number(padField.value)); status.textContent = error ?? `Assigned gamepad ${action} to button ${input.padBindings[action]}.`; padField.value = String(input.padBindings[action]); });
    padLabel.append(padField); panel.append(padLabel);
  }
  const zone = document.createElement('input'); zone.type = 'range'; zone.min = '10'; zone.max = '80'; zone.value = '25'; zone.setAttribute('aria-label', 'Gamepad dead zone');
  zone.addEventListener('input', () => { input.deadzone = Number(zone.value) / 100; input.release('pad:'); });
  const label = document.createElement('label'); label.textContent = 'Gamepad dead zone '; label.append(zone); panel.append(label, status); document.querySelector('main')?.append(panel);
  return () => {
    const pad = [...(navigator.getGamepads?.() ?? [])].find(p => p?.connected && p.mapping === 'standard') ?? null;
    const edges = input.gamepad(pad);
    if (edges.includes('pause')) options.pause();
    if (edges.includes('retry')) options.retry();
    if (edges.some(a => directions[a] !== undefined)) options.start();
  };
}
