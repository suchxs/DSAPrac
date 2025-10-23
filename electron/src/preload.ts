import { contextBridge, ipcRenderer } from 'electron';

export interface ProgressData {
  version: number;
  theory: Record<string, { answered: number; total: number; lastAnsweredAt?: string }>;
  practical: Record<string, { completed: boolean; completedAt?: string }>;
  activity: Record<string, number>;
}

export interface QuestionCounts {
  theoretical: number;
  practical: number;
}

export interface ElectronAPI {
  openMenu: () => void;
  openPractice: () => void;
  openExam: () => void;
  openSettings: () => void;
  openQuestionMaker: () => void;
  exitApp: () => void;
  getProgress: () => Promise<ProgressData>;
  updateTheoryProgress: (tag: string, answeredDelta: number) => Promise<ProgressData>;
  setPracticalDone: (problemId: string, done: boolean) => Promise<ProgressData>;
  recordActivity: (dateKey?: string) => Promise<ProgressData>;
  getQuestionCounts: () => Promise<QuestionCounts>;
  onNavigate: (callback: (route: string) => void) => void;
}

const api: ElectronAPI = {
  openMenu: () => ipcRenderer.send('open-menu'),
  openPractice: () => ipcRenderer.send('open-practice'),
  openExam: () => ipcRenderer.send('open-exam'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openQuestionMaker: () => ipcRenderer.send('open-question-maker'),
  exitApp: () => ipcRenderer.send('app-exit'),
  getProgress: () => ipcRenderer.invoke('progress:get'),
  updateTheoryProgress: (tag: string, answeredDelta: number) =>
    ipcRenderer.invoke('progress:updateTheory', tag, answeredDelta),
  setPracticalDone: (problemId: string, done: boolean) =>
    ipcRenderer.invoke('progress:setPracticalDone', problemId, done),
  recordActivity: (dateKey?: string) =>
    ipcRenderer.invoke('progress:recordActivity', dateKey),
  getQuestionCounts: () => ipcRenderer.invoke('questions:getCounts'),
  onNavigate: (callback: (route: string) => void) => {
    ipcRenderer.on('navigate', (_event, route) => callback(route));
  },
};

contextBridge.exposeInMainWorld('api', api);
