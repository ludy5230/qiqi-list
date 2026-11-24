const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  minimize: () => ipcRenderer.send("win:minimize"),
  close: () => ipcRenderer.send("win:close"),
  togglePin: () => ipcRenderer.invoke("win:togglePin"),
  getPin: () => ipcRenderer.invoke("win:getPin"),
  onPin: (cb) => ipcRenderer.on("win:pin", (e, v) => cb(v)),
  info: () => ipcRenderer.invoke("app:info")
});
