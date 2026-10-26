// Workout Tracker launcher.
// Picks which copy of the app to run (the one shipped in this folder, or a newer downloaded update),
// checks a GitHub repo for updates, downloads and verifies them, and rolls back if an update won't start.
// This file changes rarely. Everything else lives in bundle/ and updates itself.
const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

global.shellRequire = require; // lets updated code load modules shipped with the app (e.g. yauzl)

const SHELL_VERSION = 1;
const APP_ID = 'local.workout.tracker';
const DEFAULT_SOURCE = ''; // "owner/repo" on GitHub; can also be set in Settings
const RAW = process.env.WT_UPDATE_BASE || 'https://raw.githubusercontent.com';
const BUNDLED_DIR = path.join(__dirname, '..', 'bundle');
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

// ---------- helpers ----------
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(d, null, 2)); fs.renameSync(f + '.tmp', f); };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
function cmp(a, b) {
  const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}
const updatesDir = () => path.join(app.getPath('userData'), 'updates');
const stateFile = () => path.join(updatesDir(), 'active.json');
const configFile = () => path.join(updatesDir(), 'config.json');
const versionDir = (v) => path.join(updatesDir(), v);
const bundleInfo = (dir) => readJSON(path.join(dir, 'version.json'));
function usable(dir) {
  const info = bundleInfo(dir);
  return !!info && fs.existsSync(path.join(dir, 'core.js')) && (info.minShell || 1) <= SHELL_VERSION;
}
const handle = (name, fn) => { ipcMain.removeHandler(name); ipcMain.handle(name, fn); };

// ---------- single instance ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  boot();
}

function boot() {
  const BUNDLED = bundleInfo(BUNDLED_DIR) || { version: app.getVersion() };
  let state = readJSON(stateFile()) || {};
  state.bad ||= [];

  const rollback = (why) => {
    if (state.version && !state.bad.includes(state.version)) state.bad.push(state.version);
    const prev = state.previous;
    state.version = prev && prev !== state.version && usable(versionDir(prev)) ? prev : null;
    state.previous = null; state.pending = false; state.attempts = 0; state.rolledBack = why;
    writeJSON(stateFile(), state);
  };

  // A new update gets two launches to prove it works.
  if (state.version && state.pending) {
    state.attempts = (state.attempts || 0) + 1;
    if (state.attempts > 2) rollback('did not start');
    else writeJSON(stateFile(), state);
  }

  let activeDir = BUNDLED_DIR;
  if (state.version && cmp(state.version, BUNDLED.version) > 0 && usable(versionDir(state.version))) activeDir = versionDir(state.version);
  let active = bundleInfo(activeDir) || BUNDLED;

  let healthy = false;
  const ctx = (dir) => ({
    handle, iconPath: ICON, shellVersion: SHELL_VERSION, version: (bundleInfo(dir) || BUNDLED).version, bundleDir: dir,
    onWindow: (win) => {
      // If a fresh update doesn't report in, go back to the last good version.
      if (dir === BUNDLED_DIR || !state.pending) return;
      win.webContents.on('render-process-gone', () => { if (!healthy) { rollback('crashed'); app.relaunch(); app.exit(0); } });
      win.webContents.once('did-finish-load', () => setTimeout(() => {
        if (!healthy) { rollback('did not finish loading'); app.relaunch(); app.exit(0); }
      }, +process.env.WT_HEALTH_TIMEOUT || 30000));
    },
  });

  // Load the chosen bundle; if it throws, fall back to the previous update, then to the shipped copy.
  for (;;) {
    try {
      require(path.join(activeDir, 'core.js')).start(ctx(activeDir));
      break;
    } catch (err) {
      if (activeDir === BUNDLED_DIR) throw err;
      rollback('failed to load');
      activeDir = state.version && cmp(state.version, BUNDLED.version) > 0 && usable(versionDir(state.version)) ? versionDir(state.version) : BUNDLED_DIR;
      active = bundleInfo(activeDir) || BUNDLED;
    }
  }

  // ---------- updater ----------
  const config = () => ({ source: '', token: '', ...(readJSON(configFile()) || {}) });
  const source = () => (config().source || active.source || DEFAULT_SOURCE || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  let status = { state: 'idle', current: active.version, notes: active.notes || '', rolledBack: state.rolledBack || null };
  let busy = false;
  const send = () => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update:status', { ...status, source: source() }));
  const set = (patch) => { status = { ...status, ...patch }; send(); return { ...status, source: source() }; };

  async function get(url) {
    const headers = { 'Cache-Control': 'no-cache' };
    const { token } = config();
    if (token) headers.Authorization = `token ${token}`;
    const res = await net.fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? 'Update source not found. Check the repo name, or add a token if the repo is private.' : `Download failed (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }

  async function download(man, src) {
    const ref = man.ref || `v${man.version}`;
    const target = versionDir(man.version), tmp = target + '.partial';
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const [rel, hash] of Object.entries(man.files || {})) {
      if (rel.includes('..') || path.isAbsolute(rel) || /^[\\/]/.test(rel)) throw new Error('Update contains an unsafe file path.');
      let buf = null;
      try { const local = fs.readFileSync(path.join(activeDir, rel)); if (sha256(local) === hash) buf = local; } catch {}
      if (!buf) {
        buf = await get(`${RAW}/${src}/${ref}/bundle/${rel.split('/').map(encodeURIComponent).join('/')}`);
        if (sha256(buf) !== hash) throw new Error(`Update file ${rel} failed its checksum.`);
      }
      const out = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
    }
    const info = bundleInfo(tmp);
    if (!info || info.version !== man.version || !fs.existsSync(path.join(tmp, 'core.js'))) throw new Error('Downloaded update is incomplete.');
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(tmp, target);
    const s = readJSON(stateFile()) || { bad: [] };
    s.previous = activeDir === BUNDLED_DIR ? null : active.version;
    s.version = man.version; s.pending = true; s.attempts = 0; s.rolledBack = null; s.bad ||= [];
    writeJSON(stateFile(), s);
  }

  async function check() {
    if (busy) return { ...status, source: source() };
    const src = source();
    if (!src) return set({ state: 'no-source' });
    if (!/^[\w.-]+\/[\w.-]+$/.test(src)) return set({ state: 'error', error: 'Update source should look like owner/repo.' });
    busy = true; set({ state: 'checking', error: null });
    try {
      const man = JSON.parse((await get(`${RAW}/${src}/main/update-manifest.json?t=${Date.now()}`)).toString('utf8'));
      const ready = readJSON(stateFile());
      if (cmp(man.version, active.version) <= 0) return set({ state: 'up-to-date', latest: man.version, checkedAt: Date.now() });
      if (ready?.pending && ready.version === man.version && usable(versionDir(man.version))) return set({ state: 'ready', latest: man.version, notes: man.notes, checkedAt: Date.now() });
      if ((man.minShell || 1) > SHELL_VERSION) return set({ state: 'needs-download', latest: man.version, notes: man.notes, downloadUrl: man.downloadUrl || null, checkedAt: Date.now() });
      if ((ready?.bad || []).includes(man.version)) return set({ state: 'skipped', latest: man.version, checkedAt: Date.now() });
      set({ state: 'downloading', latest: man.version });
      await download(man, src);
      return set({ state: 'ready', latest: man.version, notes: man.notes || '', checkedAt: Date.now() });
    } catch (err) {
      return set({ state: 'error', error: String(err.message || err), checkedAt: Date.now() });
    } finally { busy = false; }
  }

  handle('update:get', () => ({ ...status, source: source(), config: { source: config().source, hasToken: !!config().token } }));
  handle('update:check', () => check());
  handle('update:restart', () => { app.relaunch(); app.exit(0); });
  handle('update:setConfig', (_e, cfg) => {
    const cur = config();
    const next = { source: (cfg?.source ?? cur.source ?? '').trim(), token: cfg?.token === undefined ? cur.token : String(cfg.token || '').trim() };
    writeJSON(configFile(), next);
    return check();
  });
  // The page calls this once it has loaded; that confirms a new update works.
  handle('update:healthy', () => {
    healthy = true;
    const s = readJSON(stateFile());
    if (!s) return true;
    if (s.pending && s.version === active.version) { s.pending = false; s.attempts = 0; }
    s.rolledBack = null; // shown once, this session
    writeJSON(stateFile(), s);
    // Keep only the running version, its fallback, and a downloaded-but-not-yet-applied update.
    try {
      const keep = new Set([active.version, s.previous, s.version].filter(Boolean));
      for (const d of fs.readdirSync(updatesDir())) {
        const full = path.join(updatesDir(), d);
        if (fs.statSync(full).isDirectory() && !keep.has(d)) fs.rmSync(full, { recursive: true, force: true });
      }
    } catch {}
    return true;
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    ensureShortcuts();
    setTimeout(check, 8000);
    setInterval(check, CHECK_EVERY_MS);
  });
}

// Portable build: Start menu (and, once, desktop) shortcuts so the app is easy to open
// and Windows notifications work. Shortcuts follow the exe if you move the folder.
function ensureShortcuts() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const opts = { target: process.execPath, cwd: path.dirname(process.execPath), icon: process.execPath, iconIndex: 0, appUserModelId: APP_ID, description: 'Workout Tracker' };
  const write = (file) => {
    try {
      let cur = null;
      try { cur = shell.readShortcutLink(file); } catch {}
      if (!cur || cur.target !== process.execPath) shell.writeShortcutLink(file, cur ? 'replace' : 'create', opts);
    } catch {}
  };
  write(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Workout Tracker.lnk'));
  const flag = path.join(app.getPath('userData'), '.desktop-shortcut');
  const desk = path.join(app.getPath('desktop'), 'Workout Tracker.lnk');
  if (!fs.existsSync(flag) || fs.existsSync(desk)) {
    write(desk);
    try { fs.mkdirSync(path.dirname(flag), { recursive: true }); fs.writeFileSync(flag, '1'); } catch {}
  }
}
