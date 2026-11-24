const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

const PAGE = path.join(__dirname, "src", "index.html");
const APP_NAME = "柒柒清单";

/* ---------- 数据目录：跟着 exe 走，方便整体拷走 ---------- */
function resolveBaseDir() {
  /* portable 打包后 electron-builder 会给出 exe 所在目录（此时 __dirname 在临时解包目录里） */
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (!app.isPackaged) return __dirname;
  return path.dirname(process.execPath);
}

function pickDataDir() {
  const target = path.join(resolveBaseDir(), "data");
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);
    return target;
  } catch (e) {
    /* exe 放在没有写权限的位置（比如 Program Files）时退回用户目录 */
    return path.join(app.getPath("appData"), "QiqiList");
  }
}

const DATA_DIR = pickDataDir();
app.setPath("userData", DATA_DIR);

const CFG = path.join(DATA_DIR, "window.json");

function readCfg() {
  try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch (e) { return {}; }
}
function writeCfg(o) {
  try { fs.writeFileSync(CFG, JSON.stringify(o, null, 2), "utf8"); } catch (e) {}
}

const cfg = readCfg();
let win = null;
let pinned = cfg.pinned !== false; /* 默认置顶 */

function applyPin() {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(pinned, "floating");
}

function createWindow() {
  const opt = {
    width: cfg.w || 820,
    height: cfg.h || 720,
    minWidth: 460,
    minHeight: 300,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#EFE6D2",
    title: APP_NAME,
    show: false,
    alwaysOnTop: pinned,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  };
  if (typeof cfg.x === "number" && typeof cfg.y === "number") {
    opt.x = cfg.x;
    opt.y = cfg.y;
  }

  win = new BrowserWindow(opt);
  applyPin();
  win.loadFile(PAGE);
  win.once("ready-to-show", () => win.show());

  /* 自检模式：KANBAN_SMOKE=1 时打印状态后自动退出 */
  if (process.env.KANBAN_SMOKE) {
    win.webContents.once("did-finish-load", () => {
      const b = win.getBounds();
      console.log("SMOKE top=" + win.isAlwaysOnTop() + " bounds=" + b.width + "x" + b.height + "@" + b.x + "," + b.y + " data=" + DATA_DIR);
      setTimeout(() => app.quit(), 600);
    });
  }

  const saveBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const b = win.getBounds();
    cfg.w = b.width; cfg.h = b.height; cfg.x = b.x; cfg.y = b.y;
    writeCfg(cfg);
  };
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
  win.on("close", saveBounds);
  win.on("closed", () => { win = null; });

  /* 右键最小菜单，省得忘了怎么退出 */
  win.webContents.on("context-menu", () => {
    const m = Menu.buildFromTemplate([
      { label: pinned ? "取消置顶" : "置顶显示", click: togglePin },
      { type: "separator" },
      { label: "最小化", click: () => win.minimize() },
      { label: "关闭", click: () => win.close() }
    ]);
    m.popup({ window: win });
  });
}

function togglePin() {
  pinned = !pinned;
  applyPin();
  cfg.pinned = pinned;
  writeCfg(cfg);
  return pinned;
}

ipcMain.on("win:minimize", () => { if (win) win.minimize(); });
ipcMain.on("win:close", () => { if (win) win.close(); });
ipcMain.handle("win:togglePin", togglePin);
ipcMain.handle("win:getPin", () => pinned);
ipcMain.handle("app:info", () => ({
  name: APP_NAME,
  version: app.getVersion(),
  dataDir: DATA_DIR
}));

app.whenReady().then(() => {
  /* 导出备份默认落到桌面，省得找不到 */
  try {
    session.defaultSession.on("will-download", (e, item) => {
      try {
        const name = item.getFilename() || ("柒柒清单备份-" + Date.now() + ".json");
        item.setSavePath(path.join(app.getPath("desktop"), name));
      } catch (err) {}
    });
  } catch (e) {}

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { app.quit(); });

/* 单实例：重复双击只把已有窗口提到前面 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", () => {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});
