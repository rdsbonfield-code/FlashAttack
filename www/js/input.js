// Flash Attack — twin-stick touch controls + keyboard/mouse for desktop testing
export class Input {
  constructor(canvas) {
    this.cv = canvas;
    this.move = { on: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, hot: false };
    this.aim = { on: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, hot: false, t0: 0, moved: 0 };
    this.keys = {}; this.mouse = { x: 0, y: 0, down: false, used: false };
    this.tapFire = 0; this.touchMode = false; this.radius = 52;
    this.pressed = { reload: false, swap: false, flash: false, frag: false }; this.actionHeld = false;

    const opt = { passive: false };
    canvas.addEventListener('touchstart', e => this.onTouch(e, 0), opt);
    canvas.addEventListener('touchmove', e => this.onTouch(e, 1), opt);
    canvas.addEventListener('touchend', e => this.onTouch(e, 2), opt);
    canvas.addEventListener('touchcancel', e => this.onTouch(e, 2), opt);
    canvas.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.used = true; });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) this.mouse.down = true; this.mouse.used = true; });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase(); if (this.keys[k]) return; this.keys[k] = true;
      if (k === 'r') this.pressed.reload = true; if (k === 'q') this.pressed.swap = true;
      if (k === 'f') this.pressed.flash = true; if (k === 'g') this.pressed.frag = true;
      if (this.onKey) this.onKey(k);
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
  }

  onTouch(e, phase) {
    e.preventDefault(); this.touchMode = true;
    const now = performance.now(), R = this.radius;
    for (const t of e.changedTouches) {
      if (phase === 0) {
        const s = t.clientX < window.innerWidth / 2 ? this.move : this.aim;
        if (s.on) continue;
        Object.assign(s, { on: true, id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0, hot: false, t0: now, moved: 0 });
      } else {
        const s = this.move.id === t.identifier && this.move.on ? this.move : this.aim.id === t.identifier && this.aim.on ? this.aim : null;
        if (!s) continue;
        if (phase === 1) {
          let dx = (t.clientX - s.ox) / R, dy = (t.clientY - s.oy) / R; const l = Math.hypot(dx, dy);
          s.moved = Math.max(s.moved, l);
          if (l > 1) { // stick base trails the thumb
            s.ox += (dx - dx / l) * R; s.oy += (dy - dy / l) * R; dx /= l; dy /= l;
          }
          s.dx = dx; s.dy = dy; if (s === this.aim) s.hot = l > .45;
        } else {
          if (s === this.aim && now - s.t0 < 220 && s.moved < .3) this.tapFire = .35; // quick tap = snap shot
          s.on = false; s.dx = s.dy = 0; s.hot = false; s.id = null;
        }
      }
    }
  }

  // Build a control frame for the player. `assist(angle)` returns nearest visible enemy angle or null.
  frame(player, screen, dt, nearest) {
    const c = { mx: 0, my: 0, aimAng: player.ang, fire: false, reload: this.pressed.reload, swap: this.pressed.swap, throw: this.pressed.flash ? 'flash' : this.pressed.frag ? 'frag' : null, action: this.actionHeld || !!this.keys['e'], power: 1 };
    this.pressed.reload = this.pressed.swap = this.pressed.flash = this.pressed.frag = false;
    const k = this.keys;
    c.mx = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0) + this.move.dx;
    c.my = (k['s'] || k['arrowdown'] ? 1 : 0) - (k['w'] || k['arrowup'] ? 1 : 0) + this.move.dy;
    this.tapFire = Math.max(0, this.tapFire - dt);
    const diff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

    if (this.touchMode) {
      const a = this.aim, al = Math.hypot(a.dx, a.dy);
      if (a.on && al > .18) {
        let ang = Math.atan2(a.dy, a.dx);
        if (nearest != null && Math.abs(diff(nearest, ang)) < .22) ang += diff(nearest, ang) * .6; // gentle aim assist
        c.aimAng = ang; c.fire = a.hot; c.power = Math.min(1, al);
      } else if (nearest != null) {
        c.aimAng = player.ang + diff(nearest, player.ang) * Math.min(1, dt * 14);
        if (this.tapFire > 0) c.fire = true;
      } else if (Math.hypot(c.mx, c.my) > .25) {
        c.aimAng = player.ang + diff(Math.atan2(c.my, c.mx), player.ang) * Math.min(1, dt * 10);
        if (this.tapFire > 0) c.fire = true;
      } else if (this.tapFire > 0) c.fire = true;
    } else if (this.mouse.used) {
      c.aimAng = Math.atan2(this.mouse.y - screen.y, this.mouse.x - screen.x);
      c.fire = this.mouse.down;
      c.power = Math.min(1, Math.hypot(this.mouse.y - screen.y, this.mouse.x - screen.x) / (screen.scale * 460));
    }
    return c;
  }
}
