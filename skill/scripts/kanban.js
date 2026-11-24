#!/usr/bin/env node
/* 柒柒清单 · 数据操作命令行
   直接读写 data/kanban.json，应用开着时会自动热加载，不需要重启。

   用法：
     node kanban.js path
     node kanban.js list
     node kanban.js today
     node kanban.js add "文字" [--note "备注"] [--due 2026-11-30] [--prio 要紧|寻常|不急]
     node kanban.js done "关键词"
     node kanban.js undone "关键词"
     node kanban.js prio "关键词" 要紧|寻常|不急       （等价于 high|mid|none）
     node kanban.js due "关键词" 2026-12-01|none
     node kanban.js note "关键词" "备注文字"
     node kanban.js rm "关键词"
     node kanban.js clear-done
     node kanban.js export 2026-11-24                      (输出到桌面)
     node kanban.js add-bulk                               (从 stdin 按行批量添加)
*/

"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = os.homedir();
const CFG = path.join(HOME, ".workbuddy", "qiqi-list.json");
const PRIO_CN = { high: "要紧", mid: "寻常", none: "不急" };
const PRIO_ORDER = ["high", "mid", "none"];
/* 接受中文说法，省得每次都要记 high/mid/none */
const PRIO_ALIAS = {
  high: "high", 要紧: "high", 急: "high", 很急: "high", 紧急: "high",
  mid: "mid", 寻常: "mid", 一般: "mid", 一般紧: "mid",
  none: "none", 不急: "none", 不着急: "none", 普通: "none"
};
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/* ---------- 定位数据文件 ---------- */
function candidates() {
  const list = [];
  if (process.env.QIQI_DATA) list.push(process.env.QIQI_DATA);
  try {
    const c = JSON.parse(fs.readFileSync(CFG, "utf8"));
    if (c.dataFile) list.push(c.dataFile);
    if (c.installDir) list.push(path.join(c.installDir, "data", "kanban.json"));
  } catch (e) {}
  list.push(path.join(HOME, "QiqiList", "data", "kanban.json"));
  list.push("D:\\QiqiList\\data\\kanban.json");
  list.push("D:\\WorkBuddy\\apps\\柒柒清单\\data\\kanban.json");
  if (process.env.APPDATA) list.push(path.join(process.env.APPDATA, "QiqiList", "kanban.json"));
  return list;
}

function dataFile() {
  for (const p of candidates()) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function die(msg, code) {
  console.error(msg);
  process.exit(code === undefined ? 1 : code);
}

/* ---------- 读写 ---------- */
function readDB() {
  const f = dataFile();
  if (!f) die("没找到清单数据文件。请先安装柒柒清单（运行 install.js），或用 QIQI_DATA 指定 kanban.json 的路径。");
  let raw;
  try { raw = fs.readFileSync(f, "utf8"); } catch (e) { die("读取失败：" + e.message); }
  let db;
  try { db = JSON.parse(raw); } catch (e) { die("数据文件不是合法 JSON，先别动它：" + f); }
  if (!db || !Array.isArray(db.lists) || !db.lists.length || !Array.isArray(db.items)) {
    die("数据文件结构不对，先别动它：" + f);
  }
  return { db, file: f };
}

function writeDB(db, file) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

/* ---------- 小工具 ---------- */
const colOf = (db, kind) => {
  const l = db.lists[0];
  const c = (l.columns || []).find(x => x.kind === kind);
  return { list: l, col: c };
};
const isDone = (db, it) => {
  const { col } = colOf(db, "done");
  return !!col && it.colId === col.id;
};
const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const todayStr = () => {
  const t = new Date();
  const p = n => (n < 10 ? "0" + n : "" + n);
  return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
};
const dayDiff = (d) => {
  const a = new Date(todayStr() + "T00:00:00");
  const b = new Date(d + "T00:00:00");
  return Math.round((b - a) / 86400000);
};
function fmtDue(d) {
  if (!d) return "";
  const n = dayDiff(d);
  if (n === 0) return "今天";
  if (n === 1) return "明天";
  if (n === 2) return "后天";
  if (n === -1) return "昨天";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  const md = (dt.getMonth() + 1) + "/" + dt.getDate();
  const w = "周" + WEEK[dt.getDay()];
  if (n < 0) return md + " " + w + "（逾期 " + Math.abs(n) + " 天）";
  return md + " " + w;
}

/* 排序：要紧 → 寻常 → 不急，组内按 order */
function sortedOpen(db) {
  const open = db.items.filter(i => !isDone(db, i));
  open.sort((a, b) => {
    const pa = PRIO_ORDER.indexOf(a.prio || "none");
    const pb = PRIO_ORDER.indexOf(b.prio || "none");
    if (pa !== pb) return pa - pb;
    return (a.order || 0) - (b.order || 0);
  });
  return open;
}
function sortedDone(db) {
  const done = db.items.filter(i => isDone(db, i));
  done.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  return done;
}

/* ---------- 输出 ---------- */
function line(it, idx) {
  const bits = [];
  if (idx !== undefined) bits.push(String(idx + 1).padStart(2, " ") + ".");
  bits.push(it.text || "(无标题)");
  if (it.note) bits.push("— " + it.note);
  if (it.due) bits.push("[" + fmtDue(it.due) + "]");
  bits.push("#" + it.id);
  return bits.join(" ");
}

function printList(db) {
  const open = sortedOpen(db);
  const done = sortedDone(db);
  const p = (k) => open.filter(i => (i.prio || "none") === k);

  console.log("清单：" + path.dirname(dataFile()));
  console.log("待办 " + open.length + " 条 · 已完成 " + done.length + " 条");
  const flat = [];
  for (const k of PRIO_ORDER) {
    const arr = p(k);
    if (!arr.length) continue;
    console.log("");
    console.log("【" + PRIO_CN[k] + "】" + arr.length);
    arr.forEach(it => {
      flat.push(it);
      console.log("  " + line(it, flat.length - 1));
    });
  }
  if (!open.length) console.log("\n（待办是空的）");
  if (done.length) {
    console.log("");
    console.log("已完成 " + done.length + " 条");
    done.slice(0, 10).forEach(it => console.log("  ✓ " + (it.text || "") + (it.note ? " — " + it.note : "")));
    if (done.length > 10) console.log("  …还有 " + (done.length - 10) + " 条");
  }
}

function printToday(db) {
  const open = sortedOpen(db);
  const over = open.filter(i => i.due && dayDiff(i.due) < 0);
  const tod = open.filter(i => i.due && dayDiff(i.due) === 0);
  const soon = open.filter(i => i.due && dayDiff(i.due) > 0 && dayDiff(i.due) <= 7);
  const high = open.filter(i => (i.prio || "none") === "high" && !tod.includes(i) && !over.includes(i));

  console.log("今天是 " + todayStr() + " 周" + WEEK[new Date().getDay()]);
  const sec = (t, arr) => {
    if (!arr.length) return;
    console.log("\n" + t + "（" + arr.length + "）");
    arr.forEach(it => console.log("  " + line(it)));
  };
  sec("已逾期", over);
  sec("今天到期", tod);
  sec("未来 7 天", soon);
  sec("其它「要紧」", high);
  if (!over.length && !tod.length && !soon.length && !high.length) {
    console.log("\n今天没有到期或紧急的事，待办共 " + open.length + " 条。");
  }
}

/* ---------- 匹配 ---------- */
function pick(db, q, { includeDone = true } = {}) {
  if (!q) die("要指定是哪一条：给 id（#xxxx），或者一段文字。");
  const s = String(q).replace(/^#/, "").trim();
  const pool = db.items.filter(i => includeDone || !isDone(db, i));
  let hit = pool.filter(i => i.id === s);
  if (hit.length) return hit[0];
  hit = pool.filter(i => (i.text || "").trim() === s);
  if (hit.length === 1) return hit[0];
  hit = pool.filter(i => (i.text || "").includes(s) || (i.note || "").includes(s));
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) {
    console.log("「" + s + "」匹配到 " + hit.length + " 条，请说得更具体，或用 id：");
    hit.slice(0, 12).forEach(it => console.log("  " + line(it)));
    process.exit(2);
  }
  /* 再试序号 */
  const n = parseInt(s, 10);
  if (!isNaN(n) && String(n) === s) {
    const arr = sortedOpen(db);
    if (n >= 1 && n <= arr.length) return arr[n - 1];
  }
  die("没找到「" + s + "」。先跑一次 list 看看现有条目。", 3);
}

/* ---------- 命令 ---------- */
function parseFlags(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      opt[k] = v;
    } else pos.push(a);
  }
  return { pos, opt };
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const { pos, opt } = parseFlags(argv.slice(1));

if (!cmd || cmd === "help" || cmd === "--help") {
  console.log("柒柒清单 · 数据命令\n");
  console.log("  path                       输出数据文件路径");
  console.log("  list                       列出待办（按要紧/寻常/不急）与已完成");
  console.log("  today                      今天到期、逾期、未来 7 天");
  console.log("  add \"文字\" [--note 备注]    新增一条");
  console.log("        [--due 2026-11-30] [--prio 要紧|寻常|不急]");
  console.log("  add-bulk                   从标准输入按行批量新增");
  console.log("  done \"关键词\"               标为已完成");
  console.log("  undone \"关键词\"             移回待办");
  console.log("  prio \"关键词\" 要紧|寻常|不急  改优先级（也认 high/mid/none）");
  console.log("  due \"关键词\" 2026-12-01|none 改截止日");
  console.log("  note \"关键词\" \"备注\"        改备注");
  console.log("  rm \"关键词\"                 删除（不可恢复）");
  console.log("  clear-done                 清空已完成");
  console.log("  export [文件名]             导出到桌面");
  process.exit(0);
}

if (cmd === "path") {
  const f = dataFile();
  if (!f) die("没找到清单数据文件，可能还没安装。");
  console.log(f);
  process.exit(0);
}

if (cmd === "list") {
  const { db } = readDB();
  printList(db);
  process.exit(0);
}

if (cmd === "today") {
  const { db } = readDB();
  printToday(db);
  process.exit(0);
}

if (cmd === "add") {
  const text = (pos[0] || "").trim();
  if (!text) die("要写点什么：node kanban.js add \"买电池\"");
  const { db, file } = readDB();
  const { list, col } = colOf(db, "open");
  if (!col) die("数据里没有「待办」列，文件可能被改坏了。");
  const maxOrder = db.items.filter(i => i.colId === col.id).reduce((m, i) => Math.max(m, i.order || 0), 0);
  const it = {
    id: newId(), listId: list.id, colId: col.id,
    text, note: (opt.note && opt.note !== "true" ? opt.note : ""),
    due: (opt.due && opt.due !== "true" ? opt.due : null),
    prio: (opt.prio && (PRIO_ALIAS[opt.prio] || PRIO_ALIAS[String(opt.prio).toLowerCase()])) || "none",
    order: maxOrder + 1, completedAt: null
  };
  db.items.push(it);
  writeDB(db, file);
  console.log("已加入：" + line(it) + "  [" + PRIO_CN[it.prio] + "]");
  process.exit(0);
}

if (cmd === "add-bulk") {
  const input = fs.readFileSync(0, "utf8");
  const lines = input.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) die("标准输入是空的。");
  const { db, file } = readDB();
  const { list, col } = colOf(db, "open");
  let maxOrder = db.items.filter(i => i.colId === col.id).reduce((m, i) => Math.max(m, i.order || 0), 0);
  const added = [];
  for (const t of lines) {
    const it = {
      id: newId(), listId: list.id, colId: col.id, text: t, note: "",
      due: null, prio: "none", order: ++maxOrder, completedAt: null
    };
    db.items.push(it); added.push(it);
  }
  writeDB(db, file);
  console.log("已加入 " + added.length + " 条：");
  added.forEach(it => console.log("  " + it.text));
  process.exit(0);
}

if (cmd === "done" || cmd === "undone") {
  const { db, file } = readDB();
  const it = pick(db, pos[0], { includeDone: true });
  const open = colOf(db, "open").col, done = colOf(db, "done").col;
  if (!open || !done) die("数据里缺少待办/已完成列。");
  if (cmd === "done") {
    if (it.colId === done.id) { console.log("已经是已完成：" + it.text); process.exit(0); }
    const maxOrder = db.items.filter(i => i.colId === done.id).reduce((m, x) => Math.max(m, x.order || 0), 0);
    it.colId = done.id; it.completedAt = Date.now(); it.order = maxOrder + 1;
  } else {
    if (it.colId === open.id) { console.log("已经是待办：" + it.text); process.exit(0); }
    const maxOrder = db.items.filter(i => i.colId === open.id).reduce((m, x) => Math.max(m, x.order || 0), 0);
    it.colId = open.id; it.completedAt = null; it.order = maxOrder + 1;
  }
  writeDB(db, file);
  console.log((cmd === "done" ? "已完成：" : "已移回待办：") + it.text);
  process.exit(0);
}

if (cmd === "prio") {
  const raw = (pos[1] || "").trim();
  const want = PRIO_ALIAS[raw] || PRIO_ALIAS[raw.toLowerCase()];
  if (!want) die("优先级只能是要紧 / 寻常 / 不急（也认 high / mid / none）");
  const { db, file } = readDB();
  const it = pick(db, pos[0]);
  it.prio = want;
  writeDB(db, file);
  console.log("「" + it.text + "」优先级改为 " + PRIO_CN[want]);
  process.exit(0);
}

if (cmd === "due") {
  const v = (pos[1] || "").trim();
  const { db, file } = readDB();
  const it = pick(db, pos[0]);
  it.due = (v === "none" || v === "" || v === "-") ? null : v;
  writeDB(db, file);
  console.log("「" + it.text + "」截止日：" + (it.due ? it.due + "（" + fmtDue(it.due) + "）" : "无"));
  process.exit(0);
}

if (cmd === "note") {
  const v = (pos[1] || "").trim();
  const { db, file } = readDB();
  const it = pick(db, pos[0]);
  it.note = (v === "none" || v === "-") ? "" : v;
  writeDB(db, file);
  console.log("「" + it.text + "」备注：" + (it.note || "（清空）"));
  process.exit(0);
}

if (cmd === "rm") {
  const { db, file } = readDB();
  const it = pick(db, pos[0]);
  db.items = db.items.filter(x => x.id !== it.id);
  writeDB(db, file);
  console.log("已删除：" + it.text);
  process.exit(0);
}

if (cmd === "clear-done") {
  const { db, file } = readDB();
  const done = colOf(db, "done").col;
  if (!done) die("数据里没有已完成列。");
  const n = db.items.filter(i => i.colId === done.id).length;
  if (!n) { console.log("没有已完成的事项。"); process.exit(0); }
  db.items = db.items.filter(i => i.colId !== done.id);
  writeDB(db, file);
  console.log("已清空 " + n + " 条已完成。");
  process.exit(0);
}

if (cmd === "export") {
  const { db } = readDB();
  const name = pos[0] || ("柒柒清单备份-" + todayStr() + ".json");
  const target = path.isAbsolute(name) ? name : path.join(HOME, "Desktop", name);
  fs.writeFileSync(target, JSON.stringify(db, null, 2) + "\n", "utf8");
  console.log("已导出：" + target);
  process.exit(0);
}

console.error("不认识的命令：" + cmd + "（跑 node kanban.js help 看用法）");
process.exit(1);
