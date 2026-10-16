/**
 * Shared by the js-framework-benchmark*.html pages, so they all measure and render the same way:
 *
 * - the `?cv` option (a checkbox): `content-visibility: auto` on the rows;
 * - the timing harness: each operation reports two numbers:
 *   - total: until the next frame has been rendered (requestAnimationFrame + setTimeout),
 *     i.e. including the browser's style, layout and paint of the rows;
 *   - script: until the page's render() has finished, i.e. the rows are in the DOM and
 *     handed to the browser, before any layout or paint. That's the part the library
 *     (or the vanilla code) controls.
 */

const params = new URLSearchParams(location.search);

/** Page options from the URL: `?cv` (content-visibility). Pages may read their own flags (e.g. `?compile`). */
export const options = { cv: params.has('cv') };

/**
 * content-visibility has no effect on native table rows: CSS containment doesn't apply to
 * internal table boxes. So with `?cv`, every page lays the table out as a grid (rows become
 * ordinary boxes) and puts `content-visibility: auto` on each row, so rows outside the
 * viewport skip layout and paint.
 */
const CV_STYLE = `
    .cv table, .cv thead, .cv tbody { display: block; }
    .cv tr { display: grid; grid-template-columns: 8rem 1fr 4rem; content-visibility: auto; contain-intrinsic-size: auto 2.1rem; }
    .cv td, .cv th { display: block; }
`;

/** The row of option checkboxes (`#options`), created before the buttons if the page has none. */
function optionsRow() {
    let row = document.getElementById('options');
    if (!row) {
        row = Object.assign(document.createElement('div'), { id: 'options', className: 'controls' });
        document.querySelector('.controls').before(row);
    }
    return row;
}

/** Add a checkbox for a URL flag; toggling it reloads the page with the flag set or removed (other flags kept). */
export function addToggle(flag, labelHtml) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox"> ${labelHtml}`;
    const checkbox = label.firstElementChild;
    checkbox.checked = params.has(flag);
    checkbox.addEventListener('change', () => {
        const url = new URL(location.href);
        if (checkbox.checked) url.searchParams.set(flag, ''); else url.searchParams.delete(flag);
        location.href = url.href;
    });
    optionsRow().append(label);
}

/** Set up the shared options: the content-visibility checkbox and style, and a note on what's measured. */
export function setupPage() {
    document.head.append(Object.assign(document.createElement('style'), { textContent: CV_STYLE }));
    if (options.cv) document.documentElement.classList.add('cv');
    addToggle('cv', '<code>content-visibility: auto</code> on rows (as a grid, since table rows ignore it; reloads)');
    const note = document.createElement('p');
    note.innerHTML = '<small><b>total</b>: until the next frame is rendered (includes the browser\'s layout and paint). '
        + '<b>script</b>: until the rows are in the DOM and handed to the browser.</small>';
    document.getElementById('results').before(note);
}

/**
 * The timing harness. `render` may be sync or async; `rowCount` reports the rows after an operation.
 * Lines read "<name>  <total>ms  (<rows> rows)  script <script>ms", so tools that parse the
 * total and the row count keep working.
 */
export function createBenchmark(render, rowCount) {
    const resultsEl = document.getElementById('results');
    const timings = [];
    return async function benchmark(name, fn) {
        const start = performance.now();
        fn();
        await render();
        const script = performance.now() - start;
        // Wait for idle (requestAnimationFrame + setTimeout flush): the browser has rendered the frame
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
        const elapsed = performance.now() - start;
        timings.push({ name, elapsed, script, rows: rowCount() });
        resultsEl.textContent = timings.map(t =>
            `${t.name.padEnd(25)} ${t.elapsed.toFixed(1).padStart(8)}ms  (${t.rows} rows)  script ${t.script.toFixed(1).padStart(7)}ms`
        ).join('\n');
    };
}
