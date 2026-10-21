const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  getContentSize: () => ipcRenderer.invoke('pet:get-content-size'),
  dragStart: (x, y, t) => ipcRenderer.send('pet:drag-start', x, y, t),
  dragMove: (x, y, t) => ipcRenderer.send('pet:drag-move', x, y, t),
  dragEnd: (x, y, t) => ipcRenderer.invoke('pet:drag-end', x, y, t),
  setMotionBusy: busy => ipcRenderer.send('pet:motion-busy', Boolean(busy)),
  notifyRunStarted: () => ipcRenderer.send('pet:run-started'),
  setHitMask: mask => ipcRenderer.send('pet:hit-mask', mask),
  setHitBusy: busy => ipcRenderer.send('pet:hit-busy', Boolean(busy)),
  menu: () => ipcRenderer.send('pet:context-menu'),
  getStatus: () => ipcRenderer.invoke('pet:get-status'),
  getExtraClips: () => ipcRenderer.invoke('pet:get-extra-clips'),
  onStatus: callback => ipcRenderer.on('pet:status', (_event, status) => callback(status)),
  onDirection: callback => ipcRenderer.on('pet:direction', (_event, direction) => callback(direction)),
  onWalking: callback => ipcRenderer.on('pet:walking', (_event, walking) => callback(walking)),
  onLanded: callback => ipcRenderer.on('pet:landed', (_event, impactSpeed) => callback(impactSpeed)),
  onAction: callback => ipcRenderer.on('pet:action', (_event, action) => callback(action)),
  onTurnUsage: callback => ipcRenderer.on('pet:turn-usage', (_event, report) => callback(report)),
  onSize: callback => ipcRenderer.on('pet:size', (_event, size) => callback(size))
});
