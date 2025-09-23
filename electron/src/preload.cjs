const { contextBridge, app, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong',
  exit: () => ipcRenderer.send('app-exit'),
  openSettings: () => ipcRenderer.send('open-settings')
});
