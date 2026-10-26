# Development

## Play locally

Use Node **>=24.21.0 <25** (see `package.json` and `.nvmrc`). From the
repository root:

```sh
npm ci
npm start
```

Open http://127.0.0.1:8080.

## Build a portable release

```sh
npm run package
```

Open `release/robbo/index.html` directly, or run `npm run preview` and open
http://127.0.0.1:8080. Stop the development server before starting the preview;
both use port 8080. `dist` and `release` are generated, ignored directories.
Packaging produces a self-contained IIFE, so the game works through `file://`
as well as on GitHub Pages.

## Validate

```sh
npm test
npm run test:tooling
npm run package
npx playwright install chromium firefox
npm run test:dev
npm run test:browser
npm run test:input
npm run test:touch-shooting
npm run test:session-browser
npm run test:autosave
npm run test:viewport
npm run test:artwork
npm run test:performance
```

The release browser commands package the game first; `test:dev` starts Vite on
port 8082 and checks the development entrypoint. To test an already built
release, run the corresponding `tests/browser/*.check.cjs` with Node. Run those
checks sequentially: some start a server on port 8080. Set
`ROBBO_BROWSER=firefox` for the additional viewport check; `ROBBO_CHROMIUM`
optionally selects a Chromium executable.

## Repository map

| Directory | Responsibility |
| --- | --- |
| `src/engine` | Game rules and world state |
| `src/application` | Sessions and deterministic replay |
| `src/browser` | Input, audio and persistence |
| `src/presentation` | Canvas, themes and messages |
| `src/app` | Browser startup and controllers |
| `src/generated` | Imported campaign data; never edit manually |
| `website` | Shipped HTML, CSS and assets |
| `resources` | Canonical maps and source artwork |
| `archive` | Unused assets retained outside the release |
| `tests` | Unit, integration, browser and tooling checks |
| `scripts` | Data import, release and development tools |

## Replay compatibility

Engine `robbo-java-3` allows bomb blasts to destroy doors, matching GNU Robbo
and unblocking the lower door on planet 12 without a second key. Shots still
cannot destroy doors. Historical campaign maps remain unchanged.

Engine `robbo-java-2` corrected bird contact: cardinal adjacency is lethal,
including when either Robbo or a bird moves into a neighbouring cell. Diagonals
do not count. The existing teleport materialization grace period is unchanged.

Recordings and saved attempts from `robbo-java-1` and `robbo-java-2` are rejected
because their simulation checkpoints can differ. Incompatible saved attempts
fall back to the selected planet. Keep an old build to view those recordings; record
new runs with the current build. Changing the engine field in an old recording
is not a valid migration. Campaign progress and preference storage are unchanged.

## Continuing a saved game

New profiles start with campaign **Original Legacy** (`01`) and its classic
artwork. Explicitly saved campaign and artwork choices are retained.

The current attempt is saved automatically in IndexedDB (`robbo-saves`, object
store `attempts`, key `current`) after each simulation tick or session change.
Loading finishes before input and the game clock are enabled. The saved attempt
opens paused; choose **Resume** to continue. Held touch/keyboard input and old
sound events are discarded. No offline time is simulated.

The checkpoint contains the campaign, planet, seed and current RNG state,
inventory, every entity and its timers, active lasers and bomb waves, teleport
materialization and death/win lifecycle counters. Laser owners and parts are
reconnected to the restored entity identities. Campaign data hashes and the
shared replay engine version reject incompatible records; invalid records fall
back to the selected planet instead of partially loading.

A synchronous `localStorage` journal (`robbo.attempt.backup.v1`) protects the
latest checkpoint on blur, visibility loss and pagehide, when an asynchronous
write might not finish. If IndexedDB is unavailable, the journal is the fallback
store. On startup the newest valid record wins. Replay imports and `#test`
fixtures cannot replace the player's save. New game, Restart and Reset saved
progress replace the checkpoint with the new attempt.

The save belongs to this browser profile and origin. Clearing site data removes
it; private-mode data is temporary. Another device or browser has its own save.
Storage failure is shown in Settings. A sudden OS/process crash can interrupt
an in-flight write; continuous checkpoints limit the loss to recent ticks.

`npm run test:autosave` launches a browser with a temporary persistent profile,
collects ammunition on planet 20, closes the browser process and reopens it.
It compares the full checkpoint, checks paused restoration and Resume, then
checks reset and a blocked-IndexedDB fallback. CI runs it in Chromium and Firefox.
Simulation tests also compare continued state and RNG through lasers, shooting
birds, bomb chains, teleportation and the death lifecycle.

References: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
provides asynchronous structured storage; [visibilitychange](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event)
is the lifecycle checkpoint used when a mobile page becomes hidden.

## GitHub Pages and PR previews

The production game stays at `https://robbo-game.github.io/robbo/`. Each successful
same-repository PR build is available at `/robbo/previews/pr-N/`; the comparison
index is `/robbo/previews/`. Preview navigation links back to main and the index.
`version.json` in each slot identifies its built commit and PR.

A trusted main-branch `workflow_run` publisher downloads the successful build's
static ZIP, validates archive paths and updates only that slot on `pages-site`.
Optimistic Git pushes retry against the current combined tree, preserving other
slots. A serialized Pages deploy checks out the latest combined tree after
obtaining its slot. Stale main/PR commits, closed PRs and fork builds cannot
publish. No code from the downloaded PR artifact is executed by the publisher.

Preview paths namespace localStorage and IndexedDB by PR number. Main retains
its original storage keys, and testing different variants cannot overwrite its
saved attempt, artwork or preferences. Old preview URLs are retained after PR
closure so bookmarked comparisons remain available.
