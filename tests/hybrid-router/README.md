# HybridRouter v3 browser regression tests

Run from the repository root with Node.js (no packages are required):

```sh
node tests/hybrid-router/server.mjs
```

Open http://127.0.0.1:4173/__tests in a browser. The page runs the router against a captured copy of the real Carrd playground and prints each result. Open http://127.0.0.1:4173/ for manual navigation. The server binds only to loopback. Set `PORT` to change the port.

`carrd-playground.html` was captured from https://drdemo1.crd.co/ on 2026-09-29. Its native Carrd JavaScript and CSS are retained. The test server removes the existing remote Hashium module and inserts the local `src/cms/carrd/libs/routers/v3/hybridRouter.js` module directly; it never publishes to Carrd or changes the live site. The captured fixture is for regression testing, not deployment.

v3 is opt-in. The existing `src/index.js` still imports the original v2 router and does not enable v3. For a live playground test, follow the [v3 installation instructions](../../docs/hybrid-router.md#playground-installation): replace the existing router embed with the direct v3 module embed, keep the existing redirects, and never load v2 and v3 together.

The harness instruments every real `history.pushState` and `history.replaceState` call before loading the router. Section navigation must write only clean URLs, rather than briefly writing and later removing fragments. Tests also inspect the actual active Carrd section, so a correct address bar alone cannot count as success.

Opt-in query flags exercise native behavior:

- `?__redirects=1` reproduces the playground's HTTP 301 rules: `/page` to `/#page`, nested paths to their double-dash section fragments, and unmatched paths to `/`. Query parameters are preserved.
- `?__nativeOptions=1` sets Carrd's native `page` options to hide the header/footer and disable auto-scroll. It modifies the fixture's native options only, not the router.
- `?__tall=1` adds enough section height to verify scroll restoration after a real reload.
- `?__blockedStorage=1` makes session-storage access throw, verifying graceful behavior when storage is unavailable.

To run a focused case, add `?only=substring` to `/__tests`. The filter matches test names without case sensitivity.

The runner includes initial nested paths, legacy fragment URLs, scrollpoints, refresh through Carrd redirects, Back/Forward, rapid transitions, duplicate clicks, queries, foreign history state, malformed URLs, keyboard-style click events, modified clicks, and native section lifecycle behavior. Programmatic events in the runner are supplemented by manual browser checks; cross-browser support requires running the same page in each target browser.

To update the fixture, capture the published playground HTML, preserve its Carrd runtime, and rerun the entire suite. A Carrd runtime change can alter the private invisible-scrollpoint bridge contract.
