# Carrd HybridRouter v3

`src/cms/carrd/libs/routers/v3/hybridRouter.js` exports an automatically initialized router when that module is loaded directly. It also exports the `HybridRouter` class for isolated integrations and tests.

v3 is opt-in. The existing `src/index.js` still imports the original v2 router; loading that entry point does not enable v3. To try v3, replace the existing router embed with the direct v3 module embed below. Use only one router per document; do not load v2 and v3 together.

## URL behavior

Carrd section `page--subpage-section` maps to `/page/subpage`. The first section maps to `/`; its native `#home` alias also resolves to `/`. Visible scrollpoints retain their fragment, such as `/page#fragment2`. Invisible scrollpoints keep a clean URL while their identity is retained in the history entry. Query strings survive navigation.

Normal section clicks and Back/Forward use clean History API URLs throughout. The router drives Carrd through its existing invisible-scrollpoint click handler rather than changing `location.hash`. This retains Carrd's native section animation, component load/unload, header/footer rules, titles, and form resets. The bridge temporarily suppresses only the native history write associated with its own synthetic click, then restores the original method synchronously.

Carrd transitions are serialized. A newer request updates the URL immediately and replaces pending rendering work; it waits for an already-started native transition to finish. The router never allows an old completion callback to overwrite a newer URL.

Selecting the already active section preserves its scroll position and does not create a duplicate history entry. This also avoids overriding Carrd's `disableAutoScroll` option. Use the native scroll-to-top action or `navigate('/page', { scrollToTop: true })` when a top reset is intended.

## Redirects and refresh

The playground currently redirects clean paths to native fragments before loading the document:

```text
/page                    -> /#page
/page/subpage            -> /#page--subpage
/page/subpage/third-page -> /#page--subpage--third-page
```

These redirects allow fresh requests to reach the Carrd document. They also expose a fragment before any JavaScript can run. The router normalizes it once initialized; it cannot prevent the browser displaying a fragment supplied by an HTTP redirect. Eliminating that particular flash requires a host/proxy that serves the same document at clean paths without redirecting the browser to a fragment.

Browsers do not send URL fragments to servers. A redirect source such as `/page#fragment2` cannot distinguish that request from `/page`. Bookmarking or opening a copied `/page#fragment2` in a new tab can therefore lose the point when the `/page` redirect supplies its own `#page` fragment. Direct `/#fragment2` links work with native Carrd and normalize to the correct section and point.

For a reload in the same tab, the router restores the section's scroll position and scrollpoint identity from its matching history entry. When the redirect discards that state, it uses a short-lived, single-use `sessionStorage` snapshot written when the document is left. Recovery requires an actual reload plus matching origin, query, section and canonical route; an ordinary incoming link does not revive an old scrollpoint. Storage failures are caught, so navigation continues when storage is disabled, but redirect-based reload restoration can then be unavailable.

For Back/Forward that loads another document, a Navigation API listener records the intended destination before Carrd's redirect can replace its fragment. It observes the navigation without intercepting it. This preserves a visible scrollpoint through the sequence navigate, refresh, Back, Forward. Browsers without the Navigation API retain ordinary routing and reload recovery, but cannot use this additional recovery when a cross-document traversal loses its fragment and history state. The relevant event data is described in the [Navigation API documentation](https://developer.mozilla.org/en-US/docs/Web/API/NavigateEvent/navigationType).

Scroll positions are remembered in memory for immediate Back/Forward and persisted to history at most twice per second during scrolling. Navigation and leaving the page flush the current position.

## Playground installation

The live playground was observed loading `hashium@dev/src/index10.min.js`, which imports `hashiumRouter6.js` and `modes/hybridMode2.js`. Adding v3 does not switch that live loader or the existing `src/index.js` entry point.

For a playground test, replace the existing Hashium module embed with a module URL pointing directly to v3 at a pinned commit. Do not add it alongside the existing embed or load v2 and v3 together. Keep the existing redirects for this test. The change is isolated to the router; no Carrd settings or production CDN settings need to be changed to validate in-page navigation.

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/casellas-maknikar/hashium@TESTED_COMMIT/src/cms/carrd/libs/routers/v3/hybridRouter.js"></script>
```

## API and compatibility

```js
import router from './src/cms/carrd/libs/routers/v3/hybridRouter.js';
await router.ready;
router.navigate('/page/subpage');
await router.whenIdle();
router.navigate('#fragment2', { replace: true });
```

`navigate` returns whether the target was accepted. External URLs, unknown routes and malformed encodings are not treated as Carrd sections. Modified clicks, downloads and links targeting another browsing context retain normal browser behavior.

`ready` and `whenIdle()` resolve to a success boolean. Adapter errors are available through `lastError` and a `hybridroutererror` event on `window`. `destroy()` removes the router's listeners and restores the native helpers it wrapped. Use one active router per document.

The invisible-scrollpoint bridge uses Carrd's generated runtime behavior, not a documented public Carrd API. The regression fixture captures the runtime it was validated against; rerun the browser suite when Carrd changes its generated scripts. The router does not replace Carrd's lifecycle with a separate implementation.

See [the browser test instructions](../tests/hybrid-router/README.md) for reproducible validation.
