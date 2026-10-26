import { AttemptStore } from '../browser/persistence/attempt-store';
import { saveAttempt, restoreAttempt, type SavedAttempt } from '../application/saved-attempt';
import { createThemeController } from './theme-controller';
import { createBoardRenderer } from '../presentation/rendering/board-renderer';
import { replayControls } from './replay-controls';
import type { ReplayAction } from '../application/replay';
import { PreferenceStore } from '../browser/persistence/preference-store';
import { CampaignStore } from '../browser/persistence/campaign-store';
import { attachTouch } from '../browser/input/touch-input';
import { ActionInput, attachInput } from '../browser/input/action-input';
import { javaTheme, themes } from '../presentation/themes/theme';
import { text, english } from '../presentation/i18n/messages';
import type { TextKey } from '../presentation/i18n/messages';
import { packs } from '../generated/packs';
import { GameSession } from '../application/game-session';
import { GameWorld } from '../engine/game-world';
import { GameAudio } from '../browser/audio/game-audio';
import { Camera } from '../presentation/rendering/camera';
import { seededRandom } from '../engine/model';
import type { Direction, LevelData } from '../engine/model';
import { MilestoneEffects, CURTAIN_CLOSE_START_MS } from '../presentation/rendering/milestone-effects';

/** Compose the browser controls, session and rendering lifecycle. */
export async function startGame(): Promise<void> {
  const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const progress = new CampaignStore(packs);
  let session = new GameSession(packs.find(p => p.id === progress.active)!);
  session.selectPlanet(progress.get(session.pack.id).selected); session.started = false;
  const testMode = location.hash === '#test';
  const attemptStore = testMode ? undefined : new AttemptStore();
  let restored = false, restoreFailed = false, savedAt = 0;
  // Finish loading before registering input or starting the simulation timer.
  if (attemptStore) {
    const candidates = await attemptStore.load();
    for (const candidate of candidates) {
      try { session = restoreAttempt(candidate, packs); savedAt = (candidate as SavedAttempt).savedAt; restored = true; break; }
      catch { restoreFailed = true; }
    }
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-text]')) {
    const key = node.dataset.text as TextKey;
    if (key in english) node.textContent = text(key);
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-label]')) {
    const key = node.dataset.label as TextKey;
    if (key in english) node.setAttribute('aria-label', text(key));
  }
  const packSelector = element<HTMLSelectElement>('pack');
  packSelector.replaceChildren(...packs.map(pack => {
    const option = document.createElement('option'); option.value = pack.id;
    option.textContent = pack.id === '02' ? text('ui.robbo.i.edited.legacy') : pack.id === '01' ? text('ui.robbo.i.original.legacy') : `Campaign ${pack.id}`;
    return option;
  }));
  const themeSelector = element<HTMLSelectElement>('theme');
  themeSelector.replaceChildren(...themes.map(theme => {
    const option = document.createElement('option'); option.value = theme.id; option.textContent = theme.name; option.title = theme.about;
    return option;
  }));
  const objectHelp = element('object-help');
  for (const topic of ['weapons', 'screws', 'doors', 'teleports', 'magnets', 'hazards']) {
    const section = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = text(`help.${topic}.title` as TextKey);
    const body = document.createElement('p'); body.textContent = text(`help.${topic}.body` as TextKey);
    section.append(summary, body); objectHelp.append(section);
  }
  const didRestore = restored;
  const canvas = element<HTMLCanvasElement>('board');
  const camera = new Camera();
  const artwork = createThemeController(canvas, themeSelector, render);
  const renderer = createBoardRenderer(canvas, camera, () => artwork);
  const audio = new GameAudio(message => { element('audio-status').textContent = message; });
  const preferences = new PreferenceStore();
  const touchFireSide = element<HTMLSelectElement>('touch-fire-side');
  const touchMovement = element<HTMLSelectElement>('touch-movement');
  function syncTouchLayout(): void {
    touchFireSide.value = preferences.current.touchFireSide;
    touchMovement.value = preferences.current.touchMovement;
    element('touch-movement-help').textContent = preferences.current.touchMovement === 'gestures'
      ? 'Swipe briefly for one step. Drag farther and hold to keep moving. Lift or return to the starting point to stop.'
      : 'Tap an arrow for one step. Hold to keep moving after a short delay. Slide between arrows to change direction; lift or slide to the centre to stop.';
    document.documentElement.dataset.touchMovement = preferences.current.touchMovement;
    document.documentElement.dataset.touchFireSide = preferences.current.touchFireSide;
  }
  syncTouchLayout();
  touchMovement.addEventListener('change', () => {
    clearInput(); preferences.apply({ touchMovement: touchMovement.value === 'dpad' ? 'dpad' : 'gestures' }); syncTouchLayout();
  });
  touchFireSide.addEventListener('change', () => {
    clearInput();
    preferences.apply({ touchFireSide: touchFireSide.value === 'left' ? 'left' : 'right' });
    syncTouchLayout();
  });
  audio.setMuted(preferences.current.muted); audio.setVolume(preferences.current.volume);
  element<HTMLInputElement>('mute').checked = preferences.current.muted;
  element<HTMLInputElement>('volume').value = String(preferences.current.volume * 100);
  const resetPreferences = document.createElement('button'); resetPreferences.textContent = text('preferences.reset');
  resetPreferences.addEventListener('click', () => { const value = preferences.reset(); clearInput(); syncTouchLayout(); audio.setMuted(value.muted); audio.setVolume(value.volume); element<HTMLInputElement>('mute').checked = value.muted; element<HTMLInputElement>('volume').value = String(value.volume * 100); });
  element('enable-sound').parentElement!.append(resetPreferences);
  const input = new ActionInput();
  let touchControls: ReturnType<typeof attachTouch> | undefined;
  let generation = -1;
  let previousStatus = 'playing';
  let manualTicks = false;
  const effects = new MilestoneEffects();
  let lastPresentationTick = performance.now();

  function refreshPlanets(): void {
    const selector = element<HTMLSelectElement>('planet');
    if (selector.options.length === session.pack.levels.length) return;
    selector.replaceChildren();
    for (let i = 1; i <= session.pack.levels.length; i++) {
      const option = document.createElement('option'); option.value = String(i); option.textContent = String(i).padStart(2, '0'); selector.append(option);
    }
  }
  refreshPlanets();
  let inputShotQueued = false;
  function clearInput(): void { inputShotQueued = false; input.release(); touchControls?.reset(); session.world.clearInput(); }
  function activateAudio(): void {
    element('audio-status').textContent = '';
    const events = session.world.drainEvents(); effects.consume(events, session.world); audio.unlock(events);
  }
  function focusWorld(): void {
    clearInput(); audio.stop(); effects.reset(); camera.reset();
    previousStatus = session.world.status;
    if (session.started && !replay.viewing && !restored) effects.arrive(session.world);
    restored = false;
    camera.focus(session.world);
    refreshPlanets();
    element<HTMLSelectElement>('planet').value = String(session.planet);
    element<HTMLSelectElement>('pack').value = session.pack.id;
    if (location.hash !== '#test' && !replay.viewing) progress.select(session.pack.id, session.planet);
  }
  function digits(id: string, value: number): void {
    const node = element(id);
    if (node.dataset.value === String(value)) return;
    node.dataset.value = String(value); node.setAttribute('aria-label', String(value)); node.replaceChildren();
    for (const digit of String(value).padStart(2, '0')) {
      const span = document.createElement('span'); span.className = 'digit'; span.textContent = digit; span.style.setProperty('--digit', digit); span.setAttribute('aria-hidden', 'true'); node.append(span);
    }
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function render(): void {
    const view = renderer.resize(session.world);
    const world = session.world;
    document.title = `Robbo — ${session.pack.levels.length} planets`;
    element('campaign-total').textContent = `of ${session.pack.levels.length}`;
    element('campaign-intro').textContent = `A journey through ${session.pack.levels.length} planets`;
    if (generation !== session.generation) { generation = session.generation; focusWorld(); }
    drawBoard(view);
    persistAttempt();
    canvas.dataset.camera = `${camera.x},${camera.y}`;
    canvas.dataset.tick = String(world.tick);
    canvas.dataset.state = session.completed ? 'completed' : world.status;
    canvas.dataset.robot = `${world.robot.x},${world.robot.y}`;
    digits('remaining', world.remaining); digits('keys', world.keys); digits('ammo', world.ammo); digits('planet-number', session.planet);
    element('exit-status').textContent = session.started && world.remaining === 0 ? text('exit.ready') : '';
    element('collected').textContent = String(world.collected);
    element('level-info').textContent = artwork.artworkUnavailable ? text('artwork.unavailable') : text('planet.info', { planet: session.planet, total: session.pack.levels.length, author: world.level.author, notes: world.level.notes ? ' · ' + world.level.notes : '' });
    element<HTMLButtonElement>('pause').textContent = session.paused ? text('action.resume') : text('action.pause');
    element<HTMLButtonElement>('start').textContent = session.started ? text('action.new') : text('action.start');
    element<HTMLButtonElement>('pause').disabled = !session.started || session.completed;
    let title = '', description = '', action = '';
    if (!session.started) { title = text('state.ready'); description = text('state.readyHelp'); action = text('action.start'); }
    else if (session.completed) { title = text('state.complete'); description = text('state.completeHelp', { total: session.pack.levels.length }); action = text('action.again'); }
    else if (session.paused) { title = text('state.paused'); description = text('state.pausedHelp'); action = text('action.resume'); }
    else if (world.status === 'dead' && world.statusTicks >= 4) { title = text('state.dead'); description = text('state.deadHelp'); action = text('action.retry'); }
    // Flight is drawn on the board, so the modal must not obscure it.
    element('overlay').hidden = !title;
    element('state-title').textContent = title; element('state-description').textContent = description;
    element<HTMLButtonElement>('continue').hidden = !action; element('continue').textContent = action;
    const effect = effects.frame;
    const notice = element('milestone-notice');
    notice.hidden = !effect || session.paused || !session.started || session.completed
      || (effect.kind === 'departure' && effect.elapsed >= 600 && effect.elapsed < CURTAIN_CLOSE_START_MS);
    notice.dataset.kind = effect?.kind ?? '';
    notice.dataset.reduced = String(reducedMotion.matches);
    const milestoneTitle = effect?.kind === 'unlock' ? text('milestone.secured') : effect?.kind === 'departure' ? text('milestone.departure', { planet: session.planet }) : text('milestone.arrival', { planet: session.planet });
    const milestoneHelp = effect?.kind === 'unlock' ? text('milestone.ready') : effect?.kind === 'departure' ? session.planet === session.pack.levels.length ? text('state.final') : text('milestone.destination', { planet: session.planet + 1 }) : text('ui.intro');
    if (element('milestone-title').textContent !== milestoneTitle) element('milestone-title').textContent = milestoneTitle;
    if (element('milestone-help').textContent !== milestoneHelp) element('milestone-help').textContent = milestoneHelp;
  }
  function drawBoard(view = renderer.resize(session.world)): void {
    const interpolation = manualTicks || session.paused ? 0 : Math.min(100, Math.max(0, performance.now() - lastPresentationTick));
    const effect = effects.sample(interpolation);
    canvas.dataset.effect = effect?.kind ?? '';
    canvas.dataset.effectTime = String(Math.round(effect?.elapsed ?? 0));
    renderer.draw(session.world, view, session.pack.id, session.planet, effect, reducedMotion.matches);
  }
  let lastSavedKey = '';
  function persistAttempt(leaving = false): void {
    if (!attemptStore || replay.viewing) return;
    const key = `${session.generation}:${session.world.tick}:${session.world.status}:${session.started}:${session.completed}:${session.paused}`;
    if (!leaving && key === lastSavedKey) return;
    lastSavedKey = key; savedAt = Math.max(Date.now(), savedAt + 1);
    const checkpoint = saveAttempt(session, savedAt);
    void attemptStore.save(checkpoint, leaving).then(saved => {
      const recovery = restoreFailed && !didRestore ? 'The previous game could not be restored. This planet has been restarted. ' : '';
      element('save-status').textContent = recovery + (saved ? 'Game saved in this browser. Return here to continue.' : 'Saving is unavailable in this browser. Your game will not survive closing this page.');
    });
  }
  const replay = replayControls(packs, () => session, value => { session = value; generation = -1; clearInput(); audio.stop(); render(); });
  function replayAction(action: ReplayAction): void {
    if (replay.recorder) { try { replay.recorder.action(action); } catch (error) { replay.cancel(); element('audio-status').textContent = error instanceof Error ? error.message : 'Recording stopped'; replayAction(action); } }
    else if (action.type === 'command') session.command(action.direction, action.fire, action.aimOnly);
    else if (action.type === 'pause') session.togglePause();
    else if (action.type === 'restart') session.restart();
    else if (action.type === 'retry') session.retry();
    else session.start();
  }
  function retryWithPresentation(): void {
    if (replay.viewing) replay.cancel();
    replayAction({ type: session.world.status === 'won' ? 'restart' : 'retry' }); clearInput();
    if (session.world.status === 'dead') camera.returnToStart(session.world, reducedMotion.matches);
  }
  function inputCommand(direction: Direction, fire: boolean, aimOnly?: boolean): void {
    // A press event can arrive between ticks. Preserve its shot until the next step,
    // even if the player releases Fire or changes aim before the polling pass.
    if (inputShotQueued) return;
    replayAction({ type: 'command', direction, fire, ...(aimOnly ? { aimOnly } : {}) });
    if (fire) inputShotQueued = true;
  }
  function advance(): void {
    if (replay.viewing) return;
    lastPresentationTick = performance.now();
    const arriving = effects.holdingArrival;
    if (!session.paused && session.started && !session.completed) effects.update(100);
    if (arriving) {
      clearInput(); if (!session.paused) audio.consume(session.world.drainEvents()); render(); return;
    }
    if (effects.holdingDeparture && session.world.status === 'won' && !session.paused) { clearInput(); render(); return; }
    pollInput();
    const command = input.command(session.world.robot.direction);
    if (command && !session.paused && session.world.status === 'playing') inputCommand(command.direction, command.fire, command.aimOnly);
    inputShotQueued = false;
    const oldPlanet = session.planet, oldCompleted = session.completed;
    if (replay.recorder) { try { replay.recorder.step(); } catch (error) { replay.cancel(); element('audio-status').textContent = error instanceof Error ? error.message : 'Recording stopped'; } } else session.step();
    if (location.hash !== '#test' && (oldPlanet !== session.planet || oldCompleted !== session.completed)) progress.advance(session.pack.id, session.planet, session.completed);
    if (generation !== session.generation) {
      generation = session.generation; focusWorld();
    }
    if (session.world.status !== previousStatus || session.world.teleportTicks) clearInput();
    if (session.world.status !== previousStatus) {
      audio.stop();
      if (session.world.status === 'dead') camera.returnToStart(session.world, reducedMotion.matches);
    }
    previousStatus = session.world.status;
    if (session.world.teleportTicks === 4) camera.focus(session.world);
    const events = session.world.drainEvents();
    effects.consume(events, session.world);
    camera.update(session.world, reducedMotion.matches); audio.consume(events);
    render();
  }
  function startOrContinue(): void {
    const resuming = session.paused;
    if (!session.started) { session.start(); effects.arrive(session.world); }
    else if (session.completed) { replay.cancel(); session.newCampaign(); }
    else if (session.paused) replayAction({ type: 'pause' });
    else if (session.world.status === 'dead') { /* The automatic restart is already pending. */ }
    render(); if (resuming) audio.resume(); else activateAudio();
    canvas.focus({ preventScroll: true });
  }
  function pauseOrResume(): void {
    replayAction({ type: 'pause' }); clearInput();
    if (session.paused) audio.pause(); else audio.resume();
    render();
  }
  const resetProgress = document.createElement('button'); resetProgress.textContent = text('progress.reset');
  resetProgress.addEventListener('click', () => { replay.cancel(); progress.reset(); session.newCampaign(packs.find(pack => pack.id === '01') ?? packs[0]); render(); });
  document.querySelector('.campaign-settings')!.append(resetProgress);
  element('continue').addEventListener('click', startOrContinue);
  element('start').addEventListener('click', () => { if (session.started) { replay.cancel(); session.newCampaign(); } else { session.start(); effects.arrive(session.world); } render(); activateAudio(); canvas.focus({ preventScroll: true }); });
  element('restart').addEventListener('click', () => {
    if (replay.viewing) replay.cancel();
    replayAction({ type: 'restart' }); clearInput(); render(); activateAudio();
    canvas.focus({ preventScroll: true });
  });
  element('pause').addEventListener('click', () => { pauseOrResume(); canvas.focus({ preventScroll: true }); });
  element<HTMLSelectElement>('pack').addEventListener('change', event => { replay.cancel(); session.newCampaign(packs.find(p => p.id === (event.target as HTMLSelectElement).value)); render(); });
  element<HTMLSelectElement>('planet').addEventListener('change', event => { replay.cancel(); session.selectPlanet(Number((event.target as HTMLSelectElement).value)); render(); });
  themeSelector.addEventListener('change', event => { void artwork.activate((event.target as HTMLSelectElement).value); });
  element('enable-sound').addEventListener('click', activateAudio);
  element<HTMLInputElement>('mute').addEventListener('change', event => { const muted = (event.target as HTMLInputElement).checked; audio.setMuted(muted); preferences.apply({ muted }); });
  element<HTMLInputElement>('volume').addEventListener('input', event => { const volume = Number((event.target as HTMLInputElement).value) / 100; audio.setVolume(volume); preferences.apply({ volume }); });
  let currentPage = 'game';
  const inputOptions = {
    facing: () => session.world.robot.direction,
    command: inputCommand,
    active: () => currentPage === 'game' && !replay.viewing && !session.paused && !effects.holdingArrival && session.world.status === 'playing',
    start: () => { if (currentPage !== 'game') return; if (!session.started) { session.start(); effects.arrive(session.world); render(); activateAudio(); } },
    pause: () => { if (currentPage === 'game') pauseOrResume(); },
    retry: () => { if (currentPage !== 'game') return; retryWithPresentation(); render(); activateAudio(); }
  };
  const pollInput = attachInput(input, inputOptions);
  touchControls = attachTouch(input, inputOptions);
  function pauseInBackground(): void {
    clearInput();
    if (session.started && !session.paused && !session.completed) { replayAction({ type: 'pause' }); audio.pause(); }
    render(); persistAttempt(true);
  }
  addEventListener('blur', pauseInBackground);
  addEventListener('pagehide', pauseInBackground);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseInBackground(); });
  let resizeFrame = 0;
  function scheduleResize(): void {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      // visualViewport also covers browser chrome and keyboards on Android.
      document.documentElement.style.setProperty('--screen-height', `${window.visualViewport?.height ?? innerHeight}px`);
      render();
    });
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleResize).observe(canvas.parentElement!);
  addEventListener('resize', scheduleResize);
  addEventListener('orientationchange', () => { clearInput(); scheduleResize(); });
  window.visualViewport?.addEventListener('resize', scheduleResize);
  document.addEventListener('fullscreenchange', () => { clearInput(); scheduleResize(); });
  // Query URLs work on GitHub Pages and keep the live session when navigating.
  const inputSettings = document.querySelector('.input-settings');
  if (inputSettings) element('game-settings').append(inputSettings);
  function showPage(): void {
    const requested = new URL(location.href).searchParams.get('page');
    currentPage = requested && ['settings', 'about', 'objects'].includes(requested) ? requested : 'game';
    if (currentPage !== 'game') pauseInBackground();
    element('play-area').hidden = currentPage !== 'game';
    for (const page of document.querySelectorAll<HTMLElement>('.subpage[data-page]')) page.hidden = page.dataset.page !== currentPage;
    document.body.dataset.page = currentPage;
    window.scrollTo(0, 0);
    scheduleResize();
    if (currentPage === 'game') canvas.focus({ preventScroll: true });
    else {
      const heading = document.querySelector<HTMLElement>('.subpage[data-page="' + currentPage + '"] h1, .subpage[data-page="' + currentPage + '"] h2');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-page-link]')) {
    link.addEventListener('click', async event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      if (document.fullscreenElement) await document.exitFullscreen();
      const url = new URL(location.href);
      if (link.dataset.pageLink === 'game') url.searchParams.delete('page');
      else url.searchParams.set('page', link.dataset.pageLink!);
      history.pushState(null, '', url);
      showPage();
    });
  }
  addEventListener('popstate', showPage);
  showPage();
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  element('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else element('display-status').textContent = text('fullscreen.unavailable');
    } catch { element('display-status').textContent = text('fullscreen.failed'); }
    scheduleResize();
    canvas.focus({ preventScroll: true });
  });
  scheduleResize();
  render();
  void artwork.activate(artwork.saved() ?? javaTheme.id);
  // Real-time rendering never catches up with an unbounded backlog after a suspended tab.
  setInterval(() => { if (!manualTicks) advance(); }, 100);
  function animateFeedback(): void {
    if (effects.frame && !manualTicks && !session.paused && !session.completed) drawBoard();
    requestAnimationFrame(animateFeedback);
  }
  requestAnimationFrame(animateFeedback);

  // Opt-in deterministic harness for the packaged browser tests; absent in normal play.
  if (location.hash === '#test') {
    type PendingThemeLoad = { id: string; resolve: (atlas: CanvasImageSource) => void; reject: (error: Error) => void };
    const pendingThemeLoads: PendingThemeLoad[] = [];
    const testAtlas = (id: string): HTMLCanvasElement => {
      const theme = themes.find(candidate => candidate.id === id);
      if (!theme) throw Error(`Unknown test theme: ${id}`);
      const result = document.createElement('canvas'); result.width = theme.atlas.width; result.height = theme.atlas.height;
      return result;
    };
    (window as unknown as { robboTest: unknown }).robboTest = {
      load(rows: string[], options: Record<string, number[]> = {}, seed = 1, realtime = false) {
        const data: LevelData = { ...packs[0].levels[0], rows, options, width: rows[0].length, height: rows.length, author: 'Deterministic browser test fixture', notes: 'Not an imported planet' };
        session.world = new GameWorld(data, seededRandom(seed)); session.started = true; session.paused = false; session.completed = false;
        session.generation++; manualTicks = !realtime; render(); effects.reset(); render();
      },
      step(count = 1) { for (let i = 0; i < count; i++) advance(); },
      command(direction: Direction, fire = false) { session.command(direction, fire); },
      inventory(ammo: number, keys = 0) { session.world.ammo = ammo; session.world.keys = keys; render(); },
      planet(number: number, packId = '02') { replay.cancel(); session.newCampaign(packs.find(p => p.id === packId)); session.selectPlanet(number); manualTicks = true; render(); effects.reset(); render(); },
      snapshot() { const w = session.world; return { planet: session.planet, completed: session.completed, status: w.status, robot: [w.robot.x, w.robot.y], ammo: w.ammo, remaining: w.remaining, entities: [...w.entities.values()].map(e => ({ ...e })), events: [...audio.played], failures: [...audio.failures] }; },
      artworkFrames() {
        const atlas = artwork.atlas;
        if (!(atlas instanceof HTMLCanvasElement)) return [];
        const a = artwork.activeTheme.atlas, painter = atlas.getContext('2d')!;
        return artwork.activeTheme.frames.map(([x, y]) => {
          const data = painter.getImageData(x * a.stride + a.inset, y * a.stride + a.inset, a.cell, a.cell).data;
          let visible = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 32) visible++;
          return { x, y, visible };
        });
      },
      artwork: {
        activate(id: string) { void artwork.activate(id); },
        useControlledLoader() {
          artwork.setTestLoader(id => new Promise((resolve, reject) => pendingThemeLoads.push({ id, resolve, reject })));
        },
        pending() { return pendingThemeLoads.map(load => load.id); },
        resolve(id: string) {
          const index = pendingThemeLoads.findIndex(load => load.id === id);
          if (index < 0) throw Error(`No pending test theme: ${id}`);
          pendingThemeLoads.splice(index, 1)[0].resolve(testAtlas(id));
        },
        reject(id: string) {
          const index = pendingThemeLoads.findIndex(load => load.id === id);
          if (index < 0) throw Error(`No pending test theme: ${id}`);
          pendingThemeLoads.splice(index, 1)[0].reject(Error(`Controlled test failure: ${id}`));
        },
        state() {
          return {
            active: artwork.activeTheme.id,
            theme: document.documentElement.dataset.theme,
            artwork: document.documentElement.dataset.artwork,
            selected: themeSelector.value,
            stored: artwork.saved(),
            hudCanvases: document.querySelectorAll('.hud .icon canvas').length,
            hudArtwork: [...document.querySelectorAll<HTMLCanvasElement>('.hud .icon canvas')].map(icon => icon.toDataURL()),
            canvasLabel: canvas.getAttribute('aria-label')
          };
        }
      },
      assert() { session.world.assertConsistent(); }
    };
    // Visible controls for inspecting the real engine's effects in the in-app browser.
    // They exist only in the explicitly requested deterministic test page.
    if (new URLSearchParams(location.search).has('feedback-preview')) {
      const fixture = () => {
        const rows = [
          'ssssssssssssssss', 's..............s', 's..ssss...sss..s',
          's..............s', 's....RT...!....s',
          's..............s', 's..sss....sss..s', 's..............s',
          's....sss.......s', 's..............s', 'ssssssssssssssss'
        ];
        const data: LevelData = { ...packs[0].levels[0], rows, options: {}, width: 16, height: rows.length, author: 'Feedback test fixture', notes: 'Preview only; campaign progress is not saved' };
        session.world = new GameWorld(data, seededRandom(1)); session.started = true; session.paused = false; session.completed = false;
        session.generation++; manualTicks = true; render(); effects.reset(); render();
      };
      const controls = document.createElement('div'); controls.className = 'toolbar';
      controls.setAttribute('aria-label', 'Feedback preview controls');
      const button = (label: string, action: () => void) => {
        const node = document.createElement('button'); node.textContent = label; node.addEventListener('click', action); controls.append(node);
      };
      button('Preview final screw', () => { fixture(); audio.unlock(); session.command(0); advance(); });
      button('Preview take-off', () => {
        fixture(); audio.unlock(); for (let i = 0; i < 5; i++) { session.command(0); advance(); }
      });
      button('Preview arrival', () => { fixture(); effects.arrive(session.world); audio.unlock(); render(); });
      button('Advance 100 ms', () => advance());
      button('Play animation', () => {
        const kind = effects.frame?.kind;
        fixture(); audio.unlock();
        if (kind === 'arrival') { effects.arrive(session.world); render(); }
        else for (let i = 0; i < (kind === 'departure' ? 5 : 1); i++) { session.command(0); advance(); }
        manualTicks = false; canvas.focus({ preventScroll: true });
      });
      element('play-area').prepend(controls);
    }
  }

}
