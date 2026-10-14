import type { AtlasCell } from '../rendering/sprite-frames';
export interface ThemeManifest {
  id: string; name: string; author: string; about: string;
  atlas: { path: string; width: number; height: number; cell: number; stride: number; inset: number };
  digits: { path: string; width: number; height: number; cell: number; stride: number };
  frames: readonly AtlasCell[];
  palette: { background?: string; levels?: Record<string, string> };
  sounds?: Readonly<Record<string, string>>;
}
/** Fixed frame coordinates remain defined by sprite-frames.ts; alternate atlases must share this layout. */
export const javaTheme: ThemeManifest = {
  id: 'java-atlas-v1', name: 'Original Legacy', author: 'Historical Robbo project',
  about: 'Original Java atlas and HUD digits; historical resources preserved without substitution.',
  atlas: { path: 'legacy-icons32.png', width: 410, height: 274, cell: 32, stride: 34, inset: 2 },
  digits: { path: 'numbers.png', width: 178, height: 32, cell: 16, stride: 18 },
  frames: Array.from({ length: 88 }, (_, index) => [index % 11, Math.floor(index / 11)] as AtlasCell),
  palette: {}
};
/**
 * A full-colour companion layout. Its atlas is generated in the browser so that
 * every tile can be adjusted in one small, versioned drawing module.
 */
export const neonTheme: ThemeManifest = {
  id: 'neon-forge-v1', name: 'Neon Forge', author: 'Robbo TypeScript project',
  about: 'Modern high-colour sci-fi artwork with the original frame contract.',
  atlas: { path: 'generated:neon-forge', width: 410, height: 274, cell: 32, stride: 34, inset: 2 },
  digits: { path: 'numbers.png', width: 178, height: 32, cell: 16, stride: 18 },
  frames: Array.from({ length: 88 }, (_, index) => [index % 11, Math.floor(index / 11)] as AtlasCell),
  palette: { background: '#071326' }
};
/** Add manifests here to expose another compatible layout in the browser. */
export const journeyNames = ['Atari Reborn', 'Lost Mining Colony', 'Ice Moon', 'Jungle Planet', 'Red Desert', 'Ocean World', 'Volcanic Forge', 'Lunar Ruins', 'Abandoned Orbital Station', 'Mushroom Planet'] as const;
const journeyBackgrounds = ['#33251b', '#302522', '#1d3548', '#192d23', '#492c25', '#12343d', '#2e2228', '#292738', '#1d3035', '#30263b'];
export const journeyThemes: readonly ThemeManifest[] = journeyNames.map((name, index) => ({
  ...neonTheme, id: `planet-journey-${index + 1}`, name,
  about: `Robbo repairs his escape capsule on ${name.toLowerCase()}.`,
  atlas: { path: `generated:planet-journey-${index + 1}`, width: 1640, height: 1096, cell: 128, stride: 136, inset: 8 },
  palette: { background: journeyBackgrounds[index] }
}));
export const themes: readonly ThemeManifest[] = [javaTheme, ...journeyThemes, neonTheme];
export function validateTheme(theme: ThemeManifest, atlas: { width: number; height: number }, digits: { width: number; height: number }): void {
  const a = theme.atlas, d = theme.digits;
  const scale = a.cell / 32;
  if (!theme.id || !Number.isInteger(scale) || scale < 1 || scale > 4 || a.stride !== 34 * scale || a.inset !== 2 * scale || d.cell !== 16 || d.stride !== 18) throw Error('Incompatible theme frame layout');
  if (atlas.width !== a.width || atlas.height !== a.height || digits.width !== d.width || digits.height !== d.height) throw Error('Theme image dimensions do not match the manifest');
  for (const [x, y] of theme.frames) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x * a.stride + a.inset + a.cell > a.width || y * a.stride + a.inset + a.cell > a.height) throw Error('Theme frame exceeds atlas bounds');
  }
  for (const [x, y] of javaTheme.frames) if (!theme.frames.some(frame => frame[0] === x && frame[1] === y)) throw Error('Theme is missing required atlas frames');
  if (9 * d.stride + d.cell > d.width || d.height < 32) throw Error('Theme is missing HUD digit frames');
  for (const colour of [theme.palette.background, ...Object.values(theme.palette.levels ?? {})]) if (colour !== undefined && !/^#[0-9a-f]{6}$/i.test(colour)) throw Error('Invalid theme palette colour');
}
export function themeBackground(theme: ThemeManifest, pack: string, planet: number, authored: string): string {
  return theme.palette.levels?.[`${pack}:${planet}`] ?? theme.palette.background ?? authored;
}
/** Load both resources before exposing a theme; callers retain their last valid theme on rejection. */
export async function loadTheme(theme: ThemeManifest): Promise<{ atlas: HTMLImageElement; digits: HTMLImageElement }> {
  const load = (path: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(Error(`Unable to load theme resource: ${path}`)); image.src = path;
  });
  const [atlas, digits] = await Promise.all([load(theme.atlas.path), load(theme.digits.path)]);
  validateTheme(theme, { width: atlas.naturalWidth, height: atlas.naturalHeight }, { width: digits.naturalWidth, height: digits.naturalHeight });
  return { atlas, digits };
}
