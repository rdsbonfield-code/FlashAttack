// Flash Attack — app shell: loop, menus, buy screen, event wiring
import { WEAPONS, ITEMS, RULES } from './config.js';
import { Game, angDiff, rand } from './game.js';
import { Renderer, TEAM } from './render.js';
import { Input } from './input.js';
import { sfx, unlock, setMuted, muted } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const R = new Renderer(canvas);
const input = new Input(canvas);
let game = null, viewer = null, buyOpen = false, sideSwapped = false;
const ui = { viewer: null, sticks: [input.move, input.aim], safeTop: 0, safeLeft: 0, safeRight: 0, safeBottom: 0 };

function resize() {
  R.resize(); input.radius = 52 * R.u;
  const cs = getComputedStyle($('probe'));
  ui.safeTop = parseFloat(cs.paddingTop) || 0; ui.safeRight = parseFloat(cs.paddingRight) || 0;
  ui.safeBottom = parseFloat(cs.paddingBottom) || 0; ui.safeLeft = parseFloat(cs.paddingLeft) || 0;
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { R.buildMap(); });

// distance-based loudness relative to whoever we are watching
function vol(x, y) { const v = viewer || R.cam; return Math.max(0, 1 - Math.hypot(x - v.x, y - v.y) / 1500); }
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* unsupported */ } };

function onEvent(type, d) {
  const g = game, p = g.player;
  switch (type) {
    case 'round': {
      const role = g.role(p) === 'atk' ? 'You are RAIDING' : 'You are GUARDING';
      R.showBanner('ROUND ' + d.n, (sideSwapped ? 'Sides switched! ' : '') + role, '#7257f5', 2.2); sideSwapped = false;
      R.decals.length = 0; openBuy(true); break;
    }
    case 'swap_sides': sideSwapped = true; break;
    case 'go': {
      openBuy(false); sfx.go();
      const atk = g.role(p) === 'atk';
      R.showBanner('GO GO GO!', atk ? (d.carrier === p ? `You carry the charge · team pushes ${d.site}` : `Team is pushing ${d.site}`) : 'Hold the sites', '#39b98a', 1.8); break;
    }
    case 'shot': {
      const e = d.e; sfx.shot(d.wid, vol(e.x, e.y) * (e === p ? 1 : .7));
      R.add({ kind: 'muzzle', x: d.x, y: d.y, a: e.ang, size: d.wid === 'longshot' || d.wid === 'thumper' ? 34 : 22, life: .07 });
      if (e === p) R.shake = Math.max(R.shake, d.wid === 'longshot' ? 9 : d.wid === 'thumper' ? 7 : 2.5);
      break;
    }
    case 'impact': R.burst(d.x, d.y, 4, '#fff6a8', 180, 4, .25); break;
    case 'hit': {
      const e = d.e;
      R.burst(e.x, e.y, 5, TEAM[e.team].light, 200, 5, .3);
      if (e === p) { R.hurtT = 1; R.shake = Math.max(R.shake, 7); sfx.hurt(); buzz(30); }
      else if ((R.vis.get(e.id) || 0) > .3) R.text(e.x + rand(-12, 12), e.y - 34, String(d.dmg), d.by === p ? '#fff36b' : '#fff', d.dmg > 60 ? 34 : 22);
      if (d.by === p && e !== p) sfx.hit();
      break;
    }
    case 'kill': {
      const e = d.e, tc = TEAM[e.team];
      R.burst(e.x, e.y, 16, tc.main, 320, 9, .55); R.burst(e.x, e.y, 8, '#fff', 260, 6, .4);
      R.ring(e.x, e.y, 70, tc.light, .35, 12);
      R.decals.push({ x: e.x, y: e.y, r: 26, a: Math.random() * 3, color: tc.dark });
      sfx.kill(Math.max(.3, vol(e.x, e.y)));
      if (d.by === p && e !== p) { R.text(e.x, e.y - 60, '+$' + RULES.killReward, '#8dffb0', 26); buzz(40); }
      if (e === p) buzz(200);
      break;
    }
    case 'reload': if (d.e === p) sfx.reload(); break;
    case 'buy': sfx.buy(); break;
    case 'throw': if (vol(d.e.x, d.e.y) > .3) sfx.throw(); break;
    case 'bounce': sfx.bounce(vol(d.x, d.y)); break;
    case 'flash': {
      R.ring(d.x, d.y, 260, '#fff', .45, 26); R.burst(d.x, d.y, 18, '#fff', 520, 8, .45);
      R.add({ x: d.x, y: d.y, size: 60, grow: 3, color: 'rgba(255,255,255,.8)', life: .25 });
      const got = viewer && d.hit.includes(viewer);
      sfx.flash(Math.max(.25, vol(d.x, d.y)), got); if (got && viewer === p) buzz(80);
      break;
    }
    case 'boom': {
      R.ring(d.x, d.y, d.r, '#ffb020', .5, 30); R.ring(d.x, d.y, d.r * .6, '#fff6a8', .35, 20);
      R.burst(d.x, d.y, d.big ? 60 : 26, '#ff9d2e', d.big ? 900 : 520, 14, .7); R.burst(d.x, d.y, 14, '#39344f', 300, 18, .9);
      R.decals.push({ x: d.x, y: d.y, r: d.big ? 110 : 60, a: 0, color: '#3b2f5c' });
      const v = vol(d.x, d.y); R.shake = Math.max(R.shake, (d.big ? 30 : 16) * v); sfx.boom(Math.max(.2, v), d.big);
      break;
    }
    case 'planted': R.showBanner('CHARGE PLANTED', `Site ${d.site} · ${RULES.chargeTime}s on the clock`, '#ff4d6a', 2.2); sfx.planted(); break;
    case 'beep': sfx.beep(Math.max(.15, vol(d.x, d.y))); break;
    case 'defused': sfx.defused(); break;
    case 'pickup': if (d.e === p) R.showBanner('YOU GOT THE CHARGE', 'Plant it at A or B', '#ffb020', 1.6); break;
    case 'roundend': {
      const won = d.winner === p.team;
      const why = { wipe: 'Enemy team eliminated', time: 'Time ran out', defused: 'Charge defused', exploded: 'Charge detonated' }[d.reason];
      R.showBanner(won ? 'ROUND WON!' : 'ROUND LOST', (won ? why : d.reason === 'wipe' ? 'Your team was eliminated' : why) + `  ·  ${g.score[0]} – ${g.score[1]}`, won ? TEAM[0].main : TEAM[1].main, 3.6);
      won ? sfx.win() : sfx.lose(); break;
    }
    case 'matchend': showEnd(); break;
  }
}

// ---------- buy screen ----------
const STAT = w => [Math.min(1, w.dmg * w.pellets / 105), Math.min(1, .09 / w.rate), Math.min(1, w.range / 1400), Math.min(1, w.mag / 30)];
function buildCards() {
  const box = $('cards'); box.innerHTML = '';
  const mk = (id, cls, html) => {
    const b = document.createElement('button'); b.className = 'card stroke ' + cls; b.dataset.id = id; b.innerHTML = html;
    b.addEventListener('click', () => { if (!game.buy(game.player, id)) sfx.deny(); refreshBuy(); });
    box.appendChild(b);
  };
  for (const [id, w] of Object.entries(WEAPONS)) {
    if (id === 'pip') continue;
    mk(id, '', `${w.name}<i>${w.kind}</i><div class="stats">${STAT(w).map(v => `<u><s style="width:${Math.round(v * 100)}%"></s></u>`).join('')}</div><em>$${w.price}</em>`);
  }
  for (const [id, it] of Object.entries(ITEMS)) mk(id, 'item', `${it.name}<i>${it.desc}</i><em>$${it.price}</em>`);
}
function refreshBuy() {
  if (!game) return; const p = game.player;
  $('buy-cash').textContent = '$' + p.money;
  for (const b of $('cards').children) {
    const id = b.dataset.id, it = WEAPONS[id] || ITEMS[id];
    const own = WEAPONS[id] ? (p.slots[0] && p.slots[0].id === id) : id === 'vest' ? p.armor >= 50 : id === 'kit' ? p.kit : p[id] >= it.max;
    b.classList.toggle('own', !!own);
    b.classList.toggle('poor', !own && (p.money < it.price || (id === 'kit' && game.role(p) !== 'def')));
    const em = b.querySelector('em');
    em.textContent = own ? 'OWNED' : (id === 'kit' && game.role(p) !== 'def') ? 'GUARDS ONLY' : (ITEMS[id] && it.max > 1 ? `$${it.price} · ${p[id]}/${it.max}` : '$' + it.price);
  }
}
function openBuy(on) {
  buyOpen = on && game && game.phase === 'buy';
  $('buy').classList.toggle('hidden', !buyOpen);
  if (buyOpen) refreshBuy();
}

// ---------- menus ----------
function startMatch(attack) {
  unlock(); sfx.click();
  game = new Game(onEvent); window.__game = game;
  R.fx.length = 0; R.decals.length = 0; R.vis.clear(); R.whiteT = 0;
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('btns').classList.remove('hidden');
  game.start(attack);
}
function showEnd() {
  const g = game, won = g.winner === 0;
  $('end-title').textContent = won ? 'VICTORY!' : 'DEFEAT'; $('end-title').style.color = won ? 'var(--gold)' : 'var(--red)';
  $('end-score').innerHTML = `<span style="color:var(--blue)">${g.score[0]}</span> – <span style="color:var(--red)">${g.score[1]}</span>`;
  const rows = g.ents.slice().sort((a, b) => a.team - b.team || b.kills - a.kills);
  $('end-table').innerHTML = '<tr><th></th><th>KOs</th><th>Downs</th></tr>' + rows.map(e => `<tr class="t${e.team}${e.isPlayer ? ' me' : ''}"><td>${e.name}</td><td>${e.kills}</td><td>${e.deaths}</td></tr>`).join('');
  $('end').classList.remove('hidden'); $('btns').classList.add('hidden'); openBuy(false);
  won ? sfx.win() : sfx.lose();
}
$('play-atk').addEventListener('click', () => startMatch(true));
$('play-def').addEventListener('click', () => startMatch(false));
$('again').addEventListener('click', () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); game = null; });
$('buy-close').addEventListener('click', () => { sfx.click(); openBuy(false); });
$('b-buy').addEventListener('click', () => { sfx.click(); openBuy(true); });
$('b-mute').addEventListener('click', () => { setMuted(!muted); $('b-mute').style.opacity = muted ? .4 : 1; });
for (const b of document.querySelectorAll('[data-press]')) {
  const fire = e => { e.preventDefault(); input.pressed[b.dataset.press] = true; };
  b.addEventListener('touchstart', fire, { passive: false }); b.addEventListener('mousedown', fire);
}
{
  const a = $('b-act');
  const set = on => e => { e.preventDefault(); input.actionHeld = on; a.classList.toggle('down', on); };
  a.addEventListener('touchstart', set(true), { passive: false }); a.addEventListener('mousedown', set(true));
  for (const ev of ['touchend', 'touchcancel', 'mouseup', 'mouseleave']) a.addEventListener(ev, set(false));
}
input.onKey = k => { if (k === 'b' && game && game.phase === 'buy') openBuy(!buyOpen); if (k === 'm') $('b-mute').click(); };
window.addEventListener('pointerdown', unlock, { once: false });
buildCards();

// ---------- loop ----------
let last = performance.now(), uiT = 0;
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (game) {
    const p = game.player;
    viewer = p.alive ? p : game.ents.find(e => e.alive && e.team === p.team) || null;
    ui.viewer = viewer;
    // nearest visible enemy for aim assist
    let near = null, nd = 760;
    if (p.alive) for (const e of game.ents) {
      if (!e.alive || e.team === p.team || (R.vis.get(e.id) || 0) < .5) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < nd) { nd = d; near = Math.atan2(e.y - p.y, e.x - p.x); }
    }
    const scr = { x: R.W / 2 + (p.x - R.cam.x) * R.scale, y: R.H / 2 + (p.y - R.cam.y) * R.scale, scale: R.scale };
    const c = input.frame(p, scr, dt, near);
    if (buyOpen) { c.fire = false; c.throw = null; }
    game.input = c;
    game.update(dt);
    R.draw(game, ui, dt);

    uiT -= dt;
    if (uiT <= 0) {
      uiT = .1;
      const act = $('b-act'), can = p.alive && game.phase === 'live' && (game.canPlant(p) ? 'PLANT' : game.canDefuse(p) ? 'DEFUSE' : null);
      act.classList.toggle('hidden', !can); if (can) act.textContent = can; else input.actionHeld = false;
      $('b-buy').classList.toggle('hidden', !(game.phase === 'buy' && !buyOpen));
      if (game.phase !== 'buy' && buyOpen) openBuy(false);
      for (const id of ['flash', 'frag']) { const b = $('b-' + id); b.classList.toggle('off', !p[id]); b.querySelector('.cnt').textContent = p[id]; }
      $('b-swap').classList.toggle('off', !p.slots[0]);
      if (buyOpen) $('buy-cash').textContent = '$' + p.money;
    }
  }
  requestAnimationFrame(frame);
}
resize();
requestAnimationFrame(frame);
