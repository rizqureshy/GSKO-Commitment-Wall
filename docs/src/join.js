/* Annual Connect — adding a commitment, on a phone.
   Name and promise, an optional portrait (camera or library), a preview of the print as it will hang on the wall,
   the display notice, and a confirmed save. One id is fixed for the whole draft, so pressing Submit twice, or
   retrying after a failure, can never create a second person. */
(function (AC) {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const MAX = 280, PW = 640, PH = 960, TYPES = /^image\/(jpeg|png|webp|heic|heif)$/i;
  const draft = { id: AC.store.newId(), photo: null }; let saved = false, busy = false, photoURL = null;
  const form = $('#form'), nameI = $('#name'), textI = $('#text'), themeI = $('#theme'), metroI = $('#metro'), notice = $('#notice'), err = $('#err'), count = $('#count'), cv = $('#print'), g = cv.getContext('2d');

  AC.data.THEMES.forEach(t => themeI.add(new Option(t.label, t.id)));
  AC.data.METROS.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(m => metroI.add(new Option(m.name + ' · ' + m.code, m.code)));

  // ---- the print, exactly as it will hang: monochrome in the ring ----
  function drawPrint(){
    cv.width = PW; cv.height = PH;
    if (draft.bitmap){ g.filter = 'grayscale(1) contrast(1.06)'; g.drawImage(draft.bitmap, 0, 0, PW, PH); g.filter = 'none'; }
    else { const grd = g.createLinearGradient(0, 0, PW, PH); grd.addColorStop(0, '#26262b'); grd.addColorStop(1, '#151518'); g.fillStyle = grd; g.fillRect(0, 0, PW, PH);
      g.strokeStyle = 'rgba(239,233,221,.16)'; g.lineWidth = 6; g.strokeRect(44, 44, PW - 88, PH - 88);
      g.fillStyle = '#E4DDD0'; g.font = '300 250px Fraunces, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(AC.data.initials(nameI.value) , PW/2, PH*0.49);
      g.fillStyle = '#E0242C'; g.fillRect(PW/2 - 58, PH*0.49 + 190, 116, 9); }
    $('#p-name').textContent = nameI.value.trim() || 'Your name'; $('#p-text').textContent = textI.value.trim() || 'Your commitment';
    $('#p-photo-state').textContent = draft.photo ? 'Portrait added' : 'No portrait: your initials will be shown';
    $('#remove').hidden = !draft.photo;
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawPrint);

  /* Read a photo, respect its orientation, crop it to the print, and re-encode it. Re-encoding through a canvas
     is also what drops the camera's metadata: location, device and time never leave the phone. */
  async function takePhoto(file){
    fail('');
    if (!file) return;
    if (!TYPES.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '')) return fail('That file isn\'t a photo we can read. Try a JPEG or PNG.');
    if (file.size > 30*1024*1024) return fail('That photo is larger than 30 MB. Try another, or take a new one.');
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e){ try { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); }); }
      catch (e2){ return fail('This phone couldn\'t open that photo. HEIC photos sometimes fail: try taking a new one here instead.'); } }
    const w = src.width, h = src.height, want = PW/PH; let sw = w, sh = h, sx = 0, sy = 0;
    if (w/h > want){ sw = h*want; sx = (w - sw)/2; } else { sh = w/want; sy = (h - sh)*0.28; }
    const c = document.createElement('canvas'); c.width = PW; c.height = PH; c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, PW, PH);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.86));
    if (!blob) return fail('The photo couldn\'t be prepared. You can submit without one.');
    draft.photo = blob; draft.bitmap = c; drawPrint();
  }
  $('#cam').addEventListener('change', e => { takePhoto(e.target.files[0]); e.target.value = ''; });
  $('#lib').addEventListener('change', e => { takePhoto(e.target.files[0]); e.target.value = ''; });
  $('#remove').addEventListener('click', () => { draft.photo = null; draft.bitmap = null; drawPrint(); });

  function fail(msg){ err.textContent = msg; err.hidden = !msg; if (msg) err.scrollIntoView({ block: 'nearest' }); }
  function update(){ const n = textI.value.length; count.textContent = n + ' / ' + MAX; count.classList.toggle('over', n > MAX); drawPrint(); }
  [nameI, textI].forEach(el => el.addEventListener('input', update));

  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy || saved) return; fail('');
    const name = nameI.value.trim(), text = textI.value.trim();
    if (!name){ nameI.focus(); return fail('Add your name so people can find you on the wall.'); }
    if (text.length < 8){ textI.focus(); return fail('Write your commitment: a sentence is enough.'); }
    if (text.length > MAX){ textI.focus(); return fail('Shorten your commitment to ' + MAX + ' characters. It is ' + text.length + ' now.'); }
    if (!notice.checked){ notice.focus(); return fail('Tick the box to confirm you are happy for this to be shown at the event.'); }
    busy = true; const btn = $('#submit'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const out = await AC.store.submit({ id: draft.id, displayName: name, commitment: text, themeId: themeI.value || null, metro: metroI.value || null, photo: draft.photo, submittedAt: Date.now() });
      saved = true; form.hidden = true; $('#done').hidden = false; $('#d-name').textContent = name; $('#d-text').textContent = text;
      const link = $('#find'); link.href = 'index.html?mode=explore&find=' + encodeURIComponent(out.id); link.addEventListener('click', () => { try { sessionStorage.setItem('ac-find', out.id); } catch (e2){} AC.store.find(out.id); });
      $('#d-durable').hidden = out.durable; window.scrollTo(0, 0);
    } catch (e2){ fail('It didn\'t save. Check your connection and press Submit again: nothing will be duplicated.'); btn.disabled = false; btn.textContent = 'Submit'; }
    busy = false;
  });
  $('#another').addEventListener('click', () => location.reload());
  update();
})(window.AC);
