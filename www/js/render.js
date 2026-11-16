// Flash Attack — canvas renderer: chunky cartoon world, fog of war, HUD
import { TILE, MAP, WEAPONS, RULES } from './config.js';
import { MW, MH, tileAt, raycast, los, SITES, rand } from './game.js';

const INK = '#1a1333';
export const TEAM = [
  { main: '#3aa8ff', dark: '#1f6fd1', light: '#9fdcff', shot: '#c9f1ff', name: 'BLUE' },
  { main: '#ff4d6a', dark: '#c4264a', light: '#ffa3b1', shot: '#ffd0c2', name: 'RED' },
];
const FONT = '"Titan One","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
const WALL_H = 18;

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function seeded(s) { return () => (s = (s * 16807 + 11) % 2147483647) / 2147483647; }

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.c = canvas.getContext('2d');
    this.fog = document.createElement('canvas'); this.fc = this.fog.getContext('2d');
    this.fx = []; this.decals = []; this.shake = 0; this.cam = { x: MW * TILE / 2, y: MH * TILE / 2 };
    this.vis = new Map(); this.banner = null; this.hurtT = 0; this.whiteT = 0; this.t = 0;
    this.buildMap(); this.buildMini();
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.W = window.innerWidth; this.H = window.innerHeight;
    for (const cv of [this.cv, this.fog]) { cv.width = Math.round(this.W * dpr); cv.height = Math.round(this.H * dpr); }
    this.scale = Math.min(this.H / 760, this.W / 1050);
    this.u = Math.max(.7, Math.min(this.W / 820, this.H / 400, 1.7));
  }

  // ---------- static map art ----------
  buildMap() {
    const w = MW * TILE, h = MH * TILE;
    const fl = this.floor = document.createElement('canvas'); fl.width = w; fl.height = h;
    const wl = this.walls = document.createElement('canvas'); wl.width = w; wl.height = h + WALL_H;
    const c = fl.getContext('2d'), rnd = seeded(7);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = MAP[y][x], px = x * TILE, py = y * TILE;
      c.fillStyle = (x + y) % 2 ? '#f6d993' : '#f1cf82'; c.fillRect(px, py, TILE, TILE);
      if (t === 'T' || t === 'D') { c.fillStyle = t === 'T' ? 'rgba(255,140,60,.16)' : 'rgba(60,200,190,.18)'; c.fillRect(px, py, TILE, TILE); }
      if (t === '.' && rnd() < .16) {
        c.fillStyle = 'rgba(160,110,40,.22)';
        for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(px + 8 + rnd() * 48, py + 8 + rnd() * 48, 2 + rnd() * 3, 0, 7); c.fill(); }
      }
    }
    // sites
    for (const s of Object.values(SITES)) {
      const x = s.x0 * TILE, y = s.y0 * TILE, sw = (s.x1 - s.x0 + 1) * TILE, sh = (s.y1 - s.y0 + 1) * TILE;
      c.save(); rr(c, x + 6, y + 6, sw - 12, sh - 12, 22); c.clip();
      c.fillStyle = '#ffb347'; c.fillRect(x, y, sw, sh);
      c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 16;
      for (let i = -sh; i < sw; i += 46) { c.beginPath(); c.moveTo(x + i, y + sh); c.lineTo(x + i + sh, y); c.stroke(); }
      c.restore();
      rr(c, x + 6, y + 6, sw - 12, sh - 12, 22); c.lineWidth = 6; c.strokeStyle = INK; c.stroke();
      c.font = `150px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 14; c.strokeStyle = INK; c.lineJoin = 'round'; c.strokeText(s.id, s.cx, s.cy + 8);
      c.fillStyle = '#fff6dc'; c.fillText(s.id, s.cx, s.cy + 8);
    }
    // water
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (MAP[y][x] !== 'w') continue;
      const px = x * TILE, py = y * TILE, n = (dx, dy) => tileAt(x + dx, y + dy) === 'w';
      c.fillStyle = '#38c6f4'; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = 'rgba(255,255,255,.5)'; rr(c, px + 12 + rnd() * 20, py + 14 + rnd() * 30, 18, 5, 2.5); c.fill();
      c.strokeStyle = INK; c.lineWidth = 5; c.beginPath();
      if (!n(0, -1)) { c.moveTo(px, py); c.lineTo(px + TILE, py); } if (!n(0, 1)) { c.moveTo(px, py + TILE); c.lineTo(px + TILE, py + TILE); }
      if (!n(-1, 0)) { c.moveTo(px, py); c.lineTo(px, py + TILE); } if (!n(1, 0)) { c.moveTo(px + TILE, py); c.lineTo(px + TILE, py + TILE); }
      c.stroke();
    }
    // cast shadows
    c.fillStyle = 'rgba(60,30,90,.22)';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const t = MAP[y][x]; if (t === '#' || t === 'c') c.fillRect(x * TILE + 12, y * TILE + 14, TILE, TILE); }

    // walls + crates (drawn above characters for a little depth)
    const k = wl.getContext('2d'); k.translate(0, WALL_H); k.lineJoin = 'round'; k.lineCap = 'round';
    const isW = (x, y) => tileAt(x, y) === '#';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = MAP[y][x], px = x * TILE, py = y * TILE;
      if (t === '#') {
        if (!isW(x, y + 1)) { k.fillStyle = '#4a32b8'; k.fillRect(px, py + TILE - WALL_H, TILE, WALL_H); }
        k.fillStyle = '#7257f5'; k.fillRect(px, py - WALL_H, TILE, TILE);
        k.fillStyle = '#8f78ff';
        if (!isW(x, y - 1)) k.fillRect(px, py - WALL_H, TILE, 7);
        if (rnd() < .3) { k.fillStyle = 'rgba(255,255,255,.1)'; rr(k, px + 10 + rnd() * 20, py - WALL_H + 14 + rnd() * 20, 22, 10, 5); k.fill(); }
        k.strokeStyle = INK; k.lineWidth = 5; k.beginPath();
        const T0 = py - WALL_H, B = py + TILE;
        if (!isW(x, y - 1)) { k.moveTo(px, T0); k.lineTo(px + TILE, T0); }
        if (!isW(x, y + 1)) { k.moveTo(px, B - WALL_H); k.lineTo(px + TILE, B - WALL_H); k.moveTo(px, B); k.lineTo(px + TILE, B); }
        if (!isW(x - 1, y)) { k.moveTo(px, T0); k.lineTo(px, isW(x, y + 1) ? B - WALL_H : B); }
        if (!isW(x + 1, y)) { k.moveTo(px + TILE, T0); k.lineTo(px + TILE, isW(x, y + 1) ? B - WALL_H : B); }
        k.stroke();
      } else if (t === 'c') {
        const i = 4, s = TILE - i * 2, ch = 14;
        k.fillStyle = '#a8612a'; rr(k, px + i, py + i, s, s, 8); k.fill();
        k.fillStyle = '#f0a44b'; rr(k, px + i, py + i - ch, s, s, 8); k.fill();
        k.strokeStyle = '#c47a2e'; k.lineWidth = 6; k.beginPath();
        k.moveTo(px + i + 10, py + i - ch + 10); k.lineTo(px + i + s - 10, py + i - ch + s - 10); k.moveTo(px + i + s - 10, py + i - ch + 10); k.lineTo(px + i + 10, py + i - ch + s - 10); k.stroke();
        k.strokeStyle = INK; k.lineWidth = 5; rr(k, px + i, py + i - ch, s, s, 8); k.stroke();
        k.beginPath(); k.moveTo(px + i, py + i - ch + s - 8); k.lineTo(px + i, py + i + s - 8); k.arcTo(px + i, py + i + s, px + i + 8, py + i + s, 8);
        k.lineTo(px + i + s - 8, py + i + s); k.arcTo(px + i + s, py + i + s, px + i + s, py + i + s - 8, 8); k.lineTo(px + i + s, py + i - ch + s - 8); k.stroke();
      }
    }
  }

  buildMini() {
    const s = 4, m = this.mini = document.createElement('canvas'); m.width = MW * s; m.height = MH * s;
    const c = m.getContext('2d');
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = MAP[y][x];
      c.fillStyle = t === '#' ? '#4a32b8' : t === 'c' ? '#c47a2e' : t === 'w' ? '#38c6f4' : (t === 'A' || t === 'B') ? '#ffb347' : '#f1cf82';
      c.fillRect(x * s, y * s, s, s);
    }
  }

  // ---------- effects ----------
  add(p) { this.fx.push(Object.assign({ vx: 0, vy: 0, life: .4, size: 6, color: '#fff', kind: 'dot', drag: 3, grow: 0 }, p, { max: p.life || .4 })); }
  burst(x, y, n, color, speed = 220, size = 6, life = .4) { for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = rand(.3, 1) * speed; this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, size: size * rand(.6, 1.2), life: life * rand(.6, 1.2) }); } }
  ring(x, y, r, color, life = .4, width = 10) { this.add({ kind: 'ring', x, y, size: r, color, life, width }); }
  text(x, y, text, color, size = 26) { this.add({ kind: 'text', x, y, vy: -70, text, color, size, life: .8, drag: 1.5 }); }
  showBanner(text, sub, color, dur = 2.4) { this.banner = { text, sub, color, t: 0, dur }; }

  txt(str, x, y, size, fill = '#fff', align = 'center', sw = .22) {
    const c = this.c; c.font = `${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = Math.max(3, size * sw); c.strokeStyle = INK; c.strokeText(str, x, y + size * .06); c.strokeText(str, x, y);
    c.fillStyle = fill; c.fillText(str, x, y);
  }

  // ---------- characters ----------
  trooper(e, g, alpha, mine) {
    const c = this.c, tc = TEAM[e.team], w = WEAPONS[e.slots[e.cur].id];
    c.save(); c.translate(e.x, e.y); c.globalAlpha = alpha;
    c.fillStyle = 'rgba(40,20,70,.28)'; c.beginPath(); c.ellipse(4, 12, 22, 15, 0, 0, 7); c.fill();
    c.save(); c.rotate(e.ang);
    const sw = Math.sin(e.walk * 6) * 7, moving = Math.hypot(e.vx, e.vy) > 30 ? 1 : 0;
    c.lineWidth = 4; c.strokeStyle = INK; c.lineJoin = 'round';
    // boots
    c.fillStyle = '#3b2f5c';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(sw * s * moving - 2, s * 11, 9, 6.5, 0, 0, 7); c.fill(); c.stroke(); }
    // weapon
    const rc = e.recoil * 6, gl = w.len, big = gl > 30;
    c.fillStyle = '#39344f'; rr(c, 12 - rc, 3, gl + 6, big ? 9 : 8, 3); c.fill(); c.stroke();
    c.fillStyle = tc.light; c.fillRect(18 - rc, 5, Math.min(12, gl * .4), 3);
    if (w.pellets > 1) { c.fillStyle = '#39344f'; rr(c, gl + 8 - rc, 1, 9, 13, 3); c.fill(); c.stroke(); }
    if (gl > 44) { c.fillStyle = '#86e9ff'; c.beginPath(); c.arc(26 - rc, 7.5, 5, 0, 7); c.fill(); c.stroke(); }
    // gloves
    c.fillStyle = '#ffe2b8';
    c.beginPath(); c.arc(18 - rc, 9, 6.5, 0, 7); c.fill(); c.stroke();
    if (big) { c.beginPath(); c.arc(32 - rc, 5, 6, 0, 7); c.fill(); c.stroke(); }
    // pack
    const carrying = g.bomb.state === 'carried' && g.bomb.carrier === e;
    c.fillStyle = carrying ? '#ffd23f' : tc.dark; rr(c, -27, -10, 13, 20, 5); c.fill(); c.stroke();
    if (carrying) { c.fillStyle = Math.sin(this.t * 10) > 0 ? '#ff3b3b' : '#7a1d1d'; c.beginPath(); c.arc(-21, 0, 3.5, 0, 7); c.fill(); }
    // body
    c.fillStyle = tc.main; c.beginPath(); c.arc(0, 0, 20, 0, 7); c.fill(); c.stroke();
    c.fillStyle = tc.dark; c.beginPath(); c.arc(-2, 0, 13.5, 0, 7); c.fill();
    c.fillStyle = tc.light; c.beginPath(); c.arc(-5, -5, 5, 0, 7); c.fill();
    // visor
    c.fillStyle = INK; rr(c, 6, -10, 10, 20, 5); c.fill();
    c.fillStyle = mine ? '#fff36b' : '#eafcff'; rr(c, 9, -7, 4.5, 14, 2.2); c.fill();
    if (e.hitT > 0) { c.globalAlpha = alpha * .8; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 22, 0, 7); c.fill(); c.globalAlpha = alpha; }
    c.restore();
    // overhead info
    const bw = 46, bh = 9, by = -42;
    c.fillStyle = INK; rr(c, -bw / 2 - 3, by - 3, bw + 6, bh + 6, 6); c.fill();
    c.fillStyle = '#463a66'; rr(c, -bw / 2, by, bw, bh, 4); c.fill();
    c.fillStyle = e.hp > 35 ? (e.team === 0 ? '#5cf08a' : '#ff6b7f') : '#ffb020'; rr(c, -bw / 2, by, Math.max(4, bw * e.hp / 100), bh, 4); c.fill();
    if (e.armor > 0) { c.fillStyle = '#bfe8ff'; c.fillRect(-bw / 2 + 2, by + bh - 3, (bw - 4) * e.armor / 50, 2.5); }
    this.txt(e.isPlayer ? 'YOU' : e.name, 0, by - 13, 13, mine ? '#fff36b' : '#fff', 'center', .32);
    if (e.blindT > .2) for (let i = 0; i < 3; i++) { const a = this.t * 5 + i * 2.1; this.star(Math.cos(a) * 20, -30 + Math.sin(a) * 6, 6, '#fff36b'); }
    if (e.acting) {
      c.lineWidth = 7; c.strokeStyle = INK; c.beginPath(); c.arc(0, 0, 31, 0, 7); c.stroke();
      c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.beginPath(); c.arc(0, 0, 31, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.actT / (e.actNeed || 3)); c.stroke();
    }
    c.restore();
  }
  star(x, y, r, color) {
    const c = this.c; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rad = i % 2 ? r * .45 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    c.closePath(); c.fillStyle = color; c.strokeStyle = INK; c.lineWidth = 2.5; c.fill(); c.stroke();
  }
  charge(x, y, pulse, armed) {
    const c = this.c; c.save(); c.translate(x, y);
    if (armed) { c.globalAlpha = Math.max(0, pulse) * .5; c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(0, 0, 26 + (1 - pulse) * 40, 0, 7); c.fill(); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(40,20,70,.28)'; c.beginPath(); c.ellipse(3, 8, 17, 10, 0, 0, 7); c.fill();
    c.lineWidth = 4; c.strokeStyle = INK; c.fillStyle = '#ffd23f'; rr(c, -14, -11, 28, 22, 6); c.fill(); c.stroke();
    c.fillStyle = '#39344f'; rr(c, -8, -6, 16, 8, 2); c.fill();
    c.fillStyle = armed && pulse > .4 ? '#ff3b3b' : '#7a1d1d'; c.beginPath(); c.arc(0, 6, 3, 0, 7); c.fill();
    c.restore();
  }

  // ---------- frame ----------
  draw(g, ui, dt) {
    this.t += dt;
    const c = this.c, W = this.W, H = this.H, sc = this.scale, v = ui.viewer;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = INK; c.fillRect(0, 0, W, H);

    // camera
    let tx = this.cam.x, ty = this.cam.y;
    if (v) { tx = v.x + Math.cos(v.ang) * 90; ty = v.y + Math.sin(v.ang) * 90; }
    else if (g.bomb.state === 'planted') { tx = g.bomb.x; ty = g.bomb.y; }
    const k = Math.min(1, dt * 6); this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    this.shake = Math.max(0, this.shake - dt * 30);
    const ox = W / 2 - this.cam.x * sc + rand(-1, 1) * this.shake, oy = H / 2 - this.cam.y * sc + rand(-1, 1) * this.shake;

    c.save(); c.translate(ox, oy); c.scale(sc, sc);
    c.drawImage(this.floor, 0, 0);

    for (const d of this.decals) { c.globalAlpha = .5; c.fillStyle = d.color; c.beginPath(); c.ellipse(d.x, d.y, d.r, d.r * .8, d.a, 0, 7); c.fill(); }
    c.globalAlpha = 1;

    const b = g.bomb;
    if (b.state === 'dropped') { this.charge(b.x, b.y + Math.sin(this.t * 4) * 3, 0, false); }
    if (b.state === 'planted' || b.state === 'defused') this.charge(b.x, b.y, b.pulse || 0, b.state === 'planted');

    // grenades
    for (const n of g.nades) {
      c.save(); c.translate(n.x, n.y); c.rotate(n.spin);
      c.lineWidth = 3.5; c.strokeStyle = INK; c.fillStyle = n.type === 'flash' ? '#eafcff' : '#5fd068';
      rr(c, -7, -9, 14, 18, 5); c.fill(); c.stroke(); c.fillStyle = '#39344f'; c.fillRect(-4, -12, 8, 4);
      c.restore();
    }

    // characters (enemies only when the viewer can actually see them)
    for (const e of g.ents) {
      if (!e.alive) { this.vis.delete(e.id); continue; }
      let a = 1;
      if (v && e.team !== v.team) {
        const seen = los(v.x, v.y, e.x, e.y) && Math.hypot(e.x - v.x, e.y - v.y) < 1300;
        a = Math.max(0, Math.min(1, (this.vis.get(e.id) || 0) + (seen ? dt * 10 : -dt * 5)));
        this.vis.set(e.id, a);
      } else this.vis.set(e.id, 1);
      if (a > .02) this.trooper(e, g, a, e === g.player);
    }

    // bullets
    c.lineCap = 'round';
    for (const bl of g.bullets) {
      const l = Math.hypot(bl.vx, bl.vy), nx = bl.vx / l, ny = bl.vy / l, len = bl.wid === 'longshot' ? 70 : 34;
      c.strokeStyle = INK; c.lineWidth = 9; c.beginPath(); c.moveTo(bl.x - nx * len, bl.y - ny * len); c.lineTo(bl.x, bl.y); c.stroke();
      c.strokeStyle = TEAM[bl.team].shot; c.lineWidth = 5; c.stroke();
    }

    c.drawImage(this.walls, 0, -WALL_H);

    // particles
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i]; p.life -= dt;
      if (p.life <= 0) { this.fx.splice(i, 1); continue; }
      const f = p.life / p.max, dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'ring') {
        const r = p.size * (1 - f * f); c.globalAlpha = f; c.lineWidth = p.width * f + 2; c.strokeStyle = p.color; c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.stroke();
      } else if (p.kind === 'text') {
        c.globalAlpha = Math.min(1, f * 3); const s = p.size * (1 + Math.max(0, f - .8) * 2); this.txt(p.text, p.x, p.y, s, p.color);
      } else if (p.kind === 'muzzle') {
        c.globalAlpha = f; c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = '#fff6a8'; c.strokeStyle = '#ff9d2e'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(0, -7); c.lineTo(p.size, 0); c.lineTo(0, 7); c.lineTo(6, 0); c.closePath(); c.fill(); c.stroke(); c.restore();
      } else {
        c.globalAlpha = Math.min(1, f * 2); c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (p.grow ? 1 + (1 - f) * p.grow : f), 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }
    c.restore();

    if (v) this.drawFog(v, ox, oy);
    this.drawHud(g, ui, ox, oy, dt);
  }

  drawFog(v, ox, oy) {
    const f = this.fc, sc = this.scale, W = this.W, H = this.H;
    f.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, W, H);
    f.fillStyle = 'rgba(22,14,48,.62)'; f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = 'destination-out';
    f.beginPath();
    const N = 540, max = 1500;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      const d = Math.min(max, raycast(v.x, v.y, dx, dy, max) + 30);
      f.lineTo(ox + (v.x + dx * d) * sc, oy + (v.y + dy * d) * sc);
    }
    f.closePath(); f.fillStyle = '#000'; f.fill();
    f.lineJoin = 'round'; f.lineWidth = 14 * sc; f.strokeStyle = 'rgba(0,0,0,.5)'; f.stroke();
    this.c.drawImage(this.fog, 0, 0, W, H);
  }

  edgeArrow(wx, wy, ox, oy, label, color) {
    const c = this.c, W = this.W, H = this.H, u = this.u;
    const sx = ox + wx * this.scale, sy = oy + wy * this.scale, m = 54 * u;
    if (sx > m && sx < W - m && sy > m + 30 * u && sy < H - m) return;
    const a = Math.atan2(sy - H / 2, sx - W / 2);
    const t = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m - 16 * u) / Math.abs(Math.sin(a) || 1e-6));
    const x = W / 2 + Math.cos(a) * t, y = H / 2 + Math.sin(a) * t + 8 * u;
    c.save(); c.translate(x, y);
    c.save(); c.rotate(a); c.fillStyle = color; c.strokeStyle = INK; c.lineWidth = 3 * u; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(30 * u, 0); c.lineTo(16 * u, -11 * u); c.lineTo(16 * u, 11 * u); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.beginPath(); c.arc(0, 0, 15 * u, 0, 7); c.fillStyle = color; c.fill(); c.lineWidth = 3 * u; c.strokeStyle = INK; c.stroke();
    this.txt(label, 0, 1 * u, 17 * u, '#fff');
    c.restore();
  }

  drawHud(g, ui, ox, oy, dt) {
    const c = this.c, W = this.W, H = this.H, u = this.u, p = g.player, v = ui.viewer;
    const sat = ui.safeTop || 0;

    // objective pointers
    const myRole = g.role(p), b = g.bomb;
    if (g.phase !== 'end') {
      if (b.state === 'planted') this.edgeArrow(b.x, b.y, ox, oy, '!', '#ff3b3b');
      else if (b.state === 'dropped' && myRole === 'atk') this.edgeArrow(b.x, b.y, ox, oy, '!', '#ffb020');
      else for (const s of Object.values(SITES)) this.edgeArrow(s.cx, s.cy, ox, oy, s.id, '#ff9d2e');
    }

    // hurt vignette + flash white-out
    this.hurtT = Math.max(0, this.hurtT - dt * 2.2);
    if (this.hurtT > 0) {
      const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .7);
      gr.addColorStop(0, 'rgba(255,40,70,0)'); gr.addColorStop(1, `rgba(255,40,70,${this.hurtT * .55})`);
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
    }
    const blind = v && v.blindT > 0 ? Math.min(1, v.blindT / Math.min(1.1, v.blindMax)) : 0;
    this.whiteT = Math.max(blind, this.whiteT - dt * 3);
    if (this.whiteT > 0) { c.fillStyle = `rgba(255,255,255,${this.whiteT * .97})`; c.fillRect(0, 0, W, H); }

    // scoreboard
    const cx = W / 2, y0 = 8 * u + sat;
    const armed = b.state === 'planted' && g.phase === 'live';
    c.fillStyle = INK; rr(c, cx - 132 * u, y0, 264 * u, 42 * u, 16 * u); c.fill();
    c.fillStyle = TEAM[0].main; rr(c, cx - 128 * u, y0 + 4 * u, 82 * u, 34 * u, 12 * u); c.fill();
    c.fillStyle = TEAM[1].main; rr(c, cx + 46 * u, y0 + 4 * u, 82 * u, 34 * u, 12 * u); c.fill();
    c.fillStyle = armed ? (Math.sin(this.t * 10) > 0 ? '#ff3b3b' : '#a01f2e') : '#2e2550'; rr(c, cx - 42 * u, y0 + 4 * u, 84 * u, 34 * u, 12 * u); c.fill();
    this.txt(String(g.score[0]), cx - 108 * u, y0 + 22 * u, 24 * u);
    this.txt(String(g.score[1]), cx + 108 * u, y0 + 22 * u, 24 * u);
    const tm = Math.max(0, Math.ceil(g.timer));
    const label = g.phase === 'buy' ? 'BUY ' + tm : g.phase === 'end' ? '—' : Math.floor(tm / 60) + ':' + String(tm % 60).padStart(2, '0');
    this.txt(label, cx, y0 + 22 * u, 20 * u, g.phase === 'buy' ? '#8dffb0' : '#fff');
    for (let t = 0; t < 2; t++) {
      const es = g.ents.filter(e => e.team === t);
      es.forEach((e, i) => {
        const px = t === 0 ? cx - 90 * u + i * 14 * u : cx + 62 * u + i * 14 * u;
        c.beginPath(); c.arc(px, y0 + 22 * u, 5 * u, 0, 7); c.fillStyle = e.alive ? '#fff' : 'rgba(26,19,51,.55)'; c.fill();
      });
    }
    const roleTxt = myRole === 'atk' ? 'RAIDERS · plant the charge' : 'GUARDS · protect the sites';
    this.txt(`ROUND ${g.round}  ·  ${roleTxt}`, cx, y0 + 54 * u, 11 * u, '#fff', 'center', .3);

    // minimap
    const ms = 4 * u * .8, mx = 10 * u + (ui.safeLeft || 0), my = 10 * u + sat, mw = MW * ms, mh = MH * ms;
    c.fillStyle = INK; rr(c, mx - 4 * u, my - 4 * u, mw + 8 * u, mh + 8 * u, 8 * u); c.fill();
    c.globalAlpha = .92; c.drawImage(this.mini, mx, my, mw, mh); c.globalAlpha = 1;
    const dot = (e, col, r) => { c.beginPath(); c.arc(mx + e.x / TILE * ms, my + e.y / TILE * ms, r * u, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 1.5 * u; c.strokeStyle = INK; c.stroke(); };
    for (const s of Object.values(SITES)) this.txt(s.id, mx + s.cx / TILE * ms, my + s.cy / TILE * ms, 11 * u, '#fff', 'center', .3);
    if (b.state === 'planted' || b.state === 'dropped') dot(b, Math.sin(this.t * 8) > 0 ? '#ff3b3b' : '#ffd23f', 4);
    for (const e of g.ents) {
      if (!e.alive) continue;
      if (e.team === p.team) dot(e, e === p ? '#fff36b' : TEAM[0].main, e === p ? 4 : 3);
      else if ((this.vis.get(e.id) || 0) > .5) dot(e, TEAM[1].main, 3);
    }

    // kill feed
    let fy = 14 * u + sat;
    for (const f of g.feed) {
      const a = Math.min(1, f.t); c.globalAlpha = a;
      const wn = f.wid === 'frag' ? 'Frag' : f.wid === 'charge' ? 'Charge' : (WEAPONS[f.wid] ? WEAPONS[f.wid].name : '');
      const right = W - 12 * u - (ui.safeRight || 0);
      c.font = `${13 * u}px ${FONT}`;
      const wb = c.measureText(f.b).width, ww = c.measureText(` ▸ ${wn} ▸ `).width, wa = c.measureText(f.a).width;
      c.fillStyle = 'rgba(26,19,51,.7)'; rr(c, right - wb - ww - wa - 10 * u, fy - 11 * u, wb + ww + wa + 20 * u, 22 * u, 8 * u); c.fill();
      this.txt(f.b, right, fy, 13 * u, TEAM[f.bt].light, 'right', .3);
      this.txt(` ▸ ${wn} ▸ `, right - wb, fy, 13 * u, '#fff', 'right', .3);
      if (f.a) this.txt(f.a, right - wb - ww, fy, 13 * u, f.at >= 0 ? TEAM[f.at].light : '#fff', 'right', .3);
      fy += 26 * u; c.globalAlpha = 1;
    }

    // player status (bottom centre)
    const e = v || p;
    if (e && e.alive) {
      const bw = 190 * u, bx = cx - bw / 2, by = H - 34 * u - (ui.safeBottom || 0);
      c.fillStyle = INK; rr(c, bx - 4 * u, by - 4 * u, bw + 8 * u, 26 * u, 10 * u); c.fill();
      c.fillStyle = '#463a66'; rr(c, bx, by, bw, 18 * u, 7 * u); c.fill();
      c.fillStyle = e.hp > 35 ? '#5cf08a' : '#ffb020'; rr(c, bx, by, Math.max(10 * u, bw * e.hp / 100), 18 * u, 7 * u); c.fill();
      c.fillStyle = 'rgba(255,255,255,.3)'; rr(c, bx + 4 * u, by + 2 * u, Math.max(4 * u, bw * e.hp / 100 - 8 * u), 5 * u, 2.5 * u); c.fill();
      this.txt(String(Math.ceil(e.hp)), cx, by + 9 * u, 15 * u);
      if (e.armor > 0) { c.fillStyle = INK; rr(c, bx - 4 * u, by + 22 * u, bw + 8 * u, 9 * u, 4 * u); c.fill(); c.fillStyle = '#9fdcff'; rr(c, bx, by + 24 * u, bw * e.armor / 50, 5 * u, 2.5 * u); c.fill(); }
      const w = WEAPONS[e.slots[e.cur].id], sl = e.slots[e.cur];
      this.txt('$' + p.money, bx - 14 * u, by + 9 * u, 18 * u, '#8dffb0', 'right');
      const am = e.reloadT > 0 ? 'RELOAD' : sl.mag + '/' + w.mag;
      this.txt(am, bx + bw + 14 * u, by + 9 * u, 18 * u, sl.mag <= w.mag * .25 ? '#ffb020' : '#fff', 'left');
      this.txt(w.name.toUpperCase(), bx + bw + 14 * u, by - 10 * u, 10 * u, '#d9d0ff', 'left', .3);
      if (e.reloadT > 0) { c.fillStyle = '#ffd23f'; rr(c, bx, by - 9 * u, bw * (1 - e.reloadT / w.reload), 4 * u, 2 * u); c.fill(); }
      if (e.acting) {
        const pw = 220 * u, px = cx - pw / 2, py = H * .66;
        c.fillStyle = INK; rr(c, px - 4 * u, py - 4 * u, pw + 8 * u, 24 * u, 10 * u); c.fill();
        c.fillStyle = '#ffd23f'; rr(c, px, py, Math.max(8 * u, pw * e.actT / (e.actNeed || 3)), 16 * u, 6 * u); c.fill();
        this.txt(e.acting === 'plant' ? 'PLANTING…' : 'DEFUSING…', cx, py - 18 * u, 16 * u);
      }
      if (e !== p) this.txt('SPECTATING ' + e.name.toUpperCase(), cx, H - 62 * u, 14 * u, '#fff36b');
      else if (b.carrier === p && g.phase !== 'end') this.txt('YOU HAVE THE CHARGE', cx, H - 58 * u, 13 * u, '#ffd23f', 'center', .3);
    }

    // touch sticks
    for (const s of ui.sticks || []) {
      if (!s.on) continue;
      c.globalAlpha = .35; c.fillStyle = '#fff'; c.beginPath(); c.arc(s.ox, s.oy, 52 * u, 0, 7); c.fill();
      c.globalAlpha = .9; c.lineWidth = 4 * u; c.strokeStyle = INK; c.stroke();
      c.fillStyle = s.hot ? '#ff4d6a' : '#fff'; c.beginPath(); c.arc(s.ox + s.dx * 52 * u, s.oy + s.dy * 52 * u, 24 * u, 0, 7); c.fill(); c.stroke();
      c.globalAlpha = 1;
    }

    // banner
    const bn = this.banner;
    if (bn) {
      bn.t += dt;
      if (bn.t > bn.dur) this.banner = null;
      else {
        const inn = Math.min(1, bn.t / .22), out = Math.min(1, (bn.dur - bn.t) / .25);
        const s = (inn < 1 ? .4 + inn * .75 : 1 + Math.max(0, .15 - (bn.t - .22)) ) * (0.6 + .4 * out);
        c.save(); c.globalAlpha = out; c.translate(cx, H * .3); c.scale(s, s); c.rotate(-.03);
        const size = Math.min(54 * u, W / (bn.text.length * .62));
        c.font = `${size}px ${FONT}`; const tw = c.measureText(bn.text).width;
        c.fillStyle = INK; rr(c, -tw / 2 - 26 * u, -size * .72, tw + 52 * u, size * 1.44, 18 * u); c.fill();
        c.fillStyle = bn.color || '#ffd23f'; rr(c, -tw / 2 - 20 * u, -size * .72 + 6 * u, tw + 40 * u, size * 1.44 - 12 * u, 14 * u); c.fill();
        this.txt(bn.text, 0, 0, size, '#fff', 'center', .2);
        if (bn.sub) this.txt(bn.sub, 0, size * 1.05, 17 * u, '#fff', 'center', .3);
        c.restore();
      }
    }
  }
}
