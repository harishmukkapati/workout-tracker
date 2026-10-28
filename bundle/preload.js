const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  exportBackup: (data) => ipcRenderer.invoke('data:export', data),
  importBackup: () => ipcRenderer.invoke('data:importBackup'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  pickHealth: (kind) => ipcRenderer.invoke('health:pick', kind),
  refreshHealth: (sources) => ipcRenderer.invoke('health:refresh', sources),
  notify: (title, body) => ipcRenderer.invoke('sys:notify', { title, body }),
  loginItem: (enabled) => ipcRenderer.invoke('sys:loginItem', enabled),
  setTheme: (theme) => ipcRenderer.invoke('sys:theme', theme),
  info: () => ipcRenderer.invoke('sys:info'),
  platform: process.platform,
  sync: {
    configure: (cfg) => ipcRenderer.invoke('sync:configure', cfg),
    state: () => ipcRenderer.invoke('sync:state'),
    watch: (dir) => ipcRenderer.invoke('sync:watch', dir),
    pickFolder: () => ipcRenderer.invoke('sync:pickFolder'),
    ready: () => ipcRenderer.invoke('sync:ready'),
    onPush: (cb) => ipcRenderer.on('health:push', (_e, p) => cb(p)),
    onState: (cb) => ipcRenderer.on('sync:state', (_e, s) => cb(s)),
    pull: () => ipcRenderer.invoke('sync:pull'),
    devices: () => ipcRenderer.invoke('sync:devices'),
    onRemote: (cb) => ipcRenderer.on('sync:remote', (_e, p) => cb(p)),
    onDevices: (cb) => ipcRenderer.on('sync:devices', (_e, d) => cb(d)),
    onAsk: (cb) => ipcRenderer.on('page:ask', async (_e, q) => {
      let result;
      try { result = await cb(q); } catch (err) { result = { error: String(err?.message || err) }; }
      ipcRenderer.invoke('page:answer', { id: q.id, result });
    }),
  },
  background: (on) => ipcRenderer.invoke('sys:background', on),
  backup: {
    configure: (dir) => ipcRenderer.invoke('backup:configure', dir),
    now: () => ipcRenderer.invoke('backup:now'),
    workbook: (sheets) => ipcRenderer.invoke('backup:workbook', sheets),
    suggest: () => ipcRenderer.invoke('backup:suggest'),
    pick: () => ipcRenderer.invoke('backup:pick'),
    onState: (cb) => ipcRenderer.on('backup:state', (_e, s) => cb(s)),
  },
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    restart: () => ipcRenderer.invoke('update:restart'),
    setConfig: (cfg) => ipcRenderer.invoke('update:setConfig', cfg),
    healthy: () => ipcRenderer.invoke('update:healthy'),
    onStatus: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  },
});
