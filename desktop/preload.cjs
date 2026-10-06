const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('syukatsuDesktop', Object.freeze({
  getSession: () => ipcRenderer.invoke('desktop:getSession'),
  signIn: () => ipcRenderer.invoke('desktop:signIn'),
  cancelSignIn: () => ipcRenderer.invoke('desktop:cancelSignIn'),
  signOut: () => ipcRenderer.invoke('desktop:signOut'),
  listModels: () => ipcRenderer.invoke('desktop:listModels'),
  generate: (request) => ipcRenderer.invoke('desktop:generate', request),
  openUsage: () => ipcRenderer.invoke('desktop:openUsage'),
  getCareerProfile: () => ipcRenderer.invoke('desktop:getCareerProfile'),
  saveCareerProfile: (profile) => ipcRenderer.invoke('desktop:saveCareerProfile', profile),
}));
