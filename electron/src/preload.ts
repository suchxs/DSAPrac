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

export interface TestCasePayload {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
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
  files: CodeFilePayload[];
  testCases: TestCasePayload[];
  image?: ImagePayload | null;
}

export interface PracticalQuestionRecord {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  sectionKey: string;
  section: string;
  lesson: string;
  filePath: string;
  files: CodeFilePayload[];
  testCases: TestCasePayload[];
  imageDataUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdatePracticalQuestionPayload {
  id: string;
  filePath: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  sectionKey: string;
  lesson: string;
  files: CodeFilePayload[];
  testCases: TestCasePayload[];
  image?: ImagePayload | null;
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
  updateTheoryProgress: (tag: string, answeredDelta: number) => Promise<ProgressData>;
  setPracticalDone: (problemId: string, done: boolean) => Promise<ProgressData>;
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
