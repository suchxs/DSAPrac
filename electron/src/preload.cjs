const { contextBridge, app, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong',
  exitApp: () => ipcRenderer.send('app-exit'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openPractice: () => ipcRenderer.send('open-practice'),
  openExam: () => ipcRenderer.send('open-exam'),
  openMenu: () => ipcRenderer.send('open-menu'),
  openQuestionMaker: () => ipcRenderer.send('open-question-maker'),
  onNavigate: (callback) => ipcRenderer.on('navigate', (_, route) => callback(route)),
  // Progress APIs
  getProgress: () => ipcRenderer.invoke('progress:get'),
  updateTheory: (tag, answeredDelta) => ipcRenderer.invoke('progress:updateTheory', tag, answeredDelta),
  setPracticalDone: (problemId, done, totalTests) =>
    ipcRenderer.invoke('progress:setPracticalDone', problemId, done, totalTests),
  recordActivity: (dateKey) => ipcRenderer.invoke('progress:recordActivity', dateKey),
  // Question count APIs
  getQuestionCounts: () => ipcRenderer.invoke('questions:getCounts'),
});
