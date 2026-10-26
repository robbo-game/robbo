# Canonical campaign sources

These are the unchanged historical map files, relocated from `legacy/RobboNormal/src/robbo/world/levels/`. They are active game data, not an outstanding migration task. Both packs contain 56 planets; pack 02 remains the default.

`npm run import:levels` generates `src/generated/packs.ts` and `docs/import-diagnostics.md`. `npm run check:levels` checks those outputs on every build. Keep the original metadata, including the stale records documented by the importer; do not simplify puzzles to make them pass.

| File | SHA-256 |
| --- | --- |
| `robbo01.dat` | `8cde5070e81184bb664a25a25922b24d47fb2f5ef957b3ff4d91b676b7957fb8` |
| `robbo02.dat` | `fe6461631f7e8e7b214e841af53b0c5f9d043731ae502125e1e80a8d5957813f` |

The original files remain available in [the merged implementation commit](https://github.com/robbo-game/robbo/tree/c8528cd/legacy/RobboNormal/src/robbo/world/levels).

## Unvalidated candidate

[`candidates/original-campaign-reference.dat`](candidates/original-campaign-reference.dat)
was relocated byte-for-byte from the supplemental JavaScript prototype. It is
not listed in `packs.json` and is not imported or shipped as a playable pack.
Its row counts, ending, extra symbols and palettes need explicit validation; see
[candidate-pack requirements](../../docs/campaign-import.md#candidate-packs).
