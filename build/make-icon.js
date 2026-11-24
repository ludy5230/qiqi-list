/* 生成应用图标：build/icon.ico + build/icon.png
 * 纯 Node 绘制（超采样→降采样→PNG/ICO 封装），不依赖任何图形库。
 * 用法：node build/make-icon.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const FINAL = 256;
const SS = 4;               // 超采样倍率
const S = FINAL * SS;       // 绘制画布边长

/* ---------- 颜色 ---------- */
const CREAM = [244, 235, 215];
const CREAM_EDGE = [230, 216, 186];
const BROWN = [120, 84, 34];      // 底/主色
const BROWN_2 = [150, 108, 46];
const PAPER = [253, 250, 242];
const GOLD = [232, 178, 76];

/* ---------- 画布 ---------- */
const buf = new Uint8ClampedArray(S * S * 4); // RGBA

function px(x, y, c, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const al = a === undefined ? 1 : a;
  buf[i] = buf[i] * (1 - al) + c[0] * al;
  buf[i + 1] = buf[i + 1] * (1 - al) + c[1] * al;
  buf[i + 2] = buf[i + 2] * (1 - al) + c[2] * al;
  buf[i + 3] = Math.min(255, buf[i + 3] + 255 * al);
}

function roundRect(x, y, w, h, r, fill, alpha) {
  const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
  for (let py = y0; py < y1; py++) {
    for (let pxi = x0; pxi < x1; pxi++) {
      /* 圆角距离判定 */
      const cx = Math.min(Math.max(pxi + 0.5, x + r), x + w - r);
      const cy = Math.min(Math.max(py + 0.5, y + r), y + h - r);
      const dx = pxi + 0.5 - cx, dy = py + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) {
        const c = typeof fill === "function" ? fill(pxi, py) : fill;
        px(pxi, py, c, alpha);
      }
    }
  }
}

function circle(cx, cy, r, fill, alpha) {
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) px(x, y, fill, alpha);
    }
  }
}

/* 粗折线（用于勾）：按到线段的距离填充 */
function polyline(pts, width, fill) {
  const r = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const minx = Math.floor(Math.min(ax, bx) - r), maxx = Math.ceil(Math.max(ax, bx) + r);
    const miny = Math.floor(Math.min(ay, by) - r), maxy = Math.ceil(Math.max(ay, by) + r);
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy || 1;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * vx + (y + 0.5 - ay) * vy) / len2));
        const dx = x + 0.5 - (ax + t * vx), dy = y + 0.5 - (ay + t * vy);
        if (dx * dx + dy * dy <= r * r) px(x, y, fill);
      }
    }
  }
  for (const [x, y] of pts) circle(x, y, r, fill);
}

/* ---------- 开始绘制 ---------- */
const pad = S * 0.035;
const size = S - pad * 2;
const radius = S * 0.23;

/* 圆角底板：上浅下深，模拟便签纸受光 */
roundRect(pad, pad, size, size, radius, (x, y) => {
  const t = (y - pad) / size;
  return [
    Math.round(CREAM[0] * (1 - t) + CREAM_EDGE[0] * t),
    Math.round(CREAM[1] * (1 - t) + CREAM_EDGE[1] * t),
    Math.round(CREAM[2] * (1 - t) + CREAM_EDGE[2] * t)
  ];
});

/* 三张「卡片」：前两张已完成态（暗色），第三张是待办（亮色 + 金色勾） */
const cardX = pad + size * 0.155;
const cardW = size * 0.69;
const cardH = size * 0.132;
const gap = size * 0.045;
const top0 = pad + size * 0.20;

for (let i = 0; i < 3; i++) {
  const y = top0 + i * (cardH + gap);
  if (i < 2) {
    roundRect(cardX, y, cardW, cardH, cardH * 0.30, BROWN, 1);
    /* 左侧小圆点 */
    circle(cardX + cardH * 0.52, y + cardH / 2, cardH * 0.20, GOLD, 1);
    /* 右侧文字条 */
    const bw = cardW * (i === 0 ? 0.44 : 0.34);
    roundRect(cardX + cardW * 0.22, y + cardH * 0.38, bw, cardH * 0.24, cardH * 0.12, CREAM, 0.92);
  } else {
    roundRect(cardX, y, cardW, cardH, cardH * 0.30, PAPER, 1);
    roundRect(cardX, y, cardW, cardH, cardH * 0.30, BROWN_2, 0.10);
    roundRect(cardX + 2, y + 2, cardW - 4, cardH - 4, cardH * 0.30, PAPER, 1);
    circle(cardX + cardH * 0.52, y + cardH / 2, cardH * 0.30, BROWN, 1);
    roundRect(cardX + cardW * 0.22, y + cardH * 0.38, cardW * 0.40, cardH * 0.24, cardH * 0.12, BROWN_2, 0.55);
  }
}

/* 右下角金色对勾徽标 */
const bx = pad + size * 0.72, by = pad + size * 0.735, br = size * 0.185;
circle(bx, by, br + S * 0.012, CREAM, 1);
circle(bx, by, br, GOLD, 1);
polyline([
  [bx - br * 0.42, by + br * 0.02],
  [bx - br * 0.08, by + br * 0.36],
  [bx + br * 0.46, by - br * 0.32]
], br * 0.30, [255, 252, 240]);

/* ---------- 降采样 ---------- */
const out = Buffer.alloc(FINAL * FINAL * 4);
for (let y = 0; y < FINAL; y++) {
  for (let x = 0; x < FINAL; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
        const al = buf[i + 3] / 255;
        r += buf[i] * al; g += buf[i + 1] * al; b += buf[i + 2] * al; a += al;
      }
    }
    const n = SS * SS;
    const o = (y * FINAL + x) * 4;
    const aa = a / n;
    out[o] = aa > 0 ? Math.round(r / (a || 1) * (n / n)) : 0;
    out[o + 1] = aa > 0 ? Math.round(g / (a || 1)) : 0;
    out[o + 2] = aa > 0 ? Math.round(b / (a || 1)) : 0;
    out[o + 3] = Math.round(aa * 255);
  }
}

/* ---------- PNG 编码 ---------- */
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const png = encodePNG(out, FINAL, FINAL);
const dir = __dirname;

/* ICO 容器（内嵌 256×256 PNG，Vista 起系统支持） */
const ico = Buffer.alloc(22 + png.length);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);      // type = icon
ico.writeUInt16LE(1, 4);      // 1 张
ico[6] = 0;                   // 0 = 256
ico[7] = 0;
ico[8] = 0; ico[9] = 0;
ico.writeUInt16LE(1, 10);     // planes
ico.writeUInt16LE(32, 12);    // bpp
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
png.copy(ico, 22);

fs.writeFileSync(path.join(dir, "icon.ico"), ico);
fs.writeFileSync(path.join(dir, "icon.png"), png);
console.log("icon.ico " + ico.length + " bytes, icon.png " + png.length + " bytes");
