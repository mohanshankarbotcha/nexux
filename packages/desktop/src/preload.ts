import { contextBridge, ipcRenderer } from 'electron';

export interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
  serverPort: number;
  dataDir: string;
}

export interface NexusDesktopBridge {
  isDesktop: boolean;
  platform: string;
  getSystemInfo: () => Promise<SystemInfo>;
  openDirectoryPicker: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

const desktopBridge: NexusDesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  getSystemInfo: () => ipcRenderer.invoke('nexus:get-system-info'),
  openDirectoryPicker: () => ipcRenderer.invoke('nexus:open-directory'),
  openExternal: (url: string) => ipcRenderer.invoke('nexus:open-external', url),
  minimizeWindow: () => ipcRenderer.invoke('nexus:window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('nexus:window-maximize'),
  closeWindow: () => ipcRenderer.invoke('nexus:window-close'),
};

try {
  contextBridge.exposeInMainWorld('nexusDesktop', desktopBridge);
} catch {
  // If running in test environment where contextBridge isn't active
  (globalThis as any).nexusDesktop = desktopBridge;
}
