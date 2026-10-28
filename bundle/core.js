// Workout Tracker core: windows, storage, imports. Loaded by the launcher (shell/main.js),
// either from the copy shipped with the app or from a downloaded update.
// All data lives in %APPDATA%\Workout Tracker. Nothing leaves your PC except update checks.
const { app, BrowserWindow, dialog, shell, Notification, nativeTheme, Menu } = require('electron');
const os = require('os');
const isMac = process.platform === 'darwin';
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const path = require('path');
const fs = require('fs');
const importers = require('./src/importers');

exports.start = function start(ctx) {
  const handle = ctx.handle; // ipcMain.handle that tolerates re-registration
  let win;
  const dataDir = () => app.getPath('userData');
  const dataFile = () => path.join(dataDir(), 'data.json');
  const backupDir = () => path.join(dataDir(), 'backups');

  function createWindow() {
    win = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 900,
      minHeight: 640,
      backgroundColor: '#F0F4F9',
      title: 'Workout Tracker',
      icon: ctx.iconPath,
      // macOS keeps its traffic-light buttons, tucked into the top of the nav rail; Windows draws its own controls.
      ...(isMac
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 18 } }
        : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#5F6368', height: 36 } }),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
      },
    });
    if (!isMac) win.removeMenu();
    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(__dirname, 'app', 'index.html'));
    // Open external links in the default browser, never inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    // With "keep syncing in the background" on, closing the window hides it to the tray.
    win.on('close', (e) => { if (background && !quitting) { e.preventDefault(); win.hide(); } });
    ctx.onWindow?.(win);
  }

  app.whenReady().then(() => {
    // macOS needs an app menu for copy, paste, undo and quit shortcuts to work.
    if (isMac) Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]));
    createWindow();
  });
  // macOS: clicking the Dock icon brings the window back.
  app.on('activate', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } else createWindow(); });
  app.on('window-all-closed', () => app.quit());

  // ---------- storage ----------
  const readJSON = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

  handle('data:load', () => {
    const d = readJSON(dataFile());
    if (d) return d;
    // Fall back to the newest backup if the main file is damaged.
    try {
      const files = fs.readdirSync(backupDir()).filter(f => f.endsWith('.json')).sort().reverse();
      for (const f of files) { const b = readJSON(path.join(backupDir(), f)); if (b) return b; }
    } catch {}
    return null;
  });

  handle('data:save', (_e, data) => {
    fs.mkdirSync(dataDir(), { recursive: true });
    const json = JSON.stringify(data);
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, dataFile());
    // One backup per day, keep the last 30.
    try {
      fs.mkdirSync(backupDir(), { recursive: true });
      const today = localDate();
      fs.writeFileSync(path.join(backupDir(), `data-${today}.json`), json);
      const files = fs.readdirSync(backupDir()).filter(f => f.endsWith('.json')).sort();
      while (files.length > 30) fs.unlinkSync(path.join(backupDir(), files.shift()));
    } catch {}
    lastJson = json;
    cloudBackup(false);
    return true;
  });

  // ---------- cloud backup + sync between computers (Google Drive / OneDrive / iCloud Drive folder) ----------
  // Layout inside "<cloud folder>/Workout Tracker Backups":
  //   devices/<computer name>/latest.json and data-YYYY-MM-DD.json   backups, one folder per computer (last 60 days)
  //   sync/<device id>.json                                          each computer's current data, for the others to merge
  //   Workout Tracker Data.xlsx                                       readable copy (written by the computer with the newest changes)
  // Each computer only writes its own files, so cloud sync never has two writers on one file.
  let lastJson = null, cloudDir = null, cloudAt = 0, syncAt = 0, syncHash = '';
  let cloudState = { dir: null, lastAt: null, error: null };
  const cloudFolder = () => path.join(cloudDir, 'Workout Tracker Backups');
  const safeName = (n) => String(n || 'This computer').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 60) || 'This computer';
  // Settings that belong to one computer (folder paths, Wi-Fi sync, tray) are never shared.
  const LOCAL_KEYS = ['backupDir', 'watchDir', 'healthSources', 'sync', 'background', 'lastNotified', 'lastVersion', 'backupNudgeOff', 'lastHealthSync', 'deviceId', 'deviceName'];
  function syncPayload(json) {
    const d = JSON.parse(json);
    const settings = { ...(d.settings || {}) };
    for (const k of LOCAL_KEYS) delete settings[k];
    const t = d.meta?.t || {};
    return { deviceId: d.settings?.deviceId, deviceName: d.settings?.deviceName, platform: process.platform, version: ctx.version, writtenAt: Date.now(), lastChange: Math.max(0, ...Object.values(t)), data: { ...d, settings } };
  }
  function cloudBackup(force) {
    if (!cloudDir || !lastJson) return;
    let id = null, name = null;
    try { const st = JSON.parse(lastJson).settings || {}; id = st.deviceId; name = st.deviceName; } catch {}
    try {
      // Sync file: at most every 30 seconds, and only when something changed.
      const hash = require('crypto').createHash('sha1').update(lastJson).digest('hex');
      if (id && hash !== syncHash && (force || Date.now() - syncAt > 30 * 1000)) {
        fs.mkdirSync(path.join(cloudFolder(), 'sync'), { recursive: true });
        const f = path.join(cloudFolder(), 'sync', `${id}.json`);
        fs.writeFileSync(f + '.tmp', JSON.stringify(syncPayload(lastJson)));
        fs.renameSync(f + '.tmp', f);
        syncAt = Date.now(); syncHash = hash;
        cloudState = { ...cloudState, syncAt };
      }
      // Backups: every 10 minutes.
      if (force || Date.now() - cloudAt >= 10 * 60 * 1000) {
        const dir = path.join(cloudFolder(), 'devices', safeName(name));
        fs.mkdirSync(dir, { recursive: true });
        const today = localDate();
        fs.writeFileSync(path.join(dir, 'latest.json.tmp'), lastJson);
        fs.renameSync(path.join(dir, 'latest.json.tmp'), path.join(dir, 'latest.json'));
        fs.writeFileSync(path.join(dir, `data-${today}.json`), lastJson);
        const files = fs.readdirSync(dir).filter(f => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
        while (files.length > 60) fs.unlinkSync(path.join(dir, files.shift()));
        cloudAt = Date.now();
        cloudState = { ...cloudState, dir: cloudDir, lastAt: cloudAt, error: null };
      }
    } catch (err) {
      cloudState = { ...cloudState, dir: cloudDir, error: err.message };
    }
    if (win && !win.isDestroyed()) win.webContents.send('backup:state', cloudState);
  }
  app.on('before-quit', () => cloudBackup(true));
  setInterval(() => cloudBackup(false), 30 * 1000);

  // Read the other computers' sync files and hand anything new to the page to merge.
  const seenFile = () => path.join(dataDir(), 'sync-seen.json');
  let syncSeen = readJSON(seenFile()) || {};
  let devices = [];
  function pullRemote(force) {
    if (!cloudDir || !pageReady || !win || win.isDestroyed()) return devices;
    let myId = null;
    try { myId = JSON.parse(lastJson || fs.readFileSync(dataFile(), 'utf8')).settings?.deviceId; } catch {}
    const dir = path.join(cloudFolder(), 'sync');
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== `${myId}.json`); } catch { return devices; }
    const list = [];
    for (const f of files) {
      try {
        const full = path.join(dir, f), mtime = fs.statSync(full).mtimeMs;
        const p = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (!p?.deviceId || p.deviceId === myId || !p.data) continue;
        list.push({ deviceId: p.deviceId, deviceName: p.deviceName, platform: p.platform, version: p.version, writtenAt: p.writtenAt, lastChange: p.lastChange });
        if (force || (syncSeen[p.deviceId] || 0) < p.writtenAt) {
          win.webContents.send('sync:remote', p);
          syncSeen[p.deviceId] = p.writtenAt;
          try { fs.writeFileSync(seenFile(), JSON.stringify(syncSeen)); } catch {}
        }
        void mtime;
      } catch { /* the cloud app may still be writing the file; try again next time */ }
    }
    devices = list;
    win.webContents.send('sync:devices', devices);
    return devices;
  }
  setInterval(() => pullRemote(false), 45 * 1000);
  app.on('browser-window-focus', () => pullRemote(false));
  handle('sync:pull', () => pullRemote(true));
  handle('sync:devices', () => devices);

  handle('backup:configure', (_e, dir) => {
    cloudDir = dir && fs.existsSync(dir) ? dir : null;
    cloudState = { dir: cloudDir, lastAt: null, error: dir && !cloudDir ? 'That folder no longer exists.' : null };
    if (!lastJson) { try { lastJson = fs.readFileSync(dataFile(), 'utf8'); } catch {} }
    cloudBackup(true);
    setTimeout(() => pullRemote(false), 1500);
    return cloudState;
  });
  handle('backup:now', () => { cloudBackup(true); return cloudState; });
  // Readable copy for people and AI tools: an Excel workbook next to the JSON backups.
  handle('backup:workbook', (_e, sheets) => {
    if (!cloudDir) return { ok: false, error: 'Cloud backup is off.' };
    try {
      const { buildXlsx } = require('./src/xlsx');
      const buf = buildXlsx(sheets);
      fs.mkdirSync(cloudFolder(), { recursive: true });
      const file = path.join(cloudFolder(), 'Workout Tracker Data.xlsx');
      fs.writeFileSync(file + '.tmp', buf);
      try { fs.renameSync(file + '.tmp', file); }
      catch (err) { fs.rmSync(file + '.tmp', { force: true }); throw new Error(err.code === 'EBUSY' || err.code === 'EPERM' ? 'Close Workout Tracker Data.xlsx in Excel so it can update.' : err.message); }
      cloudState = { ...cloudState, workbookAt: Date.now(), workbookError: null };
    } catch (err) { cloudState = { ...cloudState, workbookError: err.message }; }
    if (win && !win.isDestroyed()) win.webContents.send('backup:state', cloudState);
    return cloudState;
  });
  // Likely cloud folders on this PC, so setup is one click.
  handle('backup:suggest', () => {
    const home = app.getPath('home');
    const c = [
      ['OneDrive', process.env.OneDrive], ['OneDrive', process.env.OneDriveConsumer], ['OneDrive', path.join(home, 'OneDrive')],
      ['iCloud Drive', path.join(home, 'iCloudDrive')], ['Dropbox', path.join(home, 'Dropbox')],
    ];
    // Google Drive for desktop shows up as its own drive letter ("G:\My Drive") or, in mirror mode, a folder.
    if (process.platform === 'win32') for (const L of 'GHIJKLMNOPQRSTUVWXYZDEF') c.push(['Google Drive', `${L}:\\My Drive`]);
    for (const dir of [path.join(home, 'My Drive'), path.join(home, 'Google Drive', 'My Drive'), path.join(home, 'Google Drive')]) c.push(['Google Drive', dir]);
    if (isMac) {
      // Google Drive for desktop on macOS: ~/Library/CloudStorage/GoogleDrive-<account>/My Drive
      const cs = path.join(home, 'Library', 'CloudStorage');
      let entries = []; try { entries = fs.readdirSync(cs); } catch {}
      for (const e of entries) {
        if (/^GoogleDrive-/i.test(e)) c.unshift(['Google Drive', path.join(cs, e, 'My Drive')]);
        else if (/^OneDrive/i.test(e)) c.push(['OneDrive', path.join(cs, e)]);
        else if (/^Dropbox/i.test(e)) c.push(['Dropbox', path.join(cs, e)]);
      }
      c.push(['Google Drive', '/Volumes/GoogleDrive/My Drive']);
      c.push(['iCloud Drive', path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')]);
    }
    const seen = new Set(), out = [];
    for (const [name, dir] of c) { if (dir && !seen.has(name) && fs.existsSync(dir)) { seen.add(name); out.push({ name, dir }); } }
    return out;
  });
  handle('backup:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Choose a cloud folder for backups', properties: ['openDirectory', 'createDirectory'] });
    return canceled ? null : filePaths[0];
  });

  handle('data:export', async (_e, data) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export backup',
      defaultPath: `workout-tracker-backup-${localDate()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
  });

  handle('data:importBackup', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Restore backup', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths[0]) return null;
    return readJSON(filePaths[0]);
  });

  handle('data:openFolder', () => shell.openPath(dataDir()));

  // ---------- fitness data ----------
  const FILTERS = {
    apple: [{ name: 'Apple Health export', extensions: ['zip', 'xml', 'json'] }],
    google: [{ name: 'Google Takeout (Fit)', extensions: ['zip', 'csv'] }],
    csv: [{ name: 'CSV or JSON', extensions: ['csv', 'json'] }],
  };

  handle('health:pick', async (_e, kind) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose a file to import', properties: ['openFile'], filters: FILTERS[kind] || FILTERS.csv,
    });
    if (canceled || !filePaths[0]) return null;
    const file = filePaths[0];
    const result = await importers.importFile(kind, file);
    return { ...result, kind, path: file, mtime: fs.statSync(file).mtimeMs };
  });

  // Re-import saved sources whose file changed since the last import.
  handle('health:refresh', async (_e, sources) => {
    const out = [];
    for (const s of sources || []) {
      try {
        const st = fs.statSync(s.path);
        if (st.mtimeMs <= (s.mtime || 0)) continue;
        const result = await importers.importFile(s.kind, s.path);
        out.push({ ...result, kind: s.kind, path: s.path, mtime: st.mtimeMs });
      } catch (err) { out.push({ kind: s.kind, path: s.path, error: String(err.message || err) }); }
    }
    return out;
  });

  // ---------- system ----------
  handle('sys:notify', (_e, { title, body }) => {
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title, body, icon: ctx.iconPath });
    n.on('click', () => { if (win) { win.show(); win.focus(); } });
    n.show();
    return true;
  });

  handle('sys:loginItem', (_e, enabled) => {
    if (typeof enabled === 'boolean') app.setLoginItemSettings({ openAtLogin: enabled });
    return app.getLoginItemSettings().openAtLogin;
  });

  handle('sys:theme', (_e, theme) => {
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
    if (win && process.platform === 'win32') {
      win.setTitleBarOverlay({ color: '#00000000', symbolColor: theme === 'light' ? '#5F6368' : '#C4C7C5', height: 36 });
      win.setBackgroundColor(theme === 'light' ? '#F0F4F9' : '#131314');
    }
    return true;
  });

  handle('sys:info', () => ({ dataDir: dataDir(), version: ctx.version, shellVersion: ctx.shellVersion, platform: process.platform, hostname: process.env.WT_DEVICE_NAME || os.hostname().replace(/\.local$/, '') }));

  // ======================================================================
  // Apple Health live sync
  // Two automatic paths, both feed the page through 'health:push':
  //  1. Wi-Fi: the iPhone (Health Auto Export or a Shortcut) POSTs JSON to http://<this PC>:<port>/health
  //  2. Folder: watch an iCloud Drive folder the iPhone exports into
  // ======================================================================
  const http = require('http');
  const os = require('os');
  const inbox = []; // pushes that arrived before the page was ready
  let pageReady = false;
  const push = (payload) => {
    if (pageReady && win && !win.isDestroyed()) win.webContents.send('health:push', payload);
    else inbox.push(payload);
  };
  handle('sync:ready', () => { pageReady = true; const out = inbox.splice(0); return out; });

  // Ask the page a question and wait for its answer (the page owns the data).
  const asks = new Map(); let askSeq = 0;
  function askPage(kind, arg) {
    return new Promise((resolve, reject) => {
      if (!pageReady || !win || win.isDestroyed()) return reject(new Error('Workout Tracker is still starting. Try again in a moment.'));
      const id = ++askSeq;
      asks.set(id, resolve);
      win.webContents.send('page:ask', { id, kind, arg });
      setTimeout(() => { if (asks.has(id)) { asks.delete(id); reject(new Error('Workout Tracker did not answer in time.')); } }, 8000);
    });
  }
  handle('page:answer', (_e, { id, result }) => { asks.get(id)?.(result); asks.delete(id); return true; });

  const lanAddresses = () => Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map(a => a.address)
    .sort((a, b) => (/^192\.168\./.test(b) - /^192\.168\./.test(a)) || (/^10\./.test(b) - /^10\./.test(a)));

  let server = null;
  let serverCfg = null;
  let serverState = { listening: false, error: null, port: null, lastAt: null, lastSummary: null, lastFrom: null };
  const sendSyncState = () => { if (win && !win.isDestroyed()) win.webContents.send('sync:state', syncState()); };
  const syncState = () => ({ ...serverState, addresses: lanAddresses(), watch: watchState });

  function keyOk(req, url) {
    const auth = req.headers.authorization || '';
    const k = url.searchParams.get('key') || req.headers['x-api-key'] || auth.replace(/^Bearer\s+/i, '');
    return serverCfg?.key && k === serverCfg.key;
  }
  function reply(res, code, body, type = 'application/json') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  }

  function startServer(cfg) {
    stopServer();
    serverCfg = cfg;
    if (!cfg?.enabled || !cfg.key) { serverState = { ...serverState, listening: false, error: null, port: null }; return sendSyncState(); }
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://local');
      if (!url.pathname.startsWith('/health') && url.pathname !== '/ping' && url.pathname !== '/export') return reply(res, 404, { ok: false, error: 'Not found' });
      if (!keyOk(req, url)) return reply(res, 401, { ok: false, error: 'Wrong or missing key' });
      // Apple Health export: the iPhone Shortcut fetches what's new and logs it into Health.
      if (url.pathname === '/export') {
        // Opening the link in a browser only shows what's waiting. The Shortcut fetches with &hold,
        // saves everything into Health, then calls &done=<receipt>, so nothing is marked sent until it's saved.
        const browser = /^Mozilla\//.test(req.headers['user-agent'] || '');
        const done = url.searchParams.get('done');
        askPage('export', done !== null ? { done } : { mark: !browser && !url.searchParams.has('peek') && !url.searchParams.has('hold') })
          .then((out) => {
            if (out?.error) return reply(res, 403, { ok: false, error: out.error });
            serverState = { ...serverState, lastExportAt: Date.now(), lastExportCount: out.count };
            sendSyncState();
            reply(res, 200, out);
          })
          .catch((err) => reply(res, 503, { ok: false, error: err.message }));
        return;
      }
      if (req.method === 'GET') {
        return reply(res, 200, `<!doctype html><meta name="viewport" content="width=device-width"><body style="font:17px system-ui;padding:32px;color:#1f1f1f"><h2 style="color:#188038">Workout Tracker is reachable</h2><p>Your iPhone can send Apple Health data to this PC. You can close this page.</p>`, 'text/html; charset=utf-8');
      }
      if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'Use POST' });
      const chunks = []; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 50 * 1024 * 1024) { req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const result = importers.parseHealthJSON(JSON.parse(body));
          const n = Object.keys(result.days).length;
          serverState = { ...serverState, lastAt: Date.now(), lastSummary: result.summary, lastFrom: req.socket.remoteAddress };
          if (n) push({ ...result, via: 'wifi', at: Date.now() });
          sendSyncState();
          reply(res, 200, { ok: true, days: n });
        } catch (err) {
          serverState = { ...serverState, error: `Last sync failed: ${err.message}` };
          sendSyncState();
          reply(res, 400, { ok: false, error: err.message });
        }
      });
    });
    server.on('error', (err) => {
      serverState = { ...serverState, listening: false, error: err.code === 'EADDRINUSE' ? `Port ${cfg.port} is in use. Pick another port.` : err.message };
      sendSyncState();
    });
    server.listen(cfg.port || 47821, '0.0.0.0', () => {
      serverState = { ...serverState, listening: true, error: null, port: cfg.port || 47821 };
      sendSyncState();
    });
  }
  function stopServer() { if (server) { try { server.close(); } catch {} server = null; } }

  handle('sync:configure', (_e, cfg) => { startServer(cfg); return syncState(); });
  handle('sync:state', () => syncState());

  // ---------- folder watch (iCloud Drive) ----------
  const watchFile = () => path.join(dataDir(), 'watch-state.json');
  let watcher = null, watchTimer = null;
  let watchState = { dir: null, lastAt: null, lastFile: null, error: null };
  const seen = () => readJSON(watchFile()) || {};

  async function scanFolder() {
    const dir = watchState.dir;
    if (!dir) return;
    const known = seen();
    const found = [];
    const walk = (d, depth) => {
      let entries = [];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory() && depth < 3) walk(full, depth + 1);
        else if (/\.(json|csv)$/i.test(e.name)) { try { found.push({ full, mtime: fs.statSync(full).mtimeMs }); } catch {} }
      }
    };
    walk(dir, 0);
    found.sort((a, b) => a.mtime - b.mtime);
    let changed = false;
    for (const f of found) {
      if (known[f.full] && known[f.full] >= f.mtime) continue;
      try {
        const result = await importers.importFile(/\.csv$/i.test(f.full) ? 'csv' : 'json', f.full);
        if (Object.keys(result.days).length) push({ ...result, source: 'Apple Health', via: 'folder', at: Date.now() });
        watchState = { ...watchState, lastAt: Date.now(), lastFile: path.basename(f.full), error: null };
      } catch (err) {
        // iCloud may still be downloading the file; try again on the next change.
        if (!/Unexpected end|JSON/.test(err.message)) watchState = { ...watchState, error: `${path.basename(f.full)}: ${err.message}` };
        continue;
      }
      known[f.full] = f.mtime; changed = true;
    }
    if (changed) { try { fs.writeFileSync(watchFile(), JSON.stringify(known)); } catch {} }
    sendSyncState();
  }
  function setWatch(dir) {
    if (watcher) { try { watcher.close(); } catch {} watcher = null; }
    watchState = { ...watchState, dir: dir || null, error: null };
    if (!dir) return sendSyncState();
    if (!fs.existsSync(dir)) { watchState.error = 'That folder no longer exists.'; return sendSyncState(); }
    try {
      watcher = fs.watch(dir, { recursive: true }, () => { clearTimeout(watchTimer); watchTimer = setTimeout(scanFolder, 3000); });
    } catch (err) { watchState.error = err.message; }
    scanFolder();
  }
  setInterval(() => { if (watchState.dir) scanFolder(); }, 15 * 60 * 1000); // safety net if a change event is missed

  handle('sync:watch', (_e, dir) => { setWatch(dir); return syncState(); });
  handle('sync:pickFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Choose the folder your iPhone exports to', properties: ['openDirectory'] });
    return canceled ? null : filePaths[0];
  });

  // ---------- keep running in the tray ----------
  const { Tray, Menu, nativeImage } = require('electron');
  let tray = null, background = false, quitting = false;
  app.on('before-quit', () => { quitting = true; });
  function setBackground(on) {
    background = !!on;
    if (background && !tray) {
      tray = new Tray(nativeImage.createFromPath(ctx.iconPath).resize({ width: 16, height: 16 }));
      tray.setToolTip('Workout Tracker');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Workout Tracker', click: () => { win?.show(); win?.focus(); } },
        { type: 'separator' },
        { label: 'Quit', click: () => { quitting = true; app.quit(); } },
      ]));
      tray.on('click', () => { win?.show(); win?.focus(); });
    }
    if (!background && tray) { tray.destroy(); tray = null; }
  }
  handle('sys:background', (_e, on) => { setBackground(on); return background; });
};
