# Planet Journeys artwork

The two `planet-journeys` PNG sheets contain ten original AI-generated visual concepts for Robbo.
They are checked in at their original resolution for visual review and replacement.
Each row contains Robbo, a screw, a magnet, enemy eyes, an escape capsule and terrain.

`journey-art.ts` specifies crop coordinates, removes connected paper around objects
and composes each illustration into a 4x atlas with 128px sprite cells. The logical
game grid stays 32px, while the renderer uses high-quality smoothing and a
supersampled display canvas. Connected-component cleanup removes table-line debris
and normalizes silhouettes without stretching their proportions. Robot walking and
capsule flashing reuse shifted illustration frames; these are not fully authored
directional animation sheets.

`expedition-objects.png` is an AI-generated transparent 4x3 companion sprite sheet.
Its rows are: key/ammunition/door/crate, momentum crate/bomb/mystery cache/teleport,
and cannon/worm/bird/bear. These shared expedition tools and creatures use rounded,
worn-metal or organic silhouettes instead of square icon backgrounds. The renderer
adds subtle contact shadows. Inventory icons are drawn from the active atlas.

`planet-materials.png` contains ten AI-generated material surfaces in a 5x2 grid,
ordered like the theme selector. `journey-terrain.ts` clips world-aligned textures
to neighbour-aware wall silhouettes with rounded exposed corners, edge shading
and sparse biome accents. Occupancy and collision geometry do not change.

River, smoke, impacts, blasts, flame and projectile frames are explicitly painted
at 4x resolution. River remains recognizably blue-green across all ten planets.
Generated atlases and the board use software-backed Canvas contexts to avoid
intermittently missing river layers after repeated layout changes. Atlases are
cached after successful generation, and failed loads can be retried.

Select any of the ten named journeys using Artwork while playing. Switching is
presentation-only and keeps the current planet, inventory and robot position.
The original Java reference and the earlier Neon Forge prototype remain available.

Run `npm run test:artwork` to check all ten layouts, game-state preservation,
remembered selection and rapid switching. The test also checks visible pixels for
every gameplay frame and samples actual browser screenshots for river visibility
before Canvas pixel readback can flush drawing and mask a regression.
