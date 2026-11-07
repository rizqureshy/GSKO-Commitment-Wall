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

## The stream

A band of portraits rises small out of a planet horizon on the far left, runs across the frame and bends
forward toward the viewer on the right, where the prints are large, layered and softly out of focus at the
very front. Each person has a deterministic phase and offset in the stream; nothing is recalculated when it
moves. One shared progress value advances the whole procession; prints fade out past the viewer and re-enter
at the horizon, so the loop is seamless.

In guided view the stream advances slowly on its own (`STREAM_PERIOD` in `src/layout.js`). The mouse wheel, a
trackpad, a touch drag, or the left and right arrow keys move it forward and back with gentle easing and no
momentum; doing so takes manual control and pauses the guided sequence, and the stream then holds where you
leave it. Selecting a portrait stops the stream and brings that commitment forward; closing it restores the
exact position. "Resume guided view" restarts the automatic journey. Automatic features are drawn only from
the readable front of the stream. The camera stays broadly still.

## Choreography (branch `annual-connect-magic`)

Five moments layered on the stream. All of them use one extra per-print light channel and one horizon uniform;
none of them add particles or decoration.

- **Dawn.** On load the screen is dark except the horizon rim. The rim brightens, the prints come up along the
  stream from the horizon to the front, and the title and controls arrive last. Eighteen seconds on the guided
  display, seven in personal exploration, none with reduced motion. `?dawn=0` skips it. The guided sequence
  starts when dawn ends. Development control: Replay dawn.
- **The travelling light.** A warm pulse leaves the horizon (which flares a little) and runs the length of the
  stream in about eleven seconds, once a minute or so while nothing is featured. Development control:
  Travelling light.
- **The crowd makes way.** When a promise is featured, the prints around it move aside so the chosen portrait
  has room, and close again on exit. Occlusion fading is kept for anything strictly in front.
- **Time is position.** The collection is ordered by submission time along the stream: the newest at the
  readable front, older behind it toward the horizon. A readout under the count names when the people now
  passing the front made their commitment, and changes as you scroll. New arrivals enter at the front.
  Theme neighbourhoods are no longer contiguous as a consequence; shared intentions still connect the nearest
  people on the same theme.
- **The closing.** Shift+C, `?closing=1`, or the development control. The stream stops, every print lights in
  turn from the horizon to the front over nine seconds and stays faintly lit, and the title becomes
  "Our commitments. Made." Resume guided view ends it.

## Motion contract (defaults, for tuning)

Overview gap 10–15 s · focus transition 2 s · reading time `max(12, 5 + words/2.5)` s · return 1.8 s ·
breathing interval 4.5 s · shared intention 16 s · arrival 11 s. Manual input always wins; automation
resumes only through "Resume guided view" or "Guided view".

## Next milestones

Two: real mobile submission journey, image processing, durable storage, display eligibility, arrival feed,
personal links. Three: event readiness on the actual display hardware.
