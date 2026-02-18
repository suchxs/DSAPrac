import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';

let mainWindow: BrowserWindow | null = null;
let problemSolverWindow: BrowserWindow | null = null;
let currentPracticalQuestion: any = null;
let backendProcess: ReturnType<typeof spawn> | null = null;
type DevConsoleLevel = 'log' | 'warn' | 'error' | 'system';
type PendingBackendRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};
const pendingBackendRequests = new Map<string, PendingBackendRequest>();
let backendStdoutBuffer = '';
let backendRequestCounter = 0;
const consoleLevelMap: Record<number, DevConsoleLevel> = {
  0: 'log',
  1: 'warn',
  2: 'error',
};

function resolveBackendPath(): string {
  const override = process.env.DSA_JUDGE_PATH;
  if (override && fs.existsSync(override)) return override;
  const binaryName = process.platform === 'win32' ? 'dsa-judge.exe' : 'dsa-judge';
  const devPath = path.resolve(__dirname, `../../rust-backend/target/debug/${binaryName}`);
  if (fs.existsSync(devPath)) return devPath;
  const relPath = path.resolve(__dirname, `../../rust-backend/target/release/${binaryName}`);
  if (fs.existsSync(relPath)) return relPath;
  return devPath;
}

// ---------------- Progress Store (userData) ----------------
type TagProgress = { 
  answered: number; 
  total: number; 
  lastAnsweredAt?: string;
  answeredQuestions?: string[]; // Track individual question IDs
};
type PracticalProgress = {
  completed: boolean;
  completedAt?: string;
  bestScore: number;
  totalTests: number;
  attempts: number;
  lastAttemptAt?: string;
  lastScore?: number;
};

type ProgressData = {
  version: number;
  theory: Record<string, TagProgress>;
  practical: Record<string, PracticalProgress>;
  activity: Record<string, number>; // YYYY-MM-DD -> count
};
type PracticalHistoryEntry = {
  timestamp: string;
  files: { filename: string; content: string }[];
  testResults?: { index: number; passed: boolean; actualOutput?: string; expectedOutput?: string; executionTime?: number; memoryUsage?: number; error?: string }[];
  score?: number;
  maxScore?: number;
  kind: 'submission' | 'iteration';
};

type ChoicePayload = { text: string; isCorrect: boolean };
type ImagePayload = { name: string; dataUrl: string; order?: number };
type MultiIdentificationItem = { subtitle?: string; answers: string[] };
type CreateTheoreticalQuestionPayload = {
  question: string;
  section: string;
  lesson: string;
  author: string;
  choices: ChoicePayload[];
  questionType?: 'mcq' | 'identification' | 'multi-identification';
  identificationAnswers?: string[];
  multiIdentificationItems?: MultiIdentificationItem[];
  image?: ImagePayload | null;  // Legacy single image support
  images?: ImagePayload[];      // New multiple images support
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
};

type QuestionCounts = { theoretical: number; practical: number };
type ListedChoice = { text: string; isCorrect: boolean };
type TheoreticalQuestionRecord = {
  id: string;
  sectionKey: string;
  section: string;
  lesson: string;
  filePath: string;
  question: string;
  author?: string;
  choices: ListedChoice[];
  correctCount: number;
  questionType?: 'mcq' | 'identification' | 'multi-identification';
  identificationAnswers?: string[];
  multiIdentificationItems?: MultiIdentificationItem[];
  imageDataUrl?: string | null;   // Legacy single image
  imageDataUrls?: string[];       // New multiple images (ordered)
  createdAt?: string;
  updatedAt?: string;
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
};

type UpdateTheoreticalQuestionPayload = {
  id: string;
  filePath: string;
  sectionKey: string;
  lesson: string;
  question: string;
  author?: string;
  choices: ChoicePayload[];
  questionType?: 'mcq' | 'identification' | 'multi-identification';
  identificationAnswers?: string[];
  multiIdentificationItems?: MultiIdentificationItem[];
  image?: ImagePayload | null;    // Legacy single image support
  images?: ImagePayload[];        // New multiple images support
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
};

type DeleteTheoreticalQuestionPayload = {
  id: string;
  filePath: string;
};
type TestCasePayload = {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  executionTime?: number;
  memoryUsage?: number;
};

type CodeFilePayload = {
  filename: string;
  content: string;
  isLocked: boolean;
  isAnswerFile: boolean;
  isHidden: boolean;
  language: 'c' | 'cpp' | 'rust';
};

type CreatePracticalQuestionPayload = {
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  section: string;
  lesson: string;
  author?: string;
  files: CodeFilePayload[];
  testCases: TestCasePayload[];
  image?: ImagePayload | null;    // Legacy single image support
  images?: ImagePayload[];        // New multiple images support
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
};

type PracticalQuestionRecord = {
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
  imageDataUrl?: string | null;   // Legacy single image
  imageDataUrls?: string[];       // New multiple images (ordered)
  createdAt?: string;
  updatedAt?: string;
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
};

type UpdatePracticalQuestionPayload = {
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
  image?: ImagePayload | null;    // Legacy single image support
  images?: ImagePayload[];        // New multiple images support
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
};

type DeletePracticalQuestionPayload = {
  id: string;
  filePath: string;
};

type ExecuteCodePayload = {
  files: CodeFilePayload[];
  input: string;
};

type ExecuteCodeResult = {
  success: boolean;
  output?: string;
  error?: string;
  executionTime?: number;
};

const SECTION_DEFINITIONS: Record<string, { label: string; lessons: string[] }> = {
  '1': {
    label: 'Section 1',
    lessons: ['Arrays', 'Linked Lists', 'Cursor-Based', 'Stack', 'Queue', 'ADT List'],
  },
  '2': {
    label: 'Section 2',
    lessons: ['SET and ADT Set', 'ADT Dictionary'],
  },
  '3': {
    label: 'Section 3',
    lessons: [
      'ADT Tree and Implementations',
      'Binary Search Tree (BST)',
      'Heapsort Sorting Technique',
      'Directed and Undirected Graph',
      'Graph Algorithms',
      'ADT Priority Queue',
    ],
  },
};

const THEORY_MIN_CHOICES = 4;
const THEORY_MAX_CHOICES = 10;

function getUserDataDir(): string {
  const override = process.env.DSA_USER_DATA_DIR;
  if (override && fs.existsSync(override)) return override;
  return app.getPath('userData');
}

function getProgressPath(): string {
  return path.join(getUserDataDir(), 'progress.json');
}

function getSettingsPath(): string {
  return path.join(getUserDataDir(), 'settings.json');
}

function getHistoryDir(): string {
  return path.join(getUserDataDir(), 'practical-history');
}

function getHistoryPath(questionId: string): string {
  return path.join(getHistoryDir(), `${questionId}.json`);
}

interface AppSettings {
  autoSaveEnabled: boolean;
  autoSaveInterval: number; // in seconds
  developerConsoleEnabled: boolean;
  developerConsoleKey: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoSaveEnabled: true,
  autoSaveInterval: 30,
  developerConsoleEnabled: false,
  developerConsoleKey: '`',
};

function enableDevtoolsForWindow(win: BrowserWindow) {
  // Devtools intentionally disabled
}

function readSettings(): AppSettings {
  const settingsPath = getSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return { ...DEFAULT_SETTINGS, ...data };
    }
  } catch (error) {
    console.error('Failed to read settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

function writeSettings(settings: AppSettings): void {
  const settingsPath = getSettingsPath();
  ensureDirExists(path.dirname(settingsPath));
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function getQuestionsRootDir(): string {
  if (process.env.DSA_QUESTIONS_DIR) {
    return path.resolve(process.env.DSA_QUESTIONS_DIR);
  }

  if (app.isPackaged) {
    const appPath = app.getAppPath();
    return path.resolve(appPath, '..', 'questions');
  }

  // Development build: compiled files live in electron/build
  return path.resolve(__dirname, '..', '..', 'questions');
}

function getTheoryBaseDir(): string {
  return path.join(getQuestionsRootDir(), 'theory');
}

function getPracticalBaseDir(): string {
  return path.join(getQuestionsRootDir(), 'practical');
}

function countPracticalQuestions(): number {
  const baseDir = getPracticalBaseDir();
  if (!fs.existsSync(baseDir)) return 0;

  const stack: string[] = [baseDir];
  let total = 0;

  while (stack.length) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        total += 1;
      }
    }
  }

  return total;
}

function createDefaultPracticalProgress(totalTests = 0): PracticalProgress {
  return {
    completed: false,
    completedAt: undefined,
    bestScore: 0,
    totalTests,
    attempts: 0,
    lastAttemptAt: undefined,
    lastScore: undefined,
  };
}

function ensurePracticalProgressEntry(
  progress: ProgressData,
  questionId: string,
  totalTests = 0
): PracticalProgress {
  const existing = progress.practical[questionId];
  if (!existing) {
    const created = createDefaultPracticalProgress(totalTests);
    progress.practical[questionId] = created;
    return created;
  }

  if (typeof existing.bestScore !== 'number') existing.bestScore = 0;
  if (typeof existing.totalTests !== 'number' || existing.totalTests < totalTests) {
    existing.totalTests = totalTests;
  }
  if (typeof existing.attempts !== 'number') existing.attempts = 0;

  return existing;
}

function handleBackendLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const parsed = JSON.parse(trimmed);
    const id = parsed.id;
    if (!id) {
      console.warn('Judge backend response missing id:', parsed);
      return;
    }
    const pending = pendingBackendRequests.get(id);
    if (!pending) {
      console.warn('No pending backend request for id', id);
      return;
    }
    clearTimeout(pending.timeout);
    pendingBackendRequests.delete(id);
    if (parsed.success) {
      pending.resolve(parsed.data ?? null);
    } else {
      pending.reject(new Error(parsed.error ?? 'Judge backend error'));
    }
  } catch (error) {
    console.error('Failed to parse judge backend output:', trimmed, error);
  }
}

function rejectAllPendingBackendRequests(error: Error) {
  for (const [id, pending] of pendingBackendRequests.entries()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
    pendingBackendRequests.delete(id);
  }
}

function sendBackendCommand<T>(
  action: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 60000
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!backendProcess || !backendProcess.stdin || backendProcess.killed) {
      reject(new Error('Judge backend is not running.'));
      return;
    }

    const id = `req-${Date.now()}-${++backendRequestCounter}`;
    const envelope = { action, id, ...payload };
    const timeout = setTimeout(() => {
      pendingBackendRequests.delete(id);
      reject(new Error(`Judge backend request timed out for action "${action}"`));
    }, timeoutMs);

    pendingBackendRequests.set(id, { resolve, reject, timeout });

    const serialized = JSON.stringify(envelope);
    backendProcess.stdin.write(serialized + '\n', (err) => {
      if (err) {
        clearTimeout(timeout);
        pendingBackendRequests.delete(id);
        reject(err);
      }
    });
  });
}

function isPathInside(basePath: string, targetPath: string): boolean {
  const normalizedBase = path.resolve(basePath);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedBase === normalizedTarget) return true;
  const baseWithSep = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;
  return normalizedTarget.startsWith(baseWithSep);
}

function calculateQuestionCounts(progress: ProgressData): QuestionCounts {
  const theoretical = Object.values(progress.theory).reduce(
    (sum, tagData) => sum + (tagData.total ?? 0),
    0
  );
  const practical = countPracticalQuestions();
  return { theoretical, practical };
}

function broadcastDataRefresh(payload: { counts: QuestionCounts; progress: ProgressData }) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('data:refresh', payload);
  }
}

function savePracticalHistorySnapshot(
  questionId: string,
  entry: PracticalHistoryEntry
): void {
  try {
    ensureDirExists(getHistoryDir());
    const historyPath = getHistoryPath(questionId);
    let existing: PracticalHistoryEntry[] = [];
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, 'utf-8');
      existing = JSON.parse(raw);
    }

    if (entry.kind === 'iteration') {
      existing = existing.filter((e) => e.kind !== 'iteration');
      existing.unshift(entry);
    } else {
      const iterations = existing.filter((e) => e.kind === 'iteration');
      const submissions = existing.filter((e) => e.kind === 'submission');
      submissions.unshift(entry);
      const trimmedSubmissions = submissions.slice(0, 5);
      existing = [...iterations, ...trimmedSubmissions];
    }

    fs.writeFileSync(historyPath, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[History] Failed to save history snapshot:', err);
  }
}

function setIterationHistory(questionId: string, files: { filename: string; content: string }[]) {
  try {
    ensureDirExists(getHistoryDir());
    const historyPath = getHistoryPath(questionId);
    let existing: PracticalHistoryEntry[] = [];
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, 'utf-8');
      existing = JSON.parse(raw);
    }

    const entry: PracticalHistoryEntry = {
      timestamp: new Date().toISOString(),
      files,
      kind: 'iteration',
    };

    // Keep latest iteration at front, remove older iterations
    existing = existing.filter((e) => e.kind !== 'iteration');
    existing.unshift(entry);

    fs.writeFileSync(historyPath, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[History] Failed to save history snapshot:', err);
  }
}

function clearIterationHistory(questionId: string) {
  try {
    const historyPath = getHistoryPath(questionId);
    if (!fs.existsSync(historyPath)) return;
    const raw = fs.readFileSync(historyPath, 'utf-8');
    const parsed: PracticalHistoryEntry[] = JSON.parse(raw);
    const filtered = parsed.filter((e) => e.kind !== 'iteration');
    fs.writeFileSync(historyPath, JSON.stringify(filtered, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[History] Failed to clear iteration history:', err);
  }
}

function loadPracticalHistory(questionId: string): PracticalHistoryEntry[] {
  try {
    const historyPath = getHistoryPath(questionId);
    if (!fs.existsSync(historyPath)) return [];
    const raw = fs.readFileSync(historyPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[History] Failed to load history:', err);
    return [];
  }
}

function sendDevConsoleLog(entry: { level: DevConsoleLevel; message: string; source?: string; line?: number }) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('devconsole:log', entry);
    }
  });
}

function wireConsoleForwarding(win: BrowserWindow, label: string) {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const resolvedLevel = consoleLevelMap[level] ?? 'log';
    const source = sourceId ? `${label}:${sourceId}` : label;
    sendDevConsoleLog({
      level: resolvedLevel,
      message: `[${label}] ${message}`,
      source,
      line,
    });
  });
}

function parseImageDataUrl(dataUrl: string): { buffer: Buffer; extension: string } {
  // More permissive regex that handles edge cases with long base64 strings
  const match = /^data:(image\/(png|jpeg|gif));base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('INVALID_IMAGE_DATA');
  }
  const subtype = match[2] === 'jpeg' ? 'jpg' : match[2];
  const base64 = match[3];
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new Error('EMPTY_IMAGE_DATA');
  }
  return { buffer, extension: subtype };
}

function decodeQuotedString(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      const normalized = `"${trimmed.slice(1, -1).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      try {
        return JSON.parse(normalized);
      } catch {
        return trimmed.slice(1, -1);
      }
    }
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }
}

function parseScalarValue(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed; // preserve numeric-looking strings
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return decodeQuotedString(trimmed);
  }
  return trimmed;
}

function parseChoicesFromFrontmatter(lines: string[], startIndex: number): {
  choices: ListedChoice[];
  nextIndex: number;
} {
  const choices: ListedChoice[] = [];
  let idx = startIndex;
  let current: { text?: string; isCorrect?: boolean } | null = null;

  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (!trimmed) {
      idx += 1;
      continue;
    }

    if (trimmed.startsWith('-')) {
      if (current && typeof current.text === 'string') {
        choices.push({
          text: current.text,
          isCorrect: current.isCorrect ?? false,
        });
      }
      current = { isCorrect: false };
      const textMatch = trimmed.match(/-\s*text:\s*(.*)/);
      if (textMatch) {
        current.text = decodeQuotedString(textMatch[1]);
      }
      idx += 1;
      continue;
    }

    if (trimmed.startsWith('correct:')) {
      if (current) {
        const flag = trimmed.split(':')[1]?.trim().toLowerCase();
        current.isCorrect = flag === 'true';
      }
      idx += 1;
      continue;
    }

    break;
  }

  if (current && typeof current.text === 'string') {
    choices.push({
      text: current.text,
      isCorrect: current.isCorrect ?? false,
    });
  }

  return { choices, nextIndex: idx };
}

function parseImagesFromFrontmatter(lines: string[], startIndex: number): {
  images: string[];
  nextIndex: number;
} {
  const images: string[] = [];
  let idx = startIndex;

  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (!trimmed) {
      idx += 1;
      continue;
    }

    // Check if this is a list item
    if (trimmed.startsWith('-')) {
      // Extract the quoted filename
      const match = trimmed.match(/-\s*"([^"]+)"/);
      if (match) {
        images.push(match[1]);
      } else {
        // Try without quotes
        const simpleMatch = trimmed.match(/-\s*(\S+)/);
        if (simpleMatch) {
          images.push(simpleMatch[1]);
        }
      }
      idx += 1;
      continue;
    }

    // If we hit a non-list-item line, we're done with the images array
    break;
  }

  return { images, nextIndex: idx };
}

function parseTheoreticalQuestionFile(filePath: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid theoretical question format: ${filePath}`);
  }

  const [, frontmatter, body] = match;
  const lines = frontmatter.split(/\r?\n/);
  const meta: Record<string, unknown> = {};

  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (!trimmed) {
      idx += 1;
      continue;
    }

    if (trimmed.startsWith('choices:')) {
      const { choices, nextIndex } = parseChoicesFromFrontmatter(lines, idx + 1);
      meta.choices = choices;
      idx = nextIndex;
      continue;
    }

    if (trimmed.startsWith('identification_answers:')) {
      const answers: string[] = [];
      let j = idx + 1;
      while (j < lines.length) {
        const l = lines[j].trim();
        if (!l) { j += 1; continue; }
        if (l.startsWith('-')) {
          const m = l.match(/-\s*(.*)/);
          if (m) answers.push(m[1]);
          j += 1;
          continue;
        }
        break;
      }
      meta.identification_answers = answers;
      idx = j;
      continue;
    }

    if (trimmed.startsWith('multi_identification_items:')) {
      const items: MultiIdentificationItem[] = [];
      let j = idx + 1;
      let current: MultiIdentificationItem | null = null;

      while (j < lines.length) {
        const rawLine = lines[j];
        const l = rawLine.trim();
        if (!l) {
          j += 1;
          continue;
        }
        // Stop if indentation drops (new key)
        if (!rawLine.startsWith(' ')) break;

        if (l.startsWith('-')) {
          if (current) items.push(current);
          current = { subtitle: undefined, answers: [] };
          const inlineSubtitle = l.match(/-\s*subtitle:\s*(.*)/);
          if (inlineSubtitle && inlineSubtitle[1]) {
            current.subtitle = parseScalarValue(`:${inlineSubtitle[1]}`) as string;
          }
          j += 1;
          continue;
        }

        if (!current) {
          j += 1;
          continue;
        }

        if (l.startsWith('subtitle:')) {
          current.subtitle = parseScalarValue(l.slice('subtitle:'.length)) as string;
          j += 1;
          continue;
        }

        if (l.startsWith('answers:')) {
          j += 1;
          while (j < lines.length) {
            const ansRaw = lines[j];
            const ansTrim = ansRaw.trim();
            if (!ansTrim) {
              j += 1;
              continue;
            }
            const leadingSpaces = ansRaw.length - ansRaw.trimStart().length;
            // If indentation is at or above item level (<=2 spaces), this is a new item or sibling key
            if (leadingSpaces <= 2) break;
            if (ansTrim.startsWith('-')) {
              const val = ansTrim.replace(/^-+\s*/, '');
              if (val) current.answers.push(parseScalarValue(val) as string);
              j += 1;
              continue;
            }
            break;
          }
          continue;
        }

        j += 1;
      }

      if (current) items.push(current);
      meta.multi_identification_items = items;
      idx = j;
      continue;
    }

    if (trimmed.startsWith('images:')) {
      // Check if there's a value on the same line (inline array not supported, but handle empty)
      const valuePart = trimmed.slice(7).trim(); // 7 = 'images:'.length
      if (!valuePart) {
        // Multi-line array format
        const { images, nextIndex } = parseImagesFromFrontmatter(lines, idx + 1);
        meta.images = images;
        idx = nextIndex;
        continue;
      }
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.slice(0, colonIndex).trim();
      const valuePart = trimmed.slice(colonIndex + 1);
      meta[key] = parseScalarValue(valuePart);
    }
    idx += 1;
  }

  return { meta, body: body.replace(/\r\n/g, '\n').trim() };
}

function defaultProgress(): ProgressData {
  // Start with 0/0 until questions are added
  const seed = (): TagProgress => ({ answered: 0, total: 0 });
  const theory: ProgressData['theory'] = {
    'Arrays': seed(),
    'Linked Lists': seed(),
    'Cursor-Based': seed(),
    'Stack': seed(),
    'Queue': seed(),
    'ADT List': seed(),
    'SET and ADT Set': seed(),
    'ADT Dictionary': seed(),
    'ADT Priority Queue': seed(),
    'ADT Tree and Implementations': seed(),
    'Binary Search Tree (BST)': seed(),
    'Heapsort Sorting Technique': seed(),
    'Directed and Undirected Graph': seed(),
    'Graph Algorithms': seed(),
  };
  return { version: 1, theory, practical: {}, activity: {} };
}

function readProgress(): ProgressData {
  try {
    const file = getProgressPath();
    if (!fs.existsSync(file)) return defaultProgress();
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as ProgressData;
    if (!parsed.practical) {
      parsed.practical = {};
    }
    for (const [questionId, entry] of Object.entries(parsed.practical)) {
      const totalTests =
        typeof entry.totalTests === 'number' ? entry.totalTests : 0;
      let bestScore =
        typeof entry.bestScore === 'number'
          ? entry.bestScore
          : entry.completed
          ? totalTests
          : 0;
      if (bestScore > totalTests && totalTests > 0) {
        bestScore = totalTests;
      }
      const normalized: PracticalProgress = {
        completed: !!entry.completed,
        completedAt: entry.completedAt,
        bestScore,
        totalTests,
        attempts: typeof entry.attempts === 'number' ? entry.attempts : 0,
        lastAttemptAt: entry.lastAttemptAt,
        lastScore:
          typeof entry.lastScore === 'number'
            ? entry.lastScore
            : entry.completed
            ? totalTests
            : undefined,
      };
      parsed.practical[questionId] = normalized;
    }
    return parsed;
  } catch {
    return defaultProgress();
  }
}

function writeProgress(progress: ProgressData) {
  try {
    const dir = getUserDataDir();
    console.log('[Progress] Writing to directory:', dir);
    ensureDirExists(dir);
    const filePath = getProgressPath();
    console.log('[Progress] Writing to file:', filePath);
    fs.writeFileSync(filePath, JSON.stringify(progress, null, 2), 'utf-8');
    console.log('[Progress] Write successful, file size:', fs.statSync(filePath).size, 'bytes');
  } catch (error) {
    console.error('[Progress] FAILED to write progress:', error);
    throw error;
  }
}

function recordActivity(progress: ProgressData, dateKey?: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const key = dateKey ?? `${y}-${m}-${d}`;
  progress.activity[key] = (progress.activity[key] ?? 0) + 1;
}

// Sync progress totals with actual question files
function syncProgressTotals(progress: ProgressData): void {
  const baseDir = getTheoryBaseDir();
  if (!fs.existsSync(baseDir)) {
    return;
  }

  // Count questions per lesson
  const lessonCounts: Record<string, number> = {};

  for (const sectionKey of Object.keys(SECTION_DEFINITIONS)) {
    const sectionDef = SECTION_DEFINITIONS[sectionKey];
    const sectionDir = path.join(baseDir, slugify(sectionDef.label));
    if (!fs.existsSync(sectionDir)) continue;

    for (const lessonName of sectionDef.lessons) {
      const lessonDir = path.join(sectionDir, slugify(lessonName));
      if (!fs.existsSync(lessonDir)) continue;

      const questionCount = fs
        .readdirSync(lessonDir)
        .filter((file) => file.toLowerCase().endsWith('.md')).length;

      lessonCounts[lessonName] = questionCount;
    }
  }

  // Update progress totals and ensure answered doesn't exceed total
  for (const [lessonName, count] of Object.entries(lessonCounts)) {
    if (!progress.theory[lessonName]) {
      progress.theory[lessonName] = { answered: 0, total: count, answeredQuestions: [] };
    } else {
      progress.theory[lessonName].total = count;
      // If answered exceeds total, cap it at total
      if (progress.theory[lessonName].answered > count) {
        progress.theory[lessonName].answered = count;
      }
    }
  }
  
  // Also set total to 0 for lessons with no questions
  for (const lessonName of Object.keys(progress.theory)) {
    if (!lessonCounts[lessonName]) {
      progress.theory[lessonName].total = 0;
      // If there are no questions, answered should also be 0
      if (progress.theory[lessonName].answered > 0) {
        progress.theory[lessonName].answered = 0;
      }
    }
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  // Resolve icon path for dev vs packaged app
  function getIconPath(): string {
    // When packaged, icons will be copied to resources/icons via electron-builder (see package.json build.extraResources)
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'icons', 'icon.ico');
    }
    // Development: resolve relative to compiled JS location
    return path.join(__dirname, '..', 'static', 'icons', 'icon.ico');
  }

  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    title: 'DSAPrac',
    width: 1400,
    height: 1080,
    icon: nativeImage.createFromPath(iconPath),
    frame: false, // Remove default title bar
    backgroundColor: '#000000', // Black background
    titleBarStyle: 'hidden', // Hide title bar on macOS
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  enableDevtoolsForWindow(mainWindow);

  // macOS dock icon (BrowserWindow.icon is ignored on macOS for dock)
  if (process.platform === 'darwin' && fs.existsSync(iconPath)) {
    try {
      app.dock?.setIcon(nativeImage.createFromPath(iconPath));
    } catch (e) {
      console.warn('Failed to set dock icon:', e);
    }
  }

  // Load Vite dev server in development, bundled files in production
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('Failed to load Vite dev server:', err);
      console.log('Make sure Vite dev server is running on port 5173');
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// Single-window navigation - no longer needed with React Router
// Routes are now handled in the React app
function loadInMainWindow(route: string, width?: number, height?: number) {
  if (!mainWindow) return;
  if (width && height) {
    mainWindow.setSize(width, height);
  }
  // Navigation is now handled by React Router, we just notify the renderer
  mainWindow.webContents.send('navigate', route);
}

function startBackend() {
  const exePath = resolveBackendPath();
  if (!fs.existsSync(exePath)) {
    const message = `Rust backend not found. Expected at:\n${exePath}\n\nFix: open a terminal and run:\n  cd rust-backend && cargo build\n\nOr set DSA_JUDGE_PATH to the executable.`;
    console.error(message);
    dialog.showErrorBox('DSA Judge not found', message);
    return;
  }
  backendStdoutBuffer = '';
  backendProcess = spawn(exePath, ['--stdio']);
  backendProcess.stdout?.on('data', (data) => {
    backendStdoutBuffer += data.toString();
    let newlineIndex: number;
    while ((newlineIndex = backendStdoutBuffer.indexOf('\n')) >= 0) {
      const line = backendStdoutBuffer.slice(0, newlineIndex);
      backendStdoutBuffer = backendStdoutBuffer.slice(newlineIndex + 1);
      handleBackendLine(line);
    }
  });
  backendProcess.stderr?.on('data', (data) => console.error(`[backend:err] ${String(data).trim()}`));
  backendProcess.on('error', (err) => {
    console.error('[backend] spawn error:', err);
    rejectAllPendingBackendRequests(err instanceof Error ? err : new Error(String(err)));
    dialog.showErrorBox('Backend error', String(err));
  });
  backendProcess.on('close', (code) => {
    console.log(`[backend] exited with code ${code}`);
    rejectAllPendingBackendRequests(new Error('Judge backend closed.'));
  });
}

app.whenReady().then(() => {
  // Remove menu bar
  Menu.setApplicationMenu(null);
  
  // Sync progress with actual question files on startup
  try {
    const progress = readProgress();
    syncProgressTotals(progress);
    writeProgress(progress);
    console.log('[Startup] Progress synced with question files');
  } catch (error) {
    console.error('[Startup] Failed to sync progress:', error);
  }
  
  startBackend();
  createWindow();
  if (mainWindow) {
    wireConsoleForwarding(mainWindow, 'main');
  }

  ipcMain.on('app-exit', () => {
    app.quit();
  });

  ipcMain.on('open-settings', () => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Settings',
      message: 'Settings',
      detail: 'Settings panel coming soon! This will include theme options, difficulty settings, and more customization features.',
      buttons: ['OK']
    });
  });

  // Settings IPC
  ipcMain.handle('settings:get', () => {
    return readSettings();
  });

  ipcMain.handle('settings:save', (_evt, partialSettings: Partial<AppSettings>) => {
    const currentSettings = readSettings();
    const newSettings = { ...currentSettings, ...partialSettings };
    writeSettings(newSettings);

    // Broadcast settings change to all renderer windows
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('settings:updated', newSettings);
      }
    });

    return newSettings;
  });

  ipcMain.handle('devconsole:command', (_evt, rawCommand: string) => {
    const command = (rawCommand || '').trim();
    if (!command) {
      return { ok: true, output: ['Ready. Type "help" for commands.'] };
    }

    const [cmd, ...args] = command.split(/\s+/);
    const lc = cmd.toLowerCase();

    switch (lc) {
      case 'help':
        return {
          ok: true,
          output: [
            'Available commands:',
            '  help                Show this help',
            '  version             Show app version',
            '  ping                Latency check',
            '  backend             Show Rust judge status',
            '  clear               Clear console output',
          ],
        };
      case 'version':
        return { ok: true, output: [`DSAPrac ${app.getVersion()}`] };
      case 'ping':
        return { ok: true, output: ['pong'] };
      case 'backend': {
        const running = !!backendProcess && !backendProcess.killed;
        return {
          ok: true,
          output: [
            running
              ? 'Rust judge backend: running'
              : 'Rust judge backend: not running',
          ],
        };
      }
      case 'clear':
        return { ok: true, output: [], action: 'clear' };
      default:
        return {
          ok: false,
          output: [`Unknown command "${command}". Type "help" for a list.`],
        };
    }
  });

  // Progress IPC
  ipcMain.handle('progress:get', () => {
    const progress = readProgress();
    // Sync totals with actual question files
    syncProgressTotals(progress);
    writeProgress(progress);
    return progress;
  });

  ipcMain.handle('progress:updateTheory', (_evt, tag: string, answeredDelta: number | string[]) => {
    console.log('[Progress] updateTheory called:', { tag, answeredDelta });
    const p = readProgress();
    console.log('[Progress] Current progress:', p);
    const tp = p.theory[tag] ?? { answered: 0, total: 0, answeredQuestions: [] };
    
    // If answeredDelta is an array of question IDs, add them to the set
    if (Array.isArray(answeredDelta)) {
      const questionIds = new Set(tp.answeredQuestions || []);
      const before = questionIds.size;
      answeredDelta.forEach(id => questionIds.add(id));
      const after = questionIds.size;
      tp.answeredQuestions = Array.from(questionIds);
      tp.answered = tp.answeredQuestions.length;
      console.log('[Progress] Added questions:', { before, after, newQuestions: after - before });
    } else {
      // Legacy support: if it's a number, just add to the count
      tp.answered = Math.max(0, tp.answered + (answeredDelta || 0));
    }
    
    tp.lastAnsweredAt = new Date().toISOString().slice(0, 10);
    p.theory[tag] = tp;
    // Note: Activity recording moved to frontend to avoid double-counting
    // recordActivity(p);
    console.log('[Progress] After update:', p.theory[tag]);
    writeProgress(p);
    console.log('[Progress] Progress written to:', getProgressPath());
    
    // Broadcast data refresh so UI updates
    const counts = calculateQuestionCounts(p);
    broadcastDataRefresh({ counts, progress: p });
    
    return p;
  });

  ipcMain.handle('progress:resetTheory', (_evt, lessons: string[]) => {
    if (!Array.isArray(lessons) || lessons.length === 0) {
      throw new Error('No lessons provided to reset.');
    }
    const progress = readProgress();
    lessons.forEach((lesson) => {
      if (!progress.theory[lesson]) {
        progress.theory[lesson] = { answered: 0, total: 0, answeredQuestions: [] };
      } else {
        progress.theory[lesson].answered = 0;
        progress.theory[lesson].answeredQuestions = [];
        progress.theory[lesson].lastAnsweredAt = undefined;
      }
    });
    syncProgressTotals(progress);
    writeProgress(progress);
    const counts = calculateQuestionCounts(progress);
    broadcastDataRefresh({ counts, progress });
    return progress;
  });

  ipcMain.handle('progress:setPracticalDone', (_evt, problemId: string, done: boolean, totalTests?: number) => {
    const progress = readProgress();
    const entry = ensurePracticalProgressEntry(progress, problemId, totalTests ?? 0);
    entry.completed = !!done;
    if (typeof totalTests === 'number' && totalTests > 0) {
      entry.totalTests = Math.max(entry.totalTests, totalTests);
    }

    if (done) {
      const today = new Date().toISOString().slice(0, 10);
      entry.completedAt = today;
      if (entry.totalTests > 0) {
        entry.bestScore = Math.max(entry.bestScore, entry.totalTests);
        entry.lastScore = entry.totalTests;
      }
      recordActivity(progress);
    }

    writeProgress(progress);
    const counts = calculateQuestionCounts(progress);
    broadcastDataRefresh({ counts, progress });
    return progress;
  });

  ipcMain.handle('progress:recordActivity', (_evt, dateKey?: string) => {
    const p = readProgress();
    recordActivity(p, dateKey);
    writeProgress(p);
    return p;
  });

  ipcMain.handle('questions:getCounts', () => {
    const progress = readProgress();
    return calculateQuestionCounts(progress);
  });

  ipcMain.handle('judge:envCheck', async () => {
    await sendBackendCommand('env_check');
    return { success: true };
  });

  ipcMain.handle('judge:run', async (_event, request) => {
    if (!request || typeof request !== 'object') {
      throw new Error('Invalid judge request.');
    }
    return sendBackendCommand('judge', { request });
  });

  ipcMain.handle('theory:createQuestion', (_event, rawPayload: CreateTheoreticalQuestionPayload) => {
    const payload = rawPayload as CreateTheoreticalQuestionPayload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload received.');
    }

    const { question, section, lesson, author, choices, image, images, isPreviousExam, examSchoolYear, examSemester } = payload;

    const sanitizedQuestion =
      typeof question === 'string' ? question.replace(/\r\n/g, '\n').trim() : '';
    if (!sanitizedQuestion) {
      throw new Error('Question text is required.');
    }

    const sectionDef = SECTION_DEFINITIONS[section];
    if (!sectionDef) {
      throw new Error('Invalid section selected.');
    }

    if (!sectionDef.lessons.includes(lesson)) {
      throw new Error('Selected lesson does not belong to the chosen section.');
    }

    const questionType =
      payload.questionType === 'identification'
        ? 'identification'
        : payload.questionType === 'multi-identification'
        ? 'multi-identification'
        : 'mcq';
    let normalizedChoices: ChoicePayload[] = [];
    let correctCount = 0;
    let multiItems: MultiIdentificationItem[] = [];
    if (questionType === 'mcq') {
      if (!Array.isArray(choices)) {
        throw new Error('Choices payload is invalid.');
      }
  
      if (choices.length < THEORY_MIN_CHOICES || choices.length > THEORY_MAX_CHOICES) {
        throw new Error(
          `Choices must be between ${THEORY_MIN_CHOICES} and ${THEORY_MAX_CHOICES}.`
        );
      }
  
      normalizedChoices = choices.map((choice, index) => {
        if (!choice || typeof choice.text !== 'string') {
          throw new Error(`Choice #${index + 1} is invalid.`);
        }
        const text = choice.text.trim();
        if (!text) {
          throw new Error(`Choice #${index + 1} must have text.`);
        }
        return { text, isCorrect: !!choice.isCorrect };
      });
  
      correctCount = normalizedChoices.filter((choice) => choice.isCorrect).length;
      if (correctCount === 0) {
        throw new Error('At least one correct answer is required.');
      }
    } else if (questionType === 'identification') {
      const answers = Array.isArray(payload.identificationAnswers) ? payload.identificationAnswers.map(a => (typeof a === 'string' ? a.trim() : '')).filter(Boolean) : [];
      if (answers.length === 0) {
        throw new Error('At least one identification answer is required.');
      }
      normalizedChoices = [];
      correctCount = answers.length;
    } else {
      const itemsRaw = Array.isArray(payload.multiIdentificationItems) ? payload.multiIdentificationItems : [];
      multiItems = itemsRaw
        .map((item) => {
          const answers = Array.isArray(item.answers)
            ? item.answers.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean)
            : [];
          const subtitle =
            typeof item.subtitle === 'string' && item.subtitle.trim() ? item.subtitle.trim() : undefined;
          return { subtitle, answers };
        })
        .filter((item) => item.answers.length > 0);
      if (multiItems.length === 0) {
        throw new Error('At least one item with an acceptable answer is required.');
      }
      normalizedChoices = [];
      correctCount = multiItems.length;
    }

    const createdAt = new Date().toISOString();
    ensureDirExists(getQuestionsRootDir());
    const baseDir = getTheoryBaseDir();
    ensureDirExists(baseDir);

    const sectionSlug = slugify(sectionDef.label);
    const lessonSlug = slugify(lesson);
    const lessonDir = path.join(baseDir, sectionSlug, lessonSlug);
    ensureDirExists(lessonDir);

    const unique = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : crypto.randomBytes(4).toString('hex');
    const questionId = `theory-${Date.now()}-${unique}`;
    const markdownFileName = `${questionId}.md`;
    const markdownPath = path.join(lessonDir, markdownFileName);

    const imageFileNames: string[] = [];
    const imageFilePaths: string[] = [];

    try {
      // Handle multiple images (new format)
      if (images && Array.isArray(images) && images.length > 0) {
        images.forEach((img, index) => {
          if (img && img.dataUrl) {
            const { buffer, extension } = parseImageDataUrl(img.dataUrl);
            const imageFileName = `${questionId}-${index}.${extension}`;
            const imageFilePath = path.join(lessonDir, imageFileName);
            fs.writeFileSync(imageFilePath, buffer);
            imageFileNames.push(imageFileName);
            imageFilePaths.push(imageFilePath);
          }
        });
      } else if (image && image.dataUrl) {
        // Legacy single image support
        const { buffer, extension } = parseImageDataUrl(image.dataUrl);
        const imageFileName = `${questionId}.${extension}`;
        const imageFilePath = path.join(lessonDir, imageFileName);
        fs.writeFileSync(imageFilePath, buffer);
        imageFileNames.push(imageFileName);
        imageFilePaths.push(imageFilePath);
      }

      const frontmatterLines: string[] = [
        '---',
        `id: ${questionId}`,
        `section: "${sectionDef.label}"`,
        `lesson: "${lesson}"`,
        `author: "${author?.trim() || ''}"`,
        `created_at: "${createdAt}"`,
        `updated_at: "${createdAt}"`,
        `choice_count: ${normalizedChoices.length}`,
        `correct_count: ${correctCount}`,
      ];

      if (imageFileNames.length === 1) {
        // Single image - use legacy format for backward compatibility
        frontmatterLines.push(`image: "${imageFileNames[0]}"`);
      } else if (imageFileNames.length > 1) {
        // Multiple images - use new format
        frontmatterLines.push('images:');
        imageFileNames.forEach((fileName) => {
          frontmatterLines.push(`  - "${fileName}"`);
        });
      }

      // Add exam info if provided
      if (isPreviousExam) {
        frontmatterLines.push(`is_previous_exam: true`);
        if (examSchoolYear?.trim()) {
          frontmatterLines.push(`exam_school_year: "${examSchoolYear.trim()}"`);
        }
        if (examSemester?.trim()) {
          frontmatterLines.push(`exam_semester: "${examSemester.trim()}"`);
        }
      }

      frontmatterLines.push(`question_type: ${questionType}`);
      if (questionType === 'identification') {
        frontmatterLines.push('identification_answers:');
        (payload.identificationAnswers || []).forEach((ans) => {
          frontmatterLines.push(`  - ${ans.replace(/"/g, '\\"')}`);
        });
      } else if (questionType === 'multi-identification') {
        frontmatterLines.push('multi_identification_items:');
        multiItems.forEach((item) => {
          frontmatterLines.push('  -');
          if (item.subtitle) {
            frontmatterLines.push(`    subtitle: ${JSON.stringify(item.subtitle)}`);
          }
          frontmatterLines.push('    answers:');
          item.answers.forEach((ans) => {
            frontmatterLines.push(`      - ${ans.replace(/"/g, '\\"')}`);
          });
        });
      } else {
        frontmatterLines.push('choices:');
        normalizedChoices.forEach((choice) => {
          frontmatterLines.push(`  - text: ${JSON.stringify(choice.text)}`);
          frontmatterLines.push(`    correct: ${choice.isCorrect ? 'true' : 'false'}`);
        });
      }
      frontmatterLines.push('---', '', sanitizedQuestion, '');

      fs.writeFileSync(markdownPath, frontmatterLines.join('\n'), 'utf-8');

      const progress = readProgress();
      const lessonStats = progress.theory[lesson] ?? { answered: 0, total: 0 };
      lessonStats.total = (lessonStats.total ?? 0) + 1;
      progress.theory[lesson] = lessonStats;
      writeProgress(progress);

      const counts = calculateQuestionCounts(progress);
      broadcastDataRefresh({ counts, progress });

      return {
        id: questionId,
        filePath: markdownPath,
        section: sectionDef.label,
        lesson,
        counts,
      };
    } catch (error) {
      // Cleanup images on error
      imageFilePaths.forEach((imgPath) => {
        if (fs.existsSync(imgPath)) {
          try {
            fs.unlinkSync(imgPath);
          } catch {
            // Ignore cleanup errors
          }
        }
      });
      if (fs.existsSync(markdownPath)) {
        try {
          fs.unlinkSync(markdownPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  ipcMain.handle('theory:listQuestions', () => {
    const records: TheoreticalQuestionRecord[] = [];
    const baseDir = getTheoryBaseDir();
    if (!fs.existsSync(baseDir)) {
      return records;
    }

    for (const sectionKey of Object.keys(SECTION_DEFINITIONS)) {
      const sectionDef = SECTION_DEFINITIONS[sectionKey];
      const sectionDir = path.join(baseDir, slugify(sectionDef.label));
      if (!fs.existsSync(sectionDir)) continue;

      for (const lessonName of sectionDef.lessons) {
        const lessonDir = path.join(sectionDir, slugify(lessonName));
        if (!fs.existsSync(lessonDir)) continue;

        const files = fs
          .readdirSync(lessonDir)
          .filter((file) => file.toLowerCase().endsWith('.md'))
          .sort();

        for (const file of files) {
          const filePath = path.join(lessonDir, file);
          try {
            const { meta, body } = parseTheoreticalQuestionFile(filePath);
            const id =
              typeof meta.id === 'string' && meta.id.trim()
                ? (meta.id as string).trim()
                : path.basename(file, path.extname(file));
            const createdAt =
              typeof meta.created_at === 'string' ? (meta.created_at as string) : undefined;
            const updatedAt =
              typeof meta.updated_at === 'string' ? (meta.updated_at as string) : undefined;
            const choices = Array.isArray(meta.choices)
              ? (meta.choices as ListedChoice[])
              : [];
            const identificationAnswers = Array.isArray((meta as any).identification_answers)
              ? ((meta as any).identification_answers as string[])
                  .map((a) => (typeof a === 'string' ? a.trim() : ''))
                  .filter(Boolean)
              : [];
            const multiIdentificationItems = Array.isArray((meta as any).multi_identification_items)
              ? ((meta as any).multi_identification_items as any[]).map((item) => {
                  const subtitle =
                    item && typeof item.subtitle === 'string' && item.subtitle.trim()
                      ? item.subtitle.trim()
                      : undefined;
                  const answers = Array.isArray(item.answers)
                    ? item.answers
                        .map((a: any) => (typeof a === 'string' ? a.trim() : ''))
                        .filter(Boolean)
                    : [];
                  return { subtitle, answers };
                })
              : [];
            const questionType =
              meta.question_type === 'identification'
                ? 'identification'
                : meta.question_type === 'multi-identification' || meta.question_type === 'multi_identification'
                ? 'multi-identification'
                : 'mcq';
            const correctCount =
              typeof meta.correct_count === 'number'
                ? (meta.correct_count as number)
                : questionType === 'mcq'
                ? choices.filter((choice) => choice.isCorrect).length
                : questionType === 'identification'
                ? identificationAnswers.length
                : multiIdentificationItems.length;

            let imageDataUrl: string | undefined;
            let imageDataUrls: string[] | undefined;

            // Check for multiple images (new format)
            if (Array.isArray(meta.images) && meta.images.length > 0) {
              imageDataUrls = [];
              for (const imgFileName of meta.images) {
                if (typeof imgFileName === 'string' && imgFileName.trim()) {
                  const imagePath = path.join(lessonDir, imgFileName.trim());
                  if (fs.existsSync(imagePath)) {
                    const ext = path.extname(imgFileName).toLowerCase();
                    const mime =
                      ext === '.png'
                        ? 'image/png'
                        : ext === '.jpg' || ext === '.jpeg'
                        ? 'image/jpeg'
                        : ext === '.gif'
                        ? 'image/gif'
                        : null;
                    if (mime) {
                      const base64 = fs.readFileSync(imagePath, { encoding: 'base64' });
                      imageDataUrls.push(`data:${mime};base64,${base64}`);
                    }
                  }
                }
              }
              // Set first image as legacy imageDataUrl for backward compatibility
              if (imageDataUrls.length > 0) {
                imageDataUrl = imageDataUrls[0];
              }
            } else if (typeof meta.image === 'string' && meta.image.trim()) {
              // Legacy single image support
              const imageFileName = (meta.image as string).trim();
              const imagePath = path.join(lessonDir, imageFileName);
              if (fs.existsSync(imagePath)) {
                const ext = path.extname(imageFileName).toLowerCase();
                const mime =
                  ext === '.png'
                    ? 'image/png'
                    : ext === '.jpg' || ext === '.jpeg'
                    ? 'image/jpeg'
                    : ext === '.gif'
                    ? 'image/gif'
                    : null;
                if (mime) {
                  const base64 = fs.readFileSync(imagePath, { encoding: 'base64' });
                  imageDataUrl = `data:${mime};base64,${base64}`;
                  imageDataUrls = [imageDataUrl];
                }
              }
            }

            // Read exam info
            const isPreviousExam = meta.is_previous_exam === true;
            const examSchoolYear = typeof meta.exam_school_year === 'string' ? meta.exam_school_year : undefined;
            const examSemester = typeof meta.exam_semester === 'string' ? meta.exam_semester : undefined;
            const author = typeof meta.author === 'string' ? meta.author : undefined;

            records.push({
              id,
              sectionKey,
              section: sectionDef.label,
              lesson: lessonName,
              filePath,
              question: body,
              author,
              choices,
              correctCount,
              questionType,
              identificationAnswers,
              multiIdentificationItems,
              imageDataUrl,
              imageDataUrls,
              createdAt,
              updatedAt,
              isPreviousExam,
              examSchoolYear,
              examSemester,
            });
          } catch (error) {
            console.warn(`Failed to load theoretical question at ${filePath}:`, error);
            continue;
          }
        }
      }
    }

    return records;
  });

  ipcMain.handle('theory:updateQuestion', (_event, rawPayload: UpdateTheoreticalQuestionPayload) => {
    const payload = rawPayload as UpdateTheoreticalQuestionPayload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload received.');
    }

    const sectionDef = SECTION_DEFINITIONS[payload.sectionKey];
    if (!sectionDef) {
      throw new Error('Invalid section selected.');
    }

    if (!sectionDef.lessons.includes(payload.lesson)) {
      throw new Error('Invalid lesson selected.');
    }

    const sanitizedQuestion =
      typeof payload.question === 'string' ? payload.question.replace(/\r\n/g, '\n').trim() : '';
    if (!sanitizedQuestion) {
      throw new Error('Question text is required.');
    }

    if (!Array.isArray(payload.choices)) {
      throw new Error('Choices payload is invalid.');
    }

    const questionTypeUpdate =
      payload.questionType === 'identification'
        ? 'identification'
        : payload.questionType === 'multi-identification'
        ? 'multi-identification'
        : 'mcq';
    let normalizedChoices: ChoicePayload[] = [];
    let correctCount = 0;
    let multiItems: MultiIdentificationItem[] = [];
    if (questionTypeUpdate === 'mcq') {
      if (payload.choices.length < THEORY_MIN_CHOICES || payload.choices.length > THEORY_MAX_CHOICES) {
        throw new Error(
          `Choices must be between ${THEORY_MIN_CHOICES} and ${THEORY_MAX_CHOICES}.`
        );
      }
      normalizedChoices = payload.choices.map((choice, index) => {
        if (!choice || typeof choice.text !== 'string') {
          throw new Error(`Choice #${index + 1} is invalid.`);
        }
        const text = choice.text.trim();
        if (!text) {
          throw new Error(`Choice #${index + 1} must have text.`);
        }
        return { text, isCorrect: !!choice.isCorrect };
      });
  
      correctCount = normalizedChoices.filter((choice) => choice.isCorrect).length;
      if (correctCount === 0) {
        throw new Error('At least one correct answer is required.');
      }
    } else if (questionTypeUpdate === 'identification') {
      const answers = Array.isArray(payload.identificationAnswers)
        ? payload.identificationAnswers.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean)
        : [];
      if (answers.length === 0) {
        throw new Error('At least one identification answer is required.');
      }
      normalizedChoices = [];
      correctCount = answers.length;
    } else {
      const itemsRaw = Array.isArray(payload.multiIdentificationItems) ? payload.multiIdentificationItems : [];
      multiItems = itemsRaw
        .map((item) => {
          const answers = Array.isArray(item.answers)
            ? item.answers.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean)
            : [];
          const subtitle =
            typeof item.subtitle === 'string' && item.subtitle.trim() ? item.subtitle.trim() : undefined;
          return { subtitle, answers };
        })
        .filter((item) => item.answers.length > 0);
      if (multiItems.length === 0) {
        throw new Error('At least one item with an acceptable answer is required.');
      }
      normalizedChoices = [];
      correctCount = multiItems.length;
    }

    const baseDir = path.resolve(getTheoryBaseDir());
    const resolvedPath = path.resolve(payload.filePath);
    if (!isPathInside(baseDir, resolvedPath)) {
      throw new Error('Invalid question path.');
    }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error('Question file not found.');
      }

    const { meta } = parseTheoreticalQuestionFile(resolvedPath);

    const existingAuthor =
      typeof meta.author === 'string' && meta.author.trim()
        ? (meta.author as string).trim()
        : '';
    const author =
      typeof payload.author === 'string' && payload.author.trim()
        ? payload.author.trim()
        : existingAuthor;
    if (!author) {
      throw new Error('Author is required.');
    }

      const originalCreatedAt =
        typeof meta.created_at === 'string' && meta.created_at.trim()
          ? (meta.created_at as string).trim()
        : new Date().toISOString();
    const oldLessonName =
      typeof meta.lesson === 'string' && meta.lesson.trim()
        ? (meta.lesson as string).trim()
        : payload.lesson;
    const oldSectionLabel =
      typeof meta.section === 'string' && meta.section.trim()
        ? (meta.section as string).trim()
        : sectionDef.label;

    const oldImageName =
      typeof meta.image === 'string' && meta.image.trim()
        ? (meta.image as string).trim()
        : undefined;
    const oldImagesArray = Array.isArray(meta.images) ? meta.images as string[] : [];
    const oldImagePaths: string[] = [];
    
    // Collect all old image paths
    if (oldImagesArray.length > 0) {
      for (const imgName of oldImagesArray) {
        if (typeof imgName === 'string' && imgName.trim()) {
          const imgPath = path.join(path.dirname(resolvedPath), imgName.trim());
          if (fs.existsSync(imgPath)) {
            oldImagePaths.push(imgPath);
          }
        }
      }
    } else if (oldImageName) {
      const imgPath = path.join(path.dirname(resolvedPath), oldImageName);
      if (fs.existsSync(imgPath)) {
        oldImagePaths.push(imgPath);
      }
    }

    const destDir = path.join(baseDir, slugify(sectionDef.label), slugify(payload.lesson));
    ensureDirExists(destDir);
    const fileName = path.basename(resolvedPath);
    const destPath = path.join(destDir, fileName);

    const nowIso = new Date().toISOString();
    const newImageFileNames: string[] = [];
    const newImageFilePaths: string[] = [];

    try {
      // Handle multiple images (new format)
      if (payload.images && Array.isArray(payload.images)) {
        // Delete all old images first
        for (const oldPath of oldImagePaths) {
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // ignore cleanup errors
            }
          }
        }
        
        // Write new images
        payload.images.forEach((img, index) => {
          if (img && img.dataUrl) {
            const { buffer, extension } = parseImageDataUrl(img.dataUrl);
            const imageFileName = `${payload.id}-${index}.${extension}`;
            const imageFilePath = path.join(destDir, imageFileName);
            fs.writeFileSync(imageFilePath, buffer);
            newImageFileNames.push(imageFileName);
            newImageFilePaths.push(imageFilePath);
          }
        });
      } else if (payload.image === undefined) {
        // Keep existing images - copy to new location if moving
        if (oldImagePaths.length > 0 && path.dirname(oldImagePaths[0]) !== destDir) {
          for (const oldPath of oldImagePaths) {
            const imgName = path.basename(oldPath);
            const destinationPath = path.join(destDir, imgName);
            fs.copyFileSync(oldPath, destinationPath);
            newImageFileNames.push(imgName);
            newImageFilePaths.push(destinationPath);
          }
        } else {
          // Keep old names
          for (const oldPath of oldImagePaths) {
            newImageFileNames.push(path.basename(oldPath));
          }
        }
      } else if (payload.image === null) {
        // Remove all images
        for (const oldPath of oldImagePaths) {
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // ignore cleanup errors
            }
          }
        }
      } else if (payload.image) {
        // Legacy single image update
        for (const oldPath of oldImagePaths) {
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // ignore cleanup errors
            }
          }
        }
        const { buffer, extension } = parseImageDataUrl(payload.image.dataUrl);
        const imageFileName = `${payload.id}.${extension}`;
        const imageFilePath = path.join(destDir, imageFileName);
        fs.writeFileSync(imageFilePath, buffer);
        newImageFileNames.push(imageFileName);
        newImageFilePaths.push(imageFilePath);
      }

        const frontmatterLines: string[] = [
          '---',
          `id: ${payload.id}`,
          `section: "${sectionDef.label}"`,
        `lesson: "${payload.lesson}"`,
        `author: "${author}"`,
        `created_at: "${originalCreatedAt}"`,
        `updated_at: "${nowIso}"`,
        `choice_count: ${normalizedChoices.length}`,
        `correct_count: ${correctCount}`,
        `question_type: ${questionTypeUpdate}`,
      ];

      if (newImageFileNames.length === 1) {
        // Single image - use legacy format for backward compatibility
        frontmatterLines.push(`image: "${newImageFileNames[0]}"`);
      } else if (newImageFileNames.length > 1) {
        // Multiple images - use new format
        frontmatterLines.push('images:');
        newImageFileNames.forEach((imageName) => {
          frontmatterLines.push(`  - "${imageName}"`);
        });
      }

      // Add exam info if provided
      if (payload.isPreviousExam) {
        frontmatterLines.push(`is_previous_exam: true`);
        if (payload.examSchoolYear?.trim()) {
          frontmatterLines.push(`exam_school_year: "${payload.examSchoolYear.trim()}"`);
        }
      if (payload.examSemester?.trim()) {
        frontmatterLines.push(`exam_semester: "${payload.examSemester.trim()}"`);
      }
    }

      frontmatterLines.push(`question_type: ${questionTypeUpdate}`);
      if (questionTypeUpdate === 'identification') {
        frontmatterLines.push('identification_answers:');
        (payload.identificationAnswers || []).forEach((ans) => {
          frontmatterLines.push(`  - ${ans.replace(/"/g, '\\"')}`);
        });
      } else if (questionTypeUpdate === 'multi-identification') {
        frontmatterLines.push('multi_identification_items:');
        multiItems.forEach((item) => {
          frontmatterLines.push('  -');
          if (item.subtitle) {
            frontmatterLines.push(`    subtitle: ${JSON.stringify(item.subtitle)}`);
          }
          frontmatterLines.push('    answers:');
          item.answers.forEach((ans) => {
            frontmatterLines.push(`      - ${ans.replace(/"/g, '\\"')}`);
          });
        });
      } else {
        frontmatterLines.push('choices:');
        normalizedChoices.forEach((choice) => {
          frontmatterLines.push(`  - text: ${JSON.stringify(choice.text)}`);
          frontmatterLines.push(`    correct: ${choice.isCorrect ? 'true' : 'false'}`);
        });
      }
      frontmatterLines.push('---', '', sanitizedQuestion, '');

      fs.writeFileSync(destPath, frontmatterLines.join('\n'), 'utf-8');

      if (destPath !== resolvedPath) {
        fs.unlinkSync(resolvedPath);
        // Clean up old images in old directory
        for (const oldPath of oldImagePaths) {
          if (fs.existsSync(oldPath) && path.dirname(oldPath) !== destDir) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // ignore cleanup errors
            }
          }
        }
      }

      const progress = readProgress();
      
      // Sync progress totals with actual files to ensure accuracy
      syncProgressTotals(progress);
      
      // Update progress if section or lesson changed
      const sectionChanged = oldSectionLabel !== sectionDef.label;
      const lessonChanged = oldLessonName !== payload.lesson;
      
      if (sectionChanged || lessonChanged) {
        // Remove from old lesson
        const oldStats = progress.theory[oldLessonName] ?? { answered: 0, total: 0 };
        oldStats.total = Math.max(0, (oldStats.total ?? 0) - 1);
        progress.theory[oldLessonName] = oldStats;

        // Add to new lesson
        const newStats = progress.theory[payload.lesson] ?? { answered: 0, total: 0 };
        newStats.total = (newStats.total ?? 0) + 1;
        progress.theory[payload.lesson] = newStats;
      }
      
      // Sync again after manual changes to ensure everything is correct
      syncProgressTotals(progress);
      
      writeProgress(progress);
      const counts = calculateQuestionCounts(progress);
      broadcastDataRefresh({ counts, progress });
      return counts;
    } catch (error) {
      // Clean up newly written image files on error
      for (const imgPath of newImageFilePaths) {
        if (fs.existsSync(imgPath)) {
          try {
            fs.unlinkSync(imgPath);
          } catch {
            // ignore cleanup errors
          }
        }
      }
      if (destPath !== resolvedPath && fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath);
        } catch {
          // ignore cleanup errors
        }
      }
      throw error;
    }
  });

  ipcMain.handle('theory:deleteQuestion', (_event, rawPayload: DeleteTheoreticalQuestionPayload) => {
    const payload = rawPayload as DeleteTheoreticalQuestionPayload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload received.');
    }

    const baseDir = path.resolve(getTheoryBaseDir());
    const resolvedPath = path.resolve(payload.filePath);
    if (!isPathInside(baseDir, resolvedPath)) {
      throw new Error('Invalid question path.');
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error('Question file not found.');
    }

    const { meta } = parseTheoreticalQuestionFile(resolvedPath);
    const lessonName =
      typeof meta.lesson === 'string' && meta.lesson.trim()
        ? (meta.lesson as string).trim()
        : undefined;
    const imageName =
      typeof meta.image === 'string' && meta.image.trim()
        ? (meta.image as string).trim()
        : undefined;
    const imagePath = imageName ? path.join(path.dirname(resolvedPath), imageName) : undefined;

    fs.unlinkSync(resolvedPath);
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch {
        // ignore cleanup errors
      }
    }

    const progress = readProgress();
    if (lessonName) {
      const stats = progress.theory[lessonName] ?? { answered: 0, total: 0 };
      stats.total = Math.max(0, (stats.total ?? 0) - 1);
      progress.theory[lessonName] = stats;
    }

    writeProgress(progress);
    const counts = calculateQuestionCounts(progress);
    broadcastDataRefresh({ counts, progress });
    return counts;
  });

  // ============ Practical Question Handlers ============
  ipcMain.handle('practical:createQuestion', (_event, rawPayload: CreatePracticalQuestionPayload) => {
    const payload = rawPayload as CreatePracticalQuestionPayload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload received.');
    }

    const { title, description, difficulty, section, lesson, author, files, testCases, image, images, isPreviousExam, examSchoolYear, examSemester } = payload;

    if (!title.trim() || !description.trim()) {
      throw new Error('Title and description are required.');
    }

    if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) {
      throw new Error('Invalid difficulty level.');
    }

    const sectionDef = SECTION_DEFINITIONS[section];
    if (!sectionDef) {
      throw new Error('Invalid section selected.');
    }

    if (!sectionDef.lessons.includes(lesson)) {
      throw new Error('Selected lesson does not belong to the chosen section.');
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('At least one code file is required.');
    }

    // Validate that at least one file is marked as answer file
    const hasAnswerFile = files.some(f => f.isAnswerFile);
    if (!hasAnswerFile) {
      throw new Error('At least one file must be marked as an answer file.');
    }

    // Validate all files
    files.forEach((file, index) => {
      if (!file.filename.trim()) {
        throw new Error(`File #${index + 1} must have a filename.`);
      }
    });

    if (!Array.isArray(testCases) || testCases.length < 3) {
      throw new Error('At least 3 test cases are required.');
    }

    const normalizedTestCases = testCases.map((tc, index) => {
      if (!tc || typeof tc.expectedOutput !== 'string') {
        throw new Error(`Test case #${index + 1} is invalid.`);
      }
      const input = typeof tc.input === 'string' ? tc.input : '';
      const expectedOutput = tc.expectedOutput.trim();
      if (!expectedOutput) {
        throw new Error(`Test case #${index + 1} must have expected output.`);
      }
      return {
        input,
        expected_output: expectedOutput,
        is_hidden: !!tc.isHidden,
        execution_time: tc.executionTime,
        memory_usage: tc.memoryUsage,
      };
    });

    const createdAt = new Date().toISOString();
    ensureDirExists(getQuestionsRootDir());
    const baseDir = getPracticalBaseDir();
    ensureDirExists(baseDir);

    const sectionSlug = slugify(sectionDef.label);
    const lessonSlug = slugify(lesson);
    const lessonDir = path.join(baseDir, sectionSlug, lessonSlug);
    ensureDirExists(lessonDir);

    const unique = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : crypto.randomBytes(4).toString('hex');
    const questionId = `practical-${Date.now()}-${unique}`;
    const jsonFileName = `${questionId}.json`;
    const jsonPath = path.join(lessonDir, jsonFileName);

    const imageFileNames: string[] = [];
    const imageFilePaths: string[] = [];

    try {
      // Handle multiple images (new format)
      if (images && Array.isArray(images) && images.length > 0) {
        images.forEach((img, index) => {
          if (img && img.dataUrl) {
            const { buffer, extension } = parseImageDataUrl(img.dataUrl);
            const imageFileName = `${questionId}-${index}.${extension}`;
            const imageFilePath = path.join(lessonDir, imageFileName);
            fs.writeFileSync(imageFilePath, buffer);
            imageFileNames.push(imageFileName);
            imageFilePaths.push(imageFilePath);
          }
        });
      } else if (image && image.dataUrl) {
        // Legacy single image support
        const { buffer, extension } = parseImageDataUrl(image.dataUrl);
        const imageFileName = `${questionId}.${extension}`;
        const imageFilePath = path.join(lessonDir, imageFileName);
        fs.writeFileSync(imageFilePath, buffer);
        imageFileNames.push(imageFileName);
        imageFilePaths.push(imageFilePath);
      }

      const problemData: Record<string, unknown> = {
        id: questionId,
        title: title.trim(),
        description: description.replace(/\r\n/g, '\n').trim(),
        difficulty,
        section: sectionDef.label,
        lesson,
        author: author?.trim() || undefined,
        files: files.map(f => ({
          filename: f.filename.trim(),
          content: f.content.replace(/\r\n/g, '\n'),
          is_locked: f.isLocked,
          is_answer_file: f.isAnswerFile,
          language: f.language,
        })),
        test_cases: normalizedTestCases,
        created_at: createdAt,
        updated_at: createdAt,
        is_previous_exam: isPreviousExam || undefined,
        exam_school_year: isPreviousExam && examSchoolYear?.trim() ? examSchoolYear.trim() : undefined,
        exam_semester: isPreviousExam && examSemester?.trim() ? examSemester.trim() : undefined,
      };

      // Store images - use new format for multiple, legacy for single
      if (imageFileNames.length === 1) {
        problemData.image = imageFileNames[0];
      } else if (imageFileNames.length > 1) {
        problemData.images = imageFileNames;
      } else {
        problemData.image = null;
      }

      fs.writeFileSync(jsonPath, JSON.stringify(problemData, null, 2), 'utf-8');

      // Note: We don't track practical questions in progress.theory like theoretical questions
      // They are tracked in progress.practical by ID when completed
      const progress = readProgress();
      const counts = calculateQuestionCounts(progress);
      broadcastDataRefresh({ counts, progress });

      return {
        id: questionId,
        filePath: jsonPath,
        section: sectionDef.label,
        lesson,
        counts,
      };
    } catch (error) {
      // Cleanup images on error
      imageFilePaths.forEach((imgPath) => {
        if (fs.existsSync(imgPath)) {
          try {
            fs.unlinkSync(imgPath);
          } catch {
            // Ignore cleanup errors
          }
        }
      });
      if (fs.existsSync(jsonPath)) {
        try {
          fs.unlinkSync(jsonPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  ipcMain.handle('practical:listQuestions', () => {
    const records: PracticalQuestionRecord[] = [];
    const baseDir = getPracticalBaseDir();
    if (!fs.existsSync(baseDir)) {
      return records;
    }

    for (const sectionKey of Object.keys(SECTION_DEFINITIONS)) {
      const sectionDef = SECTION_DEFINITIONS[sectionKey];
      const sectionDir = path.join(baseDir, slugify(sectionDef.label));
      if (!fs.existsSync(sectionDir)) continue;

      for (const lessonName of sectionDef.lessons) {
        const lessonDir = path.join(sectionDir, slugify(lessonName));
        if (!fs.existsSync(lessonDir)) continue;

        const files = fs
          .readdirSync(lessonDir)
          .filter((file) => file.toLowerCase().endsWith('.json'))
          .sort();

        for (const file of files) {
          const filePath = path.join(lessonDir, file);
          try {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(rawData);

            const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : path.basename(file, path.extname(file));
            const title = typeof data.title === 'string' ? data.title : 'Untitled';
            const description = typeof data.description === 'string' ? data.description : '';
            const difficulty = ['Easy', 'Medium', 'Hard'].includes(data.difficulty) ? data.difficulty : 'Medium';
            const author = typeof data.author === 'string' && data.author.trim() ? data.author.trim() : undefined;
            const createdAt = typeof data.created_at === 'string' ? data.created_at : undefined;
            const updatedAt = typeof data.updated_at === 'string' ? data.updated_at : undefined;

            const files: CodeFilePayload[] = Array.isArray(data.files)
              ? data.files.map((f: any) => ({
                  filename: typeof f.filename === 'string' ? f.filename : '',
                  content: typeof f.content === 'string' ? f.content : '',
                  isLocked: !!f.is_locked,
                  isAnswerFile: !!f.is_answer_file,
                  isHidden: !!f.is_hidden,
                  language: (f.language === 'c' || f.language === 'cpp' || f.language === 'rust') ? f.language : 'c',
                }))
              : [];

            const testCases: TestCasePayload[] = Array.isArray(data.test_cases)
              ? data.test_cases.map((tc: any) => ({
                  input: typeof tc.input === 'string' ? tc.input : '',
                  expectedOutput: typeof tc.expected_output === 'string' ? tc.expected_output : '',
                  isHidden: !!tc.is_hidden,
                  executionTime: typeof tc.execution_time === 'number' ? tc.execution_time : undefined,
                  memoryUsage: typeof tc.memory_usage === 'number' ? tc.memory_usage : undefined,
                }))
              : [];

            let imageDataUrl: string | undefined;
            let imageDataUrls: string[] | undefined;

            // Check for multiple images (new format)
            if (Array.isArray(data.images) && data.images.length > 0) {
              imageDataUrls = [];
              for (const img of data.images) {
                // Handle both string format and object format
                let imgFileName: string | undefined;
                if (typeof img === 'string' && img.trim()) {
                  imgFileName = img.trim();
                } else if (img && typeof img === 'object' && typeof img.filename === 'string' && img.filename.trim()) {
                  imgFileName = img.filename.trim();
                }
                if (imgFileName) {
                  const imagePath = path.join(lessonDir, imgFileName);
                  if (fs.existsSync(imagePath)) {
                    try {
                      const imageBuffer = fs.readFileSync(imagePath);
                      const ext = path.extname(imagePath).toLowerCase();
                      const mimeType = ext === '.png'
                        ? 'image/png'
                        : ext === '.jpg' || ext === '.jpeg'
                        ? 'image/jpeg'
                        : ext === '.gif'
                        ? 'image/gif'
                        : null;
                      if (mimeType) {
                        imageDataUrls.push(`data:${mimeType};base64,${imageBuffer.toString('base64')}`);
                      }
                    } catch {
                      // Ignore image read errors
                    }
                  }
                }
              }
              // Set first image as legacy imageDataUrl for backward compatibility
              if (imageDataUrls.length > 0) {
                imageDataUrl = imageDataUrls[0];
              }
            } else if (typeof data.image === 'string' && data.image.trim()) {
              // Legacy single image support
              const imagePath = path.join(lessonDir, data.image.trim());
              if (fs.existsSync(imagePath)) {
                try {
                  const imageBuffer = fs.readFileSync(imagePath);
                  const ext = path.extname(imagePath).toLowerCase();
                  const mimeType = ext === '.png'
                    ? 'image/png'
                    : ext === '.jpg' || ext === '.jpeg'
                    ? 'image/jpeg'
                    : ext === '.gif'
                    ? 'image/gif'
                    : null;
                  if (mimeType) {
                    imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
                    imageDataUrls = [imageDataUrl];
                  }
                } catch {
                  // Ignore image read errors
                }
              }
            }

            // Read exam info
            const isPreviousExam = data.is_previous_exam === true;
            const examSchoolYear = typeof data.exam_school_year === 'string' ? data.exam_school_year : undefined;
            const examSemester = typeof data.exam_semester === 'string' ? data.exam_semester : undefined;

            records.push({
              id,
              title,
              description,
              difficulty,
              sectionKey,
              section: sectionDef.label,
              lesson: lessonName,
              author,
              filePath,
              files,
              testCases,
              imageDataUrl,
              imageDataUrls,
              createdAt,
              updatedAt,
              isPreviousExam,
              examSchoolYear,
              examSemester,
            });
          } catch (err) {
            console.error(`Failed to parse practical question file: ${filePath}`, err);
          }
        }
      }
    }

    return records;
  });

  ipcMain.handle('practical:updateQuestion', (_event, rawPayload: UpdatePracticalQuestionPayload) => {
    const payload = rawPayload as UpdatePracticalQuestionPayload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload received.');
    }

    const baseDir = path.resolve(getPracticalBaseDir());
    const resolvedPath = path.resolve(payload.filePath);
    if (!isPathInside(baseDir, resolvedPath)) {
      throw new Error('Invalid question path.');
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error('Question file not found.');
    }

    const { title, description, difficulty, sectionKey, lesson, author, files, testCases, image, images, isPreviousExam, examSchoolYear, examSemester } = payload;

    if (!title.trim() || !description.trim()) {
      throw new Error('Title and description are required.');
    }

    if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) {
      throw new Error('Invalid difficulty level.');
    }

    const sectionDef = SECTION_DEFINITIONS[sectionKey];
    if (!sectionDef) {
      throw new Error('Invalid section selected.');
    }

    if (!sectionDef.lessons.includes(lesson)) {
      throw new Error('Selected lesson does not belong to the chosen section.');
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('At least one code file is required.');
    }

    // Validate that at least one file is marked as answer file
    const hasAnswerFile = files.some(f => f.isAnswerFile);
    if (!hasAnswerFile) {
      throw new Error('At least one file must be marked as an answer file.');
    }

    // Validate all files
    files.forEach((file, index) => {
      if (!file.filename.trim()) {
        throw new Error(`File #${index + 1} must have a filename.`);
      }
    });

    if (!Array.isArray(testCases) || testCases.length < 3) {
      throw new Error('At least 3 test cases are required.');
    }

    const normalizedTestCases = testCases.map((tc, index) => {
      if (!tc || typeof tc.expectedOutput !== 'string') {
        throw new Error(`Test case #${index + 1} is invalid.`);
      }
      const input = typeof tc.input === 'string' ? tc.input : '';
      const expectedOutput = tc.expectedOutput.trim();
      if (!expectedOutput) {
        throw new Error(`Test case #${index + 1} must have expected output.`);
      }
      return {
        input,
        expected_output: expectedOutput,
        is_hidden: !!tc.isHidden,
        execution_time: tc.executionTime,
        memory_usage: tc.memoryUsage,
      };
    });

    const rawData = fs.readFileSync(resolvedPath, 'utf-8');
    const existingData = JSON.parse(rawData);
    const oldImageName = typeof existingData.image === 'string' && existingData.image.trim() ? existingData.image.trim() : undefined;
    const oldImagesArray = Array.isArray(existingData.images) ? existingData.images : [];
    const oldImagePaths: string[] = [];
    
    // Collect all old image paths - handle both string array and object array formats
    if (oldImagesArray.length > 0) {
      for (const img of oldImagesArray) {
        let imgFileName: string | undefined;
        if (typeof img === 'string' && img.trim()) {
          // String format (new standard)
          imgFileName = img.trim();
        } else if (img && typeof img === 'object' && typeof img.filename === 'string' && img.filename.trim()) {
          // Object format (legacy from previous implementation)
          imgFileName = img.filename.trim();
        }
        if (imgFileName) {
          const imgPath = path.join(path.dirname(resolvedPath), imgFileName);
          if (fs.existsSync(imgPath)) {
            oldImagePaths.push(imgPath);
          }
        }
      }
    } else if (oldImageName) {
      const imgPath = path.join(path.dirname(resolvedPath), oldImageName);
      if (fs.existsSync(imgPath)) {
        oldImagePaths.push(imgPath);
      }
    }
    
    // Check if section or lesson changed (need to move file)
    const oldSectionKey = Object.keys(SECTION_DEFINITIONS).find(
      key => SECTION_DEFINITIONS[key].label === existingData.section
    );
    const oldLesson = existingData.lesson;
    const needsMove = oldSectionKey !== sectionKey || oldLesson !== lesson;

    const newImageFileNames: string[] = [];
    const newImageFilePaths: string[] = [];

    try {
      // Determine the target directory (might be different if moving)
      const targetDir = needsMove 
        ? path.join(baseDir, slugify(sectionDef.label), slugify(lesson)) 
        : path.dirname(resolvedPath);
      
      if (needsMove) {
        ensureDirExists(targetDir);
      }
      
      const questionId = typeof existingData.id === 'string' ? existingData.id : payload.id;
      
      // Handle multiple images (new format)
      if (images && Array.isArray(images)) {
        // Delete all old images first
        for (const oldPath of oldImagePaths) {
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // Ignore cleanup errors
            }
          }
        }
        
        // Write new images
        images.forEach((img, index) => {
          if (img && img.dataUrl) {
            const { buffer, extension } = parseImageDataUrl(img.dataUrl);
            const imageFileName = `${questionId}-${index}.${extension}`;
            const imageFilePath = path.join(targetDir, imageFileName);
            fs.writeFileSync(imageFilePath, buffer);
            newImageFileNames.push(imageFileName);
            newImageFilePaths.push(imageFilePath);
          }
        });
      } else if (image !== undefined) {
        // Delete old images
        for (const oldPath of oldImagePaths) {
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // Ignore cleanup errors
            }
          }
        }

        if (image && image.dataUrl) {
          const { buffer, extension } = parseImageDataUrl(image.dataUrl);
          const imageFileName = `${questionId}.${extension}`;
          const imageFilePath = path.join(targetDir, imageFileName);
          fs.writeFileSync(imageFilePath, buffer);
          newImageFileNames.push(imageFileName);
          newImageFilePaths.push(imageFilePath);
        }
      } else {
        // Keep existing images - copy to new location if moving
        if (needsMove && oldImagePaths.length > 0) {
          for (const oldPath of oldImagePaths) {
            const imgName = path.basename(oldPath);
            const destinationPath = path.join(targetDir, imgName);
            fs.copyFileSync(oldPath, destinationPath);
            newImageFileNames.push(imgName);
            newImageFilePaths.push(destinationPath);
          }
        } else {
          // Keep old names
          for (const oldPath of oldImagePaths) {
            newImageFileNames.push(path.basename(oldPath));
          }
        }
      }

      const updatedAt = new Date().toISOString();
      const updatedData: any = {
        ...existingData,
        title: title.trim(),
        description: description.replace(/\r\n/g, '\n').trim(),
        difficulty,
        section: sectionDef.label,
        lesson,
        author: author?.trim() || existingData.author || undefined,
        files: files.map(f => ({
          filename: f.filename.trim(),
          content: f.content.replace(/\r\n/g, '\n'),
          is_locked: f.isLocked,
          is_answer_file: f.isAnswerFile,
          is_hidden: f.isHidden,
          language: f.language,
        })),
        test_cases: normalizedTestCases,
        updated_at: updatedAt,
        is_previous_exam: isPreviousExam || undefined,
        exam_school_year: isPreviousExam && examSchoolYear?.trim() ? examSchoolYear.trim() : undefined,
        exam_semester: isPreviousExam && examSemester?.trim() ? examSemester.trim() : undefined,
      };

      // Set image fields based on what we have
      if (newImageFileNames.length === 1) {
        // Single image - use legacy format
        updatedData.image = newImageFileNames[0];
        delete updatedData.images;
      } else if (newImageFileNames.length > 1) {
        // Multiple images - store as array of strings
        updatedData.images = newImageFileNames;
        updatedData.image = newImageFileNames[0]; // Keep first as legacy
      } else {
        // No images
        updatedData.image = null;
        delete updatedData.images;
      }

      let finalPath = resolvedPath;
      
      // If section or lesson changed, move the file to new directory
      if (needsMove) {
        const sectionSlug = slugify(sectionDef.label);
        const lessonSlug = slugify(lesson);
        const newDir = path.join(baseDir, sectionSlug, lessonSlug);
        ensureDirExists(newDir);
        
        const questionIdForMove = existingData.id;
        const newPath = path.join(newDir, `${questionIdForMove}.json`);
        
        // Write to new location
        fs.writeFileSync(newPath, JSON.stringify(updatedData, null, 2), 'utf-8');
        
        // Images should already be handled above (either copied to target dir or kept)
        // Clean up old images if they weren't copied
        if (!images && image === undefined) {
          // Images were copied above, delete originals
          for (const oldPath of oldImagePaths) {
            if (fs.existsSync(oldPath) && path.dirname(oldPath) !== newDir) {
              try {
                fs.unlinkSync(oldPath);
              } catch {
                // Ignore cleanup errors
              }
            }
          }
        }
        
        // Delete old file
        fs.unlinkSync(resolvedPath);
        
        // Try to remove old directory if empty
        try {
          const oldDir = path.dirname(resolvedPath);
          const remainingFiles = fs.readdirSync(oldDir);
          if (remainingFiles.length === 0) {
            fs.rmdirSync(oldDir);
          }
        } catch {
          // Ignore errors when removing old directory
        }
        
        finalPath = newPath;
      } else {
        // Just update in place
        fs.writeFileSync(resolvedPath, JSON.stringify(updatedData, null, 2), 'utf-8');
      }

      const progress = readProgress();
      const counts = calculateQuestionCounts(progress);
      broadcastDataRefresh({ counts, progress });
      return counts;
    } catch (error) {
      // Clean up newly written images on error
      for (const imgPath of newImageFilePaths) {
        if (fs.existsSync(imgPath)) {
          try {
            fs.unlinkSync(imgPath);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
      throw error;
    }
  });

  ipcMain.handle('practical:deleteQuestion', (_event, rawPayload: DeletePracticalQuestionPayload) => {
    const payload = rawPayload as DeletePracticalQuestionPayload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload received.');
    }

    const baseDir = path.resolve(getPracticalBaseDir());
    const resolvedPath = path.resolve(payload.filePath);
    if (!isPathInside(baseDir, resolvedPath)) {
      throw new Error('Invalid question path.');
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error('Question file not found.');
    }

    const rawData = fs.readFileSync(resolvedPath, 'utf-8');
    const data = JSON.parse(rawData);
    const imageName = typeof data.image === 'string' && data.image.trim() ? data.image.trim() : undefined;
    const imagePath = imageName ? path.join(path.dirname(resolvedPath), imageName) : undefined;

    fs.unlinkSync(resolvedPath);
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch {
        // Ignore cleanup errors
      }
    }

    const progress = readProgress();
    // Remove from practical progress if exists
    const questionId = payload.id;
    if (progress.practical[questionId]) {
      delete progress.practical[questionId];
    }

    writeProgress(progress);
    const counts = calculateQuestionCounts(progress);
    broadcastDataRefresh({ counts, progress });
    return counts;
  });

  // ============ Code Execution Handler ============
  ipcMain.handle('practical:executeCode', async (_event, rawPayload: ExecuteCodePayload): Promise<ExecuteCodeResult> => {
    const payload = rawPayload as ExecuteCodePayload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload received.');
    }

    const { files, input } = payload;

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('At least one code file is required to execute.');
    }

    // Create a temporary directory for compilation
    const tempDir = path.join(app.getPath('temp'), `dsa-exec-${Date.now()}`);
    ensureDirExists(tempDir);

    try {
      // Write all code files to temp directory
      for (const file of files) {
        const filePath = path.join(tempDir, file.filename);
        fs.writeFileSync(filePath, file.content, 'utf-8');
      }

      // Determine the language (assume all files use the same language)
      const language = files[0].language;

      // Find the main file (usually main.c or main.cpp, or first file)
      const mainFile = files.find(f => f.filename.toLowerCase().includes('main')) || files[0];
      const executableName = language === 'cpp' ? 'program.exe' : 'program.exe';
      const executablePath = path.join(tempDir, executableName);

      // Compile the code
      const compiler = language === 'cpp' ? 'g++' : 'gcc';
      
      // Only compile source files (.c, .cpp), not headers (.h, .hpp)
      const sourceFiles = files
        .filter(f => !f.filename.match(/\.(h|hpp)$/i))
        .map(f => f.filename);
      
      const compileArgs = [
        ...sourceFiles,
        '-o',
        executableName,
      ];

      const compileResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const compileProcess = spawn(compiler, compileArgs, { cwd: tempDir });
        let compileError = '';

        compileProcess.stderr.on('data', (data) => {
          compileError += data.toString();
        });

        compileProcess.on('close', (code) => {
          if (code !== 0) {
            resolve({ success: false, error: compileError });
          } else {
            resolve({ success: true });
          }
        });

        compileProcess.on('error', (err) => {
          resolve({ success: false, error: `Compilation failed: ${err.message}` });
        });
      });

      if (!compileResult.success) {
        return {
          success: false,
          error: compileResult.error || 'Compilation failed',
        };
      }

      // Execute the compiled program with input
      const startTime = Date.now();
      const executeResult = await new Promise<{ success: boolean; output?: string; error?: string }>((resolve) => {
        const executeProcess = spawn(executablePath, [], { cwd: tempDir });
        let output = '';
        let errorOutput = '';

        // Provide input to the program
        if (input) {
          executeProcess.stdin.write(input);
          executeProcess.stdin.end();
        }

        executeProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        executeProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        executeProcess.on('close', (code) => {
          if (code !== 0) {
            resolve({ success: false, error: errorOutput || `Program exited with code ${code}` });
          } else {
            resolve({ success: true, output });
          }
        });

        executeProcess.on('error', (err) => {
          resolve({ success: false, error: `Execution failed: ${err.message}` });
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          executeProcess.kill();
          resolve({ success: false, error: 'Execution timeout (10 seconds)' });
        }, 10000);
      });

      const executionTime = Date.now() - startTime;

      // Clean up temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      if (!executeResult.success) {
        return {
          success: false,
          error: executeResult.error,
          executionTime,
        };
      }

      return {
        success: true,
        output: executeResult.output,
        executionTime,
      };
    } catch (error) {
      // Clean up temp directory on error
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // ============ Streaming Terminal Execution Handlers ============
  // Store active terminal sessions
  const terminalSessions = new Map<string, {
    process: ReturnType<typeof spawn>;
    tempDir: string;
    startTime?: number;
    memoryMonitor?: NodeJS.Timeout;
    peakMemoryKB?: number;
  }>();

  ipcMain.handle('terminal:start', async (_event, rawPayload: any): Promise<any> => {
    const payload = rawPayload as { files: CodeFilePayload[] };
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload received.');
    }

    const { files } = payload;

    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, error: 'At least one code file is required to execute.' };
    }

    try {
      // Determine the language first (assume all files use the same language)
      const language = files[0].language;
      
      // Prepare files for Rust backend, injecting unbuffering code (C/C++ only)
      const preparedFiles = files.map(file => {
        let content = file.content;
        
        // Inject unbuffering code into files with main function
        if ((language === 'c' || language === 'cpp') && (file.filename.toLowerCase().includes('main') || files.length === 1)) {
          console.log('[Terminal] Injecting unbuffer code into', file.filename);
          // For C/C++ files, inject setvbuf calls at the start of main
          content = content.replace(
            /int\s+main\s*\([^)]*\)\s*\{/,
            (match) => {
              const unbufferCode = language === 'c' 
                ? '\n    setvbuf(stdout, NULL, _IONBF, 0); setvbuf(stderr, NULL, _IONBF, 0); setvbuf(stdin, NULL, _IONBF, 0);'
                : '\n    std::setvbuf(stdout, NULL, _IONBF, 0); std::setvbuf(stderr, NULL, _IONBF, 0); std::setvbuf(stdin, NULL, _IONBF, 0);';
              return match + unbufferCode;
            }
          );
        }
        
        return {
          filename: file.filename,
          content: content,
        };
      });

      // Use Rust backend for compilation
      console.log('[Terminal] Compiling with Rust backend...');
      console.log('[Terminal] Files to compile:', preparedFiles.map(f => f.filename).join(', '));
      
      interface CompileResult {
        success: boolean;
        executable_path?: string;
        error?: string;
        compile_time_ms: number;
      }
      
      const compileStart = Date.now();
      const compileResult = await sendBackendCommand<CompileResult>('execute', {
        language: language === 'cpp' ? 'cpp' : language === 'rust' ? 'rust' : 'c',
        files: preparedFiles,
      }, 30000); // 30 second timeout
      
      console.log('[Terminal] Compilation took:', Date.now() - compileStart, 'ms');
      console.log('[Terminal] Compile result:', compileResult);

      if (!compileResult.success || !compileResult.executable_path) {
        return {
          success: false,
          error: compileResult.error || 'Compilation failed',
        };
      }

      const executablePath = compileResult.executable_path;
      console.log('[Terminal] Compilation successful:', executablePath);
      
      // Note: temp directory is managed by Rust backend now
      const tempDir = path.dirname(executablePath);

      // Execute the compiled program with streaming I/O
      const sessionId = crypto.randomBytes(16).toString('hex');
      
      console.log('[Terminal] Starting program:', executablePath);
      
      // Track execution time and memory
      const startTime = Date.now();
      let peakMemoryKB = 0;
      
      // Execute directly without cmd wrapper for better performance
      const executeProcess = spawn(executablePath, [], { 
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          _NO_DEBUG_HEAP: '1',
        },
      });

      console.log('[Terminal] Process spawned, PID:', executeProcess.pid);
      
      // Store the session with metrics first
      const session = { 
        process: executeProcess, 
        tempDir,
        startTime,
        memoryMonitor: undefined as NodeJS.Timeout | undefined,
        peakMemoryKB: 0,
      };
      terminalSessions.set(sessionId, session);
      
      // Monitor memory usage periodically
      const isWindows = process.platform === 'win32';
      const memoryMonitor = setInterval(() => {
        if (executeProcess.pid && session) {
          try {
            // On Windows, use tasklist to get memory
            if (isWindows) {
              const { execSync } = require('child_process');
              const output = execSync(`tasklist /FI "PID eq ${executeProcess.pid}" /FO CSV /NH`, { encoding: 'utf8' });
              const match = output.match(/"([0-9,]+) K"/);
              if (match) {
                const memKB = parseInt(match[1].replace(/,/g, ''));
                session.peakMemoryKB = Math.max(session.peakMemoryKB || 0, memKB);
              }
            }
          } catch (e) {
            // Ignore errors in memory monitoring
          }
        }
      }, 50); // Check every 50ms
      
      session.memoryMonitor = memoryMonitor;

      // Set encoding
      if (executeProcess.stdout) {
        executeProcess.stdout.setEncoding('utf8');
      }
      if (executeProcess.stderr) {
        executeProcess.stderr.setEncoding('utf8');
      }
      if (executeProcess.stdin) {
        executeProcess.stdin.setDefaultEncoding('utf8');
      }

      // Stream stdout to renderer
      executeProcess.stdout.on('data', (data) => {
        console.log('[Terminal] stdout data:', JSON.stringify(data.toString()));
        // Send to all windows
        BrowserWindow.getAllWindows().forEach(win => {
          if (!win.isDestroyed()) {
            win.webContents.send('terminal:data', {
              sessionId,
              data: data.toString(),
            });
          }
        });
      });

      // Stream stderr to renderer
      executeProcess.stderr.on('data', (data) => {
        console.log('[Terminal] stderr data:', JSON.stringify(data.toString()));
        // Send to all windows
        BrowserWindow.getAllWindows().forEach(win => {
          if (!win.isDestroyed()) {
            win.webContents.send('terminal:data', {
              sessionId,
              error: data.toString(),
            });
          }
        });
      });

      // Handle process exit
      executeProcess.on('close', (code) => {
        const currentSession = terminalSessions.get(sessionId);
        
        // Calculate execution time
        const executionTime = Date.now() - startTime;
        
        // Clear memory monitor
        if (currentSession?.memoryMonitor) {
          clearInterval(currentSession.memoryMonitor);
        }
        
        // Send to all windows
        BrowserWindow.getAllWindows().forEach(win => {
          if (!win.isDestroyed()) {
            win.webContents.send('terminal:data', {
              sessionId,
              exit: true,
              exitCode: code || 0,
              executionTime, // in milliseconds
              memoryUsage: currentSession?.peakMemoryKB || 0, // in KB
            });
          }
        });

        // Clean up session and temp directory
        terminalSessions.delete(sessionId);
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Handle process error
      executeProcess.on('error', (err) => {
        // Send to all windows
        BrowserWindow.getAllWindows().forEach(win => {
          if (!win.isDestroyed()) {
            win.webContents.send('terminal:data', {
              sessionId,
              error: `Execution error: ${err.message}`,
              exit: true,
              exitCode: 1,
            });
          }
        });

        // Clean up session and temp directory
        terminalSessions.delete(sessionId);
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Timeout after 60 seconds (increased for interactive programs)
      setTimeout(() => {
        const session = terminalSessions.get(sessionId);
        if (session) {
          session.process.kill();
          terminalSessions.delete(sessionId);
          if (mainWindow) {
            mainWindow.webContents.send('terminal:data', {
              sessionId,
              error: '\r\n\r\nExecution timeout (60 seconds)',
              exit: true,
              exitCode: 124,
            });
          }
          // Clean up temp directory
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      }, 60000);

      return {
        success: true,
        sessionId,
      };
    } catch (error) {
      // Note: Rust backend manages temp directory cleanup
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // Handle writing to terminal stdin
  ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string): Promise<void> => {
    const session = terminalSessions.get(sessionId);
    console.log('[Terminal] Write request:', { sessionId, data: JSON.stringify(data), hasSession: !!session });
    if (session && session.process.stdin && session.process.stdin.writable) {
      console.log('[Terminal] Writing to stdin:', data.length, 'bytes');
      session.process.stdin.write(data);
    } else {
      console.log('[Terminal] Cannot write - session or stdin not available');
    }
  });

  // Handle stopping terminal execution
  ipcMain.handle('terminal:stop', async (_event, sessionId: string): Promise<void> => {
    const session = terminalSessions.get(sessionId);
    if (session) {
      // Clear memory monitor
      if (session.memoryMonitor) {
        clearInterval(session.memoryMonitor);
      }
      
      session.process.kill();
      terminalSessions.delete(sessionId);
      // Clean up temp directory
      try {
        fs.rmSync(session.tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  ipcMain.on('open-practice', () => {
    // Resize window for practice mode (includes heatmap)
    if (mainWindow) {
      mainWindow.setSize(1400, 1080);
      mainWindow.webContents.send('navigate', '/practice');
    }
  });

  ipcMain.on('open-exam', () => {
    // Resize window for exam config
    if (mainWindow) {
      mainWindow.setSize(1400, 1080);
      mainWindow.webContents.send('navigate', '/exam');
    }
  });

  ipcMain.on('open-menu', () => {
    // Return to main menu - keep same size for consistency
    if (mainWindow) {
      mainWindow.setSize(1400, 1080);
      mainWindow.webContents.send('navigate', '/');
    }
  });

  ipcMain.on('open-question-maker', () => {
    // Resize window for question maker
    if (mainWindow) {
      mainWindow.setSize(1400, 1080);
      mainWindow.webContents.send('navigate', '/question-maker');
    }
  });

  // ============ Practical Problem Solver Window ============
  ipcMain.on('open-practical-problem', async (_event, questionId: string) => {
    try {
      // Load the question data - use the existing listQuestions handler logic
      const records: PracticalQuestionRecord[] = [];
      const baseDir = getPracticalBaseDir();
      
      if (fs.existsSync(baseDir)) {
        for (const sectionKey of Object.keys(SECTION_DEFINITIONS)) {
          const sectionDef = SECTION_DEFINITIONS[sectionKey];
          const sectionDir = path.join(baseDir, slugify(sectionDef.label));
          if (!fs.existsSync(sectionDir)) continue;

          for (const lessonName of sectionDef.lessons) {
            const lessonDir = path.join(sectionDir, slugify(lessonName));
            if (!fs.existsSync(lessonDir)) continue;

            const files = fs
              .readdirSync(lessonDir)
              .filter((file) => file.toLowerCase().endsWith('.json'))
              .sort();

            for (const file of files) {
              const filePath = path.join(lessonDir, file);
              try {
                const rawData = fs.readFileSync(filePath, 'utf-8');
                const data = JSON.parse(rawData);

                const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : path.basename(file, path.extname(file));
                
                if (id === questionId) {
                  // Found the question - parse it fully
                  const title = typeof data.title === 'string' ? data.title : 'Untitled';
                  const description = typeof data.description === 'string' ? data.description : '';
                  const difficulty = ['Easy', 'Medium', 'Hard'].includes(data.difficulty) ? data.difficulty : 'Medium';
                  const author = typeof data.author === 'string' && data.author.trim() ? data.author.trim() : undefined;
                  const isPreviousExam = data.is_previous_exam === true;
                  const examSchoolYear = typeof data.exam_school_year === 'string' ? data.exam_school_year : undefined;
                  const examSemester = typeof data.exam_semester === 'string' ? data.exam_semester : undefined;

                  const parsedFiles: CodeFilePayload[] = Array.isArray(data.files)
                    ? data.files.map((f: any) => ({
                        filename: typeof f.filename === 'string' ? f.filename : '',
                        content: typeof f.content === 'string' ? f.content : '',
                        isLocked: !!f.is_locked,
                        isAnswerFile: !!f.is_answer_file,
                        isHidden: !!f.is_hidden,
                        language: f.language === 'cpp' ? 'cpp' : f.language === 'rust' ? 'rust' : 'c',
                      }))
                    : [];

                  // Baseline state that mirrors a fresh session with no saved progress
                  const initialFiles: CodeFilePayload[] = parsedFiles.map((pf: CodeFilePayload) => {
                    if (pf.isAnswerFile) {
                      return { ...pf, content: '' }; // Students start with an empty answer file
                    }
                    return { ...pf };
                  });

                  const testCases: TestCasePayload[] = Array.isArray(data.test_cases)
                    ? data.test_cases.map((tc: any) => ({
                        input: typeof tc.input === 'string' ? tc.input : '',
                        expectedOutput: typeof tc.expected_output === 'string' ? tc.expected_output : '',
                        isHidden: !!tc.is_hidden,
                        executionTime: typeof tc.execution_time === 'number' ? tc.execution_time : undefined,
                        memoryUsage: typeof tc.memory_usage === 'number' ? tc.memory_usage : undefined,
                      }))
                    : [];

                  let imageDataUrl: string | null = null;
                  let imageDataUrls: string[] = [];
                  
                  // Check for multiple images (new format)
                  if (Array.isArray(data.images) && data.images.length > 0) {
                    for (const imgFileName of data.images) {
                      if (typeof imgFileName === 'string' && imgFileName.trim()) {
                        const imagePath = path.join(lessonDir, imgFileName.trim());
                        if (fs.existsSync(imagePath)) {
                          const imageBuffer = fs.readFileSync(imagePath);
                          const ext = path.extname(imagePath).toLowerCase();
                          const mimeType =
                            ext === '.png' ? 'image/png' :
                            ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                            ext === '.gif' ? 'image/gif' :
                            'image/png';
                          imageDataUrls.push(`data:${mimeType};base64,${imageBuffer.toString('base64')}`);
                        }
                      }
                    }
                    // Set first image as legacy imageDataUrl for backward compatibility
                    if (imageDataUrls.length > 0) {
                      imageDataUrl = imageDataUrls[0];
                    }
                  } else if (data.image && typeof data.image === 'string') {
                    // Legacy single image support
                    const imageName = data.image;
                    const ext = path.extname(imageName).toLowerCase();
                    const imagePath = path.join(lessonDir, imageName);
                    if (fs.existsSync(imagePath)) {
                      const imageBuffer = fs.readFileSync(imagePath);
                      const mimeType =
                        ext === '.png' ? 'image/png' :
                        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                        ext === '.gif' ? 'image/gif' :
                        'image/png';
                      imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
                      imageDataUrls = [imageDataUrl];
                    }
                  }

                  // Check if there's saved progress for this question
                  const userDataDir = app.getPath('userData');
                  const progressDir = path.join(userDataDir, 'practical-progress');
                  const savedProgressFile = path.join(progressDir, `${id}.json`);
                  
                  let filesWithProgress: CodeFilePayload[] = parsedFiles.map((pf: CodeFilePayload) => ({ ...pf }));
                  if (fs.existsSync(savedProgressFile)) {
                    try {
                      const savedFiles = JSON.parse(fs.readFileSync(savedProgressFile, 'utf-8'));
                      // Merge saved content into parsedFiles
                      filesWithProgress = parsedFiles.map((pf: CodeFilePayload) => {
                        const savedFile = savedFiles.find((sf: { filename: string; content: string }) => sf.filename === pf.filename);
                        if (savedFile && savedFile.content) {
                          return { ...pf, content: savedFile.content };
                        }
                        return pf;
                      });
                    } catch (err) {
                      console.error('Failed to load saved progress:', err);
                    }
                  } else {
                    // No saved progress - blank out answer files so students don't see the author's solution
                    filesWithProgress = parsedFiles.map((pf: CodeFilePayload) => {
                      if (pf.isAnswerFile) {
                        return { ...pf, content: '' }; // Frontend will show default placeholder
                      }
                      return pf;
                    });
                  }

                  currentPracticalQuestion = {
                    id,
                    title,
                    description,
                    difficulty,
                    sectionKey,
                    section: sectionDef.label,
                    lesson: lessonName,
                    author,
                    filePath,
                    files: filesWithProgress,
                    initialFiles,
                    testCases,
                    imageDataUrl,
                    imageDataUrls: imageDataUrls.length > 0 ? imageDataUrls : undefined,
                    isPreviousExam,
                    examSchoolYear,
                    examSemester,
                  };

                  // Create new problem solver window
                  const preloadPath = path.join(__dirname, 'preload.js');
                  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

                  const iconPath = (() => {
                    if (app.isPackaged) {
                      return path.join(process.resourcesPath, 'icons', 'icon.ico');
                    }
                    return path.join(__dirname, '..', 'static', 'icons', 'icon.ico');
                  })();

                  // Close existing problem solver window if open
                  if (problemSolverWindow && !problemSolverWindow.isDestroyed()) {
                    problemSolverWindow.close();
                  }

                  problemSolverWindow = new BrowserWindow({
                    title,
                    width: 1600,
                    height: 900,
                    icon: nativeImage.createFromPath(iconPath),
                    frame: false,
                    backgroundColor: '#000000',
                    titleBarStyle: 'hidden',
                    webPreferences: {
                      nodeIntegration: false,
                      contextIsolation: true,
                      preload: preloadPath,
                    },
                  });

                  // Load the problem solver route
                  if (isDev) {
                    problemSolverWindow.loadURL('http://localhost:5173/#/practical-problem-solver').catch((err) => {
                      console.error('Failed to load problem solver:', err);
                    });
                  } else {
                    problemSolverWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
                      hash: '/practical-problem-solver',
                    });
                  }
                  if (problemSolverWindow) {
                    wireConsoleForwarding(problemSolverWindow, 'practical');
                    enableDevtoolsForWindow(problemSolverWindow);
                  }

                  // Clean up when window is closed
                  problemSolverWindow.on('closed', () => {
                    problemSolverWindow = null;
                    currentPracticalQuestion = null;

                    try {
                      const progress = readProgress();
                      syncProgressTotals(progress);
                      writeProgress(progress);
                      const counts = calculateQuestionCounts(progress);
                      broadcastDataRefresh({ counts, progress });
                    } catch (err) {
                      console.error(
                        'Failed to refresh progress after closing practical window:',
                        err
                      );
                    }

                    if (mainWindow && !mainWindow.isDestroyed()) {
                      try {
                        mainWindow.focus();
                      } catch (focusErr) {
                        console.warn(
                          'Unable to focus main window after closing practical window:',
                          focusErr
                        );
                      }
                    }
                  });

                  return; // Found and opened
                }
              } catch (err) {
                console.error(`Failed to parse ${filePath}:`, err);
              }
            }
          }
        }
      }
      
      console.error('Question not found:', questionId);
    } catch (error) {
      console.error('Failed to open practical problem:', error);
    }
  });

  ipcMain.handle('get-current-practical-question', async () => {
    return currentPracticalQuestion;
  });

  ipcMain.handle('save-practical-progress', async (_event, payload: { questionId: string; files: { filename: string; content: string }[] }) => {
    try {
      // Save student's progress to a separate progress file
      const userDataDir = app.getPath('userData');
      const progressDir = path.join(userDataDir, 'practical-progress');
      
      if (!fs.existsSync(progressDir)) {
        fs.mkdirSync(progressDir, { recursive: true });
      }

      const progressFile = path.join(progressDir, `${payload.questionId}.json`);
      fs.writeFileSync(progressFile, JSON.stringify(payload.files, null, 2), 'utf-8');

      // Also mark the problem as "attempted" in progress.json if not already completed
      const progress = readProgress();
      const practicalEntry = ensurePracticalProgressEntry(progress, payload.questionId);
      if (!practicalEntry.completed && practicalEntry.attempts === 0) {
        practicalEntry.attempts = 1;
        practicalEntry.lastAttemptAt = new Date().toISOString();
        writeProgress(progress);
        
        // Broadcast the updated progress
        const counts = calculateQuestionCounts(progress);
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send('data:refresh', { counts, progress });
        });
      }
    } catch (error) {
      console.error('Failed to save practical progress:', error);
      throw error;
    }
  });

  ipcMain.handle('reset-practical-progress', async (_event, payload: { questionId: string }) => {
    try {
      // Delete the student's progress file
      const userDataDir = app.getPath('userData');
      const progressDir = path.join(userDataDir, 'practical-progress');
      const progressFile = path.join(progressDir, `${payload.questionId}.json`);
      
      if (fs.existsSync(progressFile)) {
        fs.unlinkSync(progressFile);
      }

      // Remove history snapshots
      const historyPath = getHistoryPath(payload.questionId);
      if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath);
      }

      // Reset the practical progress in the main progress data
      const progressPath = getProgressPath();
      if (fs.existsSync(progressPath)) {
        const progressData: ProgressData = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
        if (progressData.practical && progressData.practical[payload.questionId]) {
          delete progressData.practical[payload.questionId];
          fs.writeFileSync(progressPath, JSON.stringify(progressData, null, 2), 'utf-8');
        }
      }

      // Broadcast updated progress to all windows
      const newProgress = readProgress();
      const counts = calculateQuestionCounts(newProgress);
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('data:refresh', { counts, progress: newProgress });
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to reset practical progress:', error);
      throw error;
    }
  });

  ipcMain.handle('run-practical-code', async (_event, payload: { questionId: string; files: { filename: string; content: string; language: string }[] }) => {
    try {
      // Create a temporary directory for compilation
      const tempDir = path.join(app.getPath('temp'), `dsa-run-${Date.now()}`);
      ensureDirExists(tempDir);

      try {
        // Write all code files to temp directory
        for (const file of payload.files) {
          const filePath = path.join(tempDir, file.filename);
          fs.writeFileSync(filePath, file.content, 'utf-8');
        }

        // Determine the language
        const language = payload.files[0].language;
        const executableName = 'program.exe';
        const executablePath = path.join(tempDir, executableName);

        // Compile the code
        const compiler = language === 'cpp' ? 'g++' : language === 'rust' ? 'rustc' : 'gcc';
        const sourceFiles = payload.files
          .filter(f => !f.filename.match(/\.(h|hpp)$/i))
          .map(f => f.filename);

        const compileArgs = language === 'rust'
          ? [...sourceFiles, '-O', '-o', executableName]
          : [...sourceFiles, '-o', executableName];

        const compileResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
          const compileProcess = spawn(compiler, compileArgs, { cwd: tempDir });
          let compileError = '';

          compileProcess.stderr.on('data', (data) => {
            compileError += data.toString();
          });

          compileProcess.on('close', (code) => {
            if (code !== 0) {
              resolve({ success: false, error: compileError });
            } else {
              resolve({ success: true });
            }
          });
        });

        if (!compileResult.success) {
          return { error: `Compilation failed:\n${compileResult.error}` };
        }

        // Run the compiled program
        const runResult = await new Promise<{ output: string; error: string }>((resolve) => {
          const runProcess = spawn(executablePath, [], { cwd: tempDir });
          let output = '';
          let error = '';

          runProcess.stdout.on('data', (data) => {
            output += data.toString();
          });

          runProcess.stderr.on('data', (data) => {
            error += data.toString();
          });

          runProcess.on('close', () => {
            resolve({ output, error });
          });

          // Send empty input
          runProcess.stdin.end();
        });

        return {
          output: runResult.output || 'Code executed successfully',
          error: runResult.error,
        };
      } finally {
        // Clean up temp directory
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (err) {
          console.warn('Failed to clean up temp directory:', err);
        }
      }
    } catch (error: any) {
      return { error: error.message || 'Failed to run code' };
    }
  });

  ipcMain.handle('practical:getHistory', async (_event, payload: { questionId: string }) => {
    return loadPracticalHistory(payload.questionId);
  });

  ipcMain.handle('practical:recordSubmission', async (_event, payload: {
    questionId: string;
    files: { filename: string; content: string }[];
    testResults: any[];
    score: number;
    maxScore: number;
  }) => {
    savePracticalHistorySnapshot(payload.questionId, {
      timestamp: new Date().toISOString(),
      files: payload.files,
      testResults: payload.testResults,
      score: payload.score,
      maxScore: payload.maxScore,
      kind: 'submission',
    });
    return { success: true };
  });

  ipcMain.handle('practical:setIteration', async (_event, payload: { questionId: string; files: { filename: string; content: string }[] }) => {
    setIterationHistory(payload.questionId, payload.files);
    return { success: true };
  });

  ipcMain.handle('practical:clearIteration', async (_event, payload: { questionId: string }) => {
    clearIterationHistory(payload.questionId);
    return { success: true };
  });

  ipcMain.handle('practical:openCompareOutput', async (_event, payload: { expected: string; actual: string; label?: string }) => {
    const expected = payload.expected ?? '';
    const actual = payload.actual ?? '';
    const label = payload.label ?? 'Test Case';

    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compare Output</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #0b0b0b; color: #e5e5e5; font-family: 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; }
    h1 { font-size: 16px; margin: 0 0 12px; color: #fff; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .panel { border: 1px solid #222; border-radius: 8px; background: #121212; padding: 10px; overflow: auto; max-height: 70vh; }
    .label { font-size: 11px; color: #9ca3af; margin-bottom: 6px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.45; }
    .diff-expected { background: rgba(16, 185, 129, 0.25); color: #c3f0d2; }
    .diff-actual { background: rgba(248, 113, 113, 0.25); color: #fca5a5; }
  </style>
</head>
<body>
  <h1>${escapeHtml(label)} &mdash; Compare Output</h1>
  <div class="grid">
    <div class="panel">
      <div class="label">Expected</div>
      <pre id="expected"></pre>
    </div>
    <div class="panel">
      <div class="label">Your Output</div>
      <pre id="actual"></pre>
    </div>
  </div>
  <script>
    const data = ${JSON.stringify({ expected, actual })};
    const esc = (s) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const highlight = (a, b) => {
      const max = Math.max(a.length, b.length);
      let ha = '', hb = '';
      for (let i = 0; i < max; i++) {
        const ca = a[i];
        const cb = b[i];
        if (ca === cb) {
          if (ca !== undefined) ha += esc(ca);
          if (cb !== undefined) hb += esc(cb);
        } else {
          if (ca !== undefined) ha += '<span class="diff-expected">' + esc(ca) + '</span>';
          if (cb !== undefined) hb += '<span class="diff-actual">' + esc(cb) + '</span>';
        }
      }
      return { ha, hb };
    };

    const res = highlight(data.expected, data.actual);
    document.getElementById('expected').innerHTML = res.ha || '<span style="color:#6b7280">[empty]</span>';
    document.getElementById('actual').innerHTML = res.hb || '<span style="color:#6b7280">[empty]</span>';
  </script>
</body>
</html>`;

    const compareWin = new BrowserWindow({
      width: 900,
      height: 650,
      title: 'Compare Output',
      autoHideMenuBar: true,
      show: true,
      backgroundColor: '#0b0b0b',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    enableDevtoolsForWindow(compareWin);
    compareWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return { success: true };
  });

  ipcMain.handle('submit-practical-solution', async (_event, payload: { questionId: string; files: any[]; testCases: any[] }) => {
    try {
      const language = payload.files[0]?.language === 'cpp' ? 'cpp' : payload.files[0]?.language === 'rust' ? 'rust' : 'c';

        // Prepare files similar to terminal execution (unbuffer stdout/stderr/stdin)
        const preparedFiles = payload.files.map((file: any) => {
          let content = file.content;
          if ((language === 'c' || language === 'cpp') && (file.filename.toLowerCase().includes('main') || payload.files.length === 1)) {
            content = content.replace(
              /int\s+main\s*\([^)]*\)\s*\{/,
              (match: string) => {
                const unbufferSnippet =
                  language === 'c'
                    ? '\n    setvbuf(stdout, NULL, _IONBF, 0); setvbuf(stderr, NULL, _IONBF, 0); setvbuf(stdin, NULL, _IONBF, 0);'
                    : '\n    std::setvbuf(stdout, NULL, _IONBF, 0); std::setvbuf(stderr, NULL, _IONBF, 0); std::setvbuf(stdin, NULL, _IONBF, 0);';
                return match + unbufferSnippet;
              }
            );
          }
          return { filename: file.filename, content };
        });

      interface CompileResult {
        success: boolean;
        executable_path?: string;
        error?: string;
        compile_time_ms: number;
      }

      // Compile using the Rust backend for consistency with the terminal
      const compileResult = await sendBackendCommand<CompileResult>(
        'execute',
        { language, files: preparedFiles },
        30000
      );

      if (!compileResult.success || !compileResult.executable_path) {
        throw new Error(compileResult.error || 'Compilation failed');
      }

      const executablePath = compileResult.executable_path;
      const execDir = path.dirname(executablePath);
      const testResults: any[] = [];

      const runTestCase = (input: string) =>
        new Promise<{
          output: string;
          error: string;
          exitCode: number;
          executionTime: number;
          memoryUsage: number;
        }>((resolve) => {
          const pollMemory = (pid?: number | null) => {
            if (!pid || process.platform !== 'win32') return 0;
            try {
              const tasklist = execSync(
                `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
                { encoding: 'utf8' }
              );
              const match = tasklist.match(/"([0-9,]+) K"/);
              if (match) {
                const mem = parseInt(match[1].replace(/,/g, ''), 10);
                if (!Number.isNaN(mem)) {
                  return mem;
                }
              }
            } catch {
              // ignore
            }
            return 0;
          };

          const start = Date.now();
          let output = '';
          let error = '';
          let peakMemoryKB = 0;
          const runProcess = spawn(executablePath, [], { cwd: execDir });

          // Ignore stdin pipe errors from programs that exit before reading input
          if (runProcess.stdin) {
            runProcess.stdin.on('error', (err) => {
              console.warn('[submit] stdin error:', err?.message ?? err);
            });
          }
          let exited = false;

          // Capture an initial sample in case the process exits quickly
          peakMemoryKB = Math.max(peakMemoryKB, pollMemory(runProcess.pid));

          // Sample memory similar to the terminal view
          const memoryPoller =
            process.platform === 'win32' && runProcess.pid
              ? setInterval(() => {
                  const mem = pollMemory(runProcess.pid);
                  if (mem > 0) {
                    peakMemoryKB = Math.max(peakMemoryKB, mem);
                  }
                }, 50)
              : null;

          let settled = false;
          const finalize = (result: { output: string; error: string; exitCode: number }) => {
            if (settled) return;
            settled = true;
            exited = true;
            // One last sample right before finishing
            const finalMem = pollMemory(runProcess.pid);
            if (finalMem > 0) {
              peakMemoryKB = Math.max(peakMemoryKB, finalMem);
            }
            if (memoryPoller) {
              clearInterval(memoryPoller);
            }
            clearTimeout(timeoutHandle);
            resolve({
              ...result,
              executionTime: Date.now() - start,
              memoryUsage: peakMemoryKB,
            });
          };

          const timeoutHandle = setTimeout(() => {
            runProcess.kill();
            finalize({
              output,
              error: 'Execution timeout (10 seconds)',
              exitCode: -1,
            });
          }, 10000);

          runProcess.stdout?.on('data', (data) => {
            output += data.toString();
          });

          runProcess.stderr?.on('data', (data) => {
            error += data.toString();
          });

          runProcess.on('close', (code) => {
            finalize({ output, error, exitCode: code ?? 0 });
          });

          runProcess.on('error', (err) => {
            finalize({ output, error: err.message, exitCode: -1 });
          });

          if (input) {
            try {
              if (runProcess.stdin && !runProcess.stdin.destroyed) {
                runProcess.stdin.write(input, (err) => {
                  if (err && !exited) {
                    console.warn('[submit] stdin write failed:', err.message);
                  }
                });
              }
            } catch (e: any) {
              console.warn('[submit] stdin write exception:', e?.message ?? e);
            }
          }
          try {
            if (runProcess.stdin && !runProcess.stdin.destroyed) {
              runProcess.stdin.end();
            }
          } catch (e: any) {
            if (!exited) {
              console.warn('[submit] stdin end exception:', e?.message ?? e);
            }
          }
        });

      for (let i = 0; i < payload.testCases.length; i++) {
        const testCase = payload.testCases[i];

        try {
          const runResult = await runTestCase(testCase.input);

          // Simulate terminal echo behavior to match recorded output
          let actualOutput = runResult.output;
          const inputText = (testCase.input || '').replace(/\n$/, '');
          const crlfIndex = actualOutput.indexOf('\r\n');

          if (crlfIndex !== -1 && inputText.length > 0) {
            actualOutput =
              actualOutput.substring(0, crlfIndex) +
              inputText +
              '\n\r\n' +
              actualOutput.substring(crlfIndex + 2);
          }

          const expectedOutput = (testCase.expectedOutput || '').trim();
          const passed = actualOutput.trim() === expectedOutput;

          testResults.push({
            index: i,
            passed: passed && runResult.exitCode === 0,
            actualOutput: actualOutput.trim(),
            expectedOutput,
            executionTime: runResult.executionTime,
            memoryUsage: runResult.memoryUsage,
            error:
              runResult.exitCode === 0
                ? undefined
                : runResult.error || `Program exited with code ${runResult.exitCode}`,
          });
        } catch (error: any) {
          testResults.push({
            index: i,
            passed: false,
            error: error.message || 'Execution failed',
            executionTime: 0,
            memoryUsage: 0,
          });
        }
      }

      return { testResults };
    } catch (error: any) {
      throw new Error(`Submission failed: ${error.message}`);
    }
  });

  ipcMain.handle(
    'record-practical-activity',
    async (
      _event,
      payload: { questionId: string; passedCount: number; totalCount: number; timestamp?: string }
    ) => {
      try {
        const progress = readProgress();
        const today =
          payload.timestamp?.slice(0, 10) ?? new Date().toISOString().split('T')[0];
        const passedCount = Math.max(0, payload.passedCount ?? 0);
        const totalCount = Math.max(0, payload.totalCount ?? 0);
        const activityIncrement = passedCount > 0 ? passedCount : 1;

        progress.activity[today] = (progress.activity[today] ?? 0) + activityIncrement;

        const entry = ensurePracticalProgressEntry(progress, payload.questionId, totalCount);
        if (totalCount > 0) {
          entry.totalTests = Math.max(entry.totalTests, totalCount);
        }
        entry.attempts = (entry.attempts ?? 0) + 1;
        entry.lastAttemptAt = today;
        entry.lastScore = passedCount;
        if (passedCount > entry.bestScore) {
          entry.bestScore = passedCount;
        }
        if (entry.totalTests > 0 && entry.bestScore >= entry.totalTests) {
          entry.completed = true;
          entry.completedAt = entry.completedAt ?? today;
        }

        writeProgress(progress);
        const counts = calculateQuestionCounts(progress);
        broadcastDataRefresh({ counts, progress });
      } catch (error) {
        console.error('Failed to record practical activity:', error);
        throw error;
      }
    }
  );

  // Window controls for custom title bar
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  backendProcess?.kill();
});
