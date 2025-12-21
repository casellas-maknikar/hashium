/*
 * HybridRouter with support for secondary fragments (scrollpoints).
 *
 * The base router cleans up URLs so that navigating between Carrd sections
 * results in pretty paths (e.g. `/page` instead of `/#page`). However,
 * Carrd sites can also define scrollpoints using elements with
 * `data-scroll-id` attributes. Clicking links to these anchors should
 * preserve the fragment in the URL (e.g. `/page#test`) and not trigger
 * a section change. This implementation extends the original
 * HybridRouter to detect scrollpoint anchors and avoid stripping them.
 */

class HybridRouter {
  constructor() {
    const w = window,
      d = w.document,
      l = w.location,
      h = w.history,
      t = this;
    t.l = l;
    t.o = l.origin;
    t.rS = h.replaceState.bind(h);
    // Store a reference to the history object for later use in click handlers
    t._history = h;
    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    // detected root section id (first Carrd section)
    t._rootId = '';

    (d.readyState === 'loading'
      ? d.addEventListener.bind(d, 'DOMContentLoaded')
      : (f) => f())(() => t.init(), { once: 1 });
  }

  sectionFromHash(h) {
    return String(h || '').slice(1).replaceAll('--', '/');
  }
  sectionFromPath(p) {
    return decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  }

  // detect first Carrd section id
  detectRootId() {
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return s && s.id ? s.id : 'home';
  }

  // map canonical section -> Carrd-driving hash
  // Canonical root is '' (clean URL "/"), but Carrd needs a real id to switch sections.
  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  /**
   * Determine if a given hash refers to a scrollpoint rather than a section.
   * A scrollpoint is an element with a matching `data-scroll-id` attribute.
   *
   * @param {string} hash The raw hash (with leading '#').
   * @returns {boolean} True if the hash corresponds to a scrollpoint.
   */
  isScrollPoint(hash) {
    if (!hash || hash === '#') return false;
    // Remove the leading '#', decode '--' into '/' (sectionFromHash) to
    // mirror how section ids are mapped. We use the raw name (after '#')
    // when checking data-scroll-id since scrollpoints are defined using
    // plain names (e.g. 'test' rather than 'test--foo').
    const id = this.sectionFromHash(hash);
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  drive(section, push) {
    const t = this,
      l = t.l,
      ms = t.SETTLE_MS;
    t._driving = 1;

    // use hashFor() so '#' drives the real root section
    const hh = t.hashFor(section);
    push ? (l.hash = hh) : l.replace(hh);

    setTimeout(() => {
      t.rS({ section }, '', `${t.o}/${section || ''}`);
      t._driving = 0;
    }, ms);
  }

  init() {
    const t = this,
      l = t.l,
      o = t.o,
      rS = t.rS,
      ms = t.SETTLE_MS;

    // learn root section id once
    t._rootId = t.detectRootId();

    const clean = (section) => rS({ section }, '', `${o}/${section || ''}`);
    const settleClean = (section) => setTimeout(() => clean(section), ms);

    // Initial entry
    // If there's no hash or it's just '#', but we're not on the root path,
    // drive to the section implied by the path (e.g. '/page' -> '#page').
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      // Otherwise, determine the canonical section from the hash. If the
      // current hash refers to a scrollpoint, we don't want to remove
      // it or change the path to that fragment name. Instead, we ensure
      // the history state reflects the current section (from the
      // pathname) and leave the hash intact.
      if (l.hash && l.hash !== '#') {
        // Check if this hash targets a scrollpoint.
        if (t.isScrollPoint(l.hash)) {
          const currentSection = t.sectionFromPath(l.pathname) || '';
          // Ensure the history state is set for the current section. We
          // include the scrollpoint fragment in the URL but do not
          // attempt to drive to the fragment as a section. Using
          // replaceState here avoids adding a new history entry on
          // initial page load.
          rS({ section: currentSection }, '', `${o}/${currentSection}${l.hash}`);
        } else {
          // If not a scrollpoint, treat the hash as representing a
          // section. Convert '--' to '/' and schedule a cleanup to
          // produce a pretty path.
          const s = l.hash === '#' ? '' : t.sectionFromHash(l.hash);
          settleClean(s);
          // If the hash is exactly '#', force Carrd to the real root
          // section without pushing history.
          if (l.hash === '#') t.drive('', 0);
        }
      } else {
        // No hash present (unlikely if we hit this branch) – clean up any
        // remaining state just in case.
        const s = l.pathname === '/' ? '' : t.sectionFromPath(l.pathname);
        settleClean(s);
      }
    }

    // Click handler
    t.aEL(
      'click',
      (e) => {
        const a = e.target?.closest?.('a[href^="#"]');
        if (!a) return;
        const href = a.getAttribute('href') || '#';

        // '#' or empty means canonical root section ''
        const targetSection = href === '#' || href === '' ? '' : t.sectionFromHash(href);

        // Detect if this link points to a scrollpoint. If so, allow
        // normal anchor behaviour so the fragment remains in the URL
        // (e.preventDefault is not called). The browser will update
        // location.hash to `href` and scroll the page accordingly. We
        // still update the history state to reflect the current section
        // so that back/forward navigation remains sensible.
        if (href && href !== '#' && t.isScrollPoint(href)) {
          // Scrollpoint: allow the browser to handle the hash change
          // naturally (do not preventDefault or trigger a section drive).
          // The subsequent hashchange event will update history state.
          return;
        }

        // For links targeting sections (including root), prevent the
        // default anchor change and drive to the requested section.
        e.preventDefault();
        t.drive(targetSection, 1);
      },
      1
    );

    // Hash cleanup
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // '#' means canonical root; drive Carrd to actual root id (no new history)
      if (l.hash === '#') return t.drive('', 0);

      // If the new hash corresponds to a scrollpoint, update the
      // history state with the current section and leave the fragment
      // intact. Avoid cleaning the URL to '/<hash>' which would
      // incorrectly treat the scrollpoint as a section.
      if (t.isScrollPoint(l.hash)) {
        const currentSection = t.sectionFromPath(l.pathname) || '';
        // Replace state so that the path remains at the current
        // section and the fragment is preserved. We avoid pushing
        // another history entry here to mirror native hashchange
        // behaviour.
        rS({ section: currentSection }, '', `${o}/${currentSection}${l.hash}`);
        return;
      }

      // Otherwise, treat the hash as referring to a section. After the
      // Carrd engine processes the hash and updates the visible
      // section, schedule a cleanup to produce a pretty path. Do not
      // alter the hash until cleanup executes.
      const s = t.sectionFromHash(l.hash);
      setTimeout(() => {
        clean(s);
      }, ms);
    });

    // Back / Forward navigation
    t.aEL('popstate', (e) => {
      if (t._driving) return;
      // Determine the section from the history state or from the
      // current pathname. Driving will update the hash to the correct
      // Carrd internal identifier and then clean the URL after a
      // short delay. Note: popstate events triggered by hash-only
      // navigation (scrollpoints) will still have the same pathname,
      // preserving the scrollpoint fragment. We do not attempt to
      // restore scrollpoint fragments on pop; the user can navigate
      // using the browser's native hash history instead.
      const section =
        typeof e.state?.section === 'string'
          ? e.state.section
          : t.sectionFromPath(l.pathname);
      t.drive(section, 0);
    });
  }
}

export default new HybridRouter();
