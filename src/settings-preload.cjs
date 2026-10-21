const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petSettings', {
  get: () => ipcRenderer.invoke('pet-settings:get'),
  save: value => ipcRenderer.invoke('pet-settings:save', value),
  test: () => ipcRenderer.send('pet-settings:test'),
  close: () => ipcRenderer.send('pet-settings:close'),
  onConfig: callback => ipcRenderer.on('pet-settings:config', (_event, config) => callback(config))
});
