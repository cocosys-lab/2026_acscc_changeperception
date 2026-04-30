# DrawIt for Qualtrics — Setup Guide

A "You-Draw-It"-style chart (inspired by the NYT interactive) that you can drop
into a Qualtrics survey. Participants free-draw a line with mouse or touch; the
line snaps to a configurable grid (default: 1 year × 1%, axis 1900–2100 × 0–100%);
a single fixed anchor point is shown for reference; the Next button stays
disabled until they've drawn the entire x-axis.

For each question you get back, in Embedded Data:

- **`drawit_<qid>_finalY`** — comma-separated y-value at every x-tick (`""` if a tick was somehow not drawn).
- **`drawit_<qid>_events`** — JSON event log: `[[tMs, xIndex, y], …]`. `xIndex=-1, y=-1` marks a Clear action.
- **`drawit_<qid>_editCount`** — number of distinct draw strokes (one per mousedown/touchstart) plus +1 per Clear.
- **`drawit_<qid>_timeMs`** — milliseconds from the moment the question rendered to the latest commit.
- **`drawit_<qid>_completed`** — `1` if the line spans the full x-axis, `0` otherwise.
- **`drawit_<qid>_xRange`** — `xMin,xMax,xStep` (so you can decode `finalY` later).
- **`drawit_<qid>_yRange`** — `yMin,yMax,yStep`.
- **`drawit_<qid>_anchor`** — `anchorX,anchorY` (only if an anchor was set).
- **`drawit_<qid>_revealed`** — `1` if the participant clicked Submit and saw the real data, else `0`.
- **`drawit_<qid>_submittedAt`** — ms from question render to Submit click (empty if never submitted).
- **`drawit_<qid>_truthError`** — present only if the truth CSV failed to load; the error message is saved here.

Replace `<qid>` with whatever short ID you set in each question's CONFIG block
(e.g. `overweight_us`, `women_workforce`).

---

## Files in this folder

- **`drawit-library.js`** — the reusable engine. Loaded once at the survey level.
- **`drawit-question-template.js`** — the small per-question wrapper. One copy per question, with the CONFIG values edited.
- **`drawit-demo.html`** — open this in any browser to test the experience locally before touching Qualtrics. Shows live coverage, edit count, time, and the exact Embedded Data payload you'll receive.

---

## Step 1 — Test the demo locally (recommended)

Double-click `drawit-demo.html`. Draw on the chart. Confirm the right-hand panel
updates with coverage, edit count, time, and the simulated Embedded Data fields.
Tweak the CONFIG inside the file to confirm axes, anchor, and labels behave as
expected for your study.

## Step 2 — Add the library to your survey (once)

You have two options. **Option A is recommended** — paste the library into the
survey-level header, and every question only needs the small CONFIG block.

### Option A — Look & Feel header (recommended)

1. In your Qualtrics project, open **Look and Feel** (the paint-roller icon on the left).
2. Click the **General** tab.
3. Scroll to **Header** and click the `<>` (HTML view) toggle.
4. Paste this, replacing the `/* …library… */` placeholder with the entire contents of `drawit-library.js`:

   ```html
   <script>
   /* …paste contents of drawit-library.js here… */
   </script>
   ```

5. Click **Save**.

That's it — `window.DrawIt` is now available on every survey page.

### Option B — Inlined per question (only if your org blocks header edits)

If you can't edit Look & Feel, paste the library at the top of each question's
JavaScript (above the `addOnload` block). It's repetitive but works.

## Step 3 — (Strongly recommended) Declare Embedded Data fields in the Survey Flow

Qualtrics will save Embedded Data even when fields aren't pre-declared, but
fields that aren't declared sometimes don't appear in data exports. To be safe:

1. Go to **Survey Flow** (top toolbar).
2. At the top of the flow, click **Add a New Element Here → Embedded Data**.
3. For each `<qid>` you'll use, add eight fields:

   - `drawit_<qid>_finalY`
   - `drawit_<qid>_events`
   - `drawit_<qid>_editCount`
   - `drawit_<qid>_timeMs`
   - `drawit_<qid>_completed`
   - `drawit_<qid>_xRange`
   - `drawit_<qid>_yRange`
   - `drawit_<qid>_anchor`

4. Leave the values blank (they'll be filled in at runtime).
5. **Save Flow**.

Tip: do this once with `<qid>` placeholders for each of your 6+ questions before
you start collecting data — adding fields after launch only captures new responses.

## Step 4 — Add a DrawIt question

For each chart you want in your survey:

1. Click **+ Add new question** and set the question type to **Descriptive Text**
   (formerly "Text/Graphic"). The participant's answer comes from Embedded Data,
   not from a text/multiple-choice field, so Descriptive Text is correct.
2. Leave the question text blank, or write a short prompt (e.g. "Draw your best
   estimate."). The chart will be appended below it automatically.
3. Hover over the question, click the gear icon (⚙) on the left, choose
   **Add JavaScript**.
4. Replace the editor's contents with the entire `drawit-question-template.js`.
5. Edit the **CONFIG** block at the top:
   - `qid` — unique short identifier (used as the Embedded Data prefix).
     **Make this unique for every DrawIt question in the survey.**
   - `title`, `instruction`
   - `xLabel`, `yLabel`
   - `xMin`, `xMax`, `xStep` — current default: 1900–2100, 1-year resolution.
   - `yMin`, `yMax`, `yStep` — current default: 0–100, 1% resolution.
   - `xMajorTick`, `yMajorTick` — major gridline + label spacing.
   - `anchor` — `{ x: 2025, y: 73 }` for a known data point, or `null` for none.
   - `anchorLabel` — optional override for the anchor's caption.
   - `requireFullCoverage` — keep `true` to block submission until the line spans the full x-axis.
6. Click **Save**.

## Step 5 — Preview and pilot

- Click **Preview** in the top toolbar. Draw the line, click Next, finish the
  preview, and check **Data & Analysis** — your `drawit_*` fields should be populated.
- Pilot with 3–5 internal participants on desktop and mobile to make sure the
  chart fits well on your real Look & Feel.

---

## Step 6 — (Optional) Add a real-data reveal

When you set either `truthCsvUrl` or `truthData` in a question's CONFIG, a
**Submit my answer** button replaces the auto-Next behavior. After the
participant clicks Submit, their drawing locks, the real data appears overlaid
in dark navy, and the Qualtrics Next button enables. This matches the NYT
"You Draw It" reveal flow.

### Option A — CSV in your Qualtrics Library (recommended)

1. In Qualtrics, click your account icon → **Library**.
2. Open **Files Library** (or **Graphics Library** in older versions).
3. Click **+ Upload File** and pick a small CSV with two columns: x then y.
   Example `overweight_us.csv`:
   ```csv
   year,percent
   1960,45
   1970,47
   1980,50
   1990,56
   2000,64
   2010,69
   2020,72
   2025,73
   ```
   A header row is fine — the script ignores any non-numeric rows. Provide
   coarse points and the chart will linearly interpolate between them.
4. After upload, click the file → **Embed code** (or **Get Public URL**) and
   copy the full URL. It will look like
   `https://yourorg.qualtrics.com/CP/File.php?F=F_xxxxxxxxxxxxxxxxx`.
5. Paste that URL into the question's CONFIG as `truthCsvUrl: '...'`.

### Option B — Inline truth data

If your CSV is short, you can skip the upload and inline it:

```js
truthData: [
  { x: 1960, y: 45 },
  { x: 1970, y: 47 },
  { x: 1980, y: 50 },
  { x: 1990, y: 56 },
  { x: 2000, y: 64 },
  { x: 2010, y: 69 },
  { x: 2020, y: 72 },
  { x: 2025, y: 73 }
]
```

### How participants experience it

1. They draw their line (Submit button is disabled until full coverage).
2. They click **Submit my answer**.
3. The chart locks, the real data appears as a dark-navy line labeled "Real data",
   and the status text reads "The dark line is the real data. Click Next to continue."
4. They click Next. Their drawing is final; the real data is *not* saved to
   Embedded Data (it's known to you already), but `revealed=1` and the
   `submittedAt` timestamp are saved.

### CORS note

Qualtrics-hosted CSV URLs share the survey's domain, so `fetch()` works
without extra setup. **External URLs (GitHub raw, your university server,
Google Drive)** may be blocked by the participant's browser due to CORS — host
the file in your Qualtrics Library to avoid this.

## Tips and pitfalls

- **Multiple questions per page**. If you put two DrawIt questions on the same
  page, each must use a different `qid`. The library handles multiple instances
  fine, but matching `qid`s would overwrite each other's Embedded Data.
- **Embedded Data size**. The full event log can grow. With the default 1-year × 1%
  grid and typical drawing behavior, the JSON usually stays well under Qualtrics's
  ~20 KB-per-field limit. If you see truncation, shorten the x-axis or coarsen
  `xStep` (e.g. 5-year ticks → ~5× shorter logs).
- **Mobile usability**. Touch works, but a 200-cell-wide chart on a phone is
  tight. Consider restricting to desktop in your survey settings, or using a
  larger `xStep` for mobile cohorts.
- **Decoding `finalY` later**. `xRange` saves `xMin,xMax,xStep`, so you can
  reconstruct each cell's calendar year. With defaults, `finalY[0]` is year 1990,
  `finalY[200]` is year 2040.
- **Anchor protection**. The anchor cell is locked — drawing through it does not
  overwrite its y-value, but the surrounding cells still update normally.
- **Clear button** sets every cell back to null (except the anchor) and logs a
  Clear marker as `[t, -1, -1]` in the event log; `editCount` increments by 1.
- **Time semantics**. `timeMs` is "ms from the moment the question rendered to
  the most recent commit". Commits happen on every mouse-up / touch-end and on
  page submit, so this is effectively "time spent drawing on this question".

