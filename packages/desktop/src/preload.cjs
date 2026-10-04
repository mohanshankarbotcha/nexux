const { contextBridge, ipcRenderer } = require('electron');

const desktopBridge = {
  isDesktop: true,
  platform: process.platform,
  getSystemInfo: () => ipcRenderer.invoke('nexus:get-system-info'),
  openDirectoryPicker: () => ipcRenderer.invoke('nexus:open-directory'),
  openExternal: (url) => ipcRenderer.invoke('nexus:open-external', url),
  minimizeWindow: () => ipcRenderer.invoke('nexus:window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('nexus:window-maximize'),
  closeWindow: () => ipcRenderer.invoke('nexus:window-close'),
};

try {
  contextBridge.exposeInMainWorld('nexusDesktop', desktopBridge);
} catch {
  globalThis.nexusDesktop = desktopBridge;
}
