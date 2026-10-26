import { contextBridge, ipcRenderer } from 'electron';
import type { OverlayApi } from '../shared/types';

const overlay: OverlayApi = {
  onOpen: (cb) => {
    ipcRenderer.on('overlay:open', (_e, p) => cb(p));
  },
  onHover: (cb) => {
    ipcRenderer.on('overlay:hover', (_e, i) => cb(i));
  },
  onClose: (cb) => {
    ipcRenderer.on('overlay:close', () => cb());
  },
};

contextBridge.exposeInMainWorld('overlay', overlay);
