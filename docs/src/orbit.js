/* Annual Connect — the orbit.
   The idea, stated as geometry: the people form a ring around the Earth. We watch from just above that ring.
   It comes up over the limb of the planet in the distance, passes beneath us, and continues around the far side.
   Nothing here is faked with fades or scale curves: perspective makes distant people small, and the planet itself
   hides the part of the ring that is on the other side of the world.

   Frame: +Y is "up" at the top of the ring, -Z is ahead (where people come from), +X is across the ring.
   The top of the ring is the origin; the Earth's centre is straight down. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';
  const { hashStr, mulberry32 } = AC.data;
  const D = Math.PI/180, TAU = Math.PI*2;
  const q = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(q.get(k)); return isFinite(v) ? v : d; };
  const arr = (k, d) => { const v = (q.get(k) || '').split(',').map(parseFloat); return v.length === d.length && v.every(isFinite) ? v : d; };

  const RE = num('re', 170);                 // radius of the Earth, world units
  const ALT = num('alt', 18);                // height of the ring above the ground
  const RR = RE + ALT;
  const EARTH = { x: 0, y: -RR, z: 0 };
  const THETA_NEAR = -9*D;                   // where people leave: behind and below the viewer
  const FULL = num('full', 1500);            // this many people close the ring all the way round the Earth
  const MIN_SPAN = 80*D;                     // a small collection still reaches past the horizon
  const WIDTH = num('w', 9), THICK = num('thick', 3.2);   // half-width across the ring, half-thickness
  const BASE = num('base', 3.4);             // height of a print, world units
  const DRIFT = num('drift', 0.5)*D;         // guided speed, radians per second
  const FRONT = [3*D, 30*D];                 // the readable reach of the ring, as angles ahead of the viewer

  // Viewpoint. Wide screens look along the ring from above and to the left of it; a phone stands further back.
  const CAMERA = {
    wide:   { pos: arr('cam', [-21, 5, 20]), yaw: num('yaw', 26), pitch: num('pitch', -8), roll: num('roll', -26), fov: num('fov', 36) },
    narrow: { pos: arr('ncam', [-6, 9, 30]), yaw: num('nyaw', 9), pitch: num('npitch', -16), roll: num('nroll', -6), fov: num('nfov', 66) }
  };
  // Where a featured print is held, as fractions of the half-frame, and how much of the frame height it takes.
  const STAGE = {
    wide:   { one: [[0.42, -0.02, 0.60]], trio: [[0.11, 0.10, 0.33], [0.46, -0.08, 0.33], [0.81, 0.10, 0.33]], dist: 16 },
    narrow: { one: [[0, 0.34, 0.34]],     trio: [[-0.56, 0.42, 0.19], [0, 0.34, 0.19], [0.56, 0.42, 0.19]],   dist: 16 }
  };

  const THEME_ORDER = ['listening', 'learning', 'execution', 'colleagues', 'customers', 'collaboration'];

  function ringPoint(theta, u, v, out){
    const r = RR + v; out.x = EARTH.x + u; out.y = EARTH.y + r*Math.cos(theta); out.z = EARTH.z - r*Math.sin(theta); return out;
  }
  const wrap = (a, span) => ((a % span) + span) % span;

  /* A ring for a collection of a given size. The arc it occupies is fixed at creation, so nobody's place moves
     when someone else joins. Fifteen hundred people close the circle. */
  function createRing(total){
    const span = Math.min(TAU, Math.max(MIN_SPAN, TAU*Math.max(1, total)/FULL));
    const closed = span >= TAU - 1e-6;

    function homeFor(c){
      const rng = mulberry32(hashStr(c.id));
      const ti = Math.max(0, THEME_ORDER.indexOf(c.themeIds[0]));
      // themes hold stretches of the ring, with soft edges, so neighbours tend to share an intention
      const a0 = wrap(((ti + rng())/THEME_ORDER.length + (rng() - 0.5)*0.035)*span, span);
      const u = (rng() < 0.6 ? (rng() + rng() - 1) : (rng()*2 - 1))*WIDTH;
      const v = (rng()*2 - 1)*THICK;
      const hero = rng();
      const sizeK = !c.portrait ? 0.8 + rng()*0.2 : hero > 0.975 ? 1.8 : hero > 0.9 ? 1.35 : 0.86 + rng()*0.28;
      return {
        a0, u, v, sizeK, aspect: rng() > 0.5 ? 0.8 : 0.667,
        tilt: (rng() - 0.5)*0.09, yaw: (rng() - 0.5)*0.26,
        drift: { ax: 0.1 + rng()*0.08, ay: 0.07 + rng()*0.06, px: rng()*TAU, py: rng()*TAU, sx: 0.07 + rng()*0.05, sy: 0.06 + rng()*0.05 }
      };
    }
    /* Where a person is, given how far the ring has turned. Writes x, y, z, theta and scale into out. */
    function place(home, progress, out){
      const s = wrap(home.a0 + progress, span);
      const theta = THETA_NEAR + span - s;
      ringPoint(theta, home.u, home.v, out);
      out.theta = theta;
      // an open arc has two ends; both are out of sight, and prints shrink away there rather than pop
      let k = 1; if (!closed){ const e = 2.5*D; k = Math.min(1, s/e, (span - s)/e); k = k*k*(3 - 2*k); }
      out.scale = BASE*home.sizeK*Math.max(0.001, k);
      return out;
    }
    /* The a0 that puts a newcomer at a chosen angle ahead of the viewer right now. */
    function a0At(theta, progress){ return wrap(span - (theta - THETA_NEAR) - progress, span); }
    /* How far the ring must turn to bring a home to a chosen angle. Shortest way round on a closed ring. */
    function turnTo(home, theta, progress){
      const want = span - (theta - THETA_NEAR), now = wrap(home.a0 + progress, span);
      let d = want - now; if (closed){ d = wrap(d + span/2, span) - span/2; }
      return d;
    }
    return { span, closed, homeFor, place, a0At, turnTo };
  }

  function sunDir(elDeg, azDeg, out){
    const el = elDeg*D, az = azDeg*D; out.x = Math.sin(az)*Math.cos(el); out.y = Math.sin(el); out.z = -Math.cos(az)*Math.cos(el); return out;
  }

  AC.orbit = { num, RE, RR, ALT, EARTH, BASE, DRIFT, FRONT, THETA_NEAR, CAMERA, STAGE, THEME_ORDER, D, ringPoint, createRing, sunDir };
})(window.AC);
