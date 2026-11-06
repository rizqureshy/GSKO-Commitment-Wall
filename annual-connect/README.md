# Annual Connect — a living constellation of commitments

Milestone One: the visual and interaction prototype. A spatial constellation of portraits and commitments
that runs itself on a conference screen and can be explored by hand on a laptop, tablet or phone.

## Run it

No build step is required for development. Serve the folder with any static server and open `index.html`:

```
npx serve .          # or python3 -m http.server
```

`node tools/build.mjs` writes `dist/index.html`, a single self-contained file with the demo portrait pool
embedded, and copies it to `/docs/index.html` at the repository root for GitHub Pages. Either the folder,
`dist/`, or `/docs` can be deployed to Cloudflare Pages or GitHub Pages as a static site.

GitHub Pages: Settings → Pages → Source "Deploy from a branch" → branch `main`, folder `/docs`.
The page is then at `https://<owner>.github.io/<repository>/` and accepts the URL parameters below.

### URL parameters

| Parameter | Values | Meaning |
|---|---|---|
| `mode` | `guided` (default on large screens), `explore` (default on touch and narrow screens) | Guided display runs itself; personal exploration waits for the viewer. |
| `n` | `0`, `30`, `300` (default), `1000`, up to `1200` | Size of the sample dataset. Validation sizes, not attendance claims. |
| `dev` | `1` | Shows development controls: simulate an arrival, a surge of five, a shared intention, switch dataset size. Shift+D toggles them too. |
| `display` | `1` | Audience display mode: development controls are never available. |

Keyboard: `Escape` closes a promise or dialog, `/` opens search. "All commitments" is the accessible list view.

## What is real and what is simulated

- **Sample data.** Every name and commitment is fictional and generated deterministically in `src/data.js`.
  Nothing is connected to a submission system. "Simulate arrival" adds a fictional person locally.
- **Portrait pool.** Twelve portraits, generated with an image model for this prototype, graded to one
  monochrome treatment. They are reused across the sample people with per-print mirroring and tonal
  variation, and the pool is disclosed here on purpose. No real staff photographs are used.
- **Themes** are assigned explicitly in the sample data. There is no live clustering. Related commitments
  in "A shared intention" share an assigned theme and are chosen by spatial proximity.

## Architecture

| File | Responsibility |
|---|---|
| `src/data.js` | Data adapter. `createLocalAdapter()` exposes `list()`, `subscribe()`, `simulateArrival()`, `setEligible()`. Replace with a network adapter later without touching the rest. |
| `src/layout.js` | Deterministic home positions from contribution id and theme. Stable across revisits, resizes and arrivals. |
| `src/sequencer.js` | Presentation state machine: `GUIDED_OVERVIEW`, `GUIDED_FOCUS`, `GUIDED_THEME`, `GUIDED_ARRIVAL`, `MANUAL_EXPLORE`, `MANUAL_FOCUS`, `PAUSED`. One timer at a time, fair rotation, arrival queue. Timing defaults live in `TIMING`. |
| `src/scene.js` | three.js rendering. One instanced draw call for all portraits, depth fade, dimming, occlusion handling, bounded camera tweens, viewpoint save and restore. |
| `src/app.js` | DOM wiring: the four views, search, list view, modes, input, reduced motion, development controls. |

The focused commitment is always real DOM text, never canvas, so it is readable, selectable and
available to assistive technology.

## Composition and the glide

People are laid along one ribbon that starts large at lower left and thins into the distance at upper right,
with themes occupying stretches of the ribbon. Home positions never move. In guided view the camera glides
alongside the ribbon, one slow pass each way over three minutes, so the stream appears to flow past. A focus
holds the camera; returning picks the glide up where it left off. Closing a manual selection returns to the
exact still viewpoint the viewer had.

## Motion contract (defaults, for tuning)

Overview gap 10–15 s · focus transition 2 s · reading time `max(12, 5 + words/2.5)` s · return 1.8 s ·
breathing interval 4.5 s · shared intention 16 s · arrival 11 s. Manual input always wins; automation
resumes only through "Resume guided view" or "Guided view".

## Next milestones

Two: real mobile submission journey, image processing, durable storage, display eligibility, arrival feed,
personal links. Three: event readiness on the actual display hardware.
