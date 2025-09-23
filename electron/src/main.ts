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
