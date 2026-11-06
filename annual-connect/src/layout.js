/* Annual Connect — layout and stream.
   Every contribution gets a deterministic place in the stream from its id and theme: a phase along the flow and an
   offset across it. The stream itself moves: prints rise out of the horizon on the far left, swell into a wave that
   crests near the top of the frame and fills the right of the picture, pass the viewer at lower right, and re-enter
   at the horizon. Relative positions are preserved as they travel, so neighbourhoods travel together. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const { hashStr, mulberry32 } = AC.data;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };

  // Theme order along the stream (phase bands), so a theme travels as one reach of the flow.
  const ORDER = ['listening', 'learning', 'execution', 'colleagues', 'customers', 'collaboration'];
  const STRETCH = {};
  ORDER.forEach((id, i) => { STRETCH[id] = [i/ORDER.length, (i + 1)/ORDER.length]; });

  // Spine of the stream: a long horizontal run from the horizon across the frame, then a bend forward toward the
  // viewer. A cubic curve in the ground plane; t = 0 at the horizon (far left), t = 1 just past the viewer.
  const B = [[-80, -62], [-8, -24], [8, 6], [15, 36]];
  function spine(t){
    const u = 1 - t, a = u*u*u, b = 3*u*u*t, c = 3*u*t*t, d = t*t*t;
    const x = a*B[0][0] + b*B[1][0] + c*B[2][0] + d*B[3][0];
    const z = a*B[0][1] + b*B[1][1] + c*B[2][1] + d*B[3][1];
    return { x, y: 0.4 + 1.4*t - 2.6*t*t*t + 1.1*Math.sin(Math.PI*2*t), z };
  }
  // Half-height of the sheet across the flow: a thread at the horizon, a wall as it passes the viewer.
  function halfHeight(t){ return 0.8 + 8.5*Math.pow(t, 1.2); }
  // A gentle crest through the middle so the upper edge lifts a little, as in the reference.
  function lift(t){ return 1.6*Math.sin(Math.PI*Math.min(1, t*0.95))*smooth(0.15, 0.45, t); }

  function homeFor(contribution){
    const rng = mulberry32(hashStr(contribution.id));
    const theme = contribution.themeIds[0];
    const st = STRETCH[theme] || [0, 1];
    const phase = (st[0] + (st[1] - st[0])*rng() + (rng() - 0.5)*0.1 + 1) % 1;
    const hasPhoto = !!contribution.portrait;
    const halo = rng() < 0.06;
    const fore = !halo && hasPhoto && rng() < 0.16;              // nearest layer when it passes the viewer
    // Offset across the sheet: mostly toward the centre line, some to the edges, so the mass has no hard border.
    const u = rng() < 0.6 ? (rng() + rng() - 1) : (rng()*2 - 1);
    const v = rng() - 0.5;                                        // depth jitter through the sheet
    const xj = (rng() - 0.5);
    const hero = rng();
    const sizeK = !hasPhoto ? 0.8 + rng()*0.25 : hero > 0.975 ? 1.9 : hero > 0.9 ? 1.4 : 0.85 + rng()*0.3;
    const aspect = rng() > 0.5 ? 0.8 : 0.667;
    const drift = { ax: 0.12 + rng()*0.1, ay: 0.08 + rng()*0.08, px: rng()*Math.PI*2, py: rng()*Math.PI*2, sx: 0.06 + rng()*0.04, sy: 0.05 + rng()*0.04 };
    const home = { phase, u, v, xj, halo, fore, sizeK, aspect, drift, scale: 1, t: phase, x: 0, y: 0, z: 0 };
    place(home, phase, home);
    return home;
  }

  /* Position and scale of a print at stream position t (0..1). Writes x, y, z, scale, t into out. */
  function place(home, t, out){
    const s = spine(t);
    const hh = halfHeight(t)*(home.halo ? 2.2 : 1);
    let x = s.x + home.xj*(1 + 4*t);
    let y = s.y + lift(t)*(0.5 + 0.5*home.u) + home.u*hh;
    let z = s.z + home.v*(2 + 7*t) - (home.halo ? 8 : 0);
    if (home.fore && t > 0.72){ const k = smooth(0.72, 0.9, t); z += 10*k; y -= 2.5*k; }
    // Scale grows toward the viewer; prints fade in at the horizon and out past the viewer so the loop is seamless.
    const base = (0.6 + 1.6*Math.pow(t, 1.9))*(home.fore ? 1.25 : 1)*(home.halo ? 0.7 : 1);
    const loop = smooth(0, 0.035, t)*(1 - smooth(0.96, 1, t));
    out.x = x; out.y = y; out.z = z; out.scale = base*home.sizeK*Math.max(0.001, loop); out.t = t;
    return out;
  }

  // Guided camera: a very gentle sway. The stream provides the motion; the camera only breathes.
  function cameraAt(k){
    return { pos: { x: 0.5 + 2*k, y: 3.4 - 0.4*k, z: 38 - 2*k }, look: { x: -9 + 3*k, y: 1.6 - 0.3*k, z: -12 + 3*k } };
  }

  // Horizon: a planet limb far behind the stream, low and to the left. The stream rises from just above its edge.
  const HORIZON = { center: { x: -118, y: -186, z: -150 }, radius: 176 };

  AC.layout = { homeFor, place, spine, cameraAt, ORDER, HORIZON, STREAM_PERIOD: 150 };
})(window.AC);
