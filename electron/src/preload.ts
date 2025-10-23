import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

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

export interface ImagePayload {
  name: string;
  dataUrl: string;
}

export interface ChoicePayload {
  text: string;
  isCorrect: boolean;
}

export interface CreateTheoreticalQuestionPayload {
  question: string;
  section: string;
  lesson: string;
  choices: ChoicePayload[];
  image?: ImagePayload | null;
}

export interface CreateQuestionResult {
  id: string;
  filePath: string;
  section: string;
  lesson: string;
  counts: QuestionCounts;
}

export interface DataRefreshPayload {
  counts: QuestionCounts;
  progress: ProgressData;
}

export interface TheoreticalQuestionRecord {
  id: string;
  sectionKey: string;
  section: string;
  lesson: string;
  filePath: string;
  question: string;
  choices: Array<{ text: string; isCorrect: boolean }>;
  correctCount: number;
  imageDataUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateTheoreticalQuestionPayload {
  id: string;
  filePath: string;
  sectionKey: string;
  lesson: string;
  question: string;
  choices: ChoicePayload[];
  image?: ImagePayload | null;
}

export interface DeleteTheoreticalQuestionPayload {
  id: string;
  filePath: string;
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
  createTheoreticalQuestion: (payload: CreateTheoreticalQuestionPayload) => Promise<CreateQuestionResult>;
  listTheoreticalQuestions: () => Promise<TheoreticalQuestionRecord[]>;
  updateTheoreticalQuestion: (payload: UpdateTheoreticalQuestionPayload) => Promise<QuestionCounts>;
  deleteTheoreticalQuestion: (payload: DeleteTheoreticalQuestionPayload) => Promise<QuestionCounts>;
  onNavigate: (callback: (route: string) => void) => void;
  onDataRefresh: (callback: (data: DataRefreshPayload) => void) => () => void;
  // Window controls
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  windowIsMaximized: () => Promise<boolean>;
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
  createTheoreticalQuestion: (payload) =>
    ipcRenderer.invoke('theory:createQuestion', payload),
  listTheoreticalQuestions: () => ipcRenderer.invoke('theory:listQuestions'),
  updateTheoreticalQuestion: (payload) =>
    ipcRenderer.invoke('theory:updateQuestion', payload),
  deleteTheoreticalQuestion: (payload) =>
    ipcRenderer.invoke('theory:deleteQuestion', payload),
  onNavigate: (callback: (route: string) => void) => {
    ipcRenderer.on('navigate', (_event, route) => callback(route));
  },
  onDataRefresh: (callback: (data: DataRefreshPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: DataRefreshPayload) => {
      callback(data);
    };
    ipcRenderer.on('data:refresh', listener);
    return () => ipcRenderer.removeListener('data:refresh', listener);
  },
  // Window controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
};

contextBridge.exposeInMainWorld('api', api);
