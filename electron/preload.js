const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (filePath) => ipcRenderer.invoke('desktop:open-file', filePath),
  openUrl: (url) => ipcRenderer.invoke('desktop:open-url', url),
  moveFile: (source, dest) => ipcRenderer.invoke('desktop:move-file', source, dest),
  getLogs: () => ipcRenderer.invoke('desktop:get-logs'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('desktop:show-item-in-folder', filePath),
  selectFolder: () => ipcRenderer.invoke('desktop:select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('desktop:scan-folder', folderPath),
  getScannedFiles: () => ipcRenderer.invoke('desktop:get-scanned-files'),
  getPermissions: () => ipcRenderer.invoke('desktop:get-permissions'),
  removePermission: (folderPath) => ipcRenderer.invoke('desktop:remove-permission', folderPath),
  saveFile: (name, data, folder) => ipcRenderer.invoke('desktop:save-file', { name, data, folder }),
});
