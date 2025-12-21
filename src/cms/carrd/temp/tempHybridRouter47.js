class HybridRouter {
  constructor() {
    const w = window;
    this.l = w.location;
    this.h = w.history;
    this.o = this.l.origin;
    this.rS = this.h.replaceState.bind(this.h);
    this.aEL = w.addEventListener.bind(w);

    this.SETTLE_MS = 450;
    this._driving = false;

    const init = () => this.init();
    // Initialize once the DOM is ready. Carrd attaches its scrollpoints after
    // DOMContentLoaded, so waiting here ensures scrollpoint detection works.
    w.document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', init, { once: true })
      : init();
  }

  // Convert Carrd section slugs (e.g. "page--subpage") into path segments (e.g. "page/subpage").
  path = s => String(s || '').replaceAll('--', '/');
  // Convert path segments back into Carrd section slugs.
  unpath = s => String(s || '').replaceAll('/', '--');
  // Extract a section path from a hash string (e.g. "#page--subpage" → "page/subpage").
  sectionFromHash = h => this.path(String(h || '').slice(1));
  // Extract a section path from a pathname (e.g. "/page/subpage" → "page/subpage").
  sectionFromPathname = p =>
    decodeURIComponent(String(p || '').replace(/^\/+/u, ''));
  // Build a hash string for a section path (e.g. "page/subpage" → "#page--subpage").
  hashFor = s => (s ? `#${this.unpath(s)}` : '#');
  // Schedule a callback after a short delay to let Carrd complete its animations.
  settle = fn => setTimeout(fn, this.SETTLE_MS);

  /**
   * Determine whether a given slug corresponds to a Carrd section. Carrd renders each
   * section with an ID of `<slug>-section` where `slug` is the original string from
   * the hash (e.g. "page--subpage-section"). If no such section exists, it is
   * treated as a scrollpoint inside the current section.
   *
   * @param {string} slug - The raw slug string (without the leading '#').
   * @returns {boolean} True if the slug represents a section, false if it is a scrollpoint.
   */
  isSectionSlug(slug) {
    // Empty slug corresponds to the home section.
    if (slug === '') return true;
    return !!document.getElementById(`${slug}-section`);
  }

  /**
   * Build a clean URL for a given section and optional scrollpoint. If a scrollpoint is
   * provided, it is appended as a secondary fragment (e.g. "/page#test").
   *
   * @param {string} section - The section path (e.g. "page/subpage").
   * @param {string} [scroll] - The optional scrollpoint slug (e.g. "test").
   * @returns {string} The resulting clean URL.
   */
  cleanUrl(section, scroll) {
    return `${this.o}/${section || ''}${scroll ? `#${scroll}` : ''}`;
  }

  /**
   * Replace the current history entry with a clean URL representing the given section
   * and optional scrollpoint. The history state stores only the section name.
   *
   * @param {string} section - The section path to record in history state.
   * @param {string} [scroll] - The optional scrollpoint slug.
   */
  cleanTo(section, scroll) {
    this.rS({ section }, '', this.cleanUrl(section, scroll));
  }

  /**
   * Drive Carrd to the given section by updating the hash. When `push` is true,
   * `location.hash` is assigned, creating a new history entry. Otherwise,
   * `location.replace` is used, which does not create a new history entry.
   * After Carrd handles the hash change and animations, the URL is cleaned via
   * `replaceState` to remove the hash and reflect the section path.
   *
   * @param {string} section - The section path (e.g. "page/subpage").
   * @param {boolean} push - Whether to create a new history entry.
   */
  drive(section, push) {
    this._driving = true;
    const target = this.hashFor(section);
    if (push) {
      this.l.hash = target; // creates a new history entry
    } else {
      this.l.replace(target); // does not create a new entry
    }
    this.settle(() => {
      this.cleanTo(section);
      this._driving = false;
    });
  }

  /**
   * Initialize router behavior. Handles direct-entry, click interception,
   * hash change cleanup and back/forward navigation.
   */
  init() {
    // Direct entry to /page/subpage without a hash: treat as a section.
    if ((!this.l.hash || this.l.hash === '#') && this.l.pathname !== '/') {
      this.drive(this.sectionFromPathname(this.l.pathname), false);
    } else {
      // There is a hash on initial load. Determine if it's a section or scrollpoint.
      const rawSlug = this.l.hash.slice(1);
      if (this.isSectionSlug(rawSlug)) {
        // It's a section. Clean the URL after Carrd processes the hash.
        const s = this.sectionFromHash(this.l.hash);
        this.settle(() => this.cleanTo(s));
      } else {
        // It's a scrollpoint. Do not drive Carrd again; just clean current path.
        const section = this.sectionFromPathname(this.l.pathname);
        this.settle(() => this.cleanTo(section, rawSlug));
      }
    }

    // Capture internal links. Only intercept section links and allow scrollpoint links
    // to bubble through to Carrd.
    this.aEL(
      'click',
      e => {
        const a = e.target?.closest?.('a[href^="#"]');
        if (!a) return;
        const slug = a.getAttribute('href').slice(1);
        // If the target is a section, override Carrd's default and drive manually.
        if (this.isSectionSlug(slug)) {
          e.preventDefault();
          this.drive(this.sectionFromHash(`#${slug}`), true);
        }
        // Scrollpoint links fall through without preventDefault, so Carrd handles
        // them normally via its own hashchange listener.
      },
      true
    );

    // Handle all hash changes. If not currently driving, determine whether the new
    // hash represents a section or scrollpoint. For sections, drive and clean.
    // For scrollpoints, preserve the current section and append the scrollpoint to
    // the clean URL.
    this.aEL('hashchange', () => {
      if (this._driving) return;
      const raw = this.l.hash.slice(1);
      if (this.isSectionSlug(raw)) {
        const s = this.sectionFromHash(this.l.hash);
        this.settle(() => this.cleanTo(s));
      } else {
        // Determine current section from history state or path. We do not want to
        // drive to a new section when only the scrollpoint changes.
        const section = this.h.state?.section || this.sectionFromPathname(this.l.pathname);
        this.settle(() => this.cleanTo(section, raw));
      }
    });

    // Back/Forward navigation. Replay navigation without creating a new entry.
    this.aEL('popstate', e => {
      if (this._driving) return;
      const section =
        typeof e.state?.section === 'string'
          ? e.state.section
          : this.sectionFromPathname(this.l.pathname);
      this.drive(section, false);
    });
  }
}

export default new HybridRouter();
