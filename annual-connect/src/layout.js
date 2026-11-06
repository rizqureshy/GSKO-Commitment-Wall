/* Annual Connect — deterministic layout.
   Every contribution gets a home position derived only from its id and theme, so the world is stable across
   revisits, resizes, selections and new arrivals. Themes form loose neighbourhoods along a broad, asymmetric
   current that sweeps from lower-left foreground to upper-right distance, like the reference. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const { hashStr, mulberry32 } = AC.data;

  // Theme anchors in world units (x right, y up, z toward camera). The camera sits around z = +22 looking at the origin.
  const ANCHORS = {
    collaboration: { x: -9,  y:  1.5, z:  2 },
    customers:     { x:  4,  y:  3.5, z: -2 },
    learning:      { x: 13,  y:  6.5, z: -9 },
    execution:     { x: -3,  y: -1.5, z: -6 },
    colleagues:    { x: 9,   y:  0.5, z:  5 },
    listening:     { x: -13, y:  0.5, z: -11 }
  };

  // Current: a gentle S-curve through the space. t in [0,1] maps to a point on it.
  function current(t){
    const x = -24 + 48*t;
    const y = -2 + 7*t + 2.2*Math.sin(t*Math.PI*1.6);
    const z = 4 - 18*t + 3*Math.sin(t*Math.PI*2.3);
    return { x, y, z };
  }

  function homeFor(contribution){
    const seed = hashStr(contribution.id);
    const rng = mulberry32(seed);
    const theme = contribution.themeIds[0];
    const a = ANCHORS[theme] || { x: 0, y: 0, z: 0 };
    // Position = blend of the global current and the theme anchor, plus a scattered offset.
    const t = Math.min(1, Math.max(0, (a.x + 24)/48 + (rng() - 0.5)*0.42));
    const c = current(t);
    const w = 0.45; // how strongly the theme pulls
    const r1 = rng(), r2 = rng(), r3 = rng();
    const spread = 1 + 1.6*Math.pow(rng(), 0.5);
    const x = c.x*(1 - w) + a.x*w + (r1 - 0.5)*7.5*spread;
    const y = c.y*(1 - w) + a.y*w + (r2 - 0.5)*5.2*spread;
    const z = c.z*(1 - w) + a.z*w + (r3 - 0.5)*9*spread;
    // Portrait scale: a few are larger (foreground heroes), most are modest. Deterministic.
    const big = rng();
    const scale = big > 0.965 ? 1.9 : big > 0.86 ? 1.35 : 0.8 + rng()*0.4;
    // Aspect: portraits are 2:3 or 4:5 rectangles.
    const aspect = rng() > 0.5 ? 0.8 : 0.667;
    const drift = { ax: 0.12 + rng()*0.1, ay: 0.08 + rng()*0.08, px: rng()*Math.PI*2, py: rng()*Math.PI*2, sx: 0.06 + rng()*0.04, sy: 0.05 + rng()*0.04 };
    return { x, y, z, scale, aspect, drift };
  }

  AC.layout = { homeFor, ANCHORS };
})(window.AC);
