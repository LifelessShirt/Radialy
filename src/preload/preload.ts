import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/types';

const api: Api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  getStatus: () => ipcRenderer.invoke('app:status'),
  captureTrigger: () => ipcRenderer.invoke('trigger:capture'),
  cancelCapture: () => ipcRenderer.send('trigger:cancel'),
  detectApp: () => ipcRenderer.invoke('app:detect'),
  testSteps: (steps) => ipcRenderer.send('action:test', steps),
  pickFile: () => ipcRenderer.invoke('dialog:file'),
  openDataDir: () => ipcRenderer.send('app:open-data'),
  openGitHub: () => ipcRenderer.invoke('app:open-github'),
  onExternalChange: (cb) => {
    ipcRenderer.on('settings:external', (_e, s) => cb(s));
  },
};

contextBridge.exposeInMainWorld('api', api);
