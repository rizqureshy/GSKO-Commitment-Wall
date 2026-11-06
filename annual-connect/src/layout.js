/* Annual Connect — deterministic layout.
   Every contribution gets a home position derived only from its id and theme, so the world is stable across
   revisits, resizes, selections and new arrivals.

   Composition follows the reference: a string of portraits rises out of the horizon on the far left, small and
   quiet, and flows toward the viewer on the right, where it widens into layers and the nearest prints are large.
   Themes occupy stretches along the string, so neighbourhoods survive as reaches of the same flow. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const { hashStr, mulberry32 } = AC.data;

  // Theme order along the string, from the horizon (far) to the viewer (near).
  const ORDER = ['listening', 'learning', 'execution', 'colleagues', 'customers', 'collaboration'];
  const STRETCH = {};
  ORDER.forEach((id, i) => { STRETCH[id] = [i/ORDER.length, (i + 1)/ORDER.length]; });

  // The string's spine. t = 0 at the horizon (far left), t = 1 nearest the viewer (lower right).
  function spine(t){
    const x = -58 + 72*t;
    const z = -56 + 72*t;
    const y = 1.4*(1 - t) + 3.4*Math.sin(t*Math.PI*1.7 - 0.4)*Math.pow(t, 0.4) - 2.6*t*t;
    return { x, y, z };
  }

  function homeFor(contribution){
    const rng = mulberry32(hashStr(contribution.id));
    const theme = contribution.themeIds[0];
    const st = STRETCH[theme] || [0, 1];
    let t = st[0] + (st[1] - st[0])*rng() + (rng() - 0.5)*0.12;
    t = Math.min(1, Math.max(0, t));
    const s = spine(t);
    const halo = rng() < 0.08;                                  // a few quiet prints drifting off the string
    const hasPhoto = !!contribution.portrait;
    const fore = !halo && hasPhoto && t > 0.78 && rng() < 0.22;  // the nearest layer, soft and large
    // The string is thin at the horizon and opens into layers near the viewer.
    const width = 1.0 + 7.5*Math.pow(t, 1.6);
    const u = (rng() + rng() - 1);                              // triangular: denser along the centre line
    const v = (rng() - 0.5);
    let x = s.x + (rng() - 0.5)*(1 + 3*t);
    const upper = !halo && t > 0.5 && rng() < 0.33;           // a second strand rising to the upper right
    let y = s.y + u*width*(halo ? 2.6 : 1) + (upper ? 3.2 + 2.5*rng() : 0);
    let z = s.z + v*(1.5 + 5*t) - (halo ? 10*rng() : 0);
    if (fore){ z += 6 + 7*rng(); y -= 2.2; x += 1 + 3*rng(); }
    if (halo){ y = Math.max(-7, Math.min(6.5, y)); }
    // Scale: tiny at the horizon, large near the viewer. A few deterministic heroes.
    const hero = rng();
    const base = (0.55 + 1.25*Math.pow(t, 2.2))*(fore ? 1.35 : 1)*(halo ? 0.7 : 1);
    const scale = !hasPhoto ? base*(0.8 + rng()*0.25) : hero > 0.975 ? base*1.9 : hero > 0.9 ? base*1.4 : base*(0.85 + rng()*0.3);
    const aspect = rng() > 0.5 ? 0.8 : 0.667;
    const drift = { ax: 0.12 + rng()*0.1, ay: 0.08 + rng()*0.08, px: rng()*Math.PI*2, py: rng()*Math.PI*2, sx: 0.06 + rng()*0.04, sy: 0.05 + rng()*0.04 };
    return { x, y, z, t, scale, aspect, drift, halo, fore };
  }

  // Camera path for the guided overview: a slow drift along the near reach of the string, looking back toward the
  // horizon. k in [0,1]. The horizon stays in frame at the left throughout.
  function cameraAt(k){
    const pos = { x: 6 + 6*k, y: 2.6 - 0.8*k, z: 38 - 6*k };
    const look = { x: -7 + 8*k, y: 0.8 - 0.6*k, z: -12 + 8*k };
    return { pos, look };
  }

  // Horizon: a planet limb far behind the string, low and to the left.
  const HORIZON = { center: { x: -108, y: -186, z: -150 }, radius: 176 };

  AC.layout = { homeFor, spine, cameraAt, ORDER, HORIZON };
})(window.AC);
