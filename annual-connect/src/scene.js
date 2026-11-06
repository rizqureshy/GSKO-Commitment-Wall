/* Annual Connect — WebGL scene.
   One InstancedMesh draws every portrait (photo atlas or initials atlas). Depth fade, dimming, highlight and
   occlusion fading are per-instance attributes. Camera moves are bounded tweens; the viewpoint before a focus is
   remembered so closing a promise returns exactly there. Labels are DOM, positioned by projection. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const T = window.THREE;

  const VERT = `
    attribute vec4 aRect; attribute float aAtlas; attribute float aFlip; attribute vec2 aTone; attribute vec3 aState;
    varying vec2 vUv; varying vec4 vRect; varying float vAtlas; varying vec2 vTone; varying vec3 vState; varying float vZ;
    void main(){
      vUv = vec2(aFlip > 0.5 ? 1.0 - uv.x : uv.x, uv.y); vRect = aRect; vAtlas = aAtlas; vTone = aTone; vState = aState;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vZ = -mv.z; gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision highp float;
    uniform sampler2D uPhotos; uniform sampler2D uInitials; uniform float uPhotoOK; uniform float uDim; uniform float uFogNear; uniform float uFogFar; uniform vec3 uFog; uniform float uTime;
    varying vec2 vUv; varying vec4 vRect; varying float vAtlas; varying vec2 vTone; varying vec3 vState; varying float vZ;
    vec3 samp(vec2 local, float usePhoto){ vec2 uv = vRect.xy + clamp(local, 0.0, 1.0)*vRect.zw; return mix(texture2D(uInitials, uv).rgb, texture2D(uPhotos, uv).rgb, usePhoto); }
    void main(){
      float alpha = vState.z;
      if (alpha < 0.03) discard;
      float usePhoto = (vAtlas < 0.5 && uPhotoOK > 0.5) ? 1.0 : 0.0;
      float keep = clamp(vState.x, 0.0, 1.0);
      // the nearest prints fall out of focus, like the foreground of a photograph; a featured print never does
      float nearB = smoothstep(17.0, 7.0, vZ)*(1.0 - keep);
      vec3 c = samp(vUv, usePhoto);
      if (nearB > 0.01){ vec2 o = vec2(0.028, 0.02)*nearB; c = (c*2.0 + samp(vUv + o, usePhoto) + samp(vUv - o, usePhoto) + samp(vUv + vec2(o.x, -o.y), usePhoto) + samp(vUv - vec2(o.x, -o.y), usePhoto))/6.0; }
      // per-print tonal variation so a repeated sample portrait reads as a different print
      c = (c - 0.5)*vTone.y + 0.5; c *= vTone.x;
      // soft inner vignette, like a print under glass
      vec2 e = abs(vUv - 0.5)*2.0; float vig = 1.0 - 0.22*pow(max(e.x, e.y), 4.0); c *= vig;
      // hairline edge
      float edge = step(0.988, max(e.x, e.y)); c = mix(c, vec3(0.78, 0.75, 0.70), edge*0.35*(1.0 - nearB));
      c = mix(c, vec3(dot(c, vec3(0.3,0.59,0.11)))*0.72 + 0.06, nearB*0.55);
      // atmosphere
      float f = smoothstep(uFogNear, uFogFar, vZ);
      f *= (1.0 - vState.x*0.85);
      c = mix(c, uFog, f*0.7);
      c = mix(c, vec3(dot(c, vec3(0.3,0.59,0.11))), f*0.5);
      // dim the world when something is featured; featured prints stay bright
      c *= mix(1.0 - 0.8*uDim, 1.12, keep);
      // highlight: a faint warm lift
      c += keep*vec3(0.06, 0.05, 0.03);
      c *= mix(0.3, 1.0, alpha);
      gl_FragColor = vec4(c, 1.0);
    }`;

  function easeInOut(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; }
  function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function createScene(opts){
    const { stage, canvas, poolSize } = opts; const rm = typeof opts.reducedMotion === 'function' ? opts.reducedMotion : () => !!opts.reducedMotion;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = T.sRGBEncoding;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(36, 16/9, 0.1, 200);
    const BASE = 1.75;           // world height of a scale-1 portrait
    const MAXN = 1200;

    // ---- atlases ----
    const photoTex = new T.Texture(); photoTex.encoding = T.sRGBEncoding; photoTex.minFilter = T.LinearMipmapLinearFilter; photoTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    let photoOK = 0;
    const initCanvas = document.createElement('canvas'); const ICOLS = 20, IROWS = 14, ICW = 96, ICH = 144; initCanvas.width = ICOLS*ICW; initCanvas.height = IROWS*ICH;
    const ig = initCanvas.getContext('2d'); ig.fillStyle = '#17171a'; ig.fillRect(0, 0, initCanvas.width, initCanvas.height);
    const initTex = new T.CanvasTexture(initCanvas); initTex.encoding = T.sRGBEncoding; initTex.minFilter = T.LinearMipmapLinearFilter;
    let initCount = 0;
    function drawInitials(cell, name){
      const x = (cell % ICOLS)*ICW, y = Math.floor(cell/ICOLS)*ICH;
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      const ini = parts.length ? ((Array.from(parts[0])[0] || '') + (parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : '')).toUpperCase() : '·';
      const g = ig; g.save(); g.beginPath(); g.rect(x, y, ICW, ICH); g.clip();
      const grd = g.createLinearGradient(x, y, x + ICW, y + ICH); grd.addColorStop(0, '#232326'); grd.addColorStop(1, '#141416'); g.fillStyle = grd; g.fillRect(x, y, ICW, ICH);
      g.strokeStyle = 'rgba(236,230,218,.14)'; g.lineWidth = 1; g.strokeRect(x + 6.5, y + 6.5, ICW - 13, ICH - 13);
      g.fillStyle = '#D9D2C5'; g.font = '300 34px Outfit, "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ini, x + ICW/2, y + ICH/2 + 2);
      g.fillStyle = '#C8102E'; g.fillRect(x + ICW/2 - 9, y + ICH/2 + 30, 18, 1.5);
      g.restore(); initTex.needsUpdate = true;
    }

    // ---- instanced portraits ----
    const geo = new T.PlaneGeometry(1, 1);
    const aRect = new Float32Array(MAXN*4), aAtlas = new Float32Array(MAXN), aFlip = new Float32Array(MAXN), aTone = new Float32Array(MAXN*2), aState = new Float32Array(MAXN*3);
    geo.setAttribute('aRect', new T.InstancedBufferAttribute(aRect, 4));
    geo.setAttribute('aAtlas', new T.InstancedBufferAttribute(aAtlas, 1));
    geo.setAttribute('aFlip', new T.InstancedBufferAttribute(aFlip, 1));
    geo.setAttribute('aTone', new T.InstancedBufferAttribute(aTone, 2));
    const stateAttr = new T.InstancedBufferAttribute(aState, 3).setUsage(T.DynamicDrawUsage); geo.setAttribute('aState', stateAttr);
    const mat = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: {
      uPhotos: { value: photoTex }, uInitials: { value: initTex }, uPhotoOK: { value: 0 }, uDim: { value: 0 }, uFogNear: { value: 30 }, uFogFar: { value: 98 }, uFog: { value: new T.Color('#121214') }, uTime: { value: 0 } } });
    const mesh = new T.InstancedMesh(geo, mat, MAXN); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);

    // horizon: a planet limb far behind the string, with a thin warm rim of light
    {
      const H = AC.layout.HORIZON;
      const limbVert = `varying vec3 vN, vV, vW; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*mv; }`;
      const limbU = { uCy: { value: H.center.y }, uCx: { value: H.center.x }, uR: { value: H.radius }, uDim: mat.uniforms.uDim };
      const body = new T.Mesh(new T.SphereGeometry(H.radius, 96, 64), new T.ShaderMaterial({ uniforms: limbU, vertexShader: limbVert,
        fragmentShader: `precision highp float; uniform float uCy, uCx, uR, uDim; varying vec3 vN, vV, vW; void main(){ float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0); float top = smoothstep(uCy + uR*0.5, uCy + uR*0.99, vW.y); float west = smoothstep(uCx + uR*1.1, uCx - uR*0.3, vW.x)*0.75 + 0.25; float d = 1.0 - 0.75*uDim; vec3 c = vec3(0.030, 0.030, 0.035) + vec3(0.02, 0.018, 0.015)*pow(f, 3.0)*top*d; c += vec3(0.98, 0.90, 0.74)*pow(f, 11.0)*1.7*top*west*d; gl_FragColor = vec4(c, 1.0); }` }));
      body.position.set(H.center.x, H.center.y, H.center.z); scene.add(body);
      const glow = new T.Mesh(new T.SphereGeometry(H.radius*1.04, 96, 64), new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: limbU, vertexShader: limbVert,
        fragmentShader: `precision highp float; uniform float uCy, uCx, uR, uDim; varying vec3 vN, vV, vW; void main(){ float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0); float top = smoothstep(uCy + uR*0.45, uCy + uR*1.0, vW.y); float west = smoothstep(uCx + uR*1.1, uCx - uR*0.3, vW.x)*0.75 + 0.25; float a = (pow(f, 6.0)*0.12 + pow(f, 18.0)*0.7)*top*west*(1.0 - 0.75*uDim); gl_FragColor = vec4(vec3(0.95, 0.86, 0.70)*a, a); }` }));
      glow.position.copy(body.position); scene.add(glow);
      // two faint lines of flow following the string, as in the reference
      const flowMat = new T.LineBasicMaterial({ color: 0xCFC5B4, transparent: true, opacity: 0.085 });
      [[0.9, 0.6], [-1.3, -0.5]].forEach(([oy, oz], i) => { const pts = []; for (let k = 0; k <= 120; k++){ const t = 0.02 + 0.93*k/120; const s = AC.layout.spine(t); pts.push(new T.Vector3(s.x, s.y + oy*(1 + 1.8*t) + Math.sin(t*9 + i)*0.4*t, s.z + oz*(1 + 2*t))); } scene.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), flowMat)); });
    }

    // connection arcs (shared intention)
    const arcMat = new T.LineBasicMaterial({ color: 0xC9BFAE, transparent: true, opacity: 0 });
    const arcs = new T.Group(); scene.add(arcs);
    // arrival ripple
    const ripple = new T.Mesh(new T.RingGeometry(0.98, 1, 96), new T.MeshBasicMaterial({ color: 0xD9CFBF, transparent: true, opacity: 0, side: T.DoubleSide })); ripple.visible = false; scene.add(ripple);

    // ---- instance records ----
    const items = [];            // { c, home, cur, scaleCur, hl, alpha, target }
    const byId = new Map();
    const dummy = new T.Object3D();
    function add(c, animateIn, total){
      if (items.length >= MAXN) return null;
      const home = AC.layout.homeFor(c, items.length, total || items.length + 1);
      const i = items.length;
      if (animateIn) home.phase = ((0.62 - streamPos) % 1 + 1) % 1;   // a newcomer enters where the stream is readable
      const rec = { c, home, i, x: home.x, y: home.y, z: home.z, s: animateIn ? 0.001 : 1, hl: 0, hlT: 0, alpha: 1, alphaT: 1, zoff: animateIn ? 7 : 0, bornAt: performance.now(), animateIn: !!animateIn, hover: 0 };
      items.push(rec); byId.set(c.id, rec);
      const rng = AC.data.mulberry32(AC.data.hashStr(c.id + ':tone'));
      if (c.portrait && poolSize > 0){ const p = c.portrait.pool % poolSize; const col = p % 4, row = Math.floor(p/4); aRect.set([col/4, 1 - (row + 1)/3, 1/4, 1/3], i*4); aAtlas[i] = 0; aFlip[i] = rng() > 0.5 ? 1 : 0; }
      else { const cell = initCount++ % (ICOLS*IROWS); drawInitials(cell, c.displayName); const col = cell % ICOLS, row = Math.floor(cell/ICOLS); aRect.set([col/ICOLS, 1 - (row + 1)/IROWS, 1/ICOLS, 1/IROWS], i*4); aAtlas[i] = 1; aFlip[i] = 0; }
      aTone[i*2] = 0.86 + rng()*0.26; aTone[i*2 + 1] = 0.92 + rng()*0.2;
      aState.set([0, 0, 1], i*3);
      mesh.count = items.length; geo.attributes.aRect.needsUpdate = true; geo.attributes.aAtlas.needsUpdate = true; geo.attributes.aFlip.needsUpdate = true; geo.attributes.aTone.needsUpdate = true;
      return rec;
    }

    // ---- camera model ----
    const cam = { pos: new T.Vector3(0, 1.6, 26), look: new T.Vector3(0, 1.6, 0) };
    // The stream: a position that advances around the loop. It eases to a stop while something is being read.
    let streamPos = 0, streamSpeed = 1, streamSpeedT = 1, streamTarget = null; const PL = { x: 0, y: 0, z: 0, scale: 1, t: 0 };
    // Guided overview glides alongside the ribbon: one slow pass each way. People never move; the viewer does.
    const GLIDE_PERIOD = 180; const OMEGA = 2*Math.PI/GLIDE_PERIOD; let glideOn = false, phase = 0;
    function kNow(now){ return 0.5 - 0.5*Math.cos(phase + OMEGA*now/1000); }
    function glidePose(now){ const narrow = camera.aspect < 0.9; const c = AC.layout.cameraAt(kNow(now)); return { pos: new T.Vector3(c.pos.x + (narrow ? 4 : 0), c.pos.y + (narrow ? 1.5 : 0), c.pos.z + (narrow ? 2 : 0)), look: new T.Vector3(c.look.x + (narrow ? 8 : 0), c.look.y + (narrow ? 1.0 : 0), c.look.z + (narrow ? 6 : 0)) }; }
    const user = { az: 0, el: 0, dist: 0, azT: 0, elT: 0, distT: 0 };  // bounded personal exploration offsets
    let tween = null;             // { from:{pos,look}, to:{pos,look}, t0, dur }
    let saved = null;             // viewpoint saved before a focus
    const tmpV = new T.Vector3(), tmpR = new T.Vector3(), tmpU = new T.Vector3(), tmpF = new T.Vector3();
    function flyTo(pos, look, dur, dynamic){
      if (rm()) dur = Math.min(dur, 300);
      tween = { from: { pos: cam.pos.clone(), look: cam.look.clone() }, to: { pos: pos.clone(), look: look.clone() }, t0: performance.now(), dur, dynamic: !!dynamic };
    }
    function startGlide(dur){ if (glideOn && !tween) return; glideOn = true; const g = glidePose(performance.now()); flyTo(g.pos, g.look, dur == null ? 2400 : dur, true); }
    function holdCamera(){ glideOn = false; if (tween && tween.dynamic) tween.dynamic = false; }
    function viewpoint(){ return { pos: (tween ? tween.to.pos : cam.pos).clone(), look: (tween ? tween.to.look : cam.look).clone() }; }
    function dimTo(v){ dimTarget = v; }
    let dimTarget = 0, dim = 0;

    // Frame a set of records: side = 'left' puts the group left of centre leaving room for text on the right.
    function frame(recs, mode, dur){
      const aspect = camera.aspect; const tanH = Math.tan(camera.fov*Math.PI/360);
      const narrow = aspect < 0.9;
      const center = new T.Vector3(); recs.forEach(r => center.add(new T.Vector3(r.x, r.y, r.z))); center.multiplyScalar(1/recs.length);
      // approach direction: from the current camera, so the move feels continuous, blended toward straight-on
      const from = cam.pos.clone().sub(center).normalize(); from.y *= 0.4; from.normalize(); const dir = from.lerp(new T.Vector3(0, 0.08, 1).normalize(), 0.55).normalize();
      let height;
      if (mode === 'focus' || mode === 'arrival'){
        const r = recs[0]; const h = BASE*r.home.scale*focusScale(r);
        const frac = narrow ? 0.34 : 0.6; const d = h/(2*frac*tanH);
        const lateral = narrow ? 0 : 0.42*d*tanH*aspect; const vertical = narrow ? -0.32*d*tanH : 0.02*d*tanH;
        const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), dir).normalize();
        const look = center.clone().add(right.clone().multiplyScalar(lateral)).add(new T.Vector3(0, vertical, 0));
        const pos = look.clone().add(dir.clone().multiplyScalar(d));
        flyTo(pos, look, dur);
      } else {
        let maxR = 1.5; recs.forEach(r => { maxR = Math.max(maxR, new T.Vector3(r.x, r.y, r.z).distanceTo(center) + BASE*r.home.scale*0.9); });
        const d = maxR/(Math.min(1, aspect)*tanH)*(narrow ? 1.25 : 1.05) + 2;
        const look = center.clone().add(new T.Vector3(0, narrow ? -maxR*0.55 : 0, 0));
        flyTo(look.clone().add(dir.multiplyScalar(d)), look, dur);
      }
    }
    function focusScale(r){ return r.home.scale > 1.5 ? 1.15 : 1.45; }

    // ---- occlusion fade: anything between the camera and the featured prints fades out ----
    let featuredIds = new Set();
    function setFeatured(ids){ featuredIds = new Set(ids); items.forEach(r => { r.hlT = featuredIds.has(r.c.id) ? 1 : 0; }); }
    function clearFeatured(){ setFeatured([]); }

    // ---- arcs ----
    function showArcs(recs){
      clearArcs();
      for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++){
        const a = new T.Vector3(recs[i].x, recs[i].y, recs[i].z), b = new T.Vector3(recs[j].x, recs[j].y, recs[j].z);
        if (a.distanceTo(b) > 30) continue;
        const mid = a.clone().lerp(b, 0.5).add(new T.Vector3(0, a.distanceTo(b)*0.12, 1.2));
        const pts = new T.QuadraticBezierCurve3(a, mid, b).getPoints(40);
        arcs.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), arcMat));
      }
      arcTarget = 0.42;
    }
    let arcTarget = 0;
    function clearArcs(){ arcTarget = 0; }
    function disposeArcs(){ while (arcs.children.length){ const l = arcs.children.pop(); l.geometry.dispose(); } }

    // ---- picking ----
    const ray = new T.Raycaster(); const ndc = new T.Vector2();
    function pick(clientX, clientY){
      const r = stage.getBoundingClientRect(); ndc.set(((clientX - r.left)/r.width)*2 - 1, -((clientY - r.top)/r.height)*2 + 1);
      ray.setFromCamera(ndc, camera); const hits = ray.intersectObject(mesh);
      for (const h of hits){ const rec = items[h.instanceId]; if (rec && rec.alpha > 0.4) return rec; }
      return null;
    }
    function project(rec, out){ tmpV.set(rec.x, rec.y, rec.z + rec.zoff).project(camera); const r = stage.getBoundingClientRect(); out.x = (tmpV.x*0.5 + 0.5)*r.width; out.y = (-tmpV.y*0.5 + 0.5)*r.height; out.visible = tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1; out.depth = tmpV.z;
      // on-screen half height of the print
      const h = BASE*rec.home.scale*rec.s; const d = camera.position.distanceTo(tmpU.set(rec.x, rec.y, rec.z)); out.halfH = (h/(2*d*Math.tan(camera.fov*Math.PI/360)))*r.height*0.5; out.halfW = out.halfH*rec.home.aspect; return out; }

    // ---- resize ----
    function resize(){ const r = stage.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); renderer.setPixelRatio(dpr); renderer.setSize(Math.max(2, r.width), Math.max(2, r.height), false); camera.aspect = r.width/Math.max(1, r.height); camera.updateProjectionMatrix();
    }
    resize(); new ResizeObserver(resize).observe(stage);
    { const g = glidePose(performance.now()); cam.pos.copy(g.pos); cam.look.copy(g.look); }

    // ---- frame loop ----
    let last = performance.now(); let hoverRec = null; let rippleT = 99;
    function tick(now){
      const dt = Math.min(0.05, (now - last)/1000); last = now; const t = now/1000;
      // camera
      if (tween){ if (tween.dynamic){ const g = glidePose(now); tween.to.pos.copy(g.pos); tween.to.look.copy(g.look); } const k = clamp((now - tween.t0)/tween.dur, 0, 1); const e = easeInOut(k); cam.pos.lerpVectors(tween.from.pos, tween.to.pos, e); cam.look.lerpVectors(tween.from.look, tween.to.look, e); if (k >= 1) tween = null; }
      else if (glideOn){ const g = glidePose(now); cam.pos.copy(g.pos); cam.look.copy(g.look); }
      // user offsets (bounded orbit) with damping
      user.az += (user.azT - user.az)*(1 - Math.pow(0.001, dt)); user.el += (user.elT - user.el)*(1 - Math.pow(0.001, dt)); user.dist += (user.distT - user.dist)*(1 - Math.pow(0.001, dt));
      const quiet = rm(); const driftAz = quiet ? 0 : Math.sin(t*0.07)*0.045, driftEl = quiet ? 0 : Math.sin(t*0.05 + 1)*0.02;
      tmpF.copy(cam.pos).sub(cam.look); const len = tmpF.length() + user.dist; const az = Math.atan2(tmpF.x, tmpF.z) + user.az + driftAz; const el = Math.asin(clamp(tmpF.y/Math.max(0.001, tmpF.length()), -1, 1)) + user.el + driftEl;
      camera.position.set(cam.look.x + Math.sin(az)*Math.cos(el)*len, cam.look.y + Math.sin(el)*len, cam.look.z + Math.cos(az)*Math.cos(el)*len); camera.lookAt(cam.look);
      // dim
      dim += (dimTarget - dim)*(1 - Math.pow(0.02, dt)); mat.uniforms.uDim.value = dim; mat.uniforms.uTime.value = t;
      // occlusion line
      let occA = null, occB = null; if (featuredIds.size && dim > 0.3){ occA = camera.position; }
      // stream advance
      streamSpeed += (streamSpeedT - streamSpeed)*(1 - Math.pow(0.03, dt));
      if (streamTarget != null){ const diff = streamTarget - streamPos; streamPos += diff*(1 - Math.pow(0.0008, dt)); if (Math.abs(diff) < 0.00004){ streamPos = streamTarget; streamTarget = null; } }
      else if (!quiet) streamPos += dt/AC.layout.STREAM_PERIOD*streamSpeed;
      // instances
      const n = items.length; const camPos = camera.position;
      for (let i = 0; i < n; i++){ const r = items[i]; const h = r.home;
        const dx = quiet ? 0 : Math.sin(t*h.drift.ax + h.drift.px)*h.drift.sx, dy = quiet ? 0 : Math.sin(t*h.drift.ay + h.drift.py)*h.drift.sy;
        AC.layout.place(h, ((h.phase + streamPos) % 1 + 1) % 1, PL); h.scale = PL.scale; h.t = PL.t; r.x = PL.x + dx; r.y = PL.y + dy; r.z = PL.z;
        if (r.animateIn){ const k = clamp((now - r.bornAt)/2600, 0, 1); const e = easeOut(k); r.s = 0.001 + e*0.999; r.zoff = 7*(1 - e); if (k >= 1) r.animateIn = false; }
        r.hl += (r.hlT - r.hl)*(1 - Math.pow(0.02, dt));
        // occlusion: fade prints that sit between the camera and any featured print
        let aT = 1;
        if (occA && r.hlT < 0.5){ for (const id of featuredIds){ const f = byId.get(id); if (!f) continue; tmpV.set(f.x, f.y, f.z).sub(occA); const L = tmpV.length(); tmpV.multiplyScalar(1/L); tmpU.set(r.x, r.y, r.z).sub(occA); const along = tmpU.dot(tmpV); if (along > 0 && along < L - 0.5){ const perp = tmpU.sub(tmpV.multiplyScalar(along)).length(); const rad = 1.4 + BASE*(h.scale*0.7 + f.home.scale*1.7); if (perp < rad){ aT = Math.min(aT, perp < rad*0.55 ? 0 : 0.08 + 0.3*(perp/rad)); } } } }
        if (featuredIds.size && r.hlT < 0.5 && dim > 0.2){ const dc = camPos.distanceTo(tmpU.set(r.x, r.y, r.z + r.zoff)); if (dc < 13) aT = 0; else if (dc < 20) aT = Math.min(aT, 0.1 + 0.3*(dc - 13)/7); }
        if (featuredIds.size && r.hlT < 0.5 && dim > 0.2){ tmpV.set(r.x, r.y, r.z).project(camera); if (camera.aspect < 0.9 ? tmpV.y < 0.05 : tmpV.x > 0.0) aT = Math.min(aT, 0.1); }
        if (!r.c.eligible || r.pending) aT = 0;
        r.alphaT = aT; r.alpha += (r.alphaT - r.alpha)*(1 - Math.pow(0.03, dt));
        const sc = r.s*h.scale*(1 + r.hl*(focusScale(r) - 1))*(1 + r.hover*0.06)*(0.12 + 0.88*r.alpha);
        dummy.position.set(r.x, r.y, r.z + r.zoff + r.hl*0.6); dummy.quaternion.copy(camera.quaternion); dummy.scale.set(BASE*h.aspect*sc, BASE*sc, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        aState[i*3] = r.hl; aState[i*3 + 1] = 0; aState[i*3 + 2] = r.alpha;
      }
      mesh.instanceMatrix.needsUpdate = true; stateAttr.needsUpdate = true;
      mat.uniforms.uFogFar.value = n > 600 ? 90 : 98; mat.uniforms.uFogNear.value = n > 600 ? 26 : 30;
      arcMat.opacity += (arcTarget - arcMat.opacity)*(1 - Math.pow(0.05, dt)); if (arcMat.opacity < 0.01 && arcs.children.length && arcTarget === 0) disposeArcs();
      arcs.visible = arcMat.opacity > 0.01;
      if (ripple.visible){ rippleT += dt; const k = clamp(rippleT/2.2, 0, 1); ripple.scale.setScalar(0.6 + k*4.5); ripple.material.opacity = (1 - k)*0.5; ripple.quaternion.copy(camera.quaternion); if (k >= 1) ripple.visible = false; }
      renderer.render(scene, camera);
      if (api.onFrame) api.onFrame(now);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    const api = {
      renderer, camera, items, byId, add,
      get count(){ return items.length; },
      loadPhotos(url){ return new Promise(res => { const img = new Image(); img.onload = () => { photoTex.image = img; photoTex.needsUpdate = true; mat.uniforms.uPhotoOK.value = 1; photoOK = 1; res(true); }; img.onerror = () => { mat.uniforms.uPhotoOK.value = 0; res(false); }; img.src = url; }); },
      get photosReady(){ return photoOK === 1; },
      glide(dur){ startGlide(dur); dimTo(0); },
      hold(){ holdCamera(); },
      get gliding(){ return glideOn; },
      saveViewpoint(){ saved = Object.assign(viewpoint(), { k: kNow(performance.now()), glide: glideOn }); user.azT = user.az; user.elT = user.el; user.distT = user.dist; },
      /* resumeGlide: return to the glide at the point where it was left (guided), else return to the exact still viewpoint (manual). */
      restoreViewpoint(dur, resumeGlide){ dimTo(0); if (!saved) return; if (saved.glide && resumeGlide){ const theta = Math.acos(clamp(1 - 2*saved.k, -1, 1)); phase = theta - OMEGA*performance.now()/1000; glideOn = true; const g = glidePose(performance.now()); flyTo(g.pos, g.look, dur == null ? 1800 : dur, true); } else { glideOn = false; flyTo(saved.pos, saved.look, dur == null ? 1800 : dur); } },
      stream(v){ streamSpeedT = v; },
      /* Scrub the thread by hand: positive moves it forward (toward the viewer), negative back toward the horizon. */
      scrub(d){ if (streamTarget == null) streamTarget = streamPos; streamTarget = Math.max(streamPos - 0.2, Math.min(streamPos + 0.2, streamTarget + d)); },
      get streamPos(){ return streamPos; },
      focus(rec, dur){ holdCamera(); streamSpeedT = 0; setFeatured([rec.c.id]); frame([rec], 'focus', dur == null ? 2000 : dur); dimTo(1); },
      arrival(rec, dur){ holdCamera(); streamSpeedT = 0; setFeatured([rec.c.id]); frame([rec], 'arrival', dur == null ? 2000 : dur); dimTo(0.85); ripple.position.set(rec.x, rec.y, rec.z - 0.05); ripple.visible = true; rippleT = 0; },
      group(recs, dur){ holdCamera(); streamSpeedT = 0; setFeatured(recs.map(r => r.c.id)); frame(recs, 'group', dur == null ? 2200 : dur); dimTo(0.75); showArcs(recs); },
      pulse(ids){ ids.forEach(id => { const r = byId.get(id); if (r){ r.hl = 0.5; } }); },
      release(){ clearFeatured(); clearArcs(); dimTo(0); streamSpeedT = 1; },
      pick, project,
      setHover(rec){ if (hoverRec && hoverRec !== rec) hoverRec.hover = 0; hoverRec = rec; if (rec) rec.hover = 1; },
      orbitBy(dAz, dEl){ user.azT = clamp(user.azT + dAz, -0.55, 0.55); user.elT = clamp(user.elT + dEl, -0.22, 0.3); },
      dollyBy(d){ user.distT = clamp(user.distT + d, -12, 16); },
      resetUser(){ user.azT = 0; user.elT = 0; user.distT = 0; },
      onFrame: null
    };
    return api;
  }

  AC.scene = { createScene };
})(window.AC);
