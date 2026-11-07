# Performance Comparison  

## Bruce's Ask

Can you create two web pages that effectively do the same thing but in two different ways.  Both should just use vanilla js.

1.  One page renders a large web page showing lots of repeated sections of information, no attributes, followed by a script tag with type application/json, with the JSON inside used to generate the information (so that the data essentially appears twice), maybe with some strings, formatted numbers (in the HTML), formatted dates (in the HTML).  Maybe add a script tag at the top of the page that sets the start of the time, before all the html, then a script tag that parses the json from the application/json, and then marks the end of the time.

2.  Another web page with the same script tag at the top to measure the start of time, followed by html with itemprop attributes that should look exactly the same to the end user.  A script tag at the end builds the object from reading the itemprop textContent and/or value attributes.  Then measure the total time.

I'm not sure this will be a perfect measurement.

Part of th advantage of approach 2 is that in theory, things can be done progressively as the HTML streams in, but let's start with this simple test.

## Claude's Response

Done: [`demos/hydration-benchmark/`](../../../../../demos/hydration-benchmark/).

| File | |
|---|---|
| [`generate.mjs`](../../../../../demos/hydration-benchmark/generate.mjs) | Generates both pages from the same deterministic data: `node demos/hydration-benchmark/generate.mjs [sections]` (default 1000) |
| [`json.html`](../../../../../demos/hydration-benchmark/json.html) | **Approach 1:** sections with no attributes, then `<script type="application/json">` with the same data, parsed with `JSON.parse` |
| [`microdata.html`](../../../../../demos/hydration-benchmark/microdata.html) | **Approach 2:** the same sections with `itemprop` / `itemscope`, and a final script that builds the object back from the markup |
| [`compare.html`](../../../../../demos/hydration-benchmark/compare.html) | Runs both N times and shows the medians, and checks that both pages produce **the same object** |

### The pages

- **Each section:**
  - a name;
  - the flight number;
  - a **formatted date** (*March 14, 2026 at 3:09 PM UTC*);
  - rocket and launch site;
  - a **formatted number** (*549,054 kg*);
  - success / failure;
  - a details sentence;
  - a crew list of 3 (name and role).

  The user sees **exactly the same text** in both pages.
- **Microdata typed values:**
  - `<data value="549054">549,054</data>` for numbers and booleans;
  - `<time datetime="2026-03-14T15:09:26.000Z">` for dates;
  - `<meta itemprop="id" content="…">` for the id, which isn't displayed;
  - `itemscope` on each section and each crew member.
- **Reading back** (vanilla, about 30 lines):
  - itemprops in the item's own scope only (the donut rule);
  - nested `itemscope` → an object;
  - `<data>` / `<meta>` → typed (`"7"` → 7, `"true"` → true);
  - `<time>` → its `datetime`;
  - everything else → `textContent`.

  `crew` is always an array: microdata can't tell a one-item list from a single value, so the reader has to know.
- **Timing:**
  - `window.t0 = performance.now()` is the first thing in `<head>`;
  - the final script records `t1` at its start and `t2` at its end;
  - **html** = `t1 − t0`: downloading and parsing the page, including, for approach 1, the JSON text;
  - **script** = `t2 − t1`;
  - **total** = both.

  Each page shows its own numbers in a sticky bar when opened directly.

### Results (1,000 launches, 15 loads of each page, medians in ms, local server)

| | Size | Chromium html / script / **total** | Firefox | WebKit |
|---|---|---|---|---|
| **json.html** | 881 KB (420 KB of it is the JSON) | 8.0 / 0.6 / **8.5** | 9 / 1 / **10** | 10 / 1 / **10** |
| **microdata.html** | 971 KB | 16.0 / 12.2 / **28.2** | 35 / 19 / **55** | 16 / 14 / **30** |

Both pages produced the identical object in all three browsers.

### What this says

- **Approach 1 is about 3 to 5 times faster in total here.** Two reasons:
  - **`JSON.parse` is nearly free:** under 1 ms for 420 KB.
  - **Parsing the microdata page takes about twice as long.** Mostly this isn't the attributes: in Chromium, stripping every `itemprop` / `itemscope` saved only about 2 ms. It's the **extra elements**: a `<data>`, `<time>`, `<meta>` and two `<span>`s per section, where approach 1 has plain text. The JSON text, by contrast, is one script token that the parser barely looks at.
- **Reading microdata back** takes 12 to 19 ms for 1,000 items (about 12 to 19 µs each). This first version is straightforward: a TreeWalker that calls `closest()` per element. It could probably be made faster, but it's unlikely to get near `JSON.parse`.
- **Sizes are close,** because approach 1 ships the data twice (the text, then the JSON) while approach 2 ships it once plus the attributes. With gzip or brotli over a network, the duplicated JSON compresses well, so neither should win much on transfer.
- **Not measured, and where approach 2 could still win:**
  - **Streaming.** Microdata can be read section by section *as the HTML arrives*, e.g. a small script after each section, or a `MutationObserver`. The first sections are then usable long before the page ends. Approach 1 can't use any data until the whole JSON has arrived, at the end of the page. (Putting the JSON at the *top* would fix that, but delays the content.)
  - **Hydration needs more than data.** To hydrate, the client also has to find each value's element. Approach 2 has done that already: each value came *from* an element. Approach 1 would still have to walk the DOM to pair data with elements, which is part of what Tree's adoption (see [RebindingServerRenderedManagers.md](./RebindingServerRenderedManagers.md)) would do. So for hydration specifically, the fair comparison is "JSON.parse plus pairing the DOM" against "reading microdata", not JSON.parse alone.
  - **Rendering** (layout and paint) is excluded from both, and is likely larger than either number on a real page.

### A measurement lesson along the way

**My first runner loaded the pages in hidden iframes,** and Chromium then reported **91 ms** of parsing for the microdata page (vs 16 ms as a normal page). Making the iframe visible didn't help (78 ms). Chromium evidently parses element-heavy documents in frames very differently, while the JSON page, being mostly one script token, wasn't affected.

**So `compare.html` now navigates for real:** "Run" queues the pages in `sessionStorage`; each page records its timing and loads the next; the last returns to `compare.html` with the medians. Every sample is then a real top-level page load, which is what a visitor gets. Firefox and WebKit gave similar numbers either way.

### Possible next steps

1. **A streaming variant of approach 2** (read each section as it arrives, then report when the first section is usable vs when the page ends). It would test the progressive advantage you mention, ideally over a throttled connection, so that arrival time matters.
2. **A "hydration-fair" variant of approach 1:** `JSON.parse` *plus* pairing each value with its element, which is what hydration actually needs.
3. **A faster microdata reader,** to see how close it can get.

Should I do any of these?