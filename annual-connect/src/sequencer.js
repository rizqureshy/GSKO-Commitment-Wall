/* Annual Connect — presentation state machine and guided sequencer.
   States: GUIDED_OVERVIEW, GUIDED_FOCUS, GUIDED_THEME, GUIDED_ARRIVAL, MANUAL_EXPLORE, MANUAL_FOCUS, PAUSED.
   One timer at a time. Manual input always wins. Arrivals queue and never interrupt reading. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';

  const TIMING = {
    overviewGap: [10000, 15000],   // ms between automatic features when nothing is active
    focusIn: 2000,                 // ms focus transition
    returnOut: 1800,               // ms return transition
    breathe: 4500,                 // ms collective breathing after a return
    themeHold: 16000,              // ms for a shared intention
    arrivalHold: 11000,            // ms for a single arrival
    readTime(text){ const words = String(text).trim().split(/\s+/).length; return Math.max(12, 5 + words/2.5)*1000; }
  };

  function createSequencer(opts){
    const { getPool, getRelated, onEnter, onExit, random } = opts;
    const rnd = random || Math.random;
    let state = 'GUIDED_OVERVIEW';
    let prevState = null;
    let timer = 0;
    let token = 0;              // invalidates stale callbacks
    let featured = [];          // ids featured in this rotation
    let recentThemes = [];
    const arrivals = [];        // queued arrival ids
    let current = null;         // { kind, ids }
    let manualSince = 0;
    const listeners = new Set();
    let stepCounter = 0;

    function emit(){ listeners.forEach(fn => fn({ state, current, queued: arrivals.length })); }
    function clear(){ clearTimeout(timer); timer = 0; token++; }
    function later(ms, fn){ const my = token; timer = setTimeout(() => { if (my !== token) return; fn(); }, ms); }
    function between(a){ return a[0] + rnd()*(a[1] - a[0]); }

    function pickNext(){
      const pool = getPool().filter(c => c.eligible);
      if (!pool.length) return null;
      let candidates = pool.filter(c => !featured.includes(c.id));
      if (!candidates.length){ featured = []; candidates = pool; }
      return candidates[Math.floor(rnd()*candidates.length)];
    }

    function go(next, data){
      prevState = state; state = next; current = data || null; emit();
    }

    // ---- guided steps ----
    function scheduleOverview(gapMs){
      go('GUIDED_OVERVIEW', null);
      onEnter('overview');
      later(gapMs == null ? between(TIMING.overviewGap) : gapMs, nextStep);
    }
    function nextStep(){
      if (state === 'PAUSED' || state.startsWith('MANUAL')) return;
      stepCounter++;
      if (arrivals.length){ return showArrival(); }
      // every fourth feature is a shared intention, if related people exist
      if (stepCounter % 4 === 0){ const c = pickNext(); if (c){ const rel = getRelated(c, 3); if (rel.length >= 1) return showTheme(c, rel); } }
      const c = pickNext(); if (!c) return scheduleOverview();
      showFocus(c);
    }
    function showFocus(c){
      featured.push(c.id);
      go('GUIDED_FOCUS', { kind: 'focus', ids: [c.id] });
      onEnter('focus', c);
      later(TIMING.focusIn + TIMING.readTime(c.commitment), () => { onExit('focus'); later(TIMING.returnOut, () => scheduleOverview(TIMING.breathe)); });
    }
    function showTheme(c, rel){
      const ids = [c.id].concat(rel.map(r => r.id));
      ids.forEach(id => { if (!featured.includes(id)) featured.push(id); });
      go('GUIDED_THEME', { kind: 'theme', ids, themeId: c.themeIds[0] });
      onEnter('theme', { lead: c, related: rel, themeId: c.themeIds[0] });
      later(TIMING.focusIn + TIMING.themeHold, () => { onExit('theme'); later(TIMING.returnOut, () => scheduleOverview(TIMING.breathe)); });
    }
    function showArrival(){
      // during a surge, introduce up to three together
      const batch = arrivals.splice(0, Math.min(3, arrivals.length));
      batch.forEach(id => { if (!featured.includes(id)) featured.push(id); });
      go('GUIDED_ARRIVAL', { kind: 'arrival', ids: batch, remaining: arrivals.length });
      onEnter('arrival', { ids: batch, remaining: arrivals.length });
      later(TIMING.focusIn + TIMING.arrivalHold, () => { onExit('arrival'); later(TIMING.returnOut, () => scheduleOverview(arrivals.length ? 1500 : TIMING.breathe)); });
    }

    // ---- public API ----
    const api = {
      TIMING,
      get state(){ return state; },
      get current(){ return current; },
      get queued(){ return arrivals.length; },
      onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); },
      start(){ clear(); scheduleOverview(7000); },
      /* Any manual intent: suspend automation. */
      manual(){
        if (state.startsWith('MANUAL')) return;
        clear();
        if (state !== 'GUIDED_OVERVIEW' && state !== 'PAUSED') onExit(current && current.kind, { silent: true });
        manualSince = Date.now();
        go('MANUAL_EXPLORE', null);
      },
      select(c){
        clear();
        if (state !== 'MANUAL_FOCUS' && state !== 'MANUAL_EXPLORE' && state !== 'PAUSED') onExit(current && current.kind, { silent: true });
        go('MANUAL_FOCUS', { kind: 'focus', ids: [c.id], manual: true });
        onEnter('focus', c, { manual: true });
      },
      close(){
        clear();
        if (current) onExit(current.kind);
        go('MANUAL_EXPLORE', null);
      },
      resume(){ clear(); featured = featured.slice(-Math.floor(getPool().length*0.5)); scheduleOverview(TIMING.breathe); },
      pause(){ clear(); if (current) onExit(current.kind, { silent: true }); go('PAUSED', null); },
      enqueueArrival(id){ arrivals.push(id); emit(); if (state === 'GUIDED_OVERVIEW'){ clear(); later(1200, nextStep); } },
      /* Manual theme exploration: show the group but under manual control. */
      exploreTheme(c, rel){ clear(); go('MANUAL_FOCUS', { kind: 'theme', ids: [c.id].concat(rel.map(r => r.id)), themeId: c.themeIds[0], manual: true }); onEnter('theme', { lead: c, related: rel, themeId: c.themeIds[0] }, { manual: true }); }
    };
    return api;
  }

  AC.sequencer = { createSequencer, TIMING };
})(window.AC);
