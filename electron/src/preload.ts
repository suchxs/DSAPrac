import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

export interface PracticalProgress {
  completed: boolean;
  completedAt?: string;
  bestScore?: number;
  totalTests?: number;
  attempts?: number;
  lastAttemptAt?: string;
  lastScore?: number;
}

export interface ProgressData {
  version: number;
  theory: Record<string, { answered: number; total: number; lastAnsweredAt?: string }>;
  practical: Record<string, PracticalProgress>;
  activity: Record<string, number>;
}

export interface AppSettings {
  autoSaveEnabled: boolean;
  autoSaveInterval: number;
  developerConsoleEnabled: boolean;
  developerConsoleKey: string;
}

export interface QuestionCounts {
  theoretical: number;
  practical: number;
}

export interface ImagePayload {
  name: string;
  dataUrl: string;
  order?: number;
}

export interface ChoicePayload {
  text: string;
  isCorrect: boolean;
}

export interface CreateTheoreticalQuestionPayload {
  question: string;
  section: string;
  lesson: string;
  author: string;
  choices: ChoicePayload[];
  image?: ImagePayload | null;
  images?: ImagePayload[];
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
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
  author?: string;
  choices: Array<{ text: string; isCorrect: boolean }>;
  correctCount: number;
  imageDataUrl?: string | null;
  imageDataUrls?: string[];
  createdAt?: string;
  updatedAt?: string;
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
}

export interface UpdateTheoreticalQuestionPayload {
  id: string;
  filePath: string;
  sectionKey: string;
  lesson: string;
  author: string;
  question: string;
  choices: ChoicePayload[];
  image?: ImagePayload | null;
  images?: ImagePayload[];
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
}

export interface DeleteTheoreticalQuestionPayload {
  id: string;
  filePath: string;
}

export interface TestCasePayload {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export interface RecordPracticalActivityPayload {
  questionId: string;
  passedCount: number;
  totalCount: number;
  timestamp?: string;
}

export interface CodeFilePayload {
  filename: string;
  content: string;
  isLocked: boolean;
  isAnswerFile: boolean;
  language: 'c' | 'cpp';
}

export interface CreatePracticalQuestionPayload {
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  section: string;
  lesson: string;
  author?: string;
  files: CodeFilePayload[];
  testCases: TestCasePayload[];
  image?: ImagePayload | null;
  images?: ImagePayload[];
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
}

export interface PracticalQuestionRecord {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  sectionKey: string;
  section: string;
  lesson: string;
  author?: string;
  filePath: string;
  files: CodeFilePayload[];
  testCases: TestCasePayload[];
  imageDataUrl?: string | null;
  imageDataUrls?: string[];
  createdAt?: string;
  updatedAt?: string;
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
}

export interface UpdatePracticalQuestionPayload {
  id: string;
  filePath: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  sectionKey: string;
  lesson: string;
  author?: string;
  files: CodeFilePayload[];
  testCases: TestCasePayload[];
  image?: ImagePayload | null;
  images?: ImagePayload[];
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
}

export interface DeletePracticalQuestionPayload {
  id: string;
  filePath: string;
}

export interface ExecuteCodePayload {
  files: CodeFilePayload[];
  input: string;
}

export interface ExecuteCodeResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime?: number;
}

export interface StartTerminalExecutionPayload {
  files: CodeFilePayload[];
}

export interface StartTerminalExecutionResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface TerminalDataPayload {
  sessionId: string;
  data?: string;
  error?: string;
  exit?: boolean;
  exitCode?: number;
}

export interface NormalizationOptions {
  normalize_crlf: boolean;
  ignore_extra_whitespace: boolean;
}

export interface JudgeRequest {
  code: string;
  problem: any;
  language: string;
  normalization?: NormalizationOptions;
}

export interface JudgeResponse {
  success: boolean;
  result?: any;
  error?: string;
  status: string;
}

export interface ElectronAPI {
  openMenu: () => void;
  openPractice: () => void;
  openExam: () => void;
  openSettings: () => void;
  openQuestionMaker: () => void;
  exitApp: () => void;
  getProgress: () => Promise<ProgressData>;
  updateTheory: (tag: string, answeredDelta: number | string[]) => Promise<ProgressData>;
  setPracticalDone: (problemId: string, done: boolean, totalTests?: number) => Promise<ProgressData>;
  recordActivity: (dateKey?: string) => Promise<ProgressData>;
  getQuestionCounts: () => Promise<QuestionCounts>;
  createTheoreticalQuestion: (payload: CreateTheoreticalQuestionPayload) => Promise<CreateQuestionResult>;
  listTheoreticalQuestions: () => Promise<TheoreticalQuestionRecord[]>;
  updateTheoreticalQuestion: (payload: UpdateTheoreticalQuestionPayload) => Promise<QuestionCounts>;
  deleteTheoreticalQuestion: (payload: DeleteTheoreticalQuestionPayload) => Promise<QuestionCounts>;
  createPracticalQuestion: (payload: CreatePracticalQuestionPayload) => Promise<CreateQuestionResult>;
  listPracticalQuestions: () => Promise<PracticalQuestionRecord[]>;
  updatePracticalQuestion: (payload: UpdatePracticalQuestionPayload) => Promise<QuestionCounts>;
  deletePracticalQuestion: (payload: DeletePracticalQuestionPayload) => Promise<QuestionCounts>;
  executeCodeWithInput: (payload: ExecuteCodePayload) => Promise<ExecuteCodeResult>;
  runJudge: (request: JudgeRequest) => Promise<JudgeResponse>;
  // Streaming terminal APIs
  startTerminalExecution: (payload: StartTerminalExecutionPayload) => Promise<StartTerminalExecutionResult>;
  writeToTerminal: (sessionId: string, data: string) => Promise<void>;
  stopTerminalExecution: (sessionId: string) => Promise<void>;
  onTerminalData: (callback: (data: TerminalDataPayload) => void) => () => void;
  onNavigate: (callback: (route: string) => void) => void;
  onSettingsUpdated: (callback: (settings: AppSettings) => void) => () => void;
  onDataRefresh: (callback: (data: DataRefreshPayload) => void) => () => void;
  // Practical Problem Solver
  openPracticalProblem: (questionId: string) => void;
  getCurrentPracticalQuestion: () => Promise<any>;
  savePracticalProgress: (payload: any) => Promise<void>;
  resetPracticalProgress: (payload: { questionId: string }) => Promise<{ success: boolean }>;
  runPracticalCode: (payload: any) => Promise<any>;
  submitPracticalSolution: (payload: any) => Promise<any>;
  recordPracticalActivity: (payload: RecordPracticalActivityPayload) => Promise<void>;
  runDevConsoleCommand: (command: string) => Promise<{ ok: boolean; output: string[]; action?: string }>;
  onDevConsoleLog: (callback: (entry: { level: string; message: string; source?: string; line?: number }) => void) => () => void;
  getPracticalHistory: (payload: { questionId: string }) => Promise<any[]>;
  recordPracticalSubmission: (payload: { questionId: string; files: { filename: string; content: string }[]; testResults: any[]; score: number; maxScore: number }) => Promise<any>;
  setPracticalIteration: (payload: { questionId: string; files: { filename: string; content: string }[] }) => Promise<any>;
  clearPracticalIteration: (payload: { questionId: string }) => Promise<any>;
  openCompareOutput: (payload: { expected: string; actual: string; label?: string }) => Promise<any>;
  // Window controls
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  windowIsMaximized: () => Promise<boolean>;
  // Settings APIs
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
}

const api: ElectronAPI = {
  openMenu: () => ipcRenderer.send('open-menu'),
  openPractice: () => ipcRenderer.send('open-practice'),
  openExam: () => ipcRenderer.send('open-exam'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openQuestionMaker: () => ipcRenderer.send('open-question-maker'),
  exitApp: () => ipcRenderer.send('app-exit'),
  getProgress: () => ipcRenderer.invoke('progress:get'),
  updateTheory: (tag: string, answeredDelta: number | string[]) =>
    ipcRenderer.invoke('progress:updateTheory', tag, answeredDelta),
  setPracticalDone: (problemId: string, done: boolean, totalTests?: number) =>
    ipcRenderer.invoke('progress:setPracticalDone', problemId, done, totalTests),
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
  createPracticalQuestion: (payload) =>
    ipcRenderer.invoke('practical:createQuestion', payload),
  listPracticalQuestions: () => ipcRenderer.invoke('practical:listQuestions'),
  updatePracticalQuestion: (payload) =>
    ipcRenderer.invoke('practical:updateQuestion', payload),
  deletePracticalQuestion: (payload) =>
    ipcRenderer.invoke('practical:deleteQuestion', payload),
  executeCodeWithInput: (payload) =>
    ipcRenderer.invoke('practical:executeCode', payload),
  runJudge: (request) =>
    ipcRenderer.invoke('judge:run', request),
  // Streaming terminal APIs
  startTerminalExecution: (payload) =>
    ipcRenderer.invoke('terminal:start', payload),
  writeToTerminal: (sessionId, data) =>
    ipcRenderer.invoke('terminal:write', sessionId, data),
  stopTerminalExecution: (sessionId) =>
    ipcRenderer.invoke('terminal:stop', sessionId),
  onTerminalData: (callback: (data: TerminalDataPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: TerminalDataPayload) => {
      console.log('[Preload] terminal:data event received:', data);
      callback(data);
    };
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onNavigate: (callback: (route: string) => void) => {
    ipcRenderer.on('navigate', (_event, route) => callback(route));
  },
  onSettingsUpdated: (callback: (settings: AppSettings) => void) => {
    const listener = (_event: IpcRendererEvent, payload: AppSettings) => callback(payload);
    ipcRenderer.on('settings:updated', listener);
    return () => ipcRenderer.removeListener('settings:updated', listener);
  },
  onDataRefresh: (callback: (data: DataRefreshPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: DataRefreshPayload) => {
      callback(data);
    };
    ipcRenderer.on('data:refresh', listener);
    return () => ipcRenderer.removeListener('data:refresh', listener);
  },
  // Practical Problem Solver
  openPracticalProblem: (questionId: string) => ipcRenderer.send('open-practical-problem', questionId),
  getCurrentPracticalQuestion: () => ipcRenderer.invoke('get-current-practical-question'),
  savePracticalProgress: (payload) => ipcRenderer.invoke('save-practical-progress', payload),
  resetPracticalProgress: (payload: { questionId: string }) => ipcRenderer.invoke('reset-practical-progress', payload),
  runPracticalCode: (payload) => ipcRenderer.invoke('run-practical-code', payload),
  submitPracticalSolution: (payload) => ipcRenderer.invoke('submit-practical-solution', payload),
  recordPracticalActivity: (payload: RecordPracticalActivityPayload) =>
    ipcRenderer.invoke('record-practical-activity', payload),
  runDevConsoleCommand: (command: string) => ipcRenderer.invoke('devconsole:command', command),
  onDevConsoleLog: (callback: (entry: { level: string; message: string; source?: string; line?: number }) => void) => {
    const listener = (_event: IpcRendererEvent, entry: any) => callback(entry);
    ipcRenderer.on('devconsole:log', listener);
    return () => ipcRenderer.removeListener('devconsole:log', listener);
  },
  getPracticalHistory: (payload) => ipcRenderer.invoke('practical:getHistory', payload),
  recordPracticalSubmission: (payload) => ipcRenderer.invoke('practical:recordSubmission', payload),
  setPracticalIteration: (payload: { questionId: string; files: { filename: string; content: string }[] }) =>
    ipcRenderer.invoke('practical:setIteration', payload),
  clearPracticalIteration: (payload: { questionId: string }) =>
    ipcRenderer.invoke('practical:clearIteration', payload),
  openCompareOutput: (payload: { expected: string; actual: string; label?: string }) =>
    ipcRenderer.invoke('practical:openCompareOutput', payload),
  // Window controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  // Settings APIs
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings),
};

contextBridge.exposeInMainWorld('api', api);
