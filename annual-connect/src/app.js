/* Global Field Kick Off — application layer: wires data, layout, sequencer and scene to the DOM.
   Views: ALL OF US (overview), ONE PROMISE (focus), A SHARED INTENTION (theme), SOMEONE JOINS (arrival).
   Modes: guided display (runs itself) and personal exploration (viewer drives). */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const params = new URLSearchParams(location.search);
  const COUNT = Math.max(0, Math.min(1200, parseInt(params.get('n') || '300', 10) || 0));
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const MODE = params.get('mode') || (isTouch || innerWidth < 900 ? 'explore' : 'guided');
  const DEV = params.get('dev') === '1' && params.get('display') !== '1';
  const DAWN = params.get('dawn') !== '0';
  const DISPLAY = params.get('display') === '1';
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = $('#stage');
  if (!window.THREE){ stage.classList.add('nogl'); return; }

  const adapter = AC.data.createLocalAdapter({ count: COUNT });
  const themeLabel = id => (adapter.themes.find(t => t.id === id) || {}).label || '';
  const poolSize = (AC.PORTRAIT_POOL && AC.PORTRAIT_POOL.size) || 12;
  let scene;
  try { scene = AC.scene.createScene({ stage, canvas: $('#gl'), poolSize, reducedMotion: () => reduced }); } catch (e){ console.error(e); stage.classList.add('nogl'); return; }
  scene.loadPhotos((AC.PORTRAIT_POOL && AC.PORTRAIT_POOL.atlas) || 'assets/portraits/atlas.jpg').then(ok => { if (!ok) note('Portraits could not load. Showing initials instead.'); });

  adapter.list().forEach((c, i, arr) => scene.add(c, false, arr.length));

  // ---- helpers ----
  function related(c, k){
    const me = scene.byId.get(c.id); if (!me) return [];
    return scene.items.filter(r => r.c.id !== c.id && r.c.eligible && !r.pending && r.c.themeIds[0] === c.themeIds[0])
      .map(r => ({ r, d: Math.hypot(r.x - me.x, r.y - me.y, r.z - me.z) })).sort((a, b) => a.d - b.d).slice(0, k).map(o => o.r.c);
  }
  function fmt(n){ return n.toLocaleString('en-US'); }
  let noteTimer = 0; function note(msg){ const el = $('#note'); el.textContent = msg; el.hidden = false; clearTimeout(noteTimer); noteTimer = setTimeout(() => el.hidden = true, 4200); }

  // ---- DOM refs ----
  const ui = {
    title: $('#title'), count: $('#count'), status: $('#status'), labels: $('#labels'),
    focus: $('#focus'), fKicker: $('#f-kicker'), fText: $('#f-text'), fName: $('#f-name'), fTheme: $('#f-theme'), fMore: $('#f-more'), fPortrait: $('#f-portrait'), fInitials: $('#f-initials'),
    theme: $('#theme'), tLabel: $('#t-label'), tCount: $('#t-count'),
    resume: $('#b-resume'), pause: $('#b-pause'), close: $('#b-close'), explore: $('#b-explore'), find: $('#b-find'), guided: $('#b-guided'), full: $('#b-full'), list: $('#b-list'), motion: $('#b-motion'),
    search: $('#search'), sInput: $('#s-input'), sResults: $('#s-results'), listDlg: $('#listdlg'), lInput: $('#l-input'), lRows: $('#l-rows'), joined: $('#joined'), empty: $('#empty'), dev: $('#dev')
  };
  ui.count.textContent = fmt(scene.count);
  if (!scene.count) ui.empty.hidden = false;

  // ---- sequencer ----
  const seq = AC.sequencer.createSequencer({
    getPool: () => { const front = scene.items.filter(r => !r.pending && r.alpha > 0.5 && r.home.t > 0.55 && r.home.t < 0.92); return (front.length >= 3 ? front : scene.items.filter(r => !r.pending)).map(r => r.c); },
    getRelated: (c, k) => related(c, k),
    random: AC.data.mulberry32(7),
    onEnter(kind, data, o){
      ui.title.classList.add('away');
      if (kind === 'overview'){ ui.title.classList.remove('away'); scene.glide(); return; }
      hideTheme(); scene.release();
      if (kind === 'focus'){ const rec = scene.byId.get(data.id); if (!rec) return; if (!o || !o.manual) scene.saveViewpoint(); scene.focus(rec); showFocus(data, 'One promise'); }
      if (kind === 'theme'){ hideFocus(); const recs = [data.lead].concat(data.related).map(c => scene.byId.get(c.id)).filter(Boolean); if (!o || !o.manual) scene.saveViewpoint(); scene.group(recs); showTheme(data, recs); }
      if (kind === 'arrival'){ const recs = data.ids.map(id => scene.byId.get(id)).filter(Boolean); if (!recs.length) return; scene.saveViewpoint(); recs.forEach(introduce); scene.arrival(recs[0]); showArrival(recs, data.remaining); const rel = related(recs[0].c, 6).map(c => c.id); setTimeout(() => scene.pulse(rel), 900); }
    },
    onExit(kind, o){ hideFocus(); hideTheme(); scene.release(); if (!(o && o.silent) || kind) scene.restoreViewpoint(undefined, seq.state.startsWith('GUIDED')); }
  });
  seq.onChange(s => { renderStatus(s); if (s.state.startsWith('MANUAL') || s.state === 'PAUSED') scene.hold(); const flowing = (s.state === 'GUIDED_OVERVIEW' || s.state === 'GUIDED_FOCUS' || s.state === 'GUIDED_ARRIVAL') && !scene.closingOn; scene.stream(flowing ? 1 : 0); });

  function renderStatus(s){
    const st = s.state; const guided = st.startsWith('GUIDED'); const manual = st.startsWith('MANUAL');
    ui.status.textContent = st === 'PAUSED' ? 'Paused' : guided ? 'Guided view' : 'Exploring';
    ui.resume.hidden = guided; ui.pause.hidden = !guided; ui.close.hidden = !(st === 'MANUAL_FOCUS' || st === 'GUIDED_FOCUS' || st === 'GUIDED_THEME' || st === 'GUIDED_ARRIVAL');
    ui.guided.setAttribute('aria-pressed', String(guided)); ui.explore.setAttribute('aria-pressed', String(manual));
    stage.dataset.state = st;
    const q = s.queued; $('#queued').hidden = !q; $('#queued').textContent = q === 1 ? '1 arrival waiting' : q + ' arrivals waiting';
    if (DEV) $('#d-state').textContent = st;
  }

  // ---- views ----
  function setPortrait(c){
    const rec = scene.byId.get(c.id);
    if (c.portrait && scene.photosReady){ const p = c.portrait.pool % poolSize; const src = AC.PORTRAIT_POOL && AC.PORTRAIT_POOL.focus ? AC.PORTRAIT_POOL.focus[p] : ('assets/portraits/portrait-' + String(p).padStart(2, '0') + '.jpg'); ui.fPortrait.src = src; ui.fPortrait.hidden = false; ui.fInitials.hidden = true; ui.fPortrait.style.transform = rec && rec.i % 2 ? 'scaleX(-1)' : ''; }
    else { ui.fPortrait.hidden = true; ui.fInitials.hidden = false; const parts = c.displayName.trim().split(/\s+/); ui.fInitials.textContent = ((Array.from(parts[0])[0] || '') + (parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : '')).toUpperCase(); }
    ui.fPortrait.alt = 'Portrait of ' + c.displayName;
  }
  function showFocus(c, kicker){ $('#f-lede').hidden = true; const words = String(c.commitment).trim().split(/\s+/).length; ui.focus.classList.toggle('long', words > 18 && words <= 34); ui.focus.classList.toggle('verylong', words > 34); ui.fKicker.textContent = kicker; ui.fText.textContent = c.commitment; ui.fName.textContent = c.displayName; ui.fTheme.textContent = themeLabel(c.themeIds[0]); ui.fMore.hidden = true; setPortrait(c); ui.focus.hidden = false; requestAnimationFrame(() => ui.focus.classList.add('on')); ui.focus.setAttribute('aria-label', kicker + ': ' + c.displayName); ui.fText.focus({ preventScroll: true }); }
  function hideFocus(){ ui.focus.classList.remove('on'); setTimeout(() => { if (!ui.focus.classList.contains('on')) ui.focus.hidden = true; }, 700); }
  function showArrival(recs, remaining){ const c = recs[0].c; showFocus(c, 'Someone joins'); $('#f-lede').hidden = false; ui.fMore.hidden = !(recs.length > 1 || remaining); ui.fMore.textContent = recs.length > 1 ? (recs.length - 1) + ' more joined with them' + (remaining ? ', ' + remaining + ' waiting' : '') : remaining + ' more waiting to join'; }
  let themeRecs = [];
  function showTheme(data, recs){ themeRecs = recs; ui.tLabel.textContent = themeLabel(data.themeId); ui.tCount.textContent = recs.length + ' related commitments'; ui.theme.hidden = false; requestAnimationFrame(() => ui.theme.classList.add('on')); }
  function hideTheme(){ themeRecs = []; ui.theme.classList.remove('on'); setTimeout(() => { if (!ui.theme.classList.contains('on')) ui.theme.hidden = true; }, 700); $('#f-lede').hidden = true; }

  // ---- arrivals ----
  adapter.subscribe(ev => {
    if (ev.type !== 'added') return;
    const rec = scene.add(ev.contribution, true); if (!rec) return;
    ui.count.textContent = fmt(scene.count); ui.empty.hidden = true;
    if (seq.state.startsWith('GUIDED') || seq.state === 'PAUSED'){ rec.pending = true; rec.alpha = 0; seq.enqueueArrival(ev.contribution.id); }
    else { introduce(rec); const j = ui.joined; j.textContent = ev.contribution.displayName + ' just joined'; j.hidden = false; clearTimeout(j._t); j._t = setTimeout(() => j.hidden = true, 5000); const rel = related(rec.c, 5).map(c => c.id); scene.pulse(rel); }
  });
  function introduce(rec){ if (!rec.pending && !rec.animateIn) return; rec.pending = false; rec.animateIn = true; rec.bornAt = performance.now(); rec.s = 0.001; rec.zoff = 7; }

  // The stream carries portraits only. Words appear when a person is brought forward, never over the flow.

  // ---- selection, hover, orbit ----
  let down = null, dragged = false;
  stage.addEventListener('pointerdown', e => { if (e.target.closest('button, a, input, .panel, dialog')) return; down = { x: e.clientX, y: e.clientY, id: e.pointerId }; dragged = false; });
  stage.addEventListener('pointermove', e => {
    if (down && (e.buttons & 1)){ const dx = e.clientX - down.x, dy = e.clientY - down.y; if (!dragged && Math.hypot(dx, dy) > 6){ dragged = true; stage.setPointerCapture(down.id); manualIntent(); } if (dragged && (seq.state === 'GUIDED_OVERVIEW' || seq.state === 'MANUAL_EXPLORE')){ scene.scrub((-dy - dx*0.5)*0.0006); down.x = e.clientX; down.y = e.clientY; } return; }
    if (isTouch) return; const rec = scene.pick(e.clientX, e.clientY); scene.setHover(rec); stage.classList.toggle('hover', !!rec);
  });
  stage.addEventListener('pointerup', e => { if (!down) return; const wasDrag = dragged; down = null; if (wasDrag) return; if (e.target.closest('button, a, input, .panel, dialog')) return; const rec = scene.pick(e.clientX, e.clientY); if (rec) select(rec.c); });
  stage.addEventListener('pointercancel', () => down = null);
  stage.addEventListener('wheel', e => { if (e.target.closest('.panel, dialog')) return; e.preventDefault(); if (scene.closingOn || scene.dawning) return; if (seq.state === 'MANUAL_FOCUS' || seq.state.startsWith('GUIDED_') && seq.state !== 'GUIDED_OVERVIEW') return; manualIntent(); scene.scrub((e.deltaY + e.deltaX)*0.00015); }, { passive: false });
  function manualIntent(){ if (!seq.state.startsWith('MANUAL')) seq.manual(); }
  const QUIET = ['GUIDED_OVERVIEW', 'MANUAL_EXPLORE', 'PAUSED'];
  function select(c){ const rec = scene.byId.get(c.id); if (!rec) return; if (QUIET.includes(seq.state)) scene.saveViewpoint(); seq.select(c); }
  function closeFocus(){ if (seq.state === 'MANUAL_FOCUS' || seq.state.startsWith('GUIDED_')){ if (seq.state.startsWith('GUIDED_') && seq.state !== 'GUIDED_OVERVIEW'){ seq.manual(); scene.release(); scene.restoreViewpoint(); hideFocus(); hideTheme(); } else seq.close(); } }

  // ---- controls ----
  ui.close.addEventListener('click', closeFocus);
  ui.resume.addEventListener('click', () => { scene.resetUser(); seq.resume(); });
  ui.guided.addEventListener('click', () => { scene.resetUser(); seq.resume(); });
  ui.pause.addEventListener('click', () => seq.pause());
  ui.explore.addEventListener('click', () => { if (seq.state === 'MANUAL_FOCUS') seq.close(); else seq.manual(); note('Scroll to move along the ribbon, select a portrait to read.'); });
  ui.full.addEventListener('click', () => { const el = document.documentElement; const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) f.call(el).catch(() => note('Full screen is not available here.')); });
  ui.motion.addEventListener('click', () => { reduced = !reduced; ui.motion.setAttribute('aria-pressed', String(reduced)); ui.motion.textContent = reduced ? 'Motion off' : 'Motion on'; document.documentElement.classList.toggle('reduced', reduced); });
  if (reduced){ ui.motion.setAttribute('aria-pressed', 'true'); ui.motion.textContent = 'Motion off'; document.documentElement.classList.add('reduced'); }

  // ---- sound: a browser will not start it unprompted, so it begins at the first click, tap or key press ----
  const soundBtn = $('#b-sound');
  const sound = AC.audio.create({ onState(s){ soundBtn.setAttribute('aria-pressed', String(s.on)); soundBtn.textContent = s.on ? 'Sound on' : 'Sound off';
    if (s.mode === 'bed' && s.on) note('Sound on. The music file could not be loaded, so a built-in ambient bed is playing.'); if (s.mode === 'none') note(s.label); } });
  let armed = sound.wanted();
  const firstTouch = e => { if (!armed) return; armed = false; if (e.target.closest && e.target.closest('#b-sound')) return; if (e.type === 'keydown' && e.key.toLowerCase() === 'm') return; if (!sound.on) sound.start(); };
  document.addEventListener('pointerdown', firstTouch, true); document.addEventListener('keydown', firstTouch, true);
  soundBtn.addEventListener('click', () => { armed = false; sound.toggle(); });
  document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'm' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.target.closest('input')){ armed = false; sound.toggle(); } });
  document.addEventListener('visibilitychange', () => sound.hidden(document.hidden));
  document.addEventListener('keydown', e => { if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.target.closest('input') && (seq.state === 'GUIDED_OVERVIEW' || seq.state === 'MANUAL_EXPLORE')){ manualIntent(); scene.scrub(e.key === 'ArrowRight' ? 0.02 : -0.02); } if (e.key === 'Escape'){ if (!ui.search.hidden) closeSearch(); else if (ui.listDlg.open) ui.listDlg.close(); else closeFocus(); } if (e.key === '/' && !e.target.closest('input')){ e.preventDefault(); openSearch(); } if (e.key.toLowerCase() === 'd' && e.shiftKey && !DISPLAY){ ui.dev.hidden = !ui.dev.hidden; } });

  // ---- search ----
  function openSearch(){ ui.search.hidden = false; ui.sInput.value = ''; renderResults(''); ui.sInput.focus(); }
  function closeSearch(){ ui.search.hidden = true; ui.find.focus(); }
  ui.find.addEventListener('click', openSearch); $('#s-close').addEventListener('click', closeSearch);
  ui.sInput.addEventListener('input', () => renderResults(ui.sInput.value));
  function matches(q){ q = q.trim().toLowerCase(); if (!q) return []; return adapter.list().filter(c => c.eligible && (c.displayName.toLowerCase().includes(q) || c.commitment.toLowerCase().includes(q) || themeLabel(c.themeIds[0]).toLowerCase().includes(q))).slice(0, 8); }
  function renderResults(q){ const res = matches(q); ui.sResults.innerHTML = ''; if (!q.trim()){ ui.sResults.innerHTML = '<p class="hint">Type a name, a word from a commitment, or a theme.</p>'; return; } if (!res.length){ ui.sResults.innerHTML = '<p class="hint">No one matches that yet.</p>'; return; }
    res.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'res'; b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = c.displayName; b.lastChild.textContent = c.commitment; b.addEventListener('click', () => { closeSearch(); select(c); }); ui.sResults.appendChild(b); }); }

  // ---- accessible list ----
  ui.list.addEventListener('click', () => { renderList(''); ui.listDlg.showModal(); ui.lInput.focus(); });
  $('#l-close').addEventListener('click', () => ui.listDlg.close());
  ui.lInput.addEventListener('input', () => renderList(ui.lInput.value));
  function renderList(q){ q = q.trim().toLowerCase(); const rows = adapter.list().filter(c => c.eligible && (!q || c.displayName.toLowerCase().includes(q) || c.commitment.toLowerCase().includes(q) || themeLabel(c.themeIds[0]).toLowerCase().includes(q)));
    ui.lRows.innerHTML = ''; $('#l-count').textContent = rows.length + ' of ' + adapter.list().length;
    rows.slice(0, 400).forEach(c => { const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.innerHTML = '<b></b><em></em><span></span>'; b.children[0].textContent = c.displayName; b.children[1].textContent = themeLabel(c.themeIds[0]); b.children[2].textContent = c.commitment; b.addEventListener('click', () => { ui.listDlg.close(); select(c); }); li.appendChild(b); ui.lRows.appendChild(li); }); }

  // ---- the closing ----
  const titleEl = ui.title; const TITLE_OPEN = titleEl.innerHTML;
  let closingTimer = 0;
  function startClosing(){
    if (scene.closingOn) return;
    seq.pause(); hideFocus(); hideTheme(); scene.release(); scene.hold(); scene.closing(true); sound.swell(1.3);
    titleEl.classList.add('away'); cap.hidden = true;
    clearTimeout(closingTimer);
    closingTimer = setTimeout(() => { titleEl.innerHTML = '<span>Our commitments.</span><span>Made.</span>'; titleEl.classList.add('made'); titleEl.classList.remove('away'); }, reduced ? 200 : 9500);
    note('The closing. Press Resume guided view to continue.');
  }
  function endClosing(){ clearTimeout(closingTimer); scene.closing(false); sound.swell(1); titleEl.innerHTML = TITLE_OPEN; titleEl.classList.remove('made'); }
  const cap = $('#labels');
  ui.resume.addEventListener('click', () => { if (scene.closingOn){ endClosing(); cap.hidden = false; } });
  ui.guided.addEventListener('click', () => { if (scene.closingOn){ endClosing(); cap.hidden = false; } });
  document.addEventListener('keydown', e => { if (e.shiftKey && e.key.toLowerCase() === 'c' && !e.target.closest('input')) startClosing(); });
  if (params.get('closing') === '1') setTimeout(startClosing, 6000);

  // ---- dev controls (never in audience display mode) ----
  if (DEV){ ui.dev.hidden = false; }
  if (!DISPLAY){
    $('#d-arrive').addEventListener('click', () => adapter.simulateArrival());
    $('#d-surge').addEventListener('click', () => { let k = 0; const go = () => { adapter.simulateArrival(); if (++k < 5) setTimeout(go, 400); }; go(); });
    $('#d-dawn').addEventListener('click', () => runDawn(true));
    $('#d-light').addEventListener('click', () => scene.travel());
    $('#d-close').addEventListener('click', startClosing);
    $('#d-theme').addEventListener('click', () => { const pool = scene.items.filter(r => !r.pending).map(r => r.c); if (!pool.length) return; const c = pool[Math.floor(Math.random()*pool.length)]; const rel = related(c, 3); if (!rel.length) return note('No related commitments for that theme yet.'); if (QUIET.includes(seq.state)) scene.saveViewpoint(); seq.exploreTheme(c, rel); });
    ui.dev.querySelectorAll('[data-n]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const p = new URLSearchParams(location.search); p.set('n', a.dataset.n); p.set('dev', '1'); location.search = p.toString(); }));
    $('#d-fps').textContent = '';
    let frames = 0, t0 = performance.now(); (function fps(){ frames++; const now = performance.now(); if (now - t0 > 1000){ $('#d-fps').textContent = Math.round(frames*1000/(now - t0)) + ' fps · ' + scene.count + ' prints'; frames = 0; t0 = now; } requestAnimationFrame(fps); })();
  }

  // ---- start ----
  $('#mode').textContent = MODE === 'guided' ? 'Guided display' : 'Personal exploration';
  // ---- dawn ----
  const chrome = $('.chrome');
  function runDawn(replay){
    const long = MODE === 'guided'; const ms = reduced ? 0 : (long ? 7000 : 4000);
    if (!replay){ seq.pause(); }
    if (ms){ scene.dawn(ms); titleEl.classList.add('away'); chrome.classList.add('dawn'); cap.hidden = true;
      setTimeout(() => { titleEl.classList.remove('away'); }, ms*0.8);
      setTimeout(() => { chrome.classList.remove('dawn'); cap.hidden = false; }, ms*0.9); }
    if (!replay) setTimeout(() => { if (MODE === 'guided') seq.start(); else seq.manual(); }, ms ? ms*0.92 : 0);
  }
  renderStatus({ state: seq.state, queued: 0 });
  seq.start();
  if (DAWN && scene.count) runDawn(false); else if (MODE !== 'guided') seq.manual();
  setTimeout(() => { if (armed && !sound.on && !DISPLAY) note('Click anywhere, or press M, for music.'); }, (DAWN && !reduced ? (MODE === 'guided' ? 7000 : 4000) : 0) + 1200);
  // hide the opening veil once the first frames are in
  setTimeout(() => $('#veil').classList.add('off'), 600);
  AC.app = { adapter, scene, seq, select, sound };
})(window.AC);
