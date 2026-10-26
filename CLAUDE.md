# Workout Tracker

Personal Windows desktop app (Electron) for one user: a 3-day training cycle checklist, food and
nutrition tracking, streaks, progress charts, and Apple Health / Google Fit imports. Their data lives
only on their PC (`%APPDATA%\Workout Tracker\data.json`); this repo holds code, never their data.

## Layout
- `shell/main.js`: the launcher. Picks which bundle to run, checks this repo for updates, verifies
  SHA-256 hashes, rolls back if an update fails to start. Ships inside the .exe; changing it needs a
  full re-download, so avoid touching it. `SHELL_VERSION` there is the launcher's API version.
- `bundle/`: everything that self-updates. `core.js` (main process: window, storage, IPC, imports),
  `preload.js`, `src/importers.js`, `app/` (UI: index.html, app.js, styles.css, fonts).
- `bundle/version.json`: bundle version, `minShell`, release notes.
- `update-manifest.json`: what the installed app reads from `main` to find new versions. Its `ref` is the
  commit the files are downloaded from, and each file has a SHA-256 the app checks.

## Shipping a change (the user just reopens the app)
1. Edit files in `bundle/`. Test the UI in a browser: `bundle/app/index.html` runs without Electron
   (falls back to localStorage). Use `node -e "new Function(require('fs').readFileSync('bundle/app/app.js','utf8'))"` for a syntax check.
2. `node tools/release.js <next version> "<one line the user will see>"`, then
   `git add -A && git commit -m "Release <version>"`
3. `node tools/release.js --publish` (writes update-manifest.json pointing at that exact commit), then
   `git add -A && git commit -m "Publish <version>" && git push origin main`.
   No git tags: this environment can't push them, and the manifest's `ref` (a commit SHA) replaces them.
4. Installed apps check about 8 seconds after opening and every 4 hours, then show "Restart to update".

Rules for bundle code:
- `core.js` registers IPC with `ctx.handle(...)`, never `ipcMain.handle` directly.
- Node modules come from the shell: `(global.shellRequire || require)('yauzl')`. Only modules already
  shipped in the .exe are available (currently `yauzl`). New npm deps need a full rebuild.
- If a change needs a new launcher (new shell API, new Electron, new native dep), bump `SHELL_VERSION`,
  set `minShell` in `bundle/version.json`, and give the user a new full build (`npm run build` on
  Windows, or electron-builder `--win dir` + zip).
- The UI must call `window.api.update.healthy()` after it boots (it does, in `boot()`); otherwise the
  launcher treats the update as broken and rolls back.
- Keep the user's existing data working: add migrations in `migrate()` in `bundle/app/app.js`.

## Design
Clean, playful, Google Material look: Google Sans Flex (bundled), Google blue/red/yellow/green per
workout block, pill buttons, rounded cards, light by default with a dark theme.
