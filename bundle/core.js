// Workout Tracker core: windows, storage, imports. Loaded by the launcher (shell/main.js),
// either from the copy shipped with the app or from a downloaded update.
// All data lives in %APPDATA%\Workout Tracker. Nothing leaves your PC except update checks.
const { app, BrowserWindow, dialog, shell, Notification, nativeTheme } = require('electron');
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
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#00000000', symbolColor: '#5F6368', height: 36 },
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
      },
    });
    win.removeMenu();
    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(__dirname, 'app', 'index.html'));
    // Open external links in the default browser, never inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    ctx.onWindow?.(win);
  }

  app.whenReady().then(createWindow);
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
      const today = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(path.join(backupDir(), `data-${today}.json`), json);
      const files = fs.readdirSync(backupDir()).filter(f => f.endsWith('.json')).sort();
      while (files.length > 30) fs.unlinkSync(path.join(backupDir(), files.shift()));
    } catch {}
    return true;
  });

  handle('data:export', async (_e, data) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export backup',
      defaultPath: `workout-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
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
    apple: [{ name: 'Apple Health export', extensions: ['zip', 'xml'] }],
    google: [{ name: 'Google Takeout (Fit)', extensions: ['zip', 'csv'] }],
    csv: [{ name: 'CSV', extensions: ['csv'] }],
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

  handle('sys:info', () => ({ dataDir: dataDir(), version: ctx.version, shellVersion: ctx.shellVersion }));
};
