// Type definitions for the Electron API exposed via contextBridge
export interface ElectronAPI {
  ping: () => string;
  exitApp: () => void;
  openSettings: () => void;
  openPractice: () => void;
  openExam: () => void;
  openMenu: () => void;
  openQuestionMaker: () => void;
  onNavigate: (callback: (route: string) => void) => void;
  // Progress APIs
  getProgress: () => Promise<ProgressData>;
  updateTheory: (tag: string, answeredDelta: number) => Promise<ProgressData>;
  setPracticalDone: (problemId: string, done: boolean) => Promise<ProgressData>;
  recordActivity: (dateKey?: string) => Promise<ProgressData>;
  // Question count APIs
  getQuestionCounts: () => Promise<QuestionCounts>;
  // Window controls
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  windowIsMaximized: () => Promise<boolean>;
}

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

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
