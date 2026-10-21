const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petMenu', {
  getState: () => ipcRenderer.invoke('pet-menu:get-state'),
  level: level => ipcRenderer.send('pet-menu:level', level),
  command: (command, key) => ipcRenderer.send('pet-menu:command', command, key),
  onState: callback => ipcRenderer.on('pet-menu:state', (_event, state) => callback(state))
});
