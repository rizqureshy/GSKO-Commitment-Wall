/* Annual Connect — the ribbon.
   One smooth curved path in space. Portraits sit in a few staggered lanes around that path, each with a stable
   lane offset and an ordered position along it. A single shared progress value moves the whole procession along
   the path; nothing is recalculated when it moves. The ribbon begins small and distant at the left rear, sweeps
   through the middle and opens toward the viewer across the centre-right foreground. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const { hashStr, mulberry32 } = AC.data;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };

  // The path: a cubic curve. t = 0 far left rear, t = 1 past the viewer at centre-right.
  const P = [[-48, 3.0, -64], [-18, -8.5, -34], [15, -5.0, -4], [7, 2.0, 30]];
  function spine(t){
    const u = 1 - t, a = u*u*u, b = 3*u*u*t, c = 3*u*t*t, d = t*t*t;
    return { x: a*P[0][0] + b*P[1][0] + c*P[2][0] + d*P[3][0], y: a*P[0][1] + b*P[1][1] + c*P[2][1] + d*P[3][1], z: a*P[0][2] + b*P[1][2] + c*P[2][2] + d*P[3][2] };
  }
  function tangent(t){ const a = spine(Math.max(0, t - 0.004)), b = spine(Math.min(1, t + 0.004)); const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const l = Math.hypot(dx, dy, dz) || 1; return { x: dx/l, y: dy/l, z: dz/l }; }
  // Lane frame at t: A is the horizontal direction across the path, U the upward direction across it.
  function frame(t){
    const T = tangent(t);
    let ax = T.z, az = -T.x; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;      // cross(T, up), horizontal
    const ux = -az*T.y, uy = az*T.x - ax*T.z, uz = ax*T.y;                                // cross(A, T)
    return { A: { x: ax, y: 0, z: az }, U: { x: ux, y: uy, z: uz } };
  }
  // Ribbon width (up/down across the path) and depth (sideways across it) grow toward the viewer.
  function width(t){ return 0.5 + 3.3*Math.pow(t, 1.2); }
  function depth(t){ return 0.6 + 2.4*Math.pow(t, 1.1); }

  const LANES = 7;
  /* Lane and order come from the index in the collection; the id only seeds small variation. */
  function homeFor(contribution, index, total){
    const rng = mulberry32(hashStr(contribution.id));
    const n = Math.max(1, total || 1);
    const lane = index % LANES;
    const angle = (lane/LANES)*Math.PI*2 + 0.6 + (rng() - 0.5)*0.5;        // staggered around the path
    const radial = 0.55 + 0.45*rng();                                      // within the lane band, not only on its rim
    const phase = ((index + 0.5)/n + (rng() - 0.5)*0.35/n + 1) % 1;        // ordered along the path, slight jitter
    const hasPhoto = !!contribution.portrait;
    const sizeK = (hasPhoto ? 0.92 + rng()*0.26 : 0.84 + rng()*0.12)*(rng() > 0.93 ? 1.25 : 1);
    const aspect = rng() > 0.5 ? 0.8 : 0.667;
    const drift = { ax: 0.1 + rng()*0.08, ay: 0.07 + rng()*0.06, px: rng()*Math.PI*2, py: rng()*Math.PI*2, sx: 0.04 + rng()*0.03, sy: 0.03 + rng()*0.03 };
    const home = { phase, lane, angle, radial, sizeK, aspect, drift, halo: false, scale: 1, t: phase, x: 0, y: 0, z: 0 };
    place(home, phase, home);
    return home;
  }

  /* Position and scale of a print at path position t (0..1). Writes x, y, z, scale, t into out. */
  function place(home, t, out){
    const s = spine(t), f = frame(t);
    const w = width(t)*home.radial, d = depth(t)*home.radial;
    const cu = Math.cos(home.angle)*w, ca = Math.sin(home.angle)*d;
    out.x = s.x + f.U.x*cu + f.A.x*ca; out.y = s.y + f.U.y*cu; out.z = s.z + f.U.z*cu + f.A.z*ca;
    const base = 0.42 + 1.75*Math.pow(t, 2.0);
    const loop = smooth(0, 0.04, t)*(1 - smooth(0.95, 1, t));
    out.scale = base*home.sizeK*Math.max(0.001, loop); out.t = t;
    return out;
  }

  // The camera stays broadly still; the ribbon does the moving. A barely perceptible sway in guided view.
  function cameraAt(k){
    return { pos: { x: 2.0 + 1.2*k, y: 2.6 - 0.3*k, z: 40 - 1.5*k }, look: { x: -7 + 1.5*k, y: -1.4 - 0.2*k, z: -12 + 1.5*k } };
  }

  AC.layout = { homeFor, place, spine, frame, cameraAt, LANES, STREAM_PERIOD: 170 };
})(window.AC);
