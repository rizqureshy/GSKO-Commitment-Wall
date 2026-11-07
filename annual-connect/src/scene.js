/* Annual Connect — WebGL scene.
   One InstancedMesh draws every portrait (photo atlas or initials atlas). Depth fade, dimming, highlight and
   occlusion fading are per-instance attributes. Camera moves are bounded tweens; the viewpoint before a focus is
   remembered so closing a promise returns exactly there. Labels are DOM, positioned by projection. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const T = window.THREE;

  const VERT = `
    attribute vec4 aRect; attribute float aAtlas; attribute float aFlip; attribute vec2 aTone; attribute vec4 aState; attribute float aColor;
    varying vec2 vUv; varying vec4 vRect; varying float vAtlas; varying vec2 vTone; varying vec4 vState; varying float vZ; varying float vColor;
    void main(){
      vUv = vec2(aFlip > 0.5 ? 1.0 - uv.x : uv.x, uv.y); vRect = aRect; vAtlas = aAtlas; vTone = aTone; vState = aState; vColor = aColor;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vZ = -mv.z; gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision highp float;
    uniform sampler2D uPhotos; uniform sampler2D uInitials; uniform float uPhotoOK; uniform float uDim; uniform float uFogNear; uniform float uFogFar; uniform vec3 uFog; uniform float uTime;
    varying vec2 vUv; varying vec4 vRect; varying float vAtlas; varying vec2 vTone; varying vec4 vState; varying float vZ; varying float vColor;
    vec3 samp(vec2 local, float usePhoto){ vec2 uv = vRect.xy + clamp(local, 0.0, 1.0)*vRect.zw; return mix(texture2D(uInitials, uv).rgb, texture2D(uPhotos, uv).rgb, usePhoto); }
    void main(){
      float alpha = vState.z; float vis = vState.w; float light = vState.y;
      if (alpha*vis < 0.03) discard;
      float usePhoto = (vAtlas < 0.5 && uPhotoOK > 0.5) ? 1.0 : 0.0;
      float keep = clamp(vState.x, 0.0, 1.0);
      // the nearest prints fall out of focus, like the foreground of a photograph; a featured print never does
      float nearB = smoothstep(17.0, 7.0, vZ)*(1.0 - keep);
      vec3 c = samp(vUv, usePhoto);
      if (nearB > 0.01){ vec2 o = vec2(0.028, 0.02)*nearB; c = (c*2.0 + samp(vUv + o, usePhoto) + samp(vUv - o, usePhoto) + samp(vUv + vec2(o.x, -o.y), usePhoto) + samp(vUv - vec2(o.x, -o.y), usePhoto))/6.0; }
      // the crowd is monochrome; a person comes into colour when they come forward
      float lum = dot(c, vec3(0.3, 0.59, 0.11)); c = mix(vec3(lum), c, clamp(vColor, 0.0, 1.0));
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
      // travelling light and the closing: a warm lift with a little more contrast, strongest where the air is clear
      c = mix(c, (c - 0.5)*1.18 + 0.5, clamp(light, 0.0, 1.0)*0.5);
      c += light*vec3(0.20, 0.185, 0.16)*(1.0 - f*0.6);
      c *= mix(0.3, 1.0, alpha);
      // dawn: prints come up out of the dark, horizon first
      c *= vis;
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
    const aRect = new Float32Array(MAXN*4), aAtlas = new Float32Array(MAXN), aFlip = new Float32Array(MAXN), aTone = new Float32Array(MAXN*2), aState = new Float32Array(MAXN*4);
    geo.setAttribute('aRect', new T.InstancedBufferAttribute(aRect, 4));
    geo.setAttribute('aAtlas', new T.InstancedBufferAttribute(aAtlas, 1));
    geo.setAttribute('aFlip', new T.InstancedBufferAttribute(aFlip, 1));
    geo.setAttribute('aTone', new T.InstancedBufferAttribute(aTone, 2));
    const stateAttr = new T.InstancedBufferAttribute(aState, 4).setUsage(T.DynamicDrawUsage); geo.setAttribute('aState', stateAttr);
    const aColor = new Float32Array(MAXN); const colorAttr = new T.InstancedBufferAttribute(aColor, 1).setUsage(T.DynamicDrawUsage); geo.setAttribute('aColor', colorAttr);
    const mat = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: {
      uPhotos: { value: photoTex }, uInitials: { value: initTex }, uPhotoOK: { value: 0 }, uDim: { value: 0 }, uFogNear: { value: 30 }, uFogFar: { value: 98 }, uFog: { value: new T.Color('#121214') }, uTime: { value: 0 } } });
    const mesh = new T.InstancedMesh(geo, mat, MAXN); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);
    let rimU = null;
    const ss = (a, b, x) => { const k = clamp((x - a)/(b - a), 0, 1); return k*k*(3 - 2*k); };
    // choreography state: dawn, the travelling light, the crowd making way, the closing
    let dawn = null;            // { t0, dur }
    let pulseP = -1, pulseOn = false, lastPulse = 0;
    let partK = 0;
    let closing = null;         // { t0 }
    let lifted = null;          // the print pulled out of the stream onto the stage
    const camR = new T.Vector3(), camUp = new T.Vector3(), camF = new T.Vector3(), stagePos = new T.Vector3();

    // the Earth at night, below the horizon: a slowly turning globe of city lights with a sunrise on its left limb
    const H = AC.layout.HORIZON;
    const earth = new T.Group(); earth.position.set(H.center.x, H.center.y, H.center.z); earth.rotation.set(H.tilt || 0.95, 0, H.roll || -0.25); scene.add(earth);
    const spinner = new T.Group(); earth.add(spinner);
    const lightsTex = new T.Texture(); lightsTex.encoding = T.sRGBEncoding; lightsTex.minFilter = T.LinearMipmapLinearFilter; lightsTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const sunDir = new T.Vector3(-0.78, 0.52, 0.35).normalize();
    const earthU = { uLights: { value: lightsTex }, uHas: { value: 0 }, uRim: { value: 1 }, uDim: mat.uniforms.uDim, uSun: { value: sunDir }, uTime: { value: 0 } };
    rimU = earthU.uRim;
    const earthVert = `varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(cameraPosition - (modelMatrix*vec4(position,1.0)).xyz); gl_Position = projectionMatrix*mv; }`;
    const body = new T.Mesh(new T.SphereGeometry(H.radius, 160, 112), new T.ShaderMaterial({ uniforms: earthU, vertexShader: earthVert,
      fragmentShader: `precision highp float; uniform sampler2D uLights; uniform float uHas, uRim, uDim, uTime; uniform vec3 uSun; varying vec2 vUv; varying vec3 vN, vV;
        void main(){
          vec3 n = normalize(vN); float ndl = dot(n, uSun); float f = 1.0 - max(dot(n, normalize(vV)), 0.0);
          float d = (1.0 - 0.7*uDim)*uRim;
          vec3 lights = uHas > 0.5 ? texture2D(uLights, vUv).rgb : vec3(0.0);
          float night = 1.0 - smoothstep(-0.12, 0.12, ndl);
          vec3 c = vec3(0.012, 0.012, 0.016);
          c += lights*vec3(1.0, 0.86, 0.62)*0.8*night*d*(0.92 + 0.08*sin(uTime*0.7 + vUv.x*140.0 + vUv.y*90.0));
          c += vec3(0.03, 0.033, 0.042)*smoothstep(-0.05, 0.35, ndl)*d;
          float sunrise = pow(f, 7.0)*smoothstep(-0.25, 0.25, ndl);
          c += vec3(0.98, 0.88, 0.70)*sunrise*1.6*d + vec3(0.6, 0.5, 0.42)*pow(f, 3.0)*0.08*d;
          gl_FragColor = vec4(c, 1.0); }` }));
    spinner.add(body);
    const glow = new T.Mesh(new T.SphereGeometry(H.radius*1.035, 128, 96), new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: earthU, vertexShader: earthVert,
      fragmentShader: `precision highp float; uniform float uRim, uDim; uniform vec3 uSun; varying vec3 vN, vV; void main(){ vec3 n = normalize(vN); float ndl = dot(n, uSun); float f = 1.0 - max(dot(n, normalize(vV)), 0.0); float a = (pow(f, 6.0)*0.10 + pow(f, 16.0)*0.6)*(0.25 + 0.75*smoothstep(-0.3, 0.3, ndl))*(1.0 - 0.7*uDim)*uRim; gl_FragColor = vec4(vec3(0.95, 0.86, 0.70)*a, a); }` }));
    earth.add(glow);
    const METROS = AC.data.METROS; const MN = METROS.length; const mPos = new Float32Array(MN*3), mFeat = new Float32Array(MN), mSeed = new Float32Array(MN);
    const metroLocal = METROS.map((m, i) => { const phi = (m.lon + 180)*Math.PI/180, th = (90 - m.lat)*Math.PI/180; const R = H.radius*1.004; const v = new T.Vector3(-R*Math.cos(phi)*Math.sin(th), R*Math.cos(th), R*Math.sin(phi)*Math.sin(th)); mPos.set([v.x, v.y, v.z], i*3); mSeed[i] = (i*0.37) % 1; return v; });
    const mGeo = new T.BufferGeometry(); mGeo.setAttribute('position', new T.BufferAttribute(mPos, 3)); const mFeatAttr = new T.BufferAttribute(mFeat, 1).setUsage(T.DynamicDrawUsage); mGeo.setAttribute('aFeat', mFeatAttr); mGeo.setAttribute('aSeed', new T.BufferAttribute(mSeed, 1));
    const metros = new T.Points(mGeo, new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uTime: { value: 0 }, uDim: mat.uniforms.uDim, uRim: earthU.uRim },
      vertexShader: `attribute float aFeat, aSeed; uniform float uTime; varying float vA; varying float vF; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vec3 n = normalize(mat3(modelMatrix)*normalize(position)); vec3 toCam = normalize(cameraPosition - (modelMatrix*vec4(position,1.0)).xyz); float facing = smoothstep(0.02, 0.25, dot(n, toCam)); vF = aFeat; vA = facing*(0.55 + 0.45*sin(uTime*1.3 + aSeed*20.0)); gl_PointSize = (3.0 + 9.0*aFeat)*(1400.0/max(1.0, -mv.z)); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `precision highp float; uniform float uDim, uRim; varying float vA; varying float vF; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d*2.0, 1.6)*vA*(0.55 + vF*1.2)*(1.0 - 0.5*uDim)*uRim; gl_FragColor = vec4(vec3(1.0, 0.92, 0.78)*a, a); }` }));
    spinner.add(metros);
    const tieGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]); const tieMat = new T.LineBasicMaterial({ color: 0xE8DCC4, transparent: true, opacity: 0 }); const tie = new T.Line(tieGeo, tieMat); tie.frustumCulled = false; scene.add(tie);
    const metroIndex = new Map(METROS.map((m, i) => [m.name, i]));
    const EARTH_PERIOD = 540; const tmpM = new T.Vector3();

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
      if (animateIn) home.phase = ((0.70 - streamPos) % 1 + 1) % 1;   // a newcomer enters at the front, where the newest belong
      const rec = { c, home, i, x: home.x, y: home.y, z: home.z, s: animateIn ? 0.001 : 1, hl: 0, hlT: 0, alpha: 1, alphaT: 1, zoff: animateIn ? 7 : 0, bornAt: performance.now(), animateIn: !!animateIn, hover: 0, lift: 0, liftT: 0 };
      items.push(rec); byId.set(c.id, rec);
      const rng = AC.data.mulberry32(AC.data.hashStr(c.id + ':tone'));
      if (c.portrait && poolSize > 0){ const p = c.portrait.pool % poolSize; const col = p % 4, row = Math.floor(p/4); aRect.set([col/4, 1 - (row + 1)/3, 1/4, 1/3], i*4); aAtlas[i] = 0; aFlip[i] = rng() > 0.5 ? 1 : 0; }
      else { const cell = initCount++ % (ICOLS*IROWS); drawInitials(cell, c.displayName); const col = cell % ICOLS, row = Math.floor(cell/ICOLS); aRect.set([col/ICOLS, 1 - (row + 1)/IROWS, 1/ICOLS, 1/IROWS], i*4); aAtlas[i] = 1; aFlip[i] = 0; }
      aTone[i*2] = 0.86 + rng()*0.26; aTone[i*2 + 1] = 0.92 + rng()*0.2;
      aState.set([0, 0, 1, 1], i*4);
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
        if (a.distanceTo(b) > 48) continue;
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
      // choreography
      let dawnFront = 2, rim = 1;
      if (dawn){ const k = clamp((now - dawn.t0)/dawn.dur, 0, 1); rim = ss(0, 0.4, k); dawnFront = -0.2 + 1.55*ss(0.12, 0.92, k); if (k >= 1) dawn = null; }
      if (pulseOn){ pulseP += dt/11; if (pulseP > 1.25) pulseOn = false; }
      else if (!quiet && !closing && !featuredIds.size && now - lastPulse > 52000){ lastPulse = now; pulseOn = true; pulseP = -0.2; }
      const flare = pulseOn ? Math.max(0, 1 - (pulseP + 0.2)/0.3) : 0;
      if (rimU) rimU.value = rim*(1 + 0.6*flare);
      let closeP = -1, closeHold = 0;
      if (closing){ const k = (now - closing.t0)/1000; closeP = -0.1 + 1.25*clamp(k/9, 0, 1); closeHold = ss(9, 11, k)*0.3; }
      partK += (((featuredIds.size && dim > 0.1) ? 1 : 0) - partK)*(1 - Math.pow(0.02, dt));
      // instances: positions first, so the crowd can make way around the featured prints
      const n = items.length; const camPos = camera.position;
      for (let i = 0; i < n; i++){ const r = items[i]; const h = r.home;
        const dx = quiet ? 0 : Math.sin(t*h.drift.ax + h.drift.px)*h.drift.sx, dy = quiet ? 0 : Math.sin(t*h.drift.ay + h.drift.py)*h.drift.sy;
        AC.layout.place(h, ((h.phase + streamPos) % 1 + 1) % 1, PL); h.scale = PL.scale; h.t = PL.t; r.x = PL.x + dx; r.y = PL.y + dy; r.z = PL.z; }
      // the stage: a spot in front of the camera, right of centre on a wide screen, upper half on a phone
      { const e = camera.matrixWorld.elements; camR.set(e[0], e[1], e[2]).normalize(); camUp.set(e[4], e[5], e[6]).normalize(); camF.set(-e[8], -e[9], -e[10]).normalize(); }
      const narrowV = camera.aspect < 0.9, tanH = Math.tan(camera.fov*Math.PI/360), SD = 9.5;
      const sx = narrowV ? 0 : 0.40, sy = narrowV ? 0.30 : -0.03, sFrac = narrowV ? 0.34 : 0.62;
      stagePos.copy(camPos).addScaledVector(camF, SD).addScaledVector(camR, sx*SD*tanH*camera.aspect).addScaledVector(camUp, sy*SD*tanH);
      const stageSc = (2*SD*tanH*sFrac)/BASE;
      const feats = []; if (partK > 0.01 && !lifted) for (const id of featuredIds){ const f = byId.get(id); if (f) feats.push(f); }
      for (let i = 0; i < n; i++){ const r = items[i]; const h = r.home;
        if (feats.length && r.hlT < 0.5){ for (const f of feats){ let ox = r.x - f.x, oy = r.y - f.y; const d = Math.hypot(ox, oy) || 0.001; const R = 2.4 + BASE*f.home.scale*focusScale(f)*1.15; if (d < R && Math.abs(r.z - f.z) < 9){ const push = (R - d)*partK; r.x += ox/d*push; r.y += oy/d*push; } } }
        let light = 0;
        if (pulseOn) light = Math.exp(-Math.pow((h.t - pulseP)/0.08, 2))*1.1;
        if (closing){ const sweep = Math.exp(-Math.pow((h.t - closeP)/0.045, 2))*1.1; light = Math.max(light, sweep, h.t < closeP ? closeHold : 0); }
        const vis = dawn ? 1 - ss(dawnFront - 0.42, dawnFront, h.t) : 1;
        if (r.animateIn){ const k = clamp((now - r.bornAt)/2600, 0, 1); const e = easeOut(k); r.s = 0.001 + e*0.999; r.zoff = 7*(1 - e); if (k >= 1) r.animateIn = false; }
        r.hl += (r.hlT - r.hl)*(1 - Math.pow(0.02, dt));
        // occlusion: fade prints that sit between the camera and any featured print
        let aT = 1;
        if (occA && r.hlT < 0.5 && !lifted){ for (const id of featuredIds){ const f = byId.get(id); if (!f) continue; tmpV.set(f.x, f.y, f.z).sub(occA); const L = tmpV.length(); tmpV.multiplyScalar(1/L); tmpU.set(r.x, r.y, r.z).sub(occA); const along = tmpU.dot(tmpV); if (along > 0 && along < L - 0.5){ const perp = tmpU.sub(tmpV.multiplyScalar(along)).length(); const rad = 1.4 + BASE*(h.scale*0.7 + f.home.scale*1.7); if (perp < rad){ aT = Math.min(aT, perp < rad*0.55 ? 0 : 0.08 + 0.3*(perp/rad)); } } } }
        if (featuredIds.size && r.hlT < 0.5 && dim > 0.2){ const dc = camPos.distanceTo(tmpU.set(r.x, r.y, r.z + r.zoff)); if (lifted){ if (dc < SD + 2.5) aT = 0; } else { if (dc < 13) aT = 0; else if (dc < 20) aT = Math.min(aT, 0.1 + 0.3*(dc - 13)/7); } }
        if (featuredIds.size && r.hlT < 0.5 && dim > 0.2){ tmpV.set(r.x, r.y, r.z).project(camera);
          if (lifted){ const behindText = narrowV ? tmpV.y < -0.1 : tmpV.x < -0.02; const behindStage = narrowV ? Math.abs(tmpV.y - sy) < 0.45 : (Math.abs(tmpV.x - sx) < 0.3 && Math.abs(tmpV.y - sy) < 0.75); aT = Math.min(aT, behindText ? 0.2 : behindStage ? 0.28 : 0.62); }
          else if (camera.aspect < 0.9 ? tmpV.y < 0.05 : tmpV.x > 0.0) aT = Math.min(aT, 0.1); }
        if (!r.c.eligible || r.pending) aT = 0;
        r.alphaT = aT; r.alpha += (r.alphaT - r.alpha)*(1 - Math.pow(0.03, dt));
        r.lift += (r.liftT - r.lift)*(1 - Math.pow(0.012, dt)); if (r.lift < 0.001 && r.liftT === 0) r.lift = 0;
        const liftK = r.lift > 0 ? easeInOut(clamp(r.lift, 0, 1)) : 0;
        const hlK = r.hl*(1 - liftK);
        let sc = r.s*h.scale*(1 + hlK*(focusScale(r) - 1))*(1 + r.hover*0.06)*(0.12 + 0.88*r.alpha);
        dummy.position.set(r.x, r.y, r.z + r.zoff + hlK*0.6);
        if (liftK > 0){ dummy.position.lerp(stagePos, liftK); sc = sc*(1 - liftK) + stageSc*liftK; }
        dummy.quaternion.copy(camera.quaternion); dummy.scale.set(BASE*h.aspect*sc, BASE*sc, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        aState[i*4] = r.hl; aState[i*4 + 1] = light; aState[i*4 + 2] = r.alpha; aState[i*4 + 3] = vis; aColor[i] = liftK;
      }
      mesh.instanceMatrix.needsUpdate = true; stateAttr.needsUpdate = true; colorAttr.needsUpdate = true;
      mat.uniforms.uFogFar.value = n > 600 ? 90 : 98; mat.uniforms.uFogNear.value = n > 600 ? 26 : 30;
      arcMat.opacity += (arcTarget - arcMat.opacity)*(1 - Math.pow(0.05, dt)); if (arcMat.opacity < 0.01 && arcs.children.length && arcTarget === 0) disposeArcs();
      arcs.visible = arcMat.opacity > 0.01;
      if (ripple.visible){ rippleT += dt; const k = clamp(rippleT/2.2, 0, 1); ripple.scale.setScalar(0.6 + k*4.5); ripple.material.opacity = (1 - k)*0.5; ripple.quaternion.copy(camera.quaternion); if (k >= 1) ripple.visible = false; }
      if (!quiet) spinner.rotation.y += dt*2*Math.PI/EARTH_PERIOD; earthU.uTime.value = t; metros.material.uniforms.uTime.value = t;
      let featMetro = -1; if (lifted && lifted.c.metro != null && metroIndex.has(lifted.c.metro)) featMetro = metroIndex.get(lifted.c.metro);
      for (let i = 0; i < MN; i++){ const want = i === featMetro ? lifted.lift : 0; mFeat[i] += (want - mFeat[i])*(1 - Math.pow(0.02, dt)); } mFeatAttr.needsUpdate = true;
      let tieA = 0;
      if (featMetro >= 0){ tmpM.copy(metroLocal[featMetro]); spinner.localToWorld(tmpM); tmpV.copy(tmpM).sub(earth.position).normalize(); tmpU.copy(camPos).sub(tmpM).normalize(); if (tmpV.dot(tmpU) > 0.08){ const p = tieGeo.attributes.position.array; p[0] = tmpM.x; p[1] = tmpM.y; p[2] = tmpM.z; p[3] = stagePos.x; p[4] = stagePos.y - stageSc*BASE*0.5; p[5] = stagePos.z; tieGeo.attributes.position.needsUpdate = true; tieA = 0.28*easeInOut(clamp(lifted.lift, 0, 1)); } }
      tieMat.opacity += (tieA - tieMat.opacity)*(1 - Math.pow(0.03, dt)); tie.visible = tieMat.opacity > 0.01;
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
      loadEarth(url){ return new Promise(res => { const img = new Image(); img.onload = () => { lightsTex.image = img; lightsTex.needsUpdate = true; earthU.uHas.value = 1; res(true); }; img.onerror = () => res(false); img.src = url; }); },
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
      /* Focus lifts the chosen print out of the stream onto the stage; the stream keeps flowing behind it. */
      focus(rec){ if (lifted && lifted !== rec) lifted.liftT = 0; setFeatured([rec.c.id]); lifted = rec; rec.liftT = 1; dimTo(0.55); },
      arrival(rec){ if (lifted && lifted !== rec) lifted.liftT = 0; setFeatured([rec.c.id]); lifted = rec; rec.liftT = 1; dimTo(0.5); ripple.position.set(rec.x, rec.y, rec.z - 0.05); ripple.visible = true; rippleT = 0; },
      get lifted(){ return lifted; },
      group(recs, dur){ holdCamera(); streamSpeedT = 0; setFeatured(recs.map(r => r.c.id)); frame(recs, 'group', dur == null ? 2200 : dur); dimTo(0.75); showArcs(recs); },
      pulse(ids){ ids.forEach(id => { const r = byId.get(id); if (r){ r.hl = 0.5; } }); },
      /* Dawn: the horizon brightens, then the prints come up along the stream from the horizon to the front. */
      dawn(ms){ if (rm()){ dawn = null; return; } dawn = { t0: performance.now(), dur: ms || 18000 }; lastPulse = performance.now(); },
      get dawning(){ return !!dawn; },
      /* The travelling light: one warm pulse runs the length of the stream. Also fires on its own now and then. */
      travel(){ pulseOn = true; pulseP = -0.2; lastPulse = performance.now(); },
      /* The closing: the stream stops and every print lights in turn from the horizon to the front, then holds lit. */
      closing(on){ if (on){ closing = { t0: performance.now() }; streamSpeedT = 0; } else { closing = null; } },
      get closingOn(){ return !!closing; },
      release(){ clearFeatured(); clearArcs(); dimTo(0); streamSpeedT = 1; if (lifted){ lifted.liftT = 0; lifted = null; } },
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
