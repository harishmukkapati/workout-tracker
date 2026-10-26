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
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    restart: () => ipcRenderer.invoke('update:restart'),
    setConfig: (cfg) => ipcRenderer.invoke('update:setConfig', cfg),
    healthy: () => ipcRenderer.invoke('update:healthy'),
    onStatus: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  },
});
