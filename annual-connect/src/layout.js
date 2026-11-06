/* Annual Connect — deterministic layout.
   Every contribution gets a home position derived only from its id and theme, so the world is stable across
   revisits, resizes, selections and new arrivals.

   Composition follows the reference: one broad ribbon of portraits that starts large at lower left, sweeps up
   and away to the upper right and thins into the distance. Themes occupy stretches along the ribbon, so
   neighbourhoods survive as reaches of the same stream. A sparse halo of small distant prints sits off the band. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const { hashStr, mulberry32 } = AC.data;

  // Theme order along the ribbon (near end first) and the stretch each occupies, as a range of t in [0,1].
  const ORDER = ['collaboration', 'customers', 'colleagues', 'execution', 'learning', 'listening'];
  const STRETCH = {};
  ORDER.forEach((id, i) => { STRETCH[id] = [i/ORDER.length, (i + 1)/ORDER.length]; });

  // The ribbon's spine. t = 0 is the near end (lower left, close to camera), t = 1 the far end (upper right, deep).
  function spine(t){
    const x = -20 + 54*t;
    const y = -4 + 10*t + 1.8*Math.sin(t*Math.PI*1.25);
    const z = 8 - 36*t;
    return { x, y, z };
  }
  // Local frame of the spine at t: tangent, and a "normal" that keeps the band facing the camera.
  function tangent(t){ const a = spine(Math.max(0, t - 0.01)), b = spine(Math.min(1, t + 0.01)); const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const l = Math.hypot(dx, dy, dz) || 1; return { x: dx/l, y: dy/l, z: dz/l }; }

  function homeFor(contribution){
    const rng = mulberry32(hashStr(contribution.id));
    const theme = contribution.themeIds[0];
    const st = STRETCH[theme] || [0, 1];
    // Position along the ribbon: inside the theme's stretch, with soft overlap into neighbours.
    let t = st[0] + (st[1] - st[0])*rng() + (rng() - 0.5)*0.12;
    t = Math.min(1, Math.max(0, t));
    const halo = rng() < 0.1;                           // a few quiet prints off the band
    const s = spine(t), tg = tangent(t);
    // Band half-width grows toward the near end; perpendicular scatter is tight, along-band scatter is loose.
    const width = (2.2 + 3.2*(1 - t)) * (halo ? 2.8 : 1);
    const u = (rng() + rng() - 1);                      // triangular, denser at the centre line
    const v = (rng() - 0.5)*1.4;                        // depth jitter through the band
    // Perpendicular directions: screen-up-ish and the camera axis.
    const px = -tg.z, pz = tg.x;                        // horizontal perpendicular to the tangent (in the xz plane)
    const x = s.x + u*width*0.55*px + v*1.6*tg.x*0 + (rng() - 0.5)*1.2;
    const y = s.y + u*width*1.0 + (rng() - 0.5)*0.8;
    const z = s.z + u*width*0.25*pz + v*2.4 + (halo ? -6*rng() : 0);
    // Scale: large at the near end, modest in the middle, small and quiet far away. A few deterministic heroes.
    const near = 1 - t;
    const hero = rng();
    const base = 0.62 + 0.9*near*near;
    const scale = halo ? base*0.6 : hero > 0.975 ? base*2.0 : hero > 0.9 ? base*1.45 : base*(0.85 + rng()*0.3);
    const aspect = rng() > 0.5 ? 0.8 : 0.667;
    const drift = { ax: 0.12 + rng()*0.1, ay: 0.08 + rng()*0.08, px: rng()*Math.PI*2, py: rng()*Math.PI*2, sx: 0.06 + rng()*0.04, sy: 0.05 + rng()*0.04 };
    return { x, y, z, t, scale, aspect, drift, halo };
  }

  // Camera path for the guided overview: a slow glide alongside the ribbon. k in [0,1] from near end to far end.
  function cameraAt(k){
    const t = 0.08 + 0.62*k;                            // never run past the far tail
    const s = spine(t);
    const look = { x: s.x + 6.5, y: s.y + 2.6, z: s.z };
    const pos = { x: s.x - 2 + 4*k, y: s.y + 2.6 + 1.4*k, z: s.z + 24 - 3*k };
    return { pos, look };
  }

  AC.layout = { homeFor, spine, cameraAt, ORDER };
})(window.AC);
