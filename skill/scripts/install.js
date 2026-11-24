#!/usr/bin/env node
/* 柒柒清单 · 安装器
   从 GitHub Release 下载便携版 exe，放到本地目录，建桌面快捷方式，记录路径。

   用法：
     node install.js            安装（已装过就只报告路径）
     node install.js --launch   装完顺便启动
     node install.js --dir "D:\\Apps\\QiqiList"   指定安装目录
*/

"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { execFileSync, spawn } = require("child_process");

const HOME = os.homedir();
const CFG = path.join(HOME, ".workbuddy", "qiqi-list.json");
const REPO = "ludy5230/qiqi-list";
const APP_EXE = "柒柒清单.exe";

const argv = process.argv.slice(2);
const wantLaunch = argv.includes("--launch");
const dirArg = argv.indexOf("--dir") >= 0 ? argv[argv.indexOf("--dir") + 1] : null;

/* ---------- 已装在哪 ---------- */
function existingInstall() {
  const probes = [];
  try {
    const c = JSON.parse(fs.readFileSync(CFG, "utf8"));
    if (c.installDir) probes.push(c.installDir);
  } catch (e) {}
  probes.push(path.join(HOME, "QiqiList"));
  probes.push("D:\\QiqiList");
  probes.push("D:\\WorkBuddy\\apps\\柒柒清单");
  for (const d of probes) {
    if (!d) continue;
    if (fs.existsSync(path.join(d, "data", "kanban.json")) || fs.existsSync(path.join(d, APP_EXE))) {
      return d;
    }
  }
  return null;
}

/* ---------- 选安装目录：优先 D 盘 ---------- */
function pickDir() {
  if (dirArg) return path.resolve(dirArg);
  const candidates = [];
  for (const drive of ["D:", "E:", "F:"]) {
    if (fs.existsSync(drive + "\\")) { candidates.push(drive + "\\QiqiList"); break; }
  }
  candidates.push(path.join(HOME, "QiqiList"));
  for (const d of candidates) {
    try {
      fs.mkdirSync(d, { recursive: true });
      fs.accessSync(d, fs.constants.W_OK);
      return d;
    } catch (e) {}
  }
  throw new Error("找不到可写的安装目录，用 --dir 指定一个");
}

/* ---------- 网络 ---------- */
function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "qiqi-list-skill", Accept: "application/vnd.github+json" }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(getJSON(res.headers.location));
      }
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", c => (buf += c));
      res.on("end", () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error("接口返回不是 JSON：" + buf.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(new Error("连接 GitHub 超时")); });
  });
}

function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const go = (u, depth) => {
      if (depth > 6) return reject(new Error("重定向次数过多"));
      https.get(u, { headers: { "User-Agent": "qiqi-list-skill" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return go(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("下载失败，HTTP " + res.statusCode));
        }
        const total = Number(res.headers["content-length"] || 0);
        let got = 0;
        const tmp = dest + ".part";
        const out = fs.createWriteStream(tmp);
        res.on("data", (c) => {
          got += c.length;
          if (total && onProgress) onProgress(got, total);
        });
        res.pipe(out);
        out.on("finish", () => {
          out.close(() => {
            try { fs.renameSync(tmp, dest); resolve(dest); }
            catch (e) { reject(e); }
          });
        });
        out.on("error", reject);
        res.on("error", reject);
      }).on("error", reject);
    };
    go(url, 0);
  });
}

/* ---------- 快捷方式 ---------- */
function makeShortcut(exePath, workDir) {
  const ps = [
    "$ErrorActionPreference='Stop'",
    "$desktop=[Environment]::GetFolderPath('Desktop')",
    "$lnk=Join-Path $desktop '柒柒清单.lnk'",
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($lnk)",
    "$s.TargetPath='" + exePath.replace(/'/g, "''") + "'",
    "$s.WorkingDirectory='" + workDir.replace(/'/g, "''") + "'",
    "$s.IconLocation='" + exePath.replace(/'/g, "''") + ",0'",
    "$s.Description='柒柒清单'",
    "$s.Save()",
    "Write-Output $lnk"
  ].join("; ");
  const b64 = Buffer.from(ps, "utf16le").toString("base64");
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", b64], { encoding: "utf8" });
    const p = String(out).trim().split(/\r?\n/).pop();
    return p || path.join(HOME, "Desktop", "柒柒清单.lnk");
  } catch (e) {
    return null;
  }
}

function writeCfg(installDir, exePath) {
  const dataFile = path.join(installDir, "data", "kanban.json");
  const cfg = {
    installDir,
    exe: exePath,
    dataFile,
    installedAt: new Date().toISOString(),
    source: "https://github.com/" + REPO
  };
  try {
    fs.mkdirSync(path.dirname(CFG), { recursive: true });
    fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2), "utf8");
  } catch (e) {}
  return cfg;
}

/* ---------- 主流程 ---------- */
(async function main() {
  const found = existingInstall();
  if (found) {
    const exe = path.join(found, APP_EXE);
    const cfg = writeCfg(found, exe);
    console.log("已经装好了：" + found);
    console.log("程序：" + (fs.existsSync(exe) ? exe : "（exe 不在，但数据还在）"));
    console.log("数据：" + cfg.dataFile + (fs.existsSync(cfg.dataFile) ? "" : "（还没生成，第一次启动时创建）"));
    if (wantLaunch && fs.existsSync(exe)) {
      spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
      console.log("已启动。");
    } else {
      console.log("要打开的话，双击桌面上的「柒柒清单」，或者跟我说一声。");
    }
    return;
  }

  const dir = pickDir();
  console.log("安装目录：" + dir);
  console.log("正在查询最新版本…");
  const rel = await getJSON("https://api.github.com/repos/" + REPO + "/releases/latest");
  if (!rel || !Array.isArray(rel.assets) || !rel.assets.length) {
    throw new Error("没能从 GitHub 取到发行版信息" + (rel && rel.message ? "（" + rel.message + "）" : ""));
  }
  const asset = rel.assets.find(a => /\.exe$/i.test(a.name)) || rel.assets[0];
  console.log("最新版：" + (rel.tag_name || "") + " · " + asset.name + " · " + (asset.size / 1048576).toFixed(1) + " MB");
  console.log("开始下载（有 110MB 左右，可能要一两分钟）…");

  const target = path.join(dir, APP_EXE);
  let lastPct = -1;
  await download(asset.browser_download_url, target, (got, total) => {
    const pct = Math.floor((got / total) * 100);
    if (pct >= lastPct + 10) { lastPct = pct; process.stdout.write("  " + pct + "%\n"); }
  });
  const size = fs.statSync(target).size;
  if (size < 50 * 1048576) throw new Error("下载的文件只有 " + size + " 字节，不像完整的程序，请重试");
  console.log("下载完成：" + (size / 1048576).toFixed(1) + " MB");

  /* 去掉「下载来的文件」标记，省得每次启动都弹安全提示 */
  const ps = "Unblock-File -LiteralPath '" + target.replace(/'/g, "''") + "' -ErrorAction SilentlyContinue";
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(ps, "utf16le").toString("base64")], { stdio: "ignore" });
  } catch (e) {}

  const lnk = makeShortcut(target, dir);
  const cfg = writeCfg(dir, target);
  console.log("桌面快捷方式：" + (lnk || "没建成（不影响使用）"));
  console.log("数据会存在：" + cfg.dataFile);

  if (wantLaunch) {
    spawn(target, [], { detached: true, stdio: "ignore" }).unref();
    console.log("已启动。");
  } else {
    console.log("装好了。双击桌面上的「柒柒清单」就开始用。");
  }
})().catch((e) => {
  console.error("安装失败：" + e.message);
  console.error("可以手动下载：https://github.com/" + REPO + "/releases/latest");
  process.exit(1);
});
