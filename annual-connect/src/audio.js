/* Annual Connect — sound.
   The wall plays its music quietly on a loop. Tracks live in assets/music/ and are listed in TRACKS; with more
   than one they play in turn. If no track can be loaded, a built-in ambient bed plays instead so the Sound
   control always does something. The bed is synthesised in the browser and is a stand-in, not the score.

   Browsers will not start sound without a gesture, so sound always begins from a click or a key press. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const TRACKS = (AC.MUSIC && AC.MUSIC.length) ? AC.MUSIC : ['assets/music/annual-connect.mp3'];
  const VOLUME = 0.6, FADE_IN = 3.5, FADE_OUT = 1.4, LOOP_FADE = 2.5;
  const store = { get(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }, set(k, v){ try { localStorage.setItem(k, v); } catch (e){} } };

  /* ---------- the stand-in bed: a slow, warm progression with a soft pulse and a few high notes ---------- */
  const hz = n => 440*Math.pow(2, (n - 69)/12);                       // MIDI note to frequency
  const CHORDS = [                                                    // D · A · Bm · G, eight seconds each
    { root: 38, notes: [50, 57, 62, 66, 69, 76], high: [74, 78, 81, 86] },
    { root: 33, notes: [45, 52, 57, 61, 64, 71], high: [73, 76, 81, 85] },
    { root: 35, notes: [47, 54, 59, 62, 66, 73], high: [74, 78, 83, 86] },
    { root: 31, notes: [43, 50, 55, 59, 62, 69], high: [74, 79, 83, 86] }
  ];
  const BAR = 8, BEAT = 0.75;
  function buildBed(ctx, out){
    const bus = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.3;
    const dry = ctx.createGain(); dry.gain.value = 0.62; const wet = ctx.createGain(); wet.gain.value = 0.55;
    const verb = ctx.createConvolver();
    { const len = Math.floor(ctx.sampleRate*3.2), buf = ctx.createBuffer(2, len, ctx.sampleRate); let seed = 12345; const rnd = () => ((seed = (seed*16807) % 2147483647)/2147483647)*2 - 1;
      for (let c = 0; c < 2; c++){ const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = rnd()*Math.pow(1 - i/len, 2.6); } verb.buffer = buf; }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
    bus.connect(lp); lp.connect(dry); lp.connect(verb); verb.connect(wet); dry.connect(comp); wet.connect(comp); comp.connect(out);
    function tone(type, freq, t, dur, peak, attack, release, detune){
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, Math.max(t + attack, t + dur - release)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    }
    /* Schedule everything that starts in [from, to) on the bed's own clock; base is where that clock began. */
    function schedule(from, to, base){
      base = base || 0;
      for (let bar = Math.max(0, Math.floor(from/BAR)); bar*BAR < to; bar++){ const t = bar*BAR, ch = CHORDS[bar % CHORDS.length];
        if (t >= from) ch.notes.forEach((n, i) => { tone('sine', hz(n), base + t, BAR + 3.2, 0.05, 2.6, 3.4, -4); tone('triangle', hz(n), base + t, BAR + 3.2, 0.018, 3.2, 3.4, 5 + i); });
        for (let b = 0; b*BEAT < BAR; b++){ const tb = t + b*BEAT; if (tb < from || tb >= to) continue;
          tone('triangle', hz(ch.root), base + tb, 0.62, b % 4 === 0 ? 0.11 : 0.06, 0.012, 0.5);                            // the pulse
          if (b % 3 === 1 || (bar % 2 === 1 && b % 4 === 2)) tone('sine', hz(ch.high[(bar*3 + b*5) % ch.high.length]), base + tb, 3.0, 0.03, 0.02, 2.8); } }
    }
    return { schedule };
  }

  function create(opts){
    const onState = (opts && opts.onState) || (() => {});
    let ctx = null, master = null, bed = null, bedTimer = 0, bedBase = 0, bedUntil = 0;
    let el = null, mode = 'off', on = false, level = 0, target = 0, swell = 1, swellNow = 1, raf = 0, last = 0, label = '';

    function loop(now){
      const dt = Math.min(0.1, (now - last)/1000); last = now;
      const rate = target > level ? 1/FADE_IN : 1/FADE_OUT; level += Math.sign(target - level)*Math.min(Math.abs(target - level), dt*rate);
      swellNow += (swell - swellNow)*Math.min(1, dt/2.5);
      let v = level*level*VOLUME*swellNow;                             // an eased fade
      if (el && isFinite(el.duration) && el.duration > LOOP_FADE*3){ const left = el.duration - el.currentTime; v *= Math.min(1, el.currentTime/LOOP_FADE + 0.02, left/LOOP_FADE + 0.02); }   // breathe across the loop point
      if (el) el.volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = mode === 'bed' ? Math.min(1.2, v*1.5) : 0;
      if (level <= 0 && target <= 0){ raf = 0; if (el) el.pause(); if (ctx && ctx.state === 'running') ctx.suspend(); clearInterval(bedTimer); bedTimer = 0; return; }
      raf = requestAnimationFrame(loop);
    }
    const run = () => { if (!raf){ last = performance.now(); raf = requestAnimationFrame(loop); } };

    function startBed(){
      mode = 'bed'; label = 'Built-in ambient bed';
      if (!ctx){ const C = window.AudioContext || window.webkitAudioContext; if (!C){ mode = 'off'; on = false; target = 0; return onState({ on: false, mode: 'none', label: 'This browser cannot play sound' }); }
        ctx = new C(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); bed = buildBed(ctx, master); bedBase = ctx.currentTime + 0.1; bedUntil = 0; }
      if (ctx.state !== 'running') ctx.resume();
      const pump = () => { const now = Math.max(0, ctx.currentTime - bedBase), to = now + 1.5; if (to > bedUntil){ bed.schedule(Math.max(bedUntil, now), to, bedBase); bedUntil = to; } };
      clearInterval(bedTimer); bedTimer = setInterval(pump, 400); pump(); onState({ on: true, mode, label });
    }

    function tryTrack(i){
      if (i >= TRACKS.length) return startBed();
      const a = new Audio(); a.preload = 'auto'; a.loop = TRACKS.length === 1; a.volume = 0; let settled = false;
      const fail = () => { if (settled) return; settled = true; a.removeAttribute('src'); tryTrack(i + 1); };
      a.addEventListener('error', fail, { once: true });
      a.addEventListener('canplay', () => { if (settled) return; settled = true; if (!on) return; el = a; mode = 'track';
        label = decodeURIComponent(TRACKS[i].split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '));
        a.addEventListener('ended', () => { if (TRACKS.length > 1 && on){ el = null; tryTrack((i + 1) % TRACKS.length); } });
        Promise.resolve(a.play()).then(() => onState({ on: true, mode, label }), () => { el = null; startBed(); }); }, { once: true });
      setTimeout(fail, 8000); a.src = TRACKS[i]; a.load();
    }

    const api = {
      get on(){ return on; }, get mode(){ return mode; }, get label(){ return label; }, get level(){ return level; },
      /* Must be called from a click or a key press. */
      start(){ if (on) return; on = true; target = 1; store.set('ac-sound', '1'); run();
        if (el){ Promise.resolve(el.play()).catch(() => {}); onState({ on: true, mode, label }); } else if (mode === 'bed') startBed(); else { onState({ on: true, mode: 'loading', label: 'Loading' }); tryTrack(0); } },
      stop(){ if (!on) return; on = false; target = 0; store.set('ac-sound', '0'); run(); onState({ on: false, mode, label }); },
      toggle(){ if (on) api.stop(); else api.start(); },
      /* A gentle lift for the closing; 1 is normal. */
      swell(v){ swell = v; },
      wanted(){ return store.get('ac-sound') === '1'; },
      /* Fade away while the page is hidden, come back when it returns. */
      hidden(h){ if (!on) return; target = h ? 0 : 1; if (!h){ if (el) Promise.resolve(el.play()).catch(() => {}); if (mode === 'bed') startBed(); } run(); }
    };
    return api;
  }

  AC.audio = { create, buildBed, TRACKS };
})(window.AC);
