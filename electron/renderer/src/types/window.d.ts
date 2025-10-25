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
  // Question APIs
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
  onDataRefresh: (callback: (data: DataRefreshPayload) => void) => () => void;
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

// Practical Question Types
export interface TestCasePayload {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export interface CodeFilePayload {
  filename: string;
  content: string;
  isLocked: boolean; // If true, students cannot edit this file
  isAnswerFile: boolean; // If true, this file will be cleared in exam mode (keeps only comment)
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

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
