const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  minimize: () => ipcRenderer.send("win:minimize"),
  close: () => ipcRenderer.send("win:close"),
  togglePin: () => ipcRenderer.invoke("win:togglePin"),
  getPin: () => ipcRenderer.invoke("win:getPin"),
  onPin: (cb) => ipcRenderer.on("win:pin", (e, v) => cb(v)),
  info: () => ipcRenderer.invoke("app:info"),

  /* 清单数据落盘：与 data/kanban.json 双向同步，外部程序改了会回调 */
  store: {
    read: () => ipcRenderer.invoke("store:read"),
    write: (text) => ipcRenderer.invoke("store:write", text),
    onChange: (cb) => ipcRenderer.on("store:changed", (e, text) => cb(text))
  }
});
