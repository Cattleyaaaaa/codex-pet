const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petLimits', {
  onReport: callback => ipcRenderer.on('pet-limits:report', (_event, report) => callback(report)),
  onPlacement: callback => ipcRenderer.on('pet-limits:placement', (_event, placement) => callback(placement)),
  refresh: () => ipcRenderer.send('pet-limits:refresh'),
  close: () => ipcRenderer.send('pet-limits:close')
});
