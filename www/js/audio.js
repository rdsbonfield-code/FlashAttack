// Flash Attack — tiny synthesized sound kit (no audio files)
let ac = null, master = null, noiseBuf = null, ring = null;
export let muted = false;

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : .5; }

function env(g, t, a, d, vol) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f0, f1, dur, vol = .3, delay = 0) {
  if (!ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, .005, dur, vol); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
function noise(dur, vol = .3, freq = 2000, q = .7, type = 'lowpass', delay = 0) {
  if (!ac) return; const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, .003, dur, vol); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + .05);
}

// vol: 0..1 distance falloff supplied by caller
export const sfx = {
  shot(wid, vol = 1) {
    if (vol < .03) return;
    if (wid === 'pip') { tone('square', 620, 160, .09, .16 * vol); noise(.07, .22 * vol, 3200); }
    else if (wid === 'buzzer') { tone('sawtooth', 480, 140, .06, .12 * vol); noise(.05, .2 * vol, 4200); }
    else if (wid === 'thumper') { tone('square', 200, 50, .2, .25 * vol); noise(.22, .5 * vol, 1400); }
    else if (wid === 'lancer') { tone('sawtooth', 340, 80, .1, .18 * vol); noise(.1, .32 * vol, 2600); }
    else { tone('square', 260, 40, .35, .3 * vol); noise(.4, .55 * vol, 1800); tone('sine', 1800, 300, .3, .08 * vol); }
  },
  hit(vol = 1) { tone('triangle', 900, 500, .06, .2 * vol); },
  hurt() { tone('square', 180, 90, .14, .25); noise(.1, .2, 900); },
  kill(vol = 1) { tone('square', 520, 120, .22, .2 * vol); tone('triangle', 780, 1560, .12, .16 * vol, .05); },
  reload() { noise(.04, .2, 5000, 2, 'bandpass'); noise(.05, .25, 3000, 2, 'bandpass', .18); },
  click() { tone('triangle', 700, 900, .06, .2); },
  buy() { tone('triangle', 660, 660, .08, .22); tone('triangle', 990, 990, .12, .22, .08); },
  deny() { tone('square', 200, 150, .12, .15); },
  throw() { noise(.16, .18, 1500, 1, 'bandpass'); },
  bounce(vol = 1) { tone('triangle', 500, 300, .04, .12 * vol); },
  flash(vol = 1, blinded = false) {
    noise(.3, .6 * vol, 6000, .5, 'highpass'); tone('square', 1400, 300, .15, .2 * vol);
    if (blinded && ac) { // ear ring
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 3400; g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0001, t + 2.6);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.7);
    }
  },
  boom(vol = 1, big = false) { noise(big ? 1.4 : .6, .9 * vol, big ? 500 : 800); tone('sine', 120, 30, big ? 1.2 : .5, .6 * vol); },
  beep(vol = 1) { tone('square', 1250, 1250, .07, .13 * vol); },
  planted() { tone('square', 440, 440, .12, .2); tone('square', 330, 330, .12, .2, .14); tone('square', 220, 220, .25, .2, .28); },
  defused() { tone('triangle', 520, 520, .1, .25); tone('triangle', 780, 780, .1, .25, .1); tone('triangle', 1040, 1040, .25, .25, .2); },
  go() { tone('square', 520, 520, .08, .18); tone('square', 780, 780, .2, .18, .1); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, .18, .28, i * .11)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f, .22, .25, i * .14)); },
};
