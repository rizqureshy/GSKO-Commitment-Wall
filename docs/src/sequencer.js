/* Annual Connect — who is on stage, and when.
   One state at a time, one timer at a time. A hand on the wall always wins: selecting, searching or scrolling
   suspends the guided sequence until it is resumed on purpose. Arrivals wait their turn and never interrupt
   someone who is being read. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';

  const TIMING = {
    gap: [10000, 15000],          // between features, when nothing is on stage
    lift: 2000,                   // a print rising to the stage
    lower: 1800,                  // and returning
    breathe: 4500,                // the collective alone, after a return
    theme: 16000,                 // a shared intention
    arrival: 11000,               // someone joins
    arrivalLift: 4200,
    read(text){ const words = String(text).trim().split(/\s+/).length; return Math.max(12, 5 + words/2.5)*1000; }
  };

  function create(opts){
    const { pool, prefer, related, onEnter, onExit } = opts; const rnd = opts.random || Math.random;
    let state = 'GUIDED_OVERVIEW', current = null, timer = 0, token = 0, step = 0; let featured = []; const queue = []; const subs = new Set();
    const emit = () => subs.forEach(fn => fn({ state, current, queued: queue.length }));
    const clear = () => { clearTimeout(timer); timer = 0; token++; };
    const later = (ms, fn) => { const mine = token; timer = setTimeout(() => { if (mine === token) fn(); }, ms); };
    const go = (s, cur) => { state = s; current = cur || null; emit(); };
    const guided = () => state.startsWith('GUIDED');

    /* Fair rotation: nobody twice until the available pool has been round. Those whose part of the world is in
       view below are preferred, which means the turning planet decides the order, not anyone's rank. */
    function next(){
      const all = pool(); if (!all.length) return null;
      let fresh = all.filter(c => !featured.includes(c.id)); if (!fresh.length){ featured = featured.slice(-Math.floor(all.length/3)); fresh = all.filter(c => !featured.includes(c.id)); if (!fresh.length) fresh = all; }
      const near = prefer ? fresh.filter(prefer) : []; const from = near.length && rnd() < 0.8 ? near : fresh;
      return from[Math.floor(rnd()*from.length)];
    }
    const mark = ids => ids.forEach(id => { if (!featured.includes(id)) featured.push(id); });

    function overview(gap){ go('GUIDED_OVERVIEW'); onEnter('overview'); later(gap == null ? TIMING.gap[0] + rnd()*(TIMING.gap[1] - TIMING.gap[0]) : gap, advance); }
    function leave(kind, after){ onExit(kind); later(TIMING.lower, () => overview(after)); }
    function advance(){
      if (!guided()) return; step++;
      if (queue.length) return arrival();
      const c = next(); if (!c) return overview();
      if (step % 4 === 0){ const rel = related(c, 2); if (rel.length === 2){ mark([c.id, rel[0].id, rel[1].id]); go('GUIDED_THEME', { kind: 'theme', ids: [c.id, rel[0].id, rel[1].id] }); onEnter('theme', { lead: c, related: rel }); return later(TIMING.lift + TIMING.theme, () => leave('theme', TIMING.breathe)); } }
      mark([c.id]); go('GUIDED_FOCUS', { kind: 'focus', ids: [c.id] }); onEnter('focus', c);
      later(TIMING.lift + TIMING.read(c.commitment), () => leave('focus', TIMING.breathe));
    }
    function arrival(){
      const ids = queue.splice(0, Math.min(3, queue.length)); mark(ids);   // in a surge, up to three are introduced together
      go('GUIDED_ARRIVAL', { kind: 'arrival', ids }); onEnter('arrival', { ids, remaining: queue.length });
      later(TIMING.arrivalLift + TIMING.arrival, () => leave('arrival', queue.length ? 1500 : TIMING.breathe));
    }

    return {
      TIMING,
      get state(){ return state; }, get current(){ return current; }, get queued(){ return queue.length; },
      onChange(fn){ subs.add(fn); return () => subs.delete(fn); },
      start(delay){ clear(); overview(delay == null ? 7000 : delay); },
      resume(){ clear(); if (current) onExit(current.kind); overview(TIMING.breathe); },
      pause(){ clear(); if (current) onExit(current.kind); go('PAUSED'); },
      /* any deliberate touch */
      manual(){ if (state.startsWith('MANUAL')) return; clear(); if (current) onExit(current.kind); go('MANUAL_EXPLORE'); },
      select(c){ clear(); if (current && current.kind !== 'focus') onExit(current.kind); mark([c.id]); go('MANUAL_FOCUS', { kind: 'focus', ids: [c.id] }); onEnter('focus', c, { manual: true }); },
      theme(lead, rel){ clear(); if (current) onExit(current.kind); go('MANUAL_FOCUS', { kind: 'theme', ids: [lead.id].concat(rel.map(r => r.id)) }); onEnter('theme', { lead, related: rel }, { manual: true }); },
      close(){ clear(); if (current) onExit(current.kind); go('MANUAL_EXPLORE'); },
      enqueue(id){ queue.push(id); emit(); if (state === 'GUIDED_OVERVIEW'){ clear(); later(1200, advance); } }
    };
  }

  AC.sequencer = { create, TIMING };
})(window.AC);
