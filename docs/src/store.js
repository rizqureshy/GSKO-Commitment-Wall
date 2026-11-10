/* Annual Connect — where contributions live.
   This is the seam between the experience and whatever stores the event's data. The wall and the phone page only
   ever talk to this interface:

     list()            everyone, eligible or not
     subscribe(fn)     { type: 'added' | 'changed' | 'find', ... }
     submit(draft)     resolves once the contribution is durably saved; safe to retry with the same id
     setEligible(id)   organiser control

   The implementation here is a prototype: fictional sample people, plus real submissions kept in this browser
   only (IndexedDB), announced to other tabs of the same browser over a BroadcastChannel. It proves the journey
   end to end on one machine. It is not a server, and nothing leaves the device. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const DB = 'annual-connect-prototype', STORE = 'contributions', CHANNEL = 'annual-connect-prototype';

  // ---- durable local storage, with a memory fallback where the browser refuses it ----
  const memory = new Map(); let dbp = null;
  function open(){
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => { let req; try { req = indexedDB.open(DB, 1); } catch (e){ return rej(e); }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' }); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); req.onblocked = () => rej(new Error('blocked')); });
    dbp.catch(() => { dbp = null; }); return dbp;
  }
  const tx = (mode, run) => open().then(db => new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = run(t.objectStore(STORE)); t.oncomplete = () => res(out && 'result' in out ? out.result : undefined); t.onerror = t.onabort = () => rej(t.error || new Error('aborted')); }));
  const local = {
    put(rec){ return tx('readwrite', s => s.put(rec)).then(() => true, () => { memory.set(rec.id, rec); return false; }); },
    all(){ return tx('readonly', s => s.getAll()).then(r => r || [], () => Array.from(memory.values())); },
    get(id){ return tx('readonly', s => s.get(id)).then(r => r || memory.get(id) || null, () => memory.get(id) || null); },
    clear(){ memory.clear(); return tx('readwrite', s => s.clear()).then(() => true, () => false); }
  };
  let channel = null; try { channel = new BroadcastChannel(CHANNEL); } catch (e){ channel = null; }
  const announce = msg => { try { if (channel) channel.postMessage(msg); } catch (e){} };

  const urls = new Map();
  function toContribution(rec){
    let portrait = null;
    if (rec.photo){ try { if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.photo)); portrait = { url: urls.get(rec.id) }; } catch (e){ portrait = null; } }
    return { id: rec.id, displayName: rec.displayName, commitment: rec.commitment, excerpt: null, themeIds: rec.themeIds && rec.themeIds.length ? rec.themeIds : ['collaboration'], metro: rec.metro || null, portrait, submittedAt: rec.submittedAt, eligible: rec.eligible !== false, sample: false };
  }

  /* Save a submission. Idempotent on id, so a retry after a dropped connection cannot create a second person. */
  function submit(draft){
    const rec = { id: draft.id, displayName: String(draft.displayName).trim().slice(0, 60), commitment: String(draft.commitment).trim().slice(0, 280), themeIds: draft.themeId ? [draft.themeId] : [], metro: draft.metro || null, photo: draft.photo || null, submittedAt: draft.submittedAt || Date.now(), eligible: true };
    return local.put(rec).then(durable => { announce({ type: 'added', id: rec.id }); return { id: rec.id, durable }; });
  }
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function create(opts){
    const sample = AC.data.makeSample(opts && opts.count != null ? opts.count : 300, (opts && opts.seed) || 2027);
    let items = sample.slice(); const subs = new Set(); const emit = ev => subs.forEach(fn => fn(ev));
    const ready = local.all().then(recs => { recs.sort((a, b) => a.submittedAt - b.submittedAt).forEach(r => { if (!items.some(c => c.id === r.id)) items.push(toContribution(r)); }); return items.slice(); });
    if (channel) channel.onmessage = e => { const m = e.data || {};
      if (m.type === 'added' && !items.some(c => c.id === m.id)) local.get(m.id).then(r => { if (!r || items.some(c => c.id === r.id)) return; const c = toContribution(r); items.push(c); emit({ type: 'added', contribution: c }); });
      if (m.type === 'find') emit({ type: 'find', id: m.id }); };
    return {
      kind: 'prototype-local', themes: AC.data.THEMES, metros: AC.data.METROS, ready,
      list(){ return items.slice(); },
      subscribe(fn){ subs.add(fn); return () => subs.delete(fn); },
      submit,
      /* A fictional arrival, for rehearsing. Not a submission. */
      simulateArrival(){ const c = AC.data.makeArrival(); items.push(c); emit({ type: 'added', contribution: c }); return c; },
      setEligible(id, eligible){ const c = items.find(x => x.id === id); if (c){ c.eligible = eligible; emit({ type: 'changed', id }); } },
      clearLocal(){ return local.clear(); }
    };
  }

  AC.store = { create, submit, newId, find(id){ announce({ type: 'find', id }); }, local };
})(window.AC);
