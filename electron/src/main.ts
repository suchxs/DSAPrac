import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

let mainWindow: BrowserWindow | null = null;
let problemSolverWindow: BrowserWindow | null = null;
let currentPracticalQuestion: any = null;
let backendProcess: ReturnType<typeof spawn> | null = null;
type PendingBackendRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};
const pendingBackendRequests = new Map<string, PendingBackendRequest>();
let backendStdoutBuffer = '';
let backendRequestCounter = 0;

function resolveBackendPath(): string {
  const override = process.env.DSA_JUDGE_PATH;
  if (override && fs.existsSync(override)) return override;
  const devPath = path.resolve(__dirname, '../../rust-backend/target/debug/dsa-judge.exe');
  if (fs.existsSync(devPath)) return devPath;
  const relPath = path.resolve(__dirname, '../../rust-backend/target/release/dsa-judge.exe');
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

type ChoicePayload = { text: string; isCorrect: boolean };
type ImagePayload = { name: string; dataUrl: string };
type CreateTheoreticalQuestionPayload = {
  question: string;
  section: string;
  lesson: string;
  choices: ChoicePayload[];
  image?: ImagePayload | null;
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
  choices: ListedChoice[];
  correctCount: number;
  imageDataUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type UpdateTheoreticalQuestionPayload = {
  id: string;
  filePath: string;
  sectionKey: string;
  lesson: string;
  question: string;
  choices: ChoicePayload[];
  image?: ImagePayload | null;
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
  language: 'c' | 'cpp';
};

type CreatePracticalQuestionPayload = {
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  section: string;
  lesson: string;
  files: CodeFilePayload[];
  testCases: TestCasePayload[];
  image?: ImagePayload | null;
};

type PracticalQuestionRecord = {
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
};

type UpdatePracticalQuestionPayload = {
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

const THEORY_MIN_CHOICES = 6;
const THEORY_MAX_CHOICES = 10;

function getUserDataDir(): string {
  const override = process.env.DSA_USER_DATA_DIR;
  if (override && fs.existsSync(override)) return override;
  return app.getPath('userData');
}

function getProgressPath(): string {
  return path.join(getUserDataDir(), 'progress.json');
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

function parseImageDataUrl(dataUrl: string): { buffer: Buffer; extension: string } {
  const match = /^data:(image\/(png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
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
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
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

  // macOS dock icon (BrowserWindow.icon is ignored on macOS for dock)
  if (process.platform === 'darwin' && fs.existsSync(iconPath)) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(iconPath));
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

  // F12 to toggle DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (mainWindow && mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else if (mainWindow) {
        mainWindow.webContents.openDevTools();
      }
      event.preventDefault();
    }
  });
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

    const { question, section, lesson, choices, image } = payload;

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

    if (!Array.isArray(choices)) {
      throw new Error('Choices payload is invalid.');
    }

    if (choices.length < THEORY_MIN_CHOICES || choices.length > THEORY_MAX_CHOICES) {
      throw new Error(
        `Choices must be between ${THEORY_MIN_CHOICES} and ${THEORY_MAX_CHOICES}.`
      );
    }

    const normalizedChoices = choices.map((choice, index) => {
      if (!choice || typeof choice.text !== 'string') {
        throw new Error(`Choice #${index + 1} is invalid.`);
      }
      const text = choice.text.trim();
      if (!text) {
        throw new Error(`Choice #${index + 1} must have text.`);
      }
      return { text, isCorrect: !!choice.isCorrect };
    });

    const correctCount = normalizedChoices.filter((choice) => choice.isCorrect).length;
    if (correctCount === 0) {
      throw new Error('At least one correct answer is required.');
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

    let imageFileName: string | undefined;
    let imageFilePath: string | undefined;

    try {
      if (image && image.dataUrl) {
        const { buffer, extension } = parseImageDataUrl(image.dataUrl);
        imageFileName = `${questionId}.${extension}`;
        imageFilePath = path.join(lessonDir, imageFileName);
        fs.writeFileSync(imageFilePath, buffer);
      }

      const frontmatterLines: string[] = [
        '---',
        `id: ${questionId}`,
        `section: "${sectionDef.label}"`,
        `lesson: "${lesson}"`,
        `created_at: "${createdAt}"`,
        `updated_at: "${createdAt}"`,
        `choice_count: ${normalizedChoices.length}`,
        `correct_count: ${correctCount}`,
      ];

      if (imageFileName) {
        frontmatterLines.push(`image: "${imageFileName}"`);
      }

      frontmatterLines.push('choices:');
      normalizedChoices.forEach((choice) => {
        frontmatterLines.push(`  - text: ${JSON.stringify(choice.text)}`);
        frontmatterLines.push(`    correct: ${choice.isCorrect ? 'true' : 'false'}`);
      });
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
      if (imageFilePath && fs.existsSync(imageFilePath)) {
        try {
          fs.unlinkSync(imageFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
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
            const correctCount =
              typeof meta.correct_count === 'number'
                ? (meta.correct_count as number)
                : choices.filter((choice) => choice.isCorrect).length;

            let imageDataUrl: string | undefined;
            if (typeof meta.image === 'string' && meta.image.trim()) {
              const imageFileName = (meta.image as string).trim();
              const imagePath = path.join(lessonDir, imageFileName);
              if (fs.existsSync(imagePath)) {
                const ext = path.extname(imageFileName).toLowerCase();
                const mime =
                  ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg'
                    ? 'image/jpeg'
                    : null;
                if (mime) {
                  const base64 = fs.readFileSync(imagePath, { encoding: 'base64' });
                  imageDataUrl = `data:${mime};base64,${base64}`;
                }
              }
            }

            records.push({
              id,
              sectionKey,
              section: sectionDef.label,
              lesson: lessonName,
              filePath,
              question: body,
              choices,
              correctCount,
              imageDataUrl,
              createdAt,
              updatedAt,
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

    if (payload.choices.length < THEORY_MIN_CHOICES || payload.choices.length > THEORY_MAX_CHOICES) {
      throw new Error(
        `Choices must be between ${THEORY_MIN_CHOICES} and ${THEORY_MAX_CHOICES}.`
      );
    }

    const normalizedChoices = payload.choices.map((choice, index) => {
      if (!choice || typeof choice.text !== 'string') {
        throw new Error(`Choice #${index + 1} is invalid.`);
      }
      const text = choice.text.trim();
      if (!text) {
        throw new Error(`Choice #${index + 1} must have text.`);
      }
      return { text, isCorrect: !!choice.isCorrect };
    });

    const correctCount = normalizedChoices.filter((choice) => choice.isCorrect).length;
    if (correctCount === 0) {
      throw new Error('At least one correct answer is required.');
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
    const oldImagePath = oldImageName ? path.join(path.dirname(resolvedPath), oldImageName) : undefined;

    const destDir = path.join(baseDir, slugify(sectionDef.label), slugify(payload.lesson));
    ensureDirExists(destDir);
    const fileName = path.basename(resolvedPath);
    const destPath = path.join(destDir, fileName);

    const nowIso = new Date().toISOString();
    let newImageFileName = oldImageName;
    let newImageFullPath = oldImagePath;
    let wroteNewImage = false;
    let copiedOldImage = false;

    try {
      if (payload.image === undefined) {
        if (oldImagePath && path.dirname(oldImagePath) !== destDir) {
          const destinationImagePath = path.join(destDir, oldImageName!);
          fs.copyFileSync(oldImagePath, destinationImagePath);
          newImageFileName = oldImageName;
          newImageFullPath = destinationImagePath;
          copiedOldImage = true;
        }
      } else if (payload.image === null) {
        newImageFileName = undefined;
        newImageFullPath = undefined;
      } else {
        const { buffer, extension } = parseImageDataUrl(payload.image.dataUrl);
        newImageFileName = `${payload.id}.${extension}`;
        newImageFullPath = path.join(destDir, newImageFileName);
        fs.writeFileSync(newImageFullPath, buffer);
        wroteNewImage = true;
      }

      const frontmatterLines: string[] = [
        '---',
        `id: ${payload.id}`,
        `section: "${sectionDef.label}"`,
        `lesson: "${payload.lesson}"`,
        `created_at: "${originalCreatedAt}"`,
        `updated_at: "${nowIso}"`,
        `choice_count: ${normalizedChoices.length}`,
        `correct_count: ${correctCount}`,
      ];

      if (newImageFileName) {
        frontmatterLines.push(`image: "${newImageFileName}"`);
      }

      frontmatterLines.push('choices:');
      normalizedChoices.forEach((choice) => {
        frontmatterLines.push(`  - text: ${JSON.stringify(choice.text)}`);
        frontmatterLines.push(`    correct: ${choice.isCorrect ? 'true' : 'false'}`);
      });
      frontmatterLines.push('---', '', sanitizedQuestion, '');

      fs.writeFileSync(destPath, frontmatterLines.join('\n'), 'utf-8');

      if (destPath !== resolvedPath) {
        fs.unlinkSync(resolvedPath);
      }

      if (payload.image === null) {
        if (oldImagePath && fs.existsSync(oldImagePath)) {
          try {
            fs.unlinkSync(oldImagePath);
          } catch {
            // ignore cleanup errors
          }
        }
      } else if (payload.image && oldImagePath && fs.existsSync(oldImagePath)) {
        if (!newImageFullPath || oldImagePath !== newImageFullPath) {
          try {
            fs.unlinkSync(oldImagePath);
          } catch {
            // ignore cleanup errors
          }
        }
      } else if (
        payload.image === undefined &&
        copiedOldImage &&
        oldImagePath &&
        fs.existsSync(oldImagePath) &&
        path.dirname(oldImagePath) !== destDir
      ) {
        try {
          fs.unlinkSync(oldImagePath);
        } catch {
          // ignore cleanup errors
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
      if (wroteNewImage && newImageFullPath && fs.existsSync(newImageFullPath)) {
        try {
          fs.unlinkSync(newImageFullPath);
        } catch {
          // ignore cleanup errors
        }
      }
      if (
        copiedOldImage &&
        newImageFullPath &&
        fs.existsSync(newImageFullPath) &&
        oldImagePath &&
        newImageFullPath !== oldImagePath
      ) {
        try {
          fs.unlinkSync(newImageFullPath);
        } catch {
          // ignore cleanup errors
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

    const { title, description, difficulty, section, lesson, files, testCases, image } = payload;

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
      if (!tc || typeof tc.input !== 'string' || typeof tc.expectedOutput !== 'string') {
        throw new Error(`Test case #${index + 1} is invalid.`);
      }
      const input = tc.input.trim();
      const expectedOutput = tc.expectedOutput.trim();
      if (!input || !expectedOutput) {
        throw new Error(`Test case #${index + 1} must have both input and expected output.`);
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

    let imageFileName: string | undefined;
    let imageFilePath: string | undefined;

    try {
      if (image && image.dataUrl) {
        const { buffer, extension } = parseImageDataUrl(image.dataUrl);
        imageFileName = `${questionId}.${extension}`;
        imageFilePath = path.join(lessonDir, imageFileName);
        fs.writeFileSync(imageFilePath, buffer);
      }

      const problemData = {
        id: questionId,
        title: title.trim(),
        description: description.replace(/\r\n/g, '\n').trim(),
        difficulty,
        section: sectionDef.label,
        lesson,
        files: files.map(f => ({
          filename: f.filename.trim(),
          content: f.content.replace(/\r\n/g, '\n'),
          is_locked: f.isLocked,
          is_answer_file: f.isAnswerFile,
          language: f.language,
        })),
        test_cases: normalizedTestCases,
        image: imageFileName || null,
        created_at: createdAt,
        updated_at: createdAt,
      };

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
      if (imageFilePath && fs.existsSync(imageFilePath)) {
        try {
          fs.unlinkSync(imageFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
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
            const createdAt = typeof data.created_at === 'string' ? data.created_at : undefined;
            const updatedAt = typeof data.updated_at === 'string' ? data.updated_at : undefined;

            const files: CodeFilePayload[] = Array.isArray(data.files)
              ? data.files.map((f: any) => ({
                  filename: typeof f.filename === 'string' ? f.filename : '',
                  content: typeof f.content === 'string' ? f.content : '',
                  isLocked: !!f.is_locked,
                  isAnswerFile: !!f.is_answer_file,
                  isHidden: !!f.is_hidden,
                  language: (f.language === 'c' || f.language === 'cpp') ? f.language : 'c',
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
            if (typeof data.image === 'string' && data.image.trim()) {
              const imagePath = path.join(lessonDir, data.image.trim());
              if (fs.existsSync(imagePath)) {
                try {
                  const imageBuffer = fs.readFileSync(imagePath);
                  const ext = path.extname(imagePath).toLowerCase();
                  const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
                  if (mimeType) {
                    imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
                  }
                } catch {
                  // Ignore image read errors
                }
              }
            }

            records.push({
              id,
              title,
              description,
              difficulty,
              sectionKey,
              section: sectionDef.label,
              lesson: lessonName,
              filePath,
              files,
              testCases,
              imageDataUrl,
              createdAt,
              updatedAt,
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

    const { title, description, difficulty, sectionKey, lesson, files, testCases, image } = payload;

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
      if (!tc || typeof tc.input !== 'string' || typeof tc.expectedOutput !== 'string') {
        throw new Error(`Test case #${index + 1} is invalid.`);
      }
      const input = tc.input.trim();
      const expectedOutput = tc.expectedOutput.trim();
      if (!input || !expectedOutput) {
        throw new Error(`Test case #${index + 1} must have both input and expected output.`);
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
    const oldImagePath = oldImageName ? path.join(path.dirname(resolvedPath), oldImageName) : undefined;
    
    // Check if section or lesson changed (need to move file)
    const oldSectionKey = Object.keys(SECTION_DEFINITIONS).find(
      key => SECTION_DEFINITIONS[key].label === existingData.section
    );
    const oldLesson = existingData.lesson;
    const needsMove = oldSectionKey !== sectionKey || oldLesson !== lesson;

    let newImageFileName: string | undefined;
    let newImageFilePath: string | undefined;

    try {
      // Determine the target directory (might be different if moving)
      const targetDir = needsMove 
        ? path.join(baseDir, slugify(sectionDef.label), slugify(lesson)) 
        : path.dirname(resolvedPath);
      
      if (needsMove) {
        ensureDirExists(targetDir);
      }
      
      if (image !== undefined) {
        if (oldImagePath && fs.existsSync(oldImagePath)) {
          try {
            fs.unlinkSync(oldImagePath);
          } catch {
            // Ignore cleanup errors
          }
        }

        if (image && image.dataUrl) {
          const { buffer, extension } = parseImageDataUrl(image.dataUrl);
          const questionId = typeof existingData.id === 'string' ? existingData.id : payload.id;
          newImageFileName = `${questionId}.${extension}`;
          newImageFilePath = path.join(targetDir, newImageFileName);
          fs.writeFileSync(newImageFilePath, buffer);
        }
      } else {
        newImageFileName = oldImageName;
      }

      const updatedAt = new Date().toISOString();
      const updatedData = {
        ...existingData,
        title: title.trim(),
        description: description.replace(/\r\n/g, '\n').trim(),
        difficulty,
        section: sectionDef.label,
        lesson,
        files: files.map(f => ({
          filename: f.filename.trim(),
          content: f.content.replace(/\r\n/g, '\n'),
          is_locked: f.isLocked,
          is_answer_file: f.isAnswerFile,
          is_hidden: f.isHidden,
          language: f.language,
        })),
        test_cases: normalizedTestCases,
        image: newImageFileName || null,
        updated_at: updatedAt,
      };

      let finalPath = resolvedPath;
      
      // If section or lesson changed, move the file to new directory
      if (needsMove) {
        const sectionSlug = slugify(sectionDef.label);
        const lessonSlug = slugify(lesson);
        const newDir = path.join(baseDir, sectionSlug, lessonSlug);
        ensureDirExists(newDir);
        
        const questionId = existingData.id;
        const newPath = path.join(newDir, `${questionId}.json`);
        
        // Write to new location
        fs.writeFileSync(newPath, JSON.stringify(updatedData, null, 2), 'utf-8');
        
        // Move old image if it exists and we didn't upload a new one
        if (!image && oldImagePath && fs.existsSync(oldImagePath)) {
          const newImagePath = path.join(newDir, oldImageName!);
          fs.copyFileSync(oldImagePath, newImagePath);
          fs.unlinkSync(oldImagePath);
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
      if (newImageFilePath && fs.existsSync(newImageFilePath)) {
        try {
          fs.unlinkSync(newImageFilePath);
        } catch {
          // Ignore cleanup errors
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
      
      // Prepare files for Rust backend, injecting unbuffering code
      const preparedFiles = files.map(file => {
        let content = file.content;
        
        // Inject unbuffering code into files with main function
        if (file.filename.toLowerCase().includes('main') || files.length === 1) {
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
        language: language === 'cpp' ? 'cpp' : 'c',
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

                  const parsedFiles: CodeFilePayload[] = Array.isArray(data.files)
                    ? data.files.map((f: any) => ({
                        filename: typeof f.filename === 'string' ? f.filename : '',
                        content: typeof f.content === 'string' ? f.content : '',
                        isLocked: !!f.is_locked,
                        isAnswerFile: !!f.is_answer_file,
                        isHidden: !!f.is_hidden,
                        language: f.language === 'cpp' ? 'cpp' : 'c',
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

                  let imageDataUrl: string | null = null;
                  if (data.image && typeof data.image === 'string') {
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
                    }
                  }

                  currentPracticalQuestion = {
                    id,
                    title,
                    description,
                    difficulty,
                    sectionKey,
                    section: sectionDef.label,
                    lesson: lessonName,
                    filePath,
                    files: parsedFiles,
                    testCases,
                    imageDataUrl,
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

                  // F12 to toggle DevTools
                  problemSolverWindow.webContents.on('before-input-event', (event, input) => {
                    if (input.key === 'F12') {
                      if (problemSolverWindow && problemSolverWindow.webContents.isDevToolsOpened()) {
                        problemSolverWindow.webContents.closeDevTools();
                      } else if (problemSolverWindow) {
                        problemSolverWindow.webContents.openDevTools();
                      }
                      event.preventDefault();
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
    } catch (error) {
      console.error('Failed to save practical progress:', error);
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
        const compiler = language === 'cpp' ? 'g++' : 'gcc';
        const sourceFiles = payload.files
          .filter(f => !f.filename.match(/\.(h|hpp)$/i))
          .map(f => f.filename);

        const compileArgs = [...sourceFiles, '-o', executableName];

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

  ipcMain.handle('submit-practical-solution', async (_event, payload: { questionId: string; files: any[]; testCases: any[] }) => {
    try {
      const testResults: any[] = [];
      const tempDir = path.join(app.getPath('temp'), `dsa-submit-${Date.now()}`);
      ensureDirExists(tempDir);

      try {
        // Write all code files to temp directory
        for (const file of payload.files) {
          const filePath = path.join(tempDir, file.filename);
          fs.writeFileSync(filePath, file.content, 'utf-8');
        }

        // Compile once
        const language = payload.files[0].language;
        const executableName = 'program.exe';
        const compiler = language === 'cpp' ? 'g++' : 'gcc';
        const sourceFiles = payload.files
          .filter((f: any) => !f.filename.match(/\.(h|hpp)$/i))
          .map((f: any) => f.filename);

        const compileArgs = [...sourceFiles, '-o', executableName];

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
          throw new Error(`Compilation failed:\n${compileResult.error}`);
        }

        // Run each test case - use same approach as Rust backend judge
        const executablePath = path.join(tempDir, executableName);
        
        for (let i = 0; i < payload.testCases.length; i++) {
          const testCase = payload.testCases[i];
          
          try {
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

              // Send test case input to stdin
              runProcess.stdin.write(testCase.input);
              runProcess.stdin.end();
            });

            // Simulate terminal echo behavior to match recorded output
            let actualOutput = runResult.output;
            const inputText = testCase.input.replace(/\n$/, ''); // Remove trailing \n from input
            
            // Find where to insert the input - look for \r\n sequence (Windows line ending)
            const crlfIndex = actualOutput.indexOf('\r\n');
            
            if (crlfIndex !== -1 && inputText.length > 0) {
              // Insert the input + "\n\r\n" before the program's \r\n
              // Original: "Enter a string: \r\n\nYou entered: tenten\n"
              // Insert "tenten\n\r\n" before the first \r\n
              // Result: "Enter a string: tenten\n\r\n\nYou entered: tenten\n"
              actualOutput = 
                actualOutput.substring(0, crlfIndex) + 
                inputText + '\n\r\n' + 
                actualOutput.substring(crlfIndex + 2); // Skip the original \r\n
            }
            
            const expectedOutput = testCase.expectedOutput.trim();
            const passed = actualOutput.trim() === expectedOutput;

            testResults.push({
              index: i,
              passed,
              actualOutput: actualOutput.trim(),
              expectedOutput,
            });
          } catch (error: any) {
            testResults.push({
              index: i,
              passed: false,
              error: error.message || 'Execution failed',
            });
          }
        }

        return { testResults };
      } finally {
        // Clean up temp directory
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (err) {
          console.warn('Failed to clean up temp directory:', err);
        }
      }
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
