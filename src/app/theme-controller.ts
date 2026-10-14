import { javaTheme, loadTheme, neonTheme, themes, validateTheme } from '../presentation/themes/theme';
import { createModernAtlas, validateModernAtlas } from '../presentation/rendering/modern-art';
import { createJourneyAtlas } from '../presentation/rendering/journey-art';
import { text } from '../presentation/i18n/messages';

/** Owns async theme loading; stale requests cannot replace the active artwork. */
export function createThemeController(canvas: HTMLCanvasElement, themeSelector: HTMLSelectElement, render: () => void) {
  let atlas: CanvasImageSource | undefined;
  let displayAtlas: CanvasImageSource | undefined;
  let displayAtlasScale = 1;
  let artworkUnavailable = false;
  let activeTheme = javaTheme;
  let themeRequest = 0;
  type ThemeAtlasLoader = (themeId: string) => Promise<CanvasImageSource>;
  let testThemeAtlasLoader: ThemeAtlasLoader | undefined;
  function savedTheme(): string | null { try { return localStorage.getItem('robbo.artwork'); } catch { return null; } }
  async function activateTheme(id: string): Promise<void> {
    const next = themes.find(theme => theme.id === id) ?? javaTheme;
    const request = ++themeRequest;
    themeSelector.value = next.id;
    try {
      // Generated themes still use the exact validated 11×8 atlas contract.
      let candidate: CanvasImageSource;
      if (testThemeAtlasLoader) candidate = await testThemeAtlasLoader(next.id);
      else if (next.id.startsWith('planet-journey-')) {
        const generated = await createJourneyAtlas(Number(next.id.split('-').at(-1)) - 1);
        validateTheme(next, generated, { width: next.digits.width, height: next.digits.height }); candidate = generated;
      } else if (next.id === neonTheme.id) {
        const generated = createModernAtlas(); validateModernAtlas(generated);
        validateTheme(next, generated, { width: next.digits.width, height: next.digits.height }); candidate = generated;
      } else candidate = (await loadTheme(next)).atlas;
      if (request !== themeRequest) return;
      atlas = candidate;
      // Resample the 128px source artwork once to the 64px backing size used for
      // a 32 CSS-pixel cell. Per-frame high-quality atlas downscaling stalls input.
      displayAtlasScale = next.id.startsWith('planet-journey-') ? .5 : 1;
      if (displayAtlasScale === .5) {
        const display = document.createElement('canvas');
        display.width = next.atlas.width / 2; display.height = next.atlas.height / 2;
        const painter = display.getContext('2d', { willReadFrequently: true })!;
        painter.imageSmoothingEnabled = true; painter.imageSmoothingQuality = 'high';
        painter.drawImage(candidate, 0, 0, display.width, display.height);
        displayAtlas = display;
      } else displayAtlas = candidate;
      activeTheme = next; artworkUnavailable = false;
      canvas.setAttribute('aria-label', text('label.game.board.use.arrow.keys.to.move.and.control'));
      document.documentElement.dataset.theme = next.id;
      document.documentElement.dataset.artwork = next.id === javaTheme.id ? 'classic' : 'modern';
      document.documentElement.style.setProperty('--planet-colour', next.palette.background ?? '#111710');
      updateInventoryArtwork();
      try { localStorage.setItem('robbo.artwork', next.id); } catch { /* Storage is optional. */ }
    } catch (error) {
      if (request !== themeRequest) return;
      themeSelector.value = activeTheme.id;
      artworkUnavailable = true; canvas.setAttribute('aria-label', 'Game artwork unavailable'); console.error(error);
    }
    render();
  }
  function updateInventoryArtwork(): void {
    const illustrated = activeTheme.id !== javaTheme.id;
    const cells = [[4, 0], [7, 0], [5, 0], [6, 1]];
    document.querySelectorAll<HTMLElement>('.hud .icon').forEach((icon, index) => {
      if (index === 3) return; // The planet marker identifies a number, not a ship pickup.
      icon.replaceChildren(); icon.style.removeProperty('background');
      if (!illustrated || !atlas) return;
      const preview = document.createElement('canvas'); preview.width = preview.height = 128;
      preview.setAttribute('aria-hidden', 'true');
      const p = preview.getContext('2d')!, a = activeTheme.atlas, [x, y] = cells[index];
      p.imageSmoothingEnabled = true; p.imageSmoothingQuality = 'high';
      p.drawImage(atlas, x * a.stride + a.inset, y * a.stride + a.inset, a.cell, a.cell, 0, 0, 128, 128);
      icon.style.background = 'none'; icon.append(preview);
    });
  }

  return {
    get atlas() { return atlas; },
    get displayAtlas() { return displayAtlas; },
    get displayAtlasScale() { return displayAtlasScale; },
    get artworkUnavailable() { return artworkUnavailable; },
    get activeTheme() { return activeTheme; },
    activate: activateTheme,
    saved: savedTheme,
    setTestLoader(loader: ThemeAtlasLoader) { testThemeAtlasLoader = loader; }
  };
}
