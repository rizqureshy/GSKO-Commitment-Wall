/* Annual Connect — the scene.
   An Earth at night that turns beneath a ring of portraits. One instanced draw for the crowd, a handful of meshes
   for everything else. The camera does not travel: the ring and the planet do the moving.
   The crowd is monochrome; a person comes into colour when they are lifted out of the ring onto the stage. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const T = window.THREE, O = AC.orbit, D = Math.PI/180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, k) => a + (b - a)*k;
  const ss = (a, b, x) => { const k = clamp((x - a)/(b - a), 0, 1); return k*k*(3 - 2*k); };
  const easeIO = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  const PRINT_VERT = `
    attribute vec4 aRect; attribute vec2 aLook; attribute vec2 aTone; attribute vec4 aState; attribute vec2 aAir;
    varying vec2 vUv; varying vec4 vRect; varying float vSrc; varying vec2 vTone; varying vec4 vState; varying vec2 vAir; varying float vZ;
    void main(){
      vUv = vec2(aLook.y > 0.5 ? 1.0 - uv.x : uv.x, uv.y); vRect = aRect; vSrc = aLook.x; vTone = aTone; vState = aState; vAir = aAir;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vZ = -mv.z; gl_Position = projectionMatrix * mv;
    }`;
  const PRINT_FRAG = `
    precision highp float;
    uniform sampler2D uPhotos; uniform sampler2D uInitials; uniform float uDim, uFront, uSunK;
    varying vec2 vUv; varying vec4 vRect; varying float vSrc; varying vec2 vTone; varying vec4 vState; varying vec2 vAir; varying float vZ;
    vec3 samp(vec2 l){ vec2 uv = vRect.xy + clamp(l, 0.0, 1.0)*vRect.zw; return vSrc > 0.5 ? texture2D(uInitials, uv).rgb : texture2D(uPhotos, uv).rgb; }
    void main(){
      float keep = clamp(vState.x, 0.0, 1.0), glow = vState.y, alpha = vState.z, colour = clamp(vState.w, 0.0, 1.0), vis = vAir.x, theta = vAir.y;
      if (alpha*vis < 0.03) discard;
      // the nearest prints fall out of focus, like the foreground of a photograph; a featured print never does
      float nearB = smoothstep(19.0, 8.0, vZ)*(1.0 - keep);
      vec3 c = samp(vUv);
      if (nearB > 0.01){ vec2 o = vec2(0.016, 0.011)*nearB; c = (c*2.0 + samp(vUv + o) + samp(vUv - o) + samp(vUv + vec2(o.x, -o.y)) + samp(vUv - vec2(o.x, -o.y)) + samp(vUv + vec2(o.x*1.8, 0.0)) + samp(vUv - vec2(o.x*1.8, 0.0)) + samp(vUv + vec2(0.0, o.y*1.8)) + samp(vUv - vec2(0.0, o.y*1.8)))/10.0; }
      float lum = dot(c, vec3(0.3, 0.59, 0.11)); c = mix(vec3(lum), c, colour);
      // each print is toned a little differently, so a repeated sample face reads as another print
      c = (c - 0.5)*vTone.y + 0.5; c *= vTone.x;
      vec2 e = abs(vUv - 0.5)*2.0; c *= 1.0 - 0.2*pow(max(e.x, e.y), 4.0);
      c = mix(c, vec3(0.80, 0.77, 0.71), step(0.986, max(e.x, e.y))*0.38*(1.0 - nearB));
      // distance: quieter and greyer, never fogged
      float far = smoothstep(60.0, 200.0, vZ)*(1.0 - keep);
      c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11)))*0.72, far*0.6);
      // first light: prints coming over the limb are in the sun before the ones near us
      float lit = smoothstep(uFront - 0.2, uFront + 0.03, theta)*(1.0 - keep);
      c = c*(1.0 + lit*uSunK*vec3(0.95, 0.70, 0.46)) + lit*uSunK*vec3(0.08, 0.05, 0.02);
      c *= mix(1.0 - 0.78*uDim, 1.06, keep);
      c += glow*vec3(0.95, 0.84, 0.66);
      c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11)))*0.6 + 0.04, nearB*0.5);
      c *= mix(0.3, 1.0, alpha)*vis;
      gl_FragColor = vec4(c, 1.0);
    }`;

  const EARTH_VERT = `varying vec2 vUv; varying vec3 vN, vV;
    void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position, 1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`;
  const EARTH_FRAG = `
    precision highp float;
    uniform sampler2D uNight, uDay; uniform float uHasN, uHasD, uDim, uWake, uTime; uniform vec3 uSun;
    varying vec2 vUv; varying vec3 vN, vV;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    void main(){
      vec3 n = normalize(vN); float ndl = dot(n, uSun); float f = 1.0 - max(dot(n, normalize(vV)), 0.0);
      vec3 nt = uHasN > 0.5 ? texture2D(uNight, vUv).rgb : vec3(0.0);
      // city lights are the warm part of the night map; they are broken into points so they hold up close
      float lights = smoothstep(0.10, 0.55, nt.r - nt.b*0.62);
      vec2 g = vUv*vec2(7200.0, 3600.0); float h = hash(floor(g)); float pt = smoothstep(0.75, 0.25, length(fract(g) - 0.5));
      float grain = mix(1.0, (0.2 + 2.6*step(0.45, h)*h)*pt*1.6, 0.72);
      float tw = 0.9 + 0.1*sin(uTime*0.9 + h*40.0);
      float night = 1.0 - smoothstep(-0.2, 0.02, ndl);
      float soft = smoothstep(0.02, 0.34, nt.r - nt.b*0.62);
      vec3 c = nt*vec3(0.30, 0.37, 0.50)*0.8;                                    // the land, barely
      c += vec3(1.0, 0.76, 0.46)*lights*grain*tw*2.7 + vec3(1.0, 0.62, 0.32)*soft*0.42;
      c *= night*uWake;
      // day comes round the limb
      vec3 dt = uHasD > 0.5 ? texture2D(uDay, vUv).rgb : vec3(0.08, 0.14, 0.24);
      float day = smoothstep(-0.06, 0.42, ndl);
      c += dt*day*mix(vec3(1.0, 0.66, 0.46), vec3(1.0), smoothstep(0.0, 0.3, ndl))*1.05;
      // air: a warm band along the terminator, blue on the lit limb
      float tw2 = exp(-pow((ndl - 0.03)/0.16, 2.0));
      c += vec3(1.0, 0.5, 0.24)*pow(f, 3.0)*tw2*0.4 + vec3(0.28, 0.5, 1.0)*pow(f, 3.2)*smoothstep(-0.05, 0.35, ndl)*0.7;
      c += vec3(0.10, 0.16, 0.26)*pow(f, 4.0)*0.35*uWake;                        // the limb itself, at night
      c *= 1.0 - 0.55*uDim;
      gl_FragColor = vec4(c, 1.0);
    }`;
  const AIR_FRAG = `
    precision highp float; uniform vec3 uSun; uniform float uDim, uWake; varying vec3 vN, vV;
    void main(){
      vec3 n = normalize(vN); float ndl = dot(n, uSun); float f = 1.0 - max(dot(n, normalize(vV)), 0.0);
      float sunward = smoothstep(-0.62, -0.08, ndl);
      vec3 col = mix(vec3(1.0, 0.56, 0.26), vec3(0.62, 0.80, 1.0), smoothstep(-0.36, 0.0, ndl));
      float a = (pow(f, 6.0)*0.16 + pow(f, 22.0)*1.5)*sunward;
      vec3 c = col*a + vec3(0.30, 0.62, 0.72)*pow(f, 11.0)*0.085*uWake;          // airglow, everywhere, barely
      c *= 1.0 - 0.5*uDim;
      gl_FragColor = vec4(c, 1.0);
    }`;
  const CARD_FRAG = `
    precision highp float; uniform sampler2D uMap; uniform float uAlpha, uColour, uFlip; varying vec2 vUv;
    void main(){
      vec2 uv = vec2(uFlip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y); vec3 c = texture2D(uMap, uv).rgb;
      c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, uColour);
      vec2 e = abs(vUv - 0.5)*2.0; c *= 1.0 - 0.16*pow(max(e.x, e.y), 4.0);
      c = mix(c, vec3(0.80, 0.77, 0.71), step(0.99, max(e.x, e.y))*0.5);
      gl_FragColor = vec4(c*1.04, uAlpha);
    }`;

  function create(opts){
    const { stage, canvas } = opts; const rm = opts.reducedMotion || (() => false);
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x04050A, 1); renderer.outputEncoding = T.sRGBEncoding;
    const scene = new T.Scene(); const camera = new T.PerspectiveCamera(36, 16/9, 0.5, 8000);
    const MAXN = 1600; const E = new T.Vector3(O.EARTH.x, O.EARTH.y, O.EARTH.z);
    const tmpA = new T.Vector3(), tmpB = new T.Vector3(), tmpC = new T.Vector3();

    // ---------- camera: fixed, with a sway too small to name ----------
    const fwd = new T.Vector3(), right = new T.Vector3(), up = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
    let narrow = false;
    function poseCamera(t){
      narrow = camera.aspect < 0.9; const cfg = narrow ? O.CAMERA.narrow : O.CAMERA.wide;
      if (camera.fov !== cfg.fov){ camera.fov = cfg.fov; camera.updateProjectionMatrix(); }
      const k = rm() ? 0 : 1; const yaw = (cfg.yaw + k*Math.sin(t*0.05)*0.3)*D, pitch = (cfg.pitch + k*Math.sin(t*0.037 + 1)*0.22)*D, roll = cfg.roll*D;
      fwd.set(Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
      right.crossVectors(fwd, Y).normalize(); up.crossVectors(right, fwd).normalize(); up.multiplyScalar(Math.cos(roll)).addScaledVector(right, Math.sin(roll));
      camera.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]); camera.up.copy(up); camera.lookAt(tmpA.copy(camera.position).add(fwd)); camera.updateMatrixWorld();
    }

    // ---------- stars ----------
    const starsG = new T.Group(); starsG.position.copy(E); scene.add(starsG);
    {
      const n = 1500, p = new Float32Array(n*3), s = new Float32Array(n); const rng = AC.data.mulberry32(7);
      for (let i = 0; i < n; i++){ const u = rng()*2 - 1, a = rng()*Math.PI*2, r = Math.sqrt(1 - u*u); p[i*3] = r*Math.cos(a)*3000; p[i*3 + 1] = u*3000; p[i*3 + 2] = r*Math.sin(a)*3000; s[i] = Math.pow(rng(), 3.2); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('aS', new T.BufferAttribute(s, 1));
      var starMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uA: { value: 1 }, uPx: { value: 1 } },
        vertexShader: `attribute float aS; uniform float uPx; varying float vS; void main(){ vS = aS; gl_PointSize = (1.0 + aS*2.0)*uPx; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
        fragmentShader: `precision highp float; uniform float uA; varying float vS; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = (1.0 - d*2.0)*(0.16 + 0.84*vS)*uA; gl_FragColor = vec4(vec3(0.92, 0.94, 1.0)*a, a); }` });
      const pts = new T.Points(g, starMat); pts.frustumCulled = false; starsG.add(pts);
    }

    // ---------- the Earth ----------
    const earth = new T.Group(); earth.position.copy(E); scene.add(earth);
    const orbitG = new T.Group(), tiltG = new T.Group(), spinG = new T.Group(); earth.add(orbitG); orbitG.add(tiltG); tiltG.add(spinG);
    const TILT = 40*D; tiltG.rotation.z = -TILT;            // the track is inclined, so it crosses the lit continents
    const ORBIT_RATE = 0.26*D, SPIN_RATE = 0.035*D;         // the ground passes beneath; the world also turns
    const sun = new T.Vector3(); const SUN_AZ = O.num('sunaz', -8), SUN_REST = O.num('sun', -41), SUN_NIGHT = -80, SUN_RISE = O.num('sunrise', -24.5);
    const nightTex = new T.Texture(), dayTex = new T.Texture();
    [nightTex, dayTex].forEach(t => { t.encoding = T.sRGBEncoding; t.minFilter = T.LinearMipmapLinearFilter; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
    const earthU = { uNight: { value: nightTex }, uDay: { value: dayTex }, uHasN: { value: 0 }, uHasD: { value: 0 }, uDim: { value: 0 }, uWake: { value: 1 }, uTime: { value: 0 }, uSun: { value: sun } };
    const body = new T.Mesh(new T.SphereGeometry(O.RE, 192, 128), new T.ShaderMaterial({ uniforms: earthU, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG })); spinG.add(body);
    const air = new T.Mesh(new T.SphereGeometry(O.RE*1.022, 160, 112), new T.ShaderMaterial({ uniforms: earthU, vertexShader: EARTH_VERT, fragmentShader: AIR_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); earth.add(air);
    // the sun itself, far away; the planet hides it until the closing
    const sunMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uK: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
      fragmentShader: `precision highp float; uniform float uK; varying vec2 vUv; void main(){ float d = length(vUv - 0.5)*2.0; float a = (exp(-d*d*38.0)*1.6 + exp(-d*5.5)*0.5 + exp(-d*d*900.0)*3.0)*smoothstep(1.0, 0.6, d)*uK; gl_FragColor = vec4(vec3(1.0, 0.93, 0.80)*a, a); }` });
    const sunMesh = new T.Mesh(new T.PlaneGeometry(1, 1), sunMat); sunMesh.frustumCulled = false; scene.add(sunMesh);

    // metros: brighter points among the city lights
    const METROS = AC.data.METROS, MN = METROS.length; const metroIndex = new Map(METROS.map((m, i) => [m.code, i]));
    const localOf = (lat, lon, r) => { const ph = (lon + 180)*D, th = (90 - lat)*D; return new T.Vector3(-r*Math.cos(ph)*Math.sin(th), r*Math.cos(th), r*Math.sin(ph)*Math.sin(th)); };
    const metroLocal = METROS.map(m => localOf(m.lat, m.lon, O.RE*1.003)); const metroWorld = METROS.map(() => new T.Vector3()); const metroSeen = new Uint8Array(MN);
    const mPos = new Float32Array(MN*3), mFeat = new Float32Array(MN), mSeed = new Float32Array(MN);
    metroLocal.forEach((v, i) => { mPos.set([v.x, v.y, v.z], i*3); mSeed[i] = (i*0.37) % 1; });
    const mGeo = new T.BufferGeometry(); mGeo.setAttribute('position', new T.BufferAttribute(mPos, 3)); const mFeatAttr = new T.BufferAttribute(mFeat, 1).setUsage(T.DynamicDrawUsage); mGeo.setAttribute('aFeat', mFeatAttr); mGeo.setAttribute('aSeed', new T.BufferAttribute(mSeed, 1));
    const metroMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uTime: earthU.uTime, uDim: earthU.uDim, uWake: earthU.uWake, uSun: earthU.uSun, uPx: { value: 1 } },
      vertexShader: `attribute float aFeat, aSeed; uniform float uTime, uPx; uniform vec3 uSun; varying float vA; varying float vF;
        void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix)*normalize(position)); vec3 toCam = normalize(cameraPosition - w.xyz);
          float facing = smoothstep(0.03, 0.22, dot(n, toCam)); float night = 1.0 - smoothstep(-0.2, 0.0, dot(n, uSun)); vF = aFeat;
          vA = facing*night*(0.6 + 0.4*sin(uTime*1.2 + aSeed*20.0)); vec4 mv = viewMatrix*w; gl_PointSize = clamp((2.6 + 10.0*aFeat)*uPx*(90.0/max(1.0, -mv.z)), 2.0*uPx, 26.0*uPx); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `precision highp float; uniform float uDim, uWake; varying float vA; varying float vF; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d*2.0, 1.5)*vA*(0.5 + vF*1.3)*mix(1.0 - 0.5*uDim, 1.0, vF)*uWake; gl_FragColor = vec4(vec3(1.0, 0.94, 0.82)*a, a); }` });
    const metros = new T.Points(mGeo, metroMat); metros.frustumCulled = false; spinG.add(metros);

    // start over a part of the world that is awake: Europe coming up over the limb
    let orbitA = 0, spinA = 0;
    {
      const target = new T.Vector3(0, Math.cos(14*D), -Math.sin(14*D)), L = localOf(O.num('lat', 47), O.num('lon', 8), 1), q = new T.Quaternion(), qx = new T.Quaternion(), qz = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), -TILT), qy = new T.Quaternion(), X = new T.Vector3(1, 0, 0), v = new T.Vector3(); let best = -2;
      for (let a = 0; a < 360; a += 2){ qx.setFromAxisAngle(X, a*D); for (let b = 0; b < 360; b += 2){ qy.setFromAxisAngle(Y, b*D); q.copy(qx).multiply(qz).multiply(qy); const d = v.copy(L).applyQuaternion(q).dot(target); if (d > best){ best = d; orbitA = a*D; spinA = b*D; } } }
    }

    // ---------- portrait atlases ----------
    const CW = 256, CH = 384, COLS = 8, ROWS = 6;
    const photoCanvas = document.createElement('canvas'); photoCanvas.width = COLS*CW; photoCanvas.height = ROWS*CH; const pg = photoCanvas.getContext('2d'); pg.fillStyle = '#131316'; pg.fillRect(0, 0, photoCanvas.width, photoCanvas.height);
    const photoTex = new T.CanvasTexture(photoCanvas); photoTex.encoding = T.sRGBEncoding; photoTex.minFilter = T.LinearMipmapLinearFilter; photoTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const cellOf = new Map(); let nextCell = 0, photoDirty = false;
    const rectOf = (cell, cols, rows) => [(cell % cols)/cols, 1 - (Math.floor(cell/cols) + 1)/rows, 1/cols, 1/rows];
    /* Draw a portrait into its own cell. Resolves with the cell, or -1 if the image fails or the atlas is full. */
    function photoCell(url){
      if (cellOf.has(url)) return cellOf.get(url);
      const p = new Promise(res => { if (nextCell >= COLS*ROWS) return res(-1); const cell = nextCell++; const img = new Image();
        img.onload = () => { const x = (cell % COLS)*CW, y = Math.floor(cell/COLS)*CH; const ar = img.width/img.height, want = CW/CH; let sw = img.width, sh = img.height, sx = 0, sy = 0; if (ar > want){ sw = img.height*want; sx = (img.width - sw)/2; } else { sh = img.width/want; sy = (img.height - sh)*0.3; }
          pg.drawImage(img, sx, sy, sw, sh, x, y, CW, CH); photoDirty = true; res(cell); };
        img.onerror = () => res(-1); img.src = url; });
      cellOf.set(url, p); return p;
    }
    const ICW = 96, ICH = 144, ICOLS = 20, IROWS = 14;
    const initCanvas = document.createElement('canvas'); initCanvas.width = ICOLS*ICW; initCanvas.height = IROWS*ICH; const ig = initCanvas.getContext('2d'); ig.fillStyle = '#16161a'; ig.fillRect(0, 0, initCanvas.width, initCanvas.height);
    const initTex = new T.CanvasTexture(initCanvas); initTex.encoding = T.sRGBEncoding; initTex.minFilter = T.LinearMipmapLinearFilter; let initCount = 0;
    /* The treatment for someone without a photograph: their initials, set like a name plate. */
    function drawInitials(g, x, y, w, h, name){
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      const grd = g.createLinearGradient(x, y, x + w, y + h); grd.addColorStop(0, '#26262b'); grd.addColorStop(1, '#151518'); g.fillStyle = grd; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(239,233,221,.16)'; g.lineWidth = Math.max(1, w/96); g.strokeRect(x + w*0.07, y + w*0.07, w*0.86, h - w*0.14);
      g.fillStyle = '#E4DDD0'; g.font = '300 ' + Math.round(w*0.38) + 'px Fraunces, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(AC.data.initials(name), x + w/2, y + h*0.49);
      g.fillStyle = '#E0242C'; g.fillRect(x + w/2 - w*0.09, y + h*0.49 + w*0.3, w*0.18, Math.max(1.5, w/64)); g.restore();
    }

    // ---------- the crowd ----------
    const geo = new T.PlaneGeometry(1, 1);
    const aRect = new Float32Array(MAXN*4), aLook = new Float32Array(MAXN*2), aTone = new Float32Array(MAXN*2), aState = new Float32Array(MAXN*4), aAir = new Float32Array(MAXN*2);
    const rectAttr = new T.InstancedBufferAttribute(aRect, 4), lookAttr = new T.InstancedBufferAttribute(aLook, 2), toneAttr = new T.InstancedBufferAttribute(aTone, 2);
    const stateAttr = new T.InstancedBufferAttribute(aState, 4).setUsage(T.DynamicDrawUsage), airAttr = new T.InstancedBufferAttribute(aAir, 2).setUsage(T.DynamicDrawUsage);
    geo.setAttribute('aRect', rectAttr); geo.setAttribute('aLook', lookAttr); geo.setAttribute('aTone', toneAttr); geo.setAttribute('aState', stateAttr); geo.setAttribute('aAir', airAttr);
    const printU = { uPhotos: { value: photoTex }, uInitials: { value: initTex }, uDim: { value: 0 }, uFront: { value: 1 }, uSunK: { value: 0.85 } };
    const mesh = new T.InstancedMesh(geo, new T.ShaderMaterial({ vertexShader: PRINT_VERT, fragmentShader: PRINT_FRAG, uniforms: printU }), MAXN);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);

    let ring = O.createRing(1); const items = [], byId = new Map();
    function reset(total){ ring = O.createRing(total); items.length = 0; byId.clear(); mesh.count = 0; initCount = 0; }
    function setRect(i, cell, cols, rows, src, flip){ aRect.set(rectOf(cell, cols, rows), i*4); aLook[i*2] = src; aLook[i*2 + 1] = flip; rectAttr.needsUpdate = true; lookAttr.needsUpdate = true; }
    function add(c, portraitURL){
      if (items.length >= MAXN || byId.has(c.id)) return byId.get(c.id) || null;
      const i = items.length, home = ring.homeFor(c); const rng = AC.data.mulberry32(AC.data.hashStr(c.id + ':tone'));
      const rec = { c, home, i, x: 0, y: 0, z: 0, theta: 0, sc: 1, alpha: 1, keep: 0, lift: 0, liftT: 0, liftRate: 1, slot: -1, mode: 'one', arrive: null, hover: 0, pending: false, url: portraitURL || null, flip: rng() > 0.5 ? 1 : 0, metro: metroIndex.has(c.metro) ? metroIndex.get(c.metro) : -1, stageP: new T.Vector3(), stageS: 1, shown: 0 };
      items.push(rec); byId.set(c.id, rec);
      const cell = initCount++ % (ICOLS*IROWS); drawInitials(ig, (cell % ICOLS)*ICW, Math.floor(cell/ICOLS)*ICH, ICW, ICH, c.displayName); initTex.needsUpdate = true;
      setRect(i, cell, ICOLS, IROWS, 1, 0);
      if (portraitURL) Promise.resolve(photoCell(portraitURL)).then(pc => { if (pc >= 0) setRect(i, pc, COLS, ROWS, 0, rec.flip); else rec.url = null; });
      aTone[i*2] = 0.86 + rng()*0.26; aTone[i*2 + 1] = 0.94 + rng()*0.2; toneAttr.needsUpdate = true;
      aState.set([0, 0, 1, 0], i*4); aAir.set([1, 0], i*2); mesh.count = items.length;
      return rec;
    }

    // ---------- the stage: up to three prints held in front of the viewer, in colour, at full resolution ----------
    const cardTexCache = new Map();
    function cardTexture(rec){
      const key = rec.url || ('initials:' + rec.c.displayName); if (cardTexCache.has(key)) return cardTexCache.get(key);
      let tex;
      if (rec.url){ tex = new T.Texture(); tex.encoding = T.sRGBEncoding; tex.minFilter = T.LinearMipmapLinearFilter; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); tex.acReady = false; const img = new Image(); img.onload = () => { tex.image = img; tex.needsUpdate = true; tex.acReady = true; }; img.src = rec.url; }
      else { const cv = document.createElement('canvas'); cv.width = 640; cv.height = Math.round(640/rec.home.aspect); drawInitials(cv.getContext('2d'), 0, 0, cv.width, cv.height, rec.c.displayName); tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding; tex.acReady = true; }
      cardTexCache.set(key, tex); return tex;
    }
    const cards = [0, 1, 2].map(() => { const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uMap: { value: null }, uAlpha: { value: 0 }, uColour: { value: 1 }, uFlip: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`, fragmentShader: CARD_FRAG })); m.visible = false; m.renderOrder = 10; m.frustumCulled = false; m.userData.rec = null; scene.add(m); return m; });
    const tieMat = () => new T.LineBasicMaterial({ color: 0xEADFC8, transparent: true, opacity: 0, depthWrite: false });
    const ties = [0, 1, 2].map(() => { const l = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), tieMat()); l.frustumCulled = false; l.visible = false; scene.add(l); return l; });
    let staged = [];
    function stageSet(recs, slow){
      staged.forEach(r => { if (!recs.includes(r)) r.liftT = 0; });
      recs.forEach((r, i) => { r.liftT = 1; r.slot = i; r.mode = recs.length > 1 ? 'trio' : 'one'; r.liftRate = slow ? 0.45 : 1; cards[i].userData.rec = r; const tex = cardTexture(r); cards[i].material.uniforms.uMap.value = tex; cards[i].material.uniforms.uFlip.value = r.url ? r.flip : 0; });
      staged = recs.slice();
    }
    function stageClear(){ staged.forEach(r => { r.liftT = 0; r.liftRate = 1; if (r.arrive && r.arrive.mode === 'stage') r.arrive = null; }); staged = []; }

    // ---------- choreography state ----------
    let progress = 0, flow = 1, flowT = 1, scrubT = null;
    let dawn = null, wake = 1, rise = 0, riseT = 0, dim = 0;
    const REST_FRONT = 54*D, FAR_FRONT = 1.5, NEAR_FRONT = -0.45;

    function resize(){ const r = stage.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); renderer.setPixelRatio(dpr); renderer.setSize(Math.max(2, r.width), Math.max(2, r.height), false); camera.aspect = r.width/Math.max(1, r.height); camera.updateProjectionMatrix(); starMat.uniforms.uPx.value = dpr; metroMat.uniforms.uPx.value = dpr; }
    resize(); new ResizeObserver(resize).observe(stage);

    // ---------- frame ----------
    const dummy = new T.Object3D(), qTilt = new T.Quaternion(), eul = new T.Euler(), PL = { x: 0, y: 0, z: 0, theta: 0, scale: 1 }, ndc = new T.Vector3();
    let last = performance.now(), hoverRec = null;
    function slotFor(rec, out){
      const cfg = (narrow ? O.STAGE.narrow : O.STAGE.wide), s = (rec.mode === 'trio' ? cfg.trio : cfg.one)[Math.min(rec.slot, rec.mode === 'trio' ? 2 : 0)] || cfg.one[0];
      const tanH = Math.tan(camera.fov*D/2), dist = cfg.dist;
      out.copy(camera.position).addScaledVector(fwd2, dist).addScaledVector(right2, s[0]*dist*tanH*camera.aspect).addScaledVector(up2, s[1]*dist*tanH);
      return (2*dist*tanH*s[2])/O.BASE;
    }
    const fwd2 = new T.Vector3(), right2 = new T.Vector3(), up2 = new T.Vector3();
    function tick(now){
      const dt = Math.min(0.1, (now - last)/1000); last = now; const t = now/1000, quiet = rm();
      poseCamera(t);
      { const e = camera.matrixWorld.elements; right2.set(e[0], e[1], e[2]).normalize(); up2.set(e[4], e[5], e[6]).normalize(); fwd2.set(-e[8], -e[9], -e[10]).normalize(); }
      // the ring turns; by hand it follows the hand and stops where it is left
      flow += (flowT - flow)*(1 - Math.pow(0.03, dt));
      if (scrubT != null){ const d = scrubT - progress; progress += d*(1 - Math.pow(0.0008, dt)); if (Math.abs(d) < 0.00002){ progress = scrubT; scrubT = null; } }
      else if (!quiet) progress += dt*O.DRIFT*flow;
      // the planet turns whatever we do
      if (!quiet){ orbitA += dt*ORBIT_RATE; spinA += dt*SPIN_RATE; }
      orbitG.rotation.x = orbitA; spinG.rotation.y = spinA; starsG.rotation.x = orbitA; earth.updateMatrixWorld(true);
      // light: night before dawn, first light at rest, sunrise at the closing
      if (dawn){ wake = clamp((now - dawn.t0)/dawn.dur, 0, 1); if (wake >= 1) dawn = null; }
      rise += clamp(riseT - rise, -dt/2.5, dt/11);
      const wk = easeIO(wake), rs = easeIO(rise);
      O.sunDir(mix(mix(SUN_NIGHT, SUN_REST, ss(0.0, 0.6, wk)), SUN_RISE, rs), SUN_AZ, sun);
      earthU.uWake.value = ss(0.04, 0.5, wk); earthU.uTime.value = t; starMat.uniforms.uA.value = ss(0, 0.25, wk)*(1 - 0.75*rs);
      sunMesh.position.copy(E).addScaledVector(sun, 5200); sunMesh.quaternion.copy(camera.quaternion); sunMesh.scale.setScalar(2600); sunMat.uniforms.uK.value = 0.35 + 0.65*rs;
      dim += (((staged.length ? (staged.length > 1 ? 0.5 : 0.6) : 0)) - dim)*(1 - Math.pow(0.02, dt)); printU.uDim.value = dim; earthU.uDim.value = dim;
      printU.uFront.value = mix(REST_FRONT, NEAR_FRONT, rs); printU.uSunK.value = (0.85 + 0.15*rs)*ss(0.35, 0.8, wk);
      const dawnFront = mix(FAR_FRONT, NEAR_FRONT, ss(0.22, 0.95, wk));
      // metros: where they are now, and whether we can see them
      for (let i = 0; i < MN; i++){ const w = metroWorld[i].copy(metroLocal[i]); spinG.localToWorld(w); tmpA.copy(w).sub(E).normalize(); metroSeen[i] = tmpA.dot(tmpB.copy(camera.position).sub(w).normalize()) > 0.06 && tmpA.dot(sun) < -0.05 ? 1 : 0; mFeat[i] += (0 - mFeat[i])*(1 - Math.pow(0.02, dt)); }
      // the crowd
      const n = items.length, tanH = Math.tan(camera.fov*D/2);
      const cfg = narrow ? O.STAGE.narrow : O.STAGE.wide; const stageOn = staged.length > 0 && dim > 0.15;
      for (let i = 0; i < n; i++){ const r = items[i], h = r.home;
        ring.place(h, progress, PL); r.theta = PL.theta;
        const dx = quiet ? 0 : Math.sin(t*h.drift.ax + h.drift.px)*h.drift.sx, dy = quiet ? 0 : Math.sin(t*h.drift.ay + h.drift.py)*h.drift.sy;
        let x = PL.x + dx, y = PL.y + dy, z = PL.z, sc = PL.scale, glow = 0;
        r.lift += clamp(r.liftT - r.lift, -dt*0.75, dt*0.62*r.liftRate); if (quiet) r.lift = r.liftT;
        const lk = easeIO(clamp(r.lift, 0, 1));
        // a newcomer rises from their place on the ground
        if (r.arrive){ const a = r.arrive; const from = a.metro >= 0 && metroSeen[a.metro] ? metroWorld[a.metro] : O.ringPoint(PL.theta, h.u, -O.ALT, tmpC);
          let k = a.mode === 'stage' ? 0 : clamp((now - a.t0)/a.dur, 0, 1); const ek = easeIO(k);
          x = mix(from.x, x, ek); y = mix(from.y, y, ek); z = mix(from.z, z, ek); const grow = a.mode === 'stage' ? lk : easeOut(k); sc *= mix(0.12, 1, grow); glow = (1 - grow)*1.3;
          if (a.mode === 'ring' && k >= 1) r.arrive = null; }
        if (r.lift > 0.0005){ const S = slotFor(r, r.stageP); r.stageS = S; x = mix(x, r.stageP.x, lk); y = mix(y, r.stageP.y, lk); z = mix(z, r.stageP.z, lk); sc = mix(sc, O.BASE*S, lk); if (r.metro >= 0 && r.liftT > 0) mFeat[r.metro] = Math.max(mFeat[r.metro], lk); }
        else if (r.slot >= 0 && r.liftT === 0) r.slot = -1;
        r.keep += ((r.liftT > 0 ? 1 : 0) - r.keep)*(1 - Math.pow(0.02, dt));
        // quiet the prints behind the words and behind the stage
        let aT = 1;
        if (stageOn && r.liftT === 0 && r.lift < 0.02){ ndc.set(x, y, z).project(camera); const dc = camera.position.distanceTo(tmpA.set(x, y, z));
          const behindText = narrow ? ndc.y < -0.08 : ndc.x < -0.02; aT = behindText ? 0.2 : 0.5;
          for (const s of staged){ const sl = (s.mode === 'trio' ? cfg.trio : cfg.one)[s.slot] || cfg.one[0]; if (Math.abs(ndc.x - sl[0]) < sl[2]*0.62/camera.aspect*1.0 + 0.06 && Math.abs(ndc.y - sl[1]) < sl[2] + 0.1) aT = Math.min(aT, 0.22); }
          if (dc < cfg.dist + 4) aT = 0; }
        if (!r.c.eligible || r.pending) aT = 0;
        r.alpha += (aT - r.alpha)*(1 - Math.pow(0.03, dt));
        sc *= (1 + r.hover*0.06)*(0.15 + 0.85*r.alpha);
        r.x = x; r.y = y; r.z = z; r.sc = sc;
        eul.set(0, h.yaw*(1 - lk), h.tilt*(1 - lk)); qTilt.setFromEuler(eul);
        dummy.position.set(x, y, z); dummy.quaternion.copy(camera.quaternion).multiply(qTilt); dummy.scale.set(sc*h.aspect, sc, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        const vis = wake < 1 ? ss(dawnFront - 0.05, dawnFront + 0.3, PL.theta) : 1;
        aState[i*4] = r.keep; aState[i*4 + 1] = glow; aState[i*4 + 2] = r.alpha; aState[i*4 + 3] = lk; aAir[i*2] = vis; aAir[i*2 + 1] = PL.theta; r.shown = vis*r.alpha;
      }
      mesh.instanceMatrix.needsUpdate = true; stateAttr.needsUpdate = true; airAttr.needsUpdate = true; mFeatAttr.needsUpdate = true;
      if (photoDirty){ photoTex.needsUpdate = true; photoDirty = false; }
      // stage cards take over from the instance once the print has arrived, and hold the line down to its metro
      for (let i = 0; i < 3; i++){ const card = cards[i], r = card.userData.rec, tie = ties[i]; let ta = 0;
        if (r && r.lift > 0.01 && r.slot === i){ const lk = easeIO(clamp(r.lift, 0, 1)), tex = card.material.uniforms.uMap.value; const a = tex && tex.acReady ? ss(0.72, 0.97, lk) : 0;
          card.visible = a > 0.005; card.material.uniforms.uAlpha.value = a; card.material.uniforms.uColour.value = lk;
          card.position.set(r.x, r.y, r.z).addScaledVector(fwd2, -0.03); card.quaternion.copy(camera.quaternion); card.scale.set(r.sc*r.home.aspect, r.sc, 1);
          if (r.metro >= 0 && metroSeen[r.metro] && r.liftT > 0){ const p = tie.geometry.attributes.position.array, m = metroWorld[r.metro]; p[0] = m.x; p[1] = m.y; p[2] = m.z; tmpA.set(r.x, r.y, r.z).addScaledVector(up2, -r.sc*0.5); p[3] = tmpA.x; p[4] = tmpA.y; p[5] = tmpA.z; tie.geometry.attributes.position.needsUpdate = true; ta = 0.34*ss(0.6, 1, lk); } }
        else { card.visible = false; if (r && r.lift <= 0.01) card.userData.rec = null; }
        tie.material.opacity += (ta - tie.material.opacity)*(1 - Math.pow(0.03, dt)); tie.visible = tie.material.opacity > 0.01; }
      renderer.render(scene, camera);
      if (api.onFrame) api.onFrame(now);
      requestAnimationFrame(tick);
    }

    // ---------- picking and projection ----------
    const ray = new T.Raycaster(), v2 = new T.Vector2();
    function pick(clientX, clientY){
      const r = stage.getBoundingClientRect(); v2.set(((clientX - r.left)/r.width)*2 - 1, -((clientY - r.top)/r.height)*2 + 1); ray.setFromCamera(v2, camera);
      for (const card of cards){ if (card.visible && card.userData.rec && ray.intersectObject(card).length) return card.userData.rec; }
      const hits = ray.intersectObject(mesh); for (const h of hits){ const rec = items[h.instanceId]; if (rec && rec.shown > 0.4 && !rec.pending) return rec; }
      return null;
    }
    function project(rec, out){ ndc.set(rec.x, rec.y, rec.z).project(camera); const r = stage.getBoundingClientRect(); out.x = (ndc.x*0.5 + 0.5)*r.width; out.y = (-ndc.y*0.5 + 0.5)*r.height; out.visible = ndc.z < 1 && Math.abs(ndc.x) < 1.05 && Math.abs(ndc.y) < 1.05;
      const d = camera.position.distanceTo(tmpA.set(rec.x, rec.y, rec.z)); out.halfH = (rec.sc/(2*d*Math.tan(camera.fov*D/2)))*r.height; out.halfW = out.halfH*rec.home.aspect; out.dist = d; return out; }
    /* The point on the ground a little ahead of us, as latitude and longitude. */
    function ground(){ const w = tmpA.set(0, Math.cos(16*D), -Math.sin(16*D)).multiplyScalar(O.RE).add(E); spinG.worldToLocal(w).normalize(); const lat = 90 - Math.acos(clamp(w.y, -1, 1))/D; let lon = Math.atan2(w.z, -w.x)/D - 180; if (lon < -180) lon += 360; return { lat, lon }; }

    const api = {
      renderer, camera, items, byId, add, reset, pick, project, ground,
      get count(){ return items.length; }, get ring(){ return ring; },
      loadEarth(nightURL, dayURL){ const load = (url, tex, flag) => new Promise(res => { const img = new Image(); img.onload = () => { tex.image = img; tex.needsUpdate = true; earthU[flag].value = 1; res(true); }; img.onerror = () => res(false); img.src = url; }); return Promise.all([load(nightURL, nightTex, 'uHasN'), load(dayURL, dayTex, 'uHasD')]); },
      preload(urls){ return Promise.all(urls.map(u => Promise.resolve(photoCell(u)))); },
      setHover(rec){ if (hoverRec && hoverRec !== rec) hoverRec.hover = 0; hoverRec = rec; if (rec) rec.hover = 1; },
      /* flow: 1 lets the ring drift on its own, 0 holds it. scrub moves it by hand, in radians, eased, no momentum. */
      flow(v){ flowT = v; },
      scrub(d){ if (scrubT == null) scrubT = progress; scrubT = clamp(scrubT + d, progress - 0.6, progress + 0.6); },
      turnTo(rec, theta){ scrubT = progress + ring.turnTo(rec.home, theta, progress); },
      get progress(){ return progress; }, set progress(v){ progress = v; scrubT = null; },
      stage(recs, slow){ stageSet(recs, slow); }, unstage(){ stageClear(); }, get staged(){ return staged; },
      /* A newcomer. 'stage': they rise from the ground straight to the stage. 'ring': they rise into their place. */
      arrive(rec, mode){ rec.home.a0 = ring.a0At(20*D, progress); rec.pending = false; rec.arrive = { mode, t0: performance.now(), dur: 5200, metro: rec.metro }; },
      metrosInView(){ const out = new Set(); for (let i = 0; i < MN; i++) if (metroSeen[i]) out.add(METROS[i].code); return out; },
      dawn(ms){ if (rm() || !ms){ dawn = null; wake = 1; return; } wake = 0; dawn = { t0: performance.now(), dur: ms }; },
      get dawning(){ return !!dawn; },
      sunrise(on){ riseT = on ? 1 : 0; }, get sunriseOn(){ return riseT > 0; }, get rise(){ return rise; },
      onFrame: null
    };
    poseCamera(0); requestAnimationFrame(tick);
    return api;
  }

  AC.scene = { create };
})(window.AC);
