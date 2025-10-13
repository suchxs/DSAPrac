const { contextBridge, app, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong',
  exit: () => ipcRenderer.send('app-exit'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openPractice: () => ipcRenderer.send('open-practice'),
  openExam: () => ipcRenderer.send('open-exam'),
  openMenu: () => ipcRenderer.send('open-menu'),
  // Progress APIs
  getProgress: () => ipcRenderer.invoke('progress:get'),
  updateTheory: (tag, answeredDelta) => ipcRenderer.invoke('progress:updateTheory', tag, answeredDelta),
  setPracticalDone: (problemId, done) => ipcRenderer.invoke('progress:setPracticalDone', problemId, done),
  recordActivity: (dateKey) => ipcRenderer.invoke('progress:recordActivity', dateKey),
});
