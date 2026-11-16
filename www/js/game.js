// Flash Attack — simulation core (no rendering, no DOM)
import { TILE, MAP, WEAPONS, ITEMS, RULES, BOT_NAMES } from './config.js';
import { botThink, resetBot } from './ai.js';

export const MW = MAP[0].length, MH = MAP.length;
const grid = MAP.map(r => r.split(''));
export const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? '#' : grid[ty][tx];
export const solid = (tx, ty) => { const c = tileAt(tx, ty); return c === '#' || c === 'c' || c === 'w'; };
export const opaque = (tx, ty) => { const c = tileAt(tx, ty); return c === '#' || c === 'c'; };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// Distance along a ray until it hits an opaque tile (grid DDA).
export function raycast(x, y, dx, dy, max) {
  let tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = dx === 0 ? 1e9 : Math.abs(TILE / dx), ddy = dy === 0 ? 1e9 : Math.abs(TILE / dy);
  let tmx = dx === 0 ? 1e9 : (dx > 0 ? (tx + 1) * TILE - x : x - tx * TILE) / Math.abs(dx);
  let tmy = dy === 0 ? 1e9 : (dy > 0 ? (ty + 1) * TILE - y : y - ty * TILE) / Math.abs(dy);
  for (;;) {
    let d;
    if (tmx < tmy) { d = tmx; tmx += ddx; tx += sx; } else { d = tmy; tmy += ddy; ty += sy; }
    if (d >= max) return max;
    if (opaque(tx, ty)) return d;
  }
}
export function los(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  if (d < 1) return true;
  return raycast(x0, y0, dx / d, dy / d, d) >= d;
}

// Static map features
export const SITES = {};
export const SPAWNS = { atk: [], def: [] };
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  const c = grid[y][x];
  if (c === 'A' || c === 'B') {
    const s = SITES[c] || (SITES[c] = { id: c, tiles: [], x0: 1e9, y0: 1e9, x1: -1, y1: -1 });
    s.tiles.push({ x, y }); s.x0 = Math.min(s.x0, x); s.y0 = Math.min(s.y0, y); s.x1 = Math.max(s.x1, x); s.y1 = Math.max(s.y1, y);
  }
  if (c === 'T') SPAWNS.atk.push({ x, y });
  if (c === 'D') SPAWNS.def.push({ x, y });
}
for (const s of Object.values(SITES)) {
  s.cx = (s.x0 + s.x1 + 1) / 2 * TILE; s.cy = (s.y0 + s.y1 + 1) / 2 * TILE;
  s.hold = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (solid(x, y)) continue;
    const px = (x + .5) * TILE, py = (y + .5) * TILE, d = Math.hypot(px - s.cx, py - s.cy);
    if (d > TILE * 1.2 && d < TILE * 5 && los(px, py, s.cx, s.cy)) s.hold.push({ x: px, y: py });
  }
}
export const siteAt = (x, y) => { const c = tileAt(Math.floor(x / TILE), Math.floor(y / TILE)); return c === 'A' || c === 'B' ? c : null; };

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

export class Game {
  constructor(emit) {
    this.emit = emit || (() => {});
    this.ents = []; this.bullets = []; this.nades = [];
    this.score = [0, 0]; this.round = 0;
    this.atkTeam = 0; this.phase = 'menu'; this.timer = 0; this.time = 0;
    this.bomb = { state: 'none', x: 0, y: 0, t: 0, carrier: null, site: null };
    this.plan = { site: 'A' }; this.intel = null;
    this.feed = []; this.over = false; this.winner = -1;
    this.input = { mx: 0, my: 0, aimAng: 0, fire: false, reload: false, swap: false, throw: null, action: false };
  }

  start(playerAttacks) {
    this.atkTeam = playerAttacks ? 0 : 1;
    const names = shuffle(BOT_NAMES.slice());
    let id = 0;
    for (let team = 0; team < 2; team++) for (let i = 0; i < RULES.teamSize; i++) {
      const isPlayer = team === 0 && i === 0;
      const e = {
        id: id++, team, isPlayer, name: isPlayer ? 'You' : names.pop(), r: 20,
        x: 0, y: 0, vx: 0, vy: 0, ang: 0, hp: 100, armor: 0, alive: true,
        slots: [null, { id: 'pip', mag: WEAPONS.pip.mag }], cur: 1,
        fireT: 0, reloadT: 0, swapT: 0, flash: 0, frag: 0, kit: false, blindT: 0, blindMax: 1,
        money: RULES.startMoney, kills: 0, deaths: 0, actT: 0, acting: null,
        hitT: 0, recoil: 0, walk: 0, ai: isPlayer ? null : {},
      };
      this.ents.push(e);
    }
    this.player = this.ents[0];
    this.newRound();
  }

  role(e) { return e.team === this.atkTeam ? 'atk' : 'def'; }
  weapon(e) { return WEAPONS[e.slots[e.cur].id]; }
  alive(team) { return this.ents.filter(e => e.alive && e.team === team); }

  resetGear(e, full) {
    e.slots = [null, { id: 'pip', mag: WEAPONS.pip.mag }]; e.cur = 1;
    e.armor = 0; e.flash = 0; e.frag = 0; e.kit = false;
    if (full) e.money = RULES.startMoney;
  }

  newRound() {
    this.round++;
    this.bullets.length = 0; this.nades.length = 0;
    this.intel = null;
    for (const role of ['atk', 'def']) {
      const spots = shuffle(SPAWNS[role].slice());
      for (const e of this.ents) {
        if (this.role(e) !== role) continue;
        if (!e.alive) this.resetGear(e, false);
        const s = spots.pop();
        e.x = (s.x + .5) * TILE; e.y = (s.y + .5) * TILE; e.vx = e.vy = 0;
        e.ang = role === 'atk' ? 0 : Math.PI;
        e.hp = 100; e.alive = true; e.blindT = 0; e.actT = 0; e.acting = null; e.reloadT = 0; e.fireT = 0;
        for (const sl of e.slots) if (sl) sl.mag = WEAPONS[sl.id].mag;
        if (e.slots[0]) e.cur = 0;
      }
    }
    const atk = this.ents.filter(e => this.role(e) === 'atk');
    const carrier = pick(atk);
    this.bomb = { state: 'carried', x: 0, y: 0, t: 0, carrier, site: null };
    this.plan = { site: Math.random() < .5 ? 'A' : 'B' };
    const defBots = shuffle(this.ents.filter(e => this.role(e) === 'def' && !e.isPlayer));
    defBots.forEach((e, i) => { e.ai.site = i % 2 ? 'B' : 'A'; });
    for (const e of this.ents) if (!e.isPlayer) { resetBot(this, e); this.botBuy(e); }
    this.phase = 'buy'; this.timer = RULES.buyTime;
    this.emit('round', { n: this.round });
  }

  // ---------- economy ----------
  canBuy(e, id) {
    if (this.phase !== 'buy' || !e.alive) return false;
    const w = WEAPONS[id], it = ITEMS[id], price = (w || it).price;
    if (e.money < price) return false;
    if (w) return !(e.slots[0] && e.slots[0].id === id) && id !== 'pip';
    if (id === 'vest') return e.armor < 50;
    if (id === 'kit') return !e.kit && this.role(e) === 'def';
    return e[id] < it.max;
  }
  buy(e, id) {
    if (!this.canBuy(e, id)) return false;
    const w = WEAPONS[id];
    e.money -= (w || ITEMS[id]).price;
    if (w) { e.slots[0] = { id, mag: w.mag }; e.cur = 0; e.reloadT = 0; }
    else if (id === 'vest') e.armor = 50;
    else if (id === 'kit') e.kit = true;
    else e[id]++;
    if (e.isPlayer) this.emit('buy', { id });
    return true;
  }
  botBuy(e) {
    if (!e.slots[0]) {
      const m = e.money;
      const opts = m >= 4850 && Math.random() < .2 ? ['longshot'] : m >= 3350 ? ['lancer'] : m >= 1500 ? ['buzzer', 'thumper', 'buzzer'] : [];
      if (opts.length) this.buy(e, pick(opts));
    }
    this.buy(e, 'vest');
    if (Math.random() < .6) this.buy(e, 'flash');
    if (Math.random() < .4) this.buy(e, 'frag');
    if (Math.random() < .5) this.buy(e, 'kit');
  }
  pay(e, n) { e.money = Math.min(RULES.maxMoney, e.money + n); }

  // ---------- main update ----------
  update(dt) {
    this.time += dt;
    if (this.phase === 'menu' || this.over) return;
    this.timer -= dt;
    for (const f of this.feed) f.t -= dt;
    while (this.feed.length && this.feed[0].t <= 0) this.feed.shift();

    if (this.phase === 'buy') {
      for (const e of this.ents) if (e.isPlayer && e.alive) e.ang = this.input.aimAng;
      if (this.timer <= 0) { this.phase = 'live'; this.timer = RULES.roundTime; this.emit('go', { carrier: this.bomb.carrier, site: this.plan.site }); }
      return;
    }

    for (const e of this.ents) {
      if (!e.alive) continue;
      const c = e.isPlayer ? this.input : botThink(this, e, dt);
      this.stepEnt(e, c, dt);
    }
    this.separate();
    this.stepBullets(dt);
    this.stepNades(dt);
    this.stepBomb(dt);

    if (this.phase === 'live') this.checkWin();
    else if (this.phase === 'end' && this.timer <= 0) this.afterRound();
  }

  stepEnt(e, c, dt) {
    e.fireT -= dt; e.swapT -= dt; e.hitT -= dt; e.recoil = Math.max(0, e.recoil - dt * 7);
    if (e.blindT > 0) e.blindT -= dt;
    e.ang = c.aimAng;
    const w = this.weapon(e), slot = e.slots[e.cur];

    // plant / defuse
    let acting = null;
    if (c.action && this.phase === 'live') {
      if (this.canPlant(e)) acting = 'plant'; else if (this.canDefuse(e)) acting = 'defuse';
    }
    if (acting) {
      if (e.acting !== acting) { e.acting = acting; e.actT = 0; this.emit('actstart', { e, acting }); }
      e.actT += dt;
      const need = acting === 'plant' ? RULES.plantTime : RULES.defuseTime / (e.kit ? 2 : 1);
      e.actNeed = need;
      if (e.actT >= need) { acting === 'plant' ? this.plant(e) : this.defuse(e); e.acting = null; e.actT = 0; }
    } else { e.acting = null; e.actT = 0; }

    // movement
    let mx = c.mx, my = c.my; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if (acting) mx = my = 0;
    const sp = RULES.speed * w.move * (e.blindT > 0 ? .8 : 1);
    const k = Math.min(1, dt * 14);
    e.vx += (mx * sp - e.vx) * k; e.vy += (my * sp - e.vy) * k;
    e.x += e.vx * dt; e.y += e.vy * dt;
    this.collide(e);
    e.walk += Math.hypot(e.vx, e.vy) * dt * .045;

    if (acting) return;

    // reload / swap
    if (e.reloadT > 0) { e.reloadT -= dt; if (e.reloadT <= 0) { slot.mag = w.mag; this.emit('reloaded', { e }); } }
    if (c.reload && e.reloadT <= 0 && slot.mag < w.mag) this.startReload(e);
    if (c.swap && e.swapT <= 0 && e.slots[0]) { e.cur = 1 - e.cur; e.reloadT = 0; e.swapT = .3; e.fireT = Math.max(e.fireT, .25); this.emit('swap', { e }); }
    if (c.throw && e[c.throw] > 0 && e.swapT <= 0) { e[c.throw]--; e.swapT = .5; this.throwNade(e, c.throw, c.power || 1); }
    if (c.fire) this.fire(e);
  }

  startReload(e) { const w = this.weapon(e); e.reloadT = w.reload; this.emit('reload', { e }); }

  fire(e) {
    if (e.fireT > 0 || e.reloadT > 0 || e.swapT > 0) return;
    const slot = e.slots[e.cur], w = WEAPONS[slot.id];
    if (slot.mag <= 0) { this.startReload(e); return; }
    slot.mag--; e.fireT = w.rate; e.recoil = 1;
    const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
    let mx = e.x + ca * (22 + w.len), my = e.y + sa * (22 + w.len);
    if (!los(e.x, e.y, mx, my)) { mx = e.x; my = e.y; }
    for (let i = 0; i < w.pellets; i++) {
      const a = e.ang + (Math.random() - .5) * 2 * w.spread, s = w.speed * (w.pellets > 1 ? rand(.85, 1.1) : 1);
      this.bullets.push({ x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * s, vy: Math.sin(a) * s, team: e.team, owner: e, dmg: w.dmg, life: w.range / s, wid: slot.id });
    }
    this.emit('shot', { e, wid: slot.id, x: mx, y: my });
    if (slot.mag <= 0) this.startReload(e);
  }

  collide(e) {
    for (let it = 0; it < 2; it++) {
      const x0 = Math.floor((e.x - e.r) / TILE), x1 = Math.floor((e.x + e.r) / TILE);
      const y0 = Math.floor((e.y - e.r) / TILE), y1 = Math.floor((e.y + e.r) / TILE);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (!solid(tx, ty)) continue;
        const nx = Math.max(tx * TILE, Math.min(e.x, (tx + 1) * TILE)), ny = Math.max(ty * TILE, Math.min(e.y, (ty + 1) * TILE));
        let dx = e.x - nx, dy = e.y - ny; const d = Math.hypot(dx, dy);
        if (d >= e.r) continue;
        if (d < .001) { dx = e.x - (tx + .5) * TILE; dy = e.y - (ty + .5) * TILE; const l = Math.hypot(dx, dy) || 1; e.x += dx / l * 2; e.y += dy / l * 2; continue; }
        e.x += dx / d * (e.r - d); e.y += dy / d * (e.r - d);
      }
    }
  }

  separate() {
    const es = this.ents;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j]; if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r - 4;
      if (d >= min || d < .01) continue;
      const p = (min - d) / 2 * .5, nx = dx / d, ny = dy / d;
      a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p;
      this.collide(a); this.collide(b);
    }
  }

  stepBullets(dt) {
    const bs = this.bullets;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i]; b.px = b.x; b.py = b.y;
      const dist = Math.hypot(b.vx, b.vy) * dt, n = Math.ceil(dist / 10), sx = b.vx * dt / n, sy = b.vy * dt / n;
      let dead = false;
      for (let s = 0; s < n && !dead; s++) {
        b.x += sx; b.y += sy;
        if (opaque(Math.floor(b.x / TILE), Math.floor(b.y / TILE))) { this.emit('impact', { x: b.x - sx, y: b.y - sy, wall: true }); dead = true; break; }
        for (const e of this.ents) {
          if (!e.alive || e.team === b.team) continue;
          const dx = e.x - b.x, dy = e.y - b.y;
          if (dx * dx + dy * dy < (e.r + 5) * (e.r + 5)) { this.hurt(e, b.dmg, b.owner, b.wid, b.vx, b.vy); dead = true; break; }
        }
      }
      b.life -= dt;
      if (dead || b.life <= 0) bs.splice(i, 1);
    }
  }

  hurt(e, dmg, by, wid, kx = 0, ky = 0) {
    if (!e.alive) return;
    if (e.armor > 0) { const soak = Math.min(e.armor, dmg * .4); e.armor -= soak; dmg -= soak; }
    dmg = Math.round(dmg);
    e.hp -= dmg; e.hitT = .12;
    const kl = Math.hypot(kx, ky) || 1; e.vx += kx / kl * 60; e.vy += ky / kl * 60;
    if (e.ai && by && by !== e) e.ai.alert = Math.atan2(by.y - e.y, by.x - e.x);
    this.emit('hit', { e, dmg, by });
    if (e.hp <= 0) this.kill(e, by, wid);
  }

  kill(e, by, wid) {
    e.alive = false; e.hp = 0; e.deaths++; e.acting = null; e.actT = 0;
    if (by && by !== e && by.team !== e.team) { by.kills++; this.pay(by, RULES.killReward); }
    if (this.bomb.state === 'carried' && this.bomb.carrier === e) {
      this.bomb.state = 'dropped'; this.bomb.x = e.x; this.bomb.y = e.y; this.bomb.carrier = null;
    }
    this.feed.push({ a: by ? by.name : '', at: by ? by.team : -1, b: e.name, bt: e.team, wid, t: 6 });
    if (this.feed.length > 5) this.feed.shift();
    this.emit('kill', { e, by, wid });
  }

  // ---------- grenades ----------
  throwNade(e, type, power) {
    const s = 820 * Math.max(.35, Math.min(1, power));
    this.nades.push({ type, x: e.x, y: e.y, vx: Math.cos(e.ang) * s + e.vx * .5, vy: Math.sin(e.ang) * s + e.vy * .5, t: type === 'flash' ? 1.15 : 1.5, owner: e, spin: 0 });
    this.emit('throw', { e, type });
  }
  stepNades(dt) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      const f = Math.exp(-1.7 * dt); n.vx *= f; n.vy *= f; n.spin += Math.hypot(n.vx, n.vy) * dt * .03;
      const steps = Math.ceil(Math.hypot(n.vx, n.vy) * dt / 12) || 1;
      for (let s = 0; s < steps; s++) {
        const nx = n.x + n.vx * dt / steps;
        if (opaque(Math.floor(nx / TILE), Math.floor(n.y / TILE))) { n.vx *= -.55; this.emit('bounce', n); } else n.x = nx;
        const ny = n.y + n.vy * dt / steps;
        if (opaque(Math.floor(n.x / TILE), Math.floor(ny / TILE))) { n.vy *= -.55; this.emit('bounce', n); } else n.y = ny;
      }
      n.t -= dt;
      if (n.t <= 0) { this.nades.splice(i, 1); n.type === 'flash' ? this.flashBang(n) : this.fragBoom(n); }
    }
  }
  flashBang(n) {
    const hit = [];
    for (const e of this.ents) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - n.x, e.y - n.y);
      if (d > 820 || !los(n.x, n.y, e.x, e.y)) continue;
      let dur = .7 + 2.9 * (1 - d / 820);
      // looking away from the pop helps
      const off = Math.abs(angDiff(Math.atan2(n.y - e.y, n.x - e.x), e.ang));
      if (off > 1.9 && d > 90) dur *= .45;
      if (e.blindT < dur) { e.blindT = dur; e.blindMax = dur; }
      hit.push(e);
    }
    this.emit('flash', { x: n.x, y: n.y, hit });
  }
  fragBoom(n) {
    const R = 230;
    for (const e of this.ents) {
      if (!e.alive) continue;
      if (e.team === n.owner.team && e !== n.owner) continue;
      const d = Math.hypot(e.x - n.x, e.y - n.y);
      if (d > R || !los(n.x, n.y, e.x, e.y)) continue;
      this.hurt(e, 120 * (1 - d / R) * (e === n.owner ? .5 : 1), n.owner, 'frag', e.x - n.x, e.y - n.y);
    }
    this.emit('boom', { x: n.x, y: n.y, r: R });
  }

  // ---------- the charge ----------
  canPlant(e) { return this.bomb.state === 'carried' && this.bomb.carrier === e && !!siteAt(e.x, e.y); }
  canDefuse(e) { return this.bomb.state === 'planted' && this.role(e) === 'def' && Math.hypot(e.x - this.bomb.x, e.y - this.bomb.y) < 52; }
  plant(e) {
    const b = this.bomb; b.state = 'planted'; b.x = e.x; b.y = e.y; b.carrier = null; b.t = RULES.chargeTime; b.site = siteAt(e.x, e.y); b.beep = 0;
    this.pay(e, RULES.plantReward);
    this.timer = RULES.chargeTime;
    this.emit('planted', { e, site: b.site });
  }
  defuse(e) { this.bomb.state = 'defused'; this.emit('defused', { e }); if (this.phase === 'live') this.endRound(1 - this.atkTeam, 'defused'); }
  stepBomb(dt) {
    const b = this.bomb;
    if (b.state === 'dropped') {
      for (const e of this.ents) if (e.alive && this.role(e) === 'atk' && Math.hypot(e.x - b.x, e.y - b.y) < 34) { b.state = 'carried'; b.carrier = e; this.emit('pickup', { e }); break; }
    } else if (b.state === 'planted' && this.phase === 'live') {
      b.t -= dt; b.beep -= dt;
      if (b.beep <= 0) { b.beep = Math.max(.12, b.t / RULES.chargeTime * 1.1); b.pulse = 1; this.emit('beep', b); }
      if (b.t <= 0) {
        b.state = 'exploded';
        for (const e of this.ents) { if (!e.alive) continue; const d = Math.hypot(e.x - b.x, e.y - b.y); if (d < 420) this.hurt(e, 400 * (1 - d / 420), null, 'charge', e.x - b.x, e.y - b.y); }
        this.emit('boom', { x: b.x, y: b.y, r: 420, big: true });
        this.endRound(this.atkTeam, 'exploded');
      }
    }
    if (b.pulse > 0) b.pulse -= dt * 3;
  }

  // ---------- round flow ----------
  checkWin() {
    const atk = this.alive(this.atkTeam).length, def = this.alive(1 - this.atkTeam).length;
    const planted = this.bomb.state === 'planted';
    if (def === 0) return this.endRound(this.atkTeam, 'wipe');
    if (!planted && atk === 0) return this.endRound(1 - this.atkTeam, 'wipe');
    if (!planted && this.timer <= 0) return this.endRound(1 - this.atkTeam, 'time');
  }
  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    this.phase = 'end'; this.timer = RULES.endTime; this.score[winner]++;
    this.lastWin = { winner, reason };
    for (const e of this.ents) this.pay(e, e.team === winner ? RULES.winReward : RULES.lossReward);
    this.emit('roundend', { winner, reason });
  }
  afterRound() {
    if (Math.max(...this.score) >= RULES.winScore) {
      this.over = true; this.winner = this.score[0] > this.score[1] ? 0 : 1;
      this.emit('matchend', { winner: this.winner });
      return;
    }
    if (this.round === RULES.swapAfter) {
      this.atkTeam = 1 - this.atkTeam;
      for (const e of this.ents) { e.alive = true; this.resetGear(e, true); }
      this.emit('swap_sides', {});
    }
    this.newRound();
  }
}
