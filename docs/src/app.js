/* Annual Connect — the wall.
   Wires the store, the sequencer and the scene to the page. Four views of one world: all of us (the ring),
   one promise, a shared intention, someone joins. Two modes: the guided display runs itself; personal
   exploration waits for a hand. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const O = AC.orbit, D = Math.PI/180;
  const params = new URLSearchParams(location.search);
  const COUNT = Math.max(0, Math.min(1500, parseInt(params.get('n') == null ? '300' : params.get('n'), 10) || 0));
  const touch = matchMedia('(pointer: coarse)').matches;
  const MODE = params.get('mode') || (touch || innerWidth < 900 ? 'explore' : 'guided');
  const DISPLAY = params.get('display') === '1', DEV = params.get('dev') === '1' && !DISPLAY, DAWN = params.get('dawn') !== '0';
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = $('#stage'), chrome = $('#chrome');
  const A = AC.ASSETS || { night: 'assets/earth-night.jpg', day: 'assets/earth-day.jpg', portraits: Array.from({ length: 12 }, (_, i) => 'assets/portraits/portrait-' + String(i).padStart(2, '0') + '.jpg') };
  const store = AC.store.create({ count: COUNT });
  const themeLabel = id => (store.themes.find(t => t.id === id) || {}).label || '';
  const metroOf = code => AC.data.METRO_BY_CODE[code] || null;
  const urlOf = c => c.portrait ? (c.portrait.url || A.portraits[c.portrait.pool % A.portraits.length]) : null;
  const fmt = n => n.toLocaleString('en-US');
  const metaLine = c => { const m = metroOf(c.metro); return themeLabel(c.themeIds[0]) + (m ? ' · ' + m.name + ' ' + m.code : ''); };
  const excerptOf = c => c.excerpt || (() => { const w = String(c.commitment).replace(/^I will\s+/i, '').replace(/[.]+$/, '').split(/\s+/).slice(0, 5).join(' '); return w.charAt(0).toUpperCase() + w.slice(1); })();

  const ui = { title: $('#title'), count: $('#count'), status: $('#status'), over: $('#over'), labels: $('#labels'), focus: $('#focus'), trio: $('#trio'), note: $('#note'), joined: $('#joined'), empty: $('#empty'), dev: $('#dev'),
    search: $('#search'), sInput: $('#s-input'), sResults: $('#s-results'), list: $('#listdlg'), lInput: $('#l-input'), lRows: $('#l-rows') };
  let noteT = 0; const note = msg => { ui.note.textContent = msg; ui.note.hidden = false; clearTimeout(noteT); noteT = setTimeout(() => ui.note.hidden = true, 4600); };

  if (!window.THREE){ stage.classList.add('nogl'); $('#veil').classList.add('off'); chrome.classList.remove('asleep'); return; }
  let scene; try { scene = AC.scene.create({ stage, canvas: $('#gl'), reducedMotion: () => reduced }); } catch (e){ console.error(e); stage.classList.add('nogl'); $('#veil').classList.add('off'); chrome.classList.remove('asleep'); return; }
  scene.loadEarth(A.night, A.day);

  // ---------- who is where ----------
  const usable = r => !r.pending && r.c.eligible;
  const inFront = r => usable(r) && r.shown > 0.5 && r.theta > O.FRONT[0] && r.theta < O.FRONT[1];
  function related(c, k){ const me = scene.byId.get(c.id); if (!me) return [];
    const near = scene.items.filter(r => r !== me && usable(r) && r.c.themeIds[0] === c.themeIds[0]).map(r => ({ r, d: Math.abs(r.theta - me.theta) })).sort((a, b) => a.d - b.d).slice(0, 14).map(o => o.r.c);
    // prefer three different prints side by side, and three different promises
    const out = [], seen = new Set([urlOf(c) || c.id]), said = new Set([c.commitment]);
    for (const x of near){ if (out.length >= k) break; const u = urlOf(x) || x.id; if (seen.has(u) || said.has(x.commitment)) continue; seen.add(u); said.add(x.commitment); out.push(x); }
    for (const x of near){ if (out.length >= k) break; if (!out.includes(x)) out.push(x); }
    return out; }
  let metrosBelow = new Set();

  // ---------- the sequence ----------
  const seq = AC.sequencer.create({
    pool: () => { const f = scene.items.filter(inFront); return (f.length >= 3 ? f : scene.items.filter(usable)).map(r => r.c); },
    prefer: c => metrosBelow.has(c.metro),
    related,
    onEnter(kind, data){
      if (kind === 'overview'){ ui.title.classList.remove('away'); return; }
      ui.title.classList.add('away');
      if (kind === 'focus'){ const rec = scene.byId.get(data.id); if (!rec) return; scene.stage([rec]); showFocus(data, 'One promise'); }
      if (kind === 'theme'){ const recs = [data.lead].concat(data.related).map(c => scene.byId.get(c.id)).filter(Boolean); scene.stage(recs); showTrio(data.lead, recs); }
      if (kind === 'arrival'){ const recs = data.ids.map(id => scene.byId.get(id)).filter(Boolean); if (!recs.length) return;
        scene.arrive(recs[0], 'stage'); recs.slice(1).forEach(r => scene.arrive(r, 'ring')); scene.stage([recs[0]], true);
        showFocus(recs[0].c, 'Someone joins', 'One more voice.', recs.length > 1 || data.remaining ? (recs.length > 1 ? (recs.length - 1) + ' more joined with them' : '') + (data.remaining ? (recs.length > 1 ? ' · ' : '') + data.remaining + ' waiting' : '') : ''); }
    },
    onExit(){ hidePanels(); scene.unstage(); }
  });
  seq.onChange(s => { renderStatus(s); scene.flow(s.state.startsWith('GUIDED') && !scene.sunriseOn ? 1 : 0);
    if ((s.state === 'GUIDED_OVERVIEW' || s.state === 'MANUAL_EXPLORE') && !scene.dawning && !scene.sunriseOn) ui.title.classList.remove('away'); });

  function renderStatus(s){
    const st = s.state, guided = st.startsWith('GUIDED');
    ui.status.textContent = st === 'PAUSED' ? (scene.sunriseOn ? 'The closing' : 'Paused') : guided ? 'Guided view' : 'Exploring';
    $('#b-pause').hidden = !guided; $$('[data-resume]').forEach(b => b.hidden = guided);
    $('#b-guided').setAttribute('aria-pressed', String(guided)); $('#b-explore').setAttribute('aria-pressed', String(st.startsWith('MANUAL')));
    stage.dataset.state = st; const q = $('#queued'); q.hidden = !s.queued; q.textContent = s.queued === 1 ? '1 arrival waiting' : s.queued + ' arrivals waiting';
    if (!DISPLAY) $('#d-state').textContent = st.toLowerCase().replace(/_/g, ' ');
  }

  // ---------- the words ----------
  function show(el){ el.hidden = false; requestAnimationFrame(() => el.classList.add('on')); ui.labels.classList.add('off'); }
  function hidePanels(){ [ui.focus, ui.trio].forEach(el => { el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 900); }); ui.labels.classList.remove('off'); }
  function showFocus(c, kicker, lede, more){
    ui.trio.classList.remove('on'); ui.trio.hidden = true;
    const words = String(c.commitment).trim().split(/\s+/).length; ui.focus.classList.toggle('long', words > 18 && words <= 34); ui.focus.classList.toggle('verylong', words > 34);
    $('#f-kicker').textContent = kicker; const l = $('#f-lede'); l.hidden = !lede; l.textContent = lede || '';
    $('#f-text').textContent = c.commitment; $('#f-name').textContent = c.displayName; $('#f-meta').textContent = metaLine(c);
    const m = $('#f-more'); m.hidden = !more; m.textContent = more || '';
    ui.focus.setAttribute('aria-label', kicker + ': ' + c.displayName); show(ui.focus);
  }
  function showTrio(lead, recs){
    ui.focus.classList.remove('on'); ui.focus.hidden = true;
    $('#t-label').textContent = themeLabel(lead.themeIds[0]); const ol = $('#t-list'); ol.textContent = '';
    recs.forEach(r => { const li = document.createElement('li'), b = document.createElement('button'), q = document.createElement('q'), s = document.createElement('span'); b.type = 'button'; q.textContent = r.c.commitment; s.className = 'mono'; const m = metroOf(r.c.metro); s.textContent = r.c.displayName + (m ? ' · ' + m.code : ''); b.append(q, s); b.addEventListener('click', () => select(r.c)); li.append(b); ol.append(li); });
    show(ui.trio);
  }

  // ---------- excerpts beside the nearest prints ----------
  const pool = []; for (let i = 0; i < 5; i++){ const el = document.createElement('div'); el.className = 'lbl'; el.hidden = true; ui.labels.appendChild(el); pool.push(el); }
  const P = {}; let titleBox = null, boxT = 0;
  function placeLabels(now){
    const st = seq.state, r = stage.getBoundingClientRect(); let used = 0;
    const on = (st === 'GUIDED_OVERVIEW' || st === 'MANUAL_EXPLORE') && r.width > 700 && !scene.staged.length && !scene.dawning && !scene.sunriseOn;
    if (on){
      if (now - boxT > 700){ boxT = now; const b = ui.title.getBoundingClientRect(); titleBox = ui.title.classList.contains('away') ? null : { x: b.left - r.left - 20, y: b.top - r.top - 16, w: b.width + 60, h: b.height + 40 }; }
      const cand = []; for (const rec of scene.items){ if (!rec.c.portrait || !inFront(rec)) continue; scene.project(rec, P); if (!P.visible || P.halfH < 44 || P.halfH > 230 || P.dist < 20) continue; cand.push({ rec, x: P.x, y: P.y, hh: P.halfH, hw: P.halfW }); }
      cand.sort((a, b) => b.hh - a.hh); const seen = new Set(), placed = titleBox ? [titleBox] : [];
      for (const c of cand){ if (used >= pool.length) break; const text = excerptOf(c.rec.c); if (seen.has(text)) continue;
        const w = Math.min(230, r.width*0.19), h = 62; let x = -1, y = -1;
        for (const [cx, cy] of [[c.x + c.hw + 14, c.y - c.hh*0.3], [c.x - c.hw - 14 - w, c.y - c.hh*0.3], [c.x - w/2, c.y + c.hh + 10]]){ if (cx < 14 || cx + w > r.width - 14 || cy < 70 || cy + h > r.height - 70) continue; if (placed.some(b => cx < b.x + b.w && cx + w > b.x && cy < b.y + b.h && cy + h > b.y)) continue; x = cx; y = cy; break; }
        if (x < 0) continue; seen.add(text); placed.push({ x, y, w, h });
        const el = pool[used++]; el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)'; el.style.width = w + 'px'; if (el.textContent !== text) el.textContent = text; el.hidden = false; }
    }
    for (let i = used; i < pool.length; i++) pool[i].hidden = true;
  }

  // ---------- where we are over the world ----------
  let teleT = 0;
  function telemetry(now){
    if (now - teleT < 600) return; teleT = now; metrosBelow = scene.metrosInView();
    const g = scene.ground(); let best = null, bd = 1e9;
    for (const m of store.metros){ const d = Math.acos(Math.max(-1, Math.min(1, Math.sin(g.lat*D)*Math.sin(m.lat*D) + Math.cos(g.lat*D)*Math.cos(m.lat*D)*Math.cos((g.lon - m.lon)*D))))/D; if (d < bd){ bd = d; best = m; } }
    ui.over.textContent = best && bd < 7 ? 'Over ' + best.name + ' ' + best.code : Math.abs(g.lat).toFixed(1) + '°' + (g.lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(g.lon).toFixed(1) + '°' + (g.lon >= 0 ? 'E' : 'W');
  }
  scene.onFrame = now => { placeLabels(now); telemetry(now); };

  // ---------- hands ----------
  const isControl = t => !!t.closest('button, a, input, .panel, dialog, #search, #dev');
  const busy = () => scene.dawning || scene.sunriseOn;
  // a hand on the ring always takes over from the guided sequence; only a promise the viewer opened themselves holds it still
  const canScrub = () => !busy() && seq.state !== 'MANUAL_FOCUS';
  function takeOver(){ if (!seq.state.startsWith('MANUAL')) seq.manual(); }
  let down = null, dragged = false;
  stage.addEventListener('pointerdown', e => { if (isControl(e.target)) return; down = { x: e.clientX, y: e.clientY, id: e.pointerId }; dragged = false; });
  stage.addEventListener('pointermove', e => {
    if (down && (e.buttons & 1 || e.pointerType === 'touch')){ const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!dragged && Math.hypot(dx, dy) > 7 && canScrub()){ dragged = true; try { stage.setPointerCapture(down.id); } catch (err){} takeOver(); }
      if (dragged){ scene.scrub((dx*0.6 + dy)*0.0013); down.x = e.clientX; down.y = e.clientY; } return; }
    if (touch || busy()) return; const rec = scene.pick(e.clientX, e.clientY); scene.setHover(rec); stage.classList.toggle('hover', !!rec);
  });
  stage.addEventListener('pointerup', e => { if (!down) return; const was = dragged; down = null; if (was || isControl(e.target) || busy()) return; const rec = scene.pick(e.clientX, e.clientY); if (rec) select(rec.c); });
  stage.addEventListener('pointercancel', () => { down = null; });
  stage.addEventListener('wheel', e => { if (e.target.closest('dialog, #search')) return; e.preventDefault(); if (!canScrub()) return; takeOver(); scene.scrub((e.deltaY + e.deltaX)*0.00022); }, { passive: false });

  function select(c){ const rec = scene.byId.get(c.id); if (!rec || rec.pending) return; if (scene.sunriseOn) endClosing(); if (scene.dawning) return;
    if (!(rec.theta > -0.02 && rec.theta < 0.85)) scene.turnTo(rec, 14*D);       // bring their place round to the front first
    seq.select(c); }
  function closeFocus(){ if (seq.state === 'MANUAL_FOCUS') seq.close(); else if (seq.state.startsWith('GUIDED_') && seq.state !== 'GUIDED_OVERVIEW') seq.manual(); }
  function resume(){ if (scene.sunriseOn) endClosing(); seq.resume(); }

  $$('[data-close]').forEach(b => b.addEventListener('click', closeFocus));
  $$('[data-resume]').forEach(b => b.addEventListener('click', resume));
  $('#b-guided').addEventListener('click', resume);
  $('#b-explore').addEventListener('click', () => { if (busy()) return; if (seq.state === 'MANUAL_FOCUS') seq.close(); else seq.manual(); note(touch ? 'Drag to move along the ring · tap a portrait to read' : 'Scroll to move along the ring · select a portrait to read'); });
  $('#b-pause').addEventListener('click', () => seq.pause());
  $('#b-full').addEventListener('click', () => { const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) Promise.resolve(f.call(el)).catch(() => note('Full screen is not available here')); else note('Full screen is not available here'); });
  const motionBtn = $('#b-motion'); const setMotion = () => { motionBtn.setAttribute('aria-pressed', String(reduced)); motionBtn.textContent = reduced ? 'Motion off' : 'Motion on'; document.documentElement.classList.toggle('reduced', reduced); };
  motionBtn.addEventListener('click', () => { reduced = !reduced; setMotion(); }); setMotion();
  if (DISPLAY) $('#b-join').hidden = true;
  document.addEventListener('keydown', e => { const typing = !!e.target.closest('input, textarea');
    if (e.key === 'Escape'){ if (!ui.search.hidden) closeSearch(); else if (ui.list.open) ui.list.close(); else closeFocus(); return; }
    if (typing) return;
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && canScrub()){ takeOver(); scene.scrub(e.key === 'ArrowRight' ? 0.035 : -0.035); }
    if (e.key === '/'){ e.preventDefault(); openSearch(); }
    if (e.shiftKey && e.key.toLowerCase() === 'c') startClosing();
    if (e.shiftKey && e.key.toLowerCase() === 'd' && !DISPLAY) ui.dev.hidden = !ui.dev.hidden; });

  // ---------- find ----------
  const hay = c => { const m = metroOf(c.metro); return (c.displayName + ' ' + c.commitment + ' ' + themeLabel(c.themeIds[0]) + ' ' + (m ? m.name + ' ' + m.code : '')).toLowerCase(); };
  const matches = q => { q = q.trim().toLowerCase(); return q ? store.list().filter(c => c.eligible && hay(c).includes(q)) : []; };
  function openSearch(){ if (busy()) return; ui.search.hidden = false; ui.sInput.value = ''; renderResults(''); ui.sInput.focus(); }
  function closeSearch(){ ui.search.hidden = true; $('#b-find').focus(); }
  $('#b-find').addEventListener('click', openSearch); $('#s-close').addEventListener('click', closeSearch); ui.sInput.addEventListener('input', () => renderResults(ui.sInput.value));
  function renderResults(q){ ui.sResults.textContent = ''; const hint = t => { const p = document.createElement('p'); p.className = 'hint'; p.textContent = t; ui.sResults.append(p); };
    if (!q.trim()) return hint('Type a name, a word from a commitment, a theme or a city.'); const res = matches(q).slice(0, 8); if (!res.length) return hint('No one matches that yet.');
    res.forEach(c => { const b = document.createElement('button'), n = document.createElement('b'), s = document.createElement('span'); b.type = 'button'; b.className = 'res'; n.textContent = c.displayName; s.textContent = c.commitment; b.append(n, s); b.addEventListener('click', () => { closeSearch(); select(c); }); ui.sResults.append(b); }); }

  // ---------- everything, as text ----------
  $('#b-list').addEventListener('click', () => { renderList(''); ui.lInput.value = ''; ui.list.showModal(); ui.lInput.focus(); });
  $('#l-close').addEventListener('click', () => ui.list.close()); ui.lInput.addEventListener('input', () => renderList(ui.lInput.value));
  function renderList(q){ q = q.trim().toLowerCase(); const all = store.list().filter(c => c.eligible), rows = q ? all.filter(c => hay(c).includes(q)) : all; ui.lRows.textContent = ''; $('#l-count').textContent = fmt(rows.length) + ' of ' + fmt(all.length);
    rows.slice(0, 500).forEach(c => { const li = document.createElement('li'), b = document.createElement('button'), n = document.createElement('b'), m = document.createElement('em'), s = document.createElement('span'); b.type = 'button'; n.textContent = c.displayName; m.className = 'mono'; m.textContent = c.metro || ''; s.textContent = c.commitment; b.append(n, m, s); b.addEventListener('click', () => { ui.list.close(); select(c); }); li.append(b); ui.lRows.append(li); }); }

  // ---------- arrivals ----------
  store.subscribe(ev => {
    if (ev.type === 'find'){ const c = store.list().find(x => x.id === ev.id); if (c) select(c); return; }
    if (ev.type !== 'added') return;
    const rec = scene.add(ev.contribution, urlOf(ev.contribution)); if (!rec) return; ui.count.textContent = fmt(scene.count); ui.empty.hidden = true;
    // the display introduces a newcomer in its own turn; a personal session never has its reading interrupted
    if (seq.state.startsWith('GUIDED') || seq.state === 'PAUSED'){ rec.pending = true; seq.enqueue(ev.contribution.id); }
    else { scene.arrive(rec, 'ring'); ui.joined.textContent = ev.contribution.displayName + ' just joined'; ui.joined.hidden = false; clearTimeout(ui.joined._t); ui.joined._t = setTimeout(() => ui.joined.hidden = true, 5200); }
  });

  // ---------- dawn and the closing ----------
  const TITLE = ui.title.innerHTML; let closeT = 0;
  function runDawn(first){
    const ms = reduced ? 0 : (MODE === 'guided' ? 17000 : 6500);
    if (first) seq.pause(); else { hidePanels(); scene.unstage(); }
    if (!ms){ chrome.classList.remove('asleep'); ui.title.classList.remove('away'); if (first) begin(); return; }
    scene.dawn(ms); ui.title.classList.add('away'); chrome.classList.add('asleep');
    setTimeout(() => ui.title.classList.remove('away'), ms*0.78); setTimeout(() => chrome.classList.remove('asleep'), ms*0.9);
    if (first) setTimeout(begin, ms*0.94);
  }
  function begin(){ if (MODE === 'guided') seq.start(); else seq.manual(); }
  function startClosing(){
    if (scene.sunriseOn || scene.dawning) return;
    seq.pause(); scene.sunrise(true); scene.flow(0.35); ui.title.classList.add('away'); renderStatus({ state: seq.state, queued: seq.queued });
    clearTimeout(closeT); closeT = setTimeout(() => { ui.title.innerHTML = '<span>Our commitments.</span><span>Made.</span>'; ui.title.classList.add('made'); ui.title.classList.remove('away'); }, reduced ? 300 : 9000);
  }
  function endClosing(){ clearTimeout(closeT); scene.sunrise(false); ui.title.classList.add('away'); setTimeout(() => { ui.title.innerHTML = TITLE; ui.title.classList.remove('made'); if (seq.state === 'GUIDED_OVERVIEW' || seq.state === 'MANUAL_EXPLORE') ui.title.classList.remove('away'); }, 1200); }

  // ---------- rehearsal controls ----------
  if (!DISPLAY){
    if (DEV) ui.dev.hidden = false;
    $('#d-arrive').addEventListener('click', () => store.simulateArrival());
    $('#d-surge').addEventListener('click', () => { let k = 0; const go = () => { store.simulateArrival(); if (++k < 5) setTimeout(go, 400); }; go(); });
    $('#d-theme').addEventListener('click', () => { if (busy()) return; const f = scene.items.filter(inFront); for (let i = 0; i < 20 && f.length; i++){ const c = f[Math.floor(Math.random()*f.length)].c, rel = related(c, 2); if (rel.length === 2) return seq.theme(c, rel); } note('Not enough related commitments in view'); });
    $('#d-dawn').addEventListener('click', () => { if (scene.sunriseOn) endClosing(); runDawn(false); });
    $('#d-close').addEventListener('click', startClosing);
    $('#d-clear').addEventListener('click', () => store.clearLocal().then(() => note('Local entries forgotten. Reload to see the wall without them.')));
    $$('[data-n]', ui.dev).forEach(a => a.addEventListener('click', e => { e.preventDefault(); const p = new URLSearchParams(location.search); p.set('n', a.dataset.n); p.set('dev', '1'); location.search = p.toString(); }));
    let frames = 0, t0 = performance.now(); (function fps(){ frames++; const now = performance.now(); if (now - t0 > 1000){ $('#d-fps').textContent = Math.round(frames*1000/(now - t0)) + ' fps · ' + scene.count; frames = 0; t0 = now; } requestAnimationFrame(fps); })();
  }

  // ---------- begin ----------
  $('#mode').textContent = MODE === 'guided' ? 'Guided display' : 'Personal exploration';
  const fonts = document.fonts && document.fonts.load ? Promise.race([Promise.all([document.fonts.load('300 40px Fraunces'), document.fonts.load('400 11px "Geist Mono"')]), new Promise(r => setTimeout(r, 1800))]).catch(() => {}) : Promise.resolve();
  Promise.all([store.ready.catch(() => store.list()), fonts]).then(([list]) => {
    scene.reset(Math.max(list.length, 1)); list.forEach(c => scene.add(c, urlOf(c)));
    ui.count.textContent = fmt(scene.count); ui.empty.hidden = scene.count > 0;
    renderStatus({ state: seq.state, queued: 0 });
    setTimeout(() => $('#veil').classList.add('off'), 500);
    if (DAWN && scene.count) runDawn(true); else { chrome.classList.remove('asleep'); ui.title.classList.remove('away'); begin(); }
    let find = params.get('find'); try { find = find || sessionStorage.getItem('ac-find'); sessionStorage.removeItem('ac-find'); } catch (e){}
    if (find) setTimeout(() => { const c = store.list().find(x => x.id === find); if (c) select(c); }, DAWN ? 8000 : 1200);
    if (params.get('closing') === '1') setTimeout(startClosing, 6000);
  });
  AC.app = { store, scene, seq, select, startClosing, endClosing };
})(window.AC);
