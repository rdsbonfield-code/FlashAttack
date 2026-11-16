// Flash Attack — bot brains: A* navigation, objective play, gunfights
import { TILE, WEAPONS } from './config.js';
import { MW, MH, solid, los, SITES, angDiff, rand, pick } from './game.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function findPath(sx, sy, gx, gy) {
  const s = sy * MW + sx, g = gy * MW + gx;
  if (s === g || solid(gx, gy)) return [];
  const N = MW * MH, cost = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  cost[s] = 0;
  const open = [s];
  const h = i => Math.hypot((i % MW) - gx, ((i / MW) | 0) - gy);
  while (open.length) {
    let bi = 0, bf = 1e9;
    for (let i = 0; i < open.length; i++) { const f = cost[open[i]] + h(open[i]); if (f < bf) { bf = f; bi = i; } }
    const cur = open.splice(bi, 1)[0];
    if (cur === g) break;
    if (done[cur]) continue; done[cur] = 1;
    const cx = cur % MW, cy = (cur / MW) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (solid(nx, ny)) continue;
      if (dx && dy && (solid(cx + dx, cy) || solid(cx, cy + dy))) continue;
      const ni = ny * MW + nx, c = cost[cur] + (dx && dy ? 1.414 : 1);
      if (c < cost[ni]) { cost[ni] = c; from[ni] = cur; open.push(ni); }
    }
  }
  if (from[g] < 0) return [];
  const path = [];
  for (let i = g; i !== s; i = from[i]) path.push({ x: (i % MW + .5) * TILE, y: (((i / MW) | 0) + .5) * TILE });
  return path.reverse();
}

// Can a body-width circle walk the straight line?
function walkClear(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), n = Math.ceil(d / 16), r = 23;
  for (let i = 1; i <= n; i++) {
    const x = x0 + dx * i / n, y = y0 + dy * i / n;
    if (solid(Math.floor((x - r) / TILE), Math.floor((y - r) / TILE)) || solid(Math.floor((x + r) / TILE), Math.floor((y - r) / TILE)) ||
      solid(Math.floor((x - r) / TILE), Math.floor((y + r) / TILE)) || solid(Math.floor((x + r) / TILE), Math.floor((y + r) / TILE))) return false;
  }
  return true;
}

export function resetBot(g, e) {
  const keepSite = e.ai.site;
  e.ai = {
    ctrl: { mx: 0, my: 0, aimAng: e.ang, fire: false, reload: false, swap: false, throw: null, action: false, power: 1 },
    site: keepSite, target: null, react: 0, scanT: Math.random() * .1, aimErr: 0, aimErrT: 0,
    lastSeen: null, lastSeenT: 0, strafe: Math.random() < .5 ? 1 : -1, strafeT: 0, nadeCd: rand(2, 6),
    path: null, pathKey: '', repathT: 0, stuckT: 0, sx: e.x, sy: e.y, holdSpot: null, holdSite: null, sweep: Math.random() * 6,
    alert: null, skill: rand(.75, 1.25), rotator: Math.random() < .7, peekDelay: rand(0, 1.5),
  };
}

function holdSpotFor(e, siteId) {
  const ai = e.ai;
  if (ai.holdSite !== siteId || !ai.holdSpot) { ai.holdSite = siteId; ai.holdSpot = pick(SITES[siteId].hold); }
  return ai.holdSpot;
}

function pickGoal(g, e) {
  const ai = e.ai, b = g.bomb, role = g.role(e);
  if (role === 'atk') {
    if (b.state === 'dropped') {
      let best = null, bd = 1e9;
      for (const o of g.ents) if (o.alive && o.team === e.team && !o.isPlayer) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; best = o; } }
      if (best === e) return { x: b.x, y: b.y, mode: 'fetch' };
    }
    if (b.state === 'planted') { const s = holdSpotFor(e, b.site); return { x: s.x, y: s.y, mode: 'hold' }; }
    // follow a human carrier's call if they commit to the other site
    const c = b.carrier;
    if (c && c.isPlayer) {
      const other = g.plan.site === 'A' ? 'B' : 'A', so = SITES[other], sp = SITES[g.plan.site];
      if (Math.hypot(c.x - so.cx, c.y - so.cy) + 300 < Math.hypot(c.x - sp.cx, c.y - sp.cy)) g.plan.site = other;
    }
    const site = SITES[g.plan.site];
    if (c === e) {
      if (!ai.plantSpot || ai.plantSite !== site.id) { const t = pick(site.tiles); ai.plantSpot = { x: (t.x + .5) * TILE, y: (t.y + .5) * TILE }; ai.plantSite = site.id; }
      return { x: ai.plantSpot.x, y: ai.plantSpot.y, mode: 'plant' };
    }
    const s = holdSpotFor(e, site.id);
    return { x: s.x, y: s.y, mode: 'hold' };
  }
  // guards
  if (b.state === 'planted') return { x: b.x, y: b.y, mode: 'defuse' };
  let siteId = ai.site || 'A';
  if (g.intel && ai.rotator) siteId = g.intel;
  const s = holdSpotFor(e, siteId);
  return { x: s.x, y: s.y, mode: 'hold' };
}

function navigate(g, e, gx, gy, dt) {
  const ai = e.ai, c = ai.ctrl;
  const key = Math.floor(gx / TILE) + ',' + Math.floor(gy / TILE);
  ai.repathT -= dt;
  if (!ai.path || ai.pathKey !== key || ai.repathT <= 0) {
    ai.path = findPath(Math.floor(e.x / TILE), Math.floor(e.y / TILE), Math.floor(gx / TILE), Math.floor(gy / TILE));
    if (ai.path.length) ai.path[ai.path.length - 1] = { x: gx, y: gy }; else ai.path = [{ x: gx, y: gy }];
    ai.pathKey = key; ai.repathT = 2.5;
  }
  while (ai.path.length > 1 && walkClear(e.x, e.y, ai.path[1].x, ai.path[1].y)) ai.path.shift();
  let wp = ai.path[0];
  let dx = wp.x - e.x, dy = wp.y - e.y, d = Math.hypot(dx, dy);
  if (d < 16 && ai.path.length > 1) { ai.path.shift(); wp = ai.path[0]; dx = wp.x - e.x; dy = wp.y - e.y; d = Math.hypot(dx, dy); }
  const total = Math.hypot(gx - e.x, gy - e.y);
  if (total > 10 && d > .1) { c.mx = dx / d; c.my = dy / d; }
  // unstick
  ai.stuckT += dt;
  if (ai.stuckT > 1) {
    if (total > 30 && Math.hypot(e.x - ai.sx, e.y - ai.sy) < 12) { ai.path = null; c.mx = rand(-1, 1); c.my = rand(-1, 1); }
    ai.stuckT = 0; ai.sx = e.x; ai.sy = e.y;
  }
  return total;
}

function turnTo(e, c, want, rate, dt) {
  const d = angDiff(want, e.ang), step = rate * dt;
  c.aimAng = Math.abs(d) < step ? want : e.ang + Math.sign(d) * step;
}

export function botThink(g, e, dt) {
  const ai = e.ai, c = ai.ctrl, w = WEAPONS[e.slots[e.cur].id], slot = e.slots[e.cur];
  c.mx = c.my = 0; c.fire = false; c.reload = false; c.swap = false; c.throw = null; c.action = false; c.aimAng = e.ang;
  ai.nadeCd -= dt; ai.lastSeenT -= dt;

  if (g.phase === 'end' && !ai.target && g.lastWin && g.lastWin.winner !== e.team) { /* losers keep fighting below */ }

  // blinded: stumble and maybe spray
  if (e.blindT > .35) {
    ai.target = null; ai.sweep += dt;
    c.mx = Math.cos(ai.sweep * 3 + e.id) * .5; c.my = Math.sin(ai.sweep * 2.3 + e.id) * .5;
    c.aimAng = e.ang + Math.sin(ai.sweep * 6 + e.id) * .06;
    c.fire = ai.lastSeenT > 1.5 && Math.random() < .3;
    return c;
  }

  // perception
  ai.scanT -= dt;
  if (ai.scanT <= 0) {
    ai.scanT = .1;
    let best = null, bd = 1e9;
    for (const o of g.ents) {
      if (!o.alive || o.team === e.team) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d > 1050 || d >= bd) continue;
      const off = Math.abs(angDiff(Math.atan2(o.y - e.y, o.x - e.x), e.ang));
      if (off > 1.8 && d > 240) continue;
      if (!los(e.x, e.y, o.x, o.y)) continue;
      bd = d; best = o;
    }
    if (best !== ai.target) { if (best) ai.react = (rand(.22, .5) + (w.rate > 1 ? .15 : 0)) / ai.skill; ai.target = best; }
    if (best) {
      ai.lastSeen = { x: best.x, y: best.y }; ai.lastSeenT = 3.5;
      if (g.role(e) === 'def' && g.bomb.state !== 'planted') for (const s of Object.values(SITES)) if (Math.hypot(best.x - s.cx, best.y - s.cy) < 520) g.intel = s.id;
    }
  }
  if (ai.target && !ai.target.alive) ai.target = null;

  const goal = pickGoal(g, e);
  const busy = e.acting && e.actT > (e.actNeed || 3) * .55;

  if (ai.target && !busy) {
    const t = ai.target, dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
    ai.aimErrT -= dt;
    if (ai.aimErrT <= 0) { ai.aimErrT = rand(.2, .45); ai.aimErr = rand(-1, 1) * .085 * (.5 + d / 600) / ai.skill; }
    // lead the target a little
    const lead = d / w.speed * .7;
    const want = Math.atan2(dy + t.vy * lead, dx + t.vx * lead) + ai.aimErr;
    turnTo(e, c, want, 8.5, dt);
    ai.react -= dt;
    if (ai.react <= 0 && Math.abs(angDiff(want, c.aimAng)) < .14 && d < w.range * 1.05) c.fire = true;
    // dance
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafeT = rand(.4, 1.1); ai.strafe = -ai.strafe; }
    const pref = Math.min(w.range * .62, 420), nx = dx / d, ny = dy / d;
    let fwd = d > pref * 1.25 ? .9 : d < pref * .55 ? -.8 : 0;
    if (w.rate > 1) fwd = d < 300 ? -1 : 0;
    c.mx = nx * fwd - ny * ai.strafe * .75; c.my = ny * fwd + nx * ai.strafe * .75;
    if (ai.nadeCd <= 0 && d > 260 && d < 640) {
      ai.nadeCd = rand(5, 9);
      if (e.flash > 0 && Math.random() < .35) { c.throw = 'flash'; c.power = Math.min(1, d / 460); }
      else if (e.frag > 0 && Math.random() < .3) { c.throw = 'frag'; c.power = Math.min(1, d / 440); }
    }
    if (slot.mag === 0 && e.cur === 0 && d < 380 && e.slots[1].mag > 0) c.swap = true;
    ai.path = null;
    return c;
  }

  // no target: chase a fresh sighting unless the objective comes first
  let gx = goal.x, gy = goal.y;
  const objective = goal.mode === 'plant' || goal.mode === 'defuse' || goal.mode === 'fetch';
  if (!objective && ai.lastSeenT > 0 && ai.lastSeen) { gx = ai.lastSeen.x; gy = ai.lastSeen.y; }
  const dist = navigate(g, e, gx, gy, dt);

  if (goal.mode === 'plant' && g.canPlant(e) && dist < 30) { c.action = true; c.mx = c.my = 0; }
  if (goal.mode === 'defuse' && g.canDefuse(e)) { c.action = true; c.mx = c.my = 0; }
  if (dist < 26 && ai.lastSeenT > 0 && !objective) ai.lastSeenT = 0;

  // where to look
  let want = e.ang;
  if (ai.alert != null) { want = ai.alert; ai.alertT = (ai.alertT || 0) + dt; if (ai.alertT > 1) { ai.alert = null; ai.alertT = 0; } }
  else if (Math.hypot(c.mx, c.my) > .2) want = Math.atan2(c.my, c.mx);
  else { ai.sweep += dt; want = e.ang + Math.sin(ai.sweep * 1.3 + e.id) * 2.2 * dt * 3; }
  turnTo(e, c, want, 7, dt);

  if (slot.mag < WEAPONS[slot.id].mag * .45 && e.reloadT <= 0) c.reload = true;
  if (e.cur === 1 && e.slots[0] && e.reloadT <= 0) c.swap = true;
  return c;
}
