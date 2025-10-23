import type { ElectronAPI } from '../src/preload';

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
