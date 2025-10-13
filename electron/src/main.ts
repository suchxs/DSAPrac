import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

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
  const preloadPath = path.join(__dirname, '../src/preload.cjs');

  mainWindow = new BrowserWindow({
    title: 'DSAPrac',
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  // Load static HTML file directly - NO VITE NEEDED!
  mainWindow.loadFile(path.join(__dirname, '../static/index.html'));
}

// Single-window navigation helpers
function loadInMainWindow(fileRelativePath: string, width?: number, height?: number) {
  if (!mainWindow) return;
  if (width && height) {
    // Resize then center for a seamless transition
    mainWindow.setSize(width, height);
    mainWindow.center();
  }
  mainWindow.loadFile(path.join(__dirname, fileRelativePath));
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

  ipcMain.on('open-practice', () => {
    // Resize existing window and load practice UI in place
    loadInMainWindow('../static/practice.html', 1440, 960);
  });

  ipcMain.on('open-exam', () => {
    // Placeholder: reuse single-window flow with a future exam page
    loadInMainWindow('../static/practice.html', 1440, 960);
  });

  ipcMain.on('open-menu', () => {
    // Return to main menu and resize to original menu size
    loadInMainWindow('../static/index.html', 1024, 768);
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
