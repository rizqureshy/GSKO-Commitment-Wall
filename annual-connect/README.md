# Annual Connect — the orbit

A wall of commitments for a conference, reworked from first principles on the branch `annual-connect-orbit`.

**The idea.** The people who commit form a ring around the Earth, and we watch from just above it. The ring
comes up over the curve of the planet, passes beneath us and carries on round the far side. Below, the world
turns in the dark and its cities are lit. Fifteen hundred people close the ring all the way round.

Everything else follows from that one picture:

| The brief asked for | Here it is |
|---|---|
| All of us | The ring. Distant people are small because they are far, and the planet hides those on the other side. |
| One promise | A print lifts out of the ring and is held in front of us, in colour, beside the words. A line runs down to the place they work. |
| A shared intention | Three prints held side by side, each from a different place, with the three promises in full. |
| Someone joins | A light rises from their city, becomes a portrait, and takes a place in the ring. |
| The start of the day | Dawn: stars, then the limb of the planet, then city lights, then the ring arriving over the horizon. |
| The end of the day | The closing: the sun comes up on the ring, every print is gilded, and the title changes to "Made." |

Nothing is decoration. The guided display even takes its order from the planet: people whose part of the world
is in view below are featured first, so the turning Earth decides who is next, and everyone's place comes round.

## Run it

```
cd annual-connect
python3 -m http.server 8080        # or: npx serve .
```

Open `http://localhost:8080/` for the wall and `http://localhost:8080/join.html` for the phone page. There is
no build step for development and nothing is fetched from another site: three.js, the fonts and the imagery are
all in this folder.

`node tools/build.mjs` writes the deployable site to `dist/` and to `/docs` at the repository root (GitHub Pages:
branch, folder `/docs`), plus a self-contained preview in `dist/preview/`.

### Addresses

| Address | What it is |
|---|---|
| `index.html?mode=guided&display=1` | The conference screen. Runs itself. No rehearsal controls, no "Add yours" link. |
| `index.html?mode=explore` | Personal exploration. Default on touch devices and narrow windows. |
| `join.html` | The phone page: add a commitment. |
| `index.html?find=<id>` | Opens the wall on one person. The phone page's "Find my commitment" link. |

Other parameters: `n=0|30|300|1000|1500` sample size · `dev=1` rehearsal controls (also Shift+D) · `dawn=0` skip
the dawn · `closing=1` start the closing after six seconds.

### Keys

`←` `→` move along the ring · `/` find · `Esc` close · `Shift+C` the closing · `Shift+D` rehearsal controls.

## How it behaves

- **One state at a time.** `GUIDED_OVERVIEW`, `GUIDED_FOCUS`, `GUIDED_THEME`, `GUIDED_ARRIVAL`, `MANUAL_EXPLORE`,
  `MANUAL_FOCUS`, `PAUSED`. One timer at a time; stale callbacks are dropped by a token.
- **A hand always wins.** Selecting, searching, scrolling, dragging or an arrow key suspends the guided sequence.
  It resumes only through "Guided view" or "Resume guided view".
- **Scrolling moves the people, not the camera.** One shared progress value turns the whole ring. It follows the
  hand with easing and no momentum, and stays where it is left. The camera does not travel.
- **Reading is not disturbed.** A featured print is lifted out of the ring, so the ring can keep flowing behind
  it without the print going anywhere. A promise the viewer opened stays until they close it. Closing puts the
  print back and leaves the ring exactly where it was.
- **Arrivals queue.** On the guided display a newcomer waits for the current feature to finish. In a surge, up
  to three are introduced together and the rest are counted. In a personal session an arrival is a quiet line of
  text and a new print rising into place.
- **Fair rotation.** Nobody is featured twice until the available pool has been round. Nothing is weighted by
  seniority, appearance or reactions.
- **Stable places.** A person's place in the ring comes from their id and theme alone. The arc the ring occupies
  is fixed when the wall opens, so one person joining never moves another.
- **Timing defaults** (in `src/sequencer.js`): 10–15 s between features · 2 s lift · reading time
  `max(12, 5 + words/2.5)` s · 1.8 s return · 4.5 s breath · 16 s for a shared intention · 11 s for an arrival.
- **Reduced motion.** No dawn, a still ring and planet, immediate lifts. Every view and control remains. There
  is also a Motion button on the page.

## What is real and what is not

| | |
|---|---|
| **People and promises** | Fictional. Generated in `src/data.js` so the wall can be judged at 30, 300, 1,000 and 1,500. |
| **Portraits** | Twelve generated sample portraits, reused across the sample people with mirroring and per-print toning. This pool is disclosed here on purpose; no real staff photographs are used. About one in five sample people has no portrait and shows initials instead. |
| **Themes** | Assigned in the sample data. There is no clustering. "A shared intention" shows people who carry the same assigned theme, and never rewrites anyone's words. |
| **Metros** | Forty-seven places with two-letter codes in the style Equinix uses. The list and coordinates are illustrative and approximate (`METROS` in `src/data.js`). Sample people are assigned one at random. |
| **The Earth** | NASA Blue Marble and Black Marble imagery (public domain), via the `three-globe` example assets. City lights are redrawn as points in the shader so they hold up at close range. The orbit is inclined 40° so the ground track crosses lit continents. Not to scale. |
| **Submissions** | Real, but local. The phone page saves to this browser only (IndexedDB) and tells a wall open in the same browser. It proves the journey on one machine. Nothing is sent anywhere. |
| **"Simulate arrival"** | A fictional person added locally. Not a submission. |
| **Not built** | A server, storage shared between devices, organiser sign-in and moderation, a retention period, the QR code, a text filter. See "Going live". |

## The phone journey

Name and commitment, optionally a place and a theme, optionally a portrait from the camera or the library, a live
preview of the print as it will hang in the ring, the display notice, then a confirmed save and a personal
"Find my commitment" link.

- The photo is opened with its orientation respected, cropped to the print and re-encoded on the device at
  640×960. Re-encoding is also what removes the camera's metadata: location, device and time are not kept.
- No portrait is an equal choice: initials, set like a name plate.
- One id is fixed for the whole draft, so a double press or a retry cannot create a second person.
- The page says so plainly when a file is not a readable photo, when a photo is too large, or when saving fails.
- Text is always placed as text, never as markup, on both pages.
- No face recognition and no inference about anyone.

The wording of the display notice is a placeholder for the event owner to replace, and the retention period is
theirs to set; neither is decided here.

## Files

| File | Responsibility |
|---|---|
| `src/data.js` | Sample people, promises, themes and metros. |
| `src/store.js` | The seam to storage: `list`, `subscribe`, `submit`, `setEligible`. The prototype implementation lives here; the wall and the phone page talk only to this interface. |
| `src/orbit.js` | The geometry: the ring, a person's place in it, the viewpoint, the stage. |
| `src/sequencer.js` | Who is on stage and when. |
| `src/scene.js` | Rendering: Earth, air, stars, metros, the crowd in one instanced draw, the stage, dawn and sunrise. |
| `src/app.js` | The wall page: views, input, search, the plain list, arrivals, dawn, the closing. |
| `src/join.js`, `join.html` | The phone page. |
| `tools/build.mjs` | Static site and self-contained preview. |

The focused commitment, the names and the plain list are real text in the page, not pixels in the canvas.

## Going live

The experience does not change; `src/store.js` does. Replace its prototype implementation with calls to the
event's own service, keeping the same four functions:

1. **Static hosting** for these files.
2. **One small service** with: submit (idempotent on the client's id), list eligible contributions, serve
   portraits, an event stream or poll for arrivals, and organiser-only hide and remove.
3. **Storage** for rows and for portraits, originals kept apart from display copies.
4. **Organiser access** behind the company's sign-in.

Cloudflare Pages, a Worker, D1 and R2 fit this exactly and were the plan discussed earlier; any equivalent does.
Before the event: the real display and its browser, real phones, a burst of arrivals, a dropped connection (the
wall should keep showing the last collection it had), and the display notice signed off by its owner.

## Checked

Driven in headless Chromium with real clicks, scrolls, keys and a phone-page submission, on this build:

- the ring moves untouched; automatic features come from the readable front; the ring flows during a feature
- a scroll takes over; forward advances and holds; backward returns to the same place
- a click brings the right person and their whole promise forward; an arrival does not interrupt; Escape closes
  and the ring is exactly where it was; nothing automatic happens until guided view is resumed
- search finds someone on the far side and brings their place round
- a shared intention shows three people with the same theme
- a surge of five is queued and introduced as a group
- places are identical on a revisit
- arrows, slash and Escape; the plain list holds everyone
- reduced motion; an empty collection; every portrait failing to load
- a 275-character promise with a 42-character name, whole and unscrolled, on a wide screen and a phone
- phone: no sideways overflow, targets of 44 px or more
- 30, 300, 1,000 and 1,500 people; a triple-pressed submit stores one entry; it survives a reload

Frame rate was only measured in software rendering without a GPU (about 20 frames a second at every size), which
says nothing useful about a real display. Measure it on the event hardware.
