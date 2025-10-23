import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ReturnType<typeof spawn> | null = null;

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
type TagProgress = { answered: number; total: number; lastAnsweredAt?: string };
type ProgressData = {
  version: number;
  theory: Record<string, TagProgress>;
  practical: Record<string, { completed: boolean; completedAt?: string }>;
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
  const practical = Object.keys(progress.practical).length;
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
    return parsed;
  } catch {
    return defaultProgress();
  }
}

function writeProgress(progress: ProgressData) {
  const dir = getUserDataDir();
  ensureDirExists(dir);
  fs.writeFileSync(getProgressPath(), JSON.stringify(progress, null, 2), 'utf-8');
}

function recordActivity(progress: ProgressData, dateKey?: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const key = dateKey ?? `${y}-${m}-${d}`;
  progress.activity[key] = (progress.activity[key] ?? 0) + 1;
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
    width: 1100,
    height: 900,
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
  backendProcess = spawn(exePath);
  backendProcess.stdout?.on('data', (data) => console.log(`[backend] ${String(data).trim()}`));
  backendProcess.stderr?.on('data', (data) => console.error(`[backend:err] ${String(data).trim()}`));
  backendProcess.on('error', (err) => {
    console.error('[backend] spawn error:', err);
    dialog.showErrorBox('Backend error', String(err));
  });
  backendProcess.on('close', (code) => console.log(`[backend] exited with code ${code}`));
}

app.whenReady().then(() => {
  // Remove menu bar
  Menu.setApplicationMenu(null);
  
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
    return readProgress();
  });

  ipcMain.handle('progress:updateTheory', (_evt, tag: string, answeredDelta: number) => {
    const p = readProgress();
    const tp = p.theory[tag] ?? { answered: 0, total: 0 };
    tp.answered = Math.max(0, tp.answered + (answeredDelta || 0));
    tp.lastAnsweredAt = new Date().toISOString().slice(0, 10);
    p.theory[tag] = tp;
    recordActivity(p);
    writeProgress(p);
    return p;
  });

  ipcMain.handle('progress:setPracticalDone', (_evt, problemId: string, done: boolean) => {
    const p = readProgress();
    p.practical[problemId] = {
      completed: !!done,
      completedAt: done ? new Date().toISOString().slice(0, 10) : undefined,
    };
    if (done) recordActivity(p);
    writeProgress(p);
    return p;
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
      if (oldLessonName !== payload.lesson) {
        const oldStats = progress.theory[oldLessonName] ?? { answered: 0, total: 0 };
        oldStats.total = Math.max(0, (oldStats.total ?? 0) - 1);
        progress.theory[oldLessonName] = oldStats;

        const newStats = progress.theory[payload.lesson] ?? { answered: 0, total: 0 };
        newStats.total = (newStats.total ?? 0) + 1;
        progress.theory[payload.lesson] = newStats;
      }
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
    // Return to main menu and resize to original size
    if (mainWindow) {
      mainWindow.setSize(1100, 900);
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
