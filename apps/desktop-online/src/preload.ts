import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_KEY, createBridge } from './ipc';

/**
 * The renderer only ever sees `window.deepkhata` with `printReceipt` and
 * `openCashDrawer`. No `require`, no `fs`, no channel names it can guess.
 */
contextBridge.exposeInMainWorld(
  BRIDGE_KEY,
  createBridge((channel, payload) => ipcRenderer.invoke(channel, payload)),
);
