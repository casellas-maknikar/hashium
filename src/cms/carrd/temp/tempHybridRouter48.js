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

    // Set of all section slugs (e.g. 'page', 'page--subpage'). Filled during init.
    this.sections = new Set();
    // Track the current section slug so scrollpoints can be resolved correctly.
    this.currentSection = null;

    const init = () => this.init();
    // Wait for DOMContentLoaded to ensure sections are present.
    w.document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', init, { once: true })
      : init();
  }

  // Convert Carrd section slugs to path (e.g. 'page--subpage' → 'page/subpage').
  path = s => String(s || '').replaceAll('--', '/');
  // Convert path to slug (e.g. 'page/subpage' → 'page--subpage').
  unpath = s => String(s || '').replaceAll('/', '--');
  // Extract section path from hash (without '#').
  sectionFromHash = h => this.path(String(h || '').slice(1));
  // Extract section path from pathname (strip leading '/').
  sectionFromPathname = p =>
    decodeURIComponent(String(p || '').replace(/^\/+/u, ''));
  // Build hash for a section path.
  hashFor = s => (s ? `#${this.unpath(s)}` : '#');
  // Defer callback until after Carrd animations.
  settle = fn => setTimeout(fn, this.SETTLE_MS);

  /**
   * Initialize the router once the DOM is ready. Collect sections, perform initial
   * routing, and wire up event listeners.
   */
  init() {
    // Collect section slugs from the DOM. Carrd creates sections with ids
    // `<slug>-section`. We remove the suffix to obtain the slug.
    document.querySelectorAll('section[id$="-section"]').forEach(sec => {
      const id = sec.id;
      if (id.endsWith('-section')) {
        const slug = id.slice(0, -'-section'.length);
        this.sections.add(slug);
      }
    });

    // Helper to update current section state and clean URL.
    const clean = (section, scroll) => {
      // Record the current section.
      this.currentSection = section;
      this.cleanTo(section, scroll);
    };

    // Handle direct entry or hash on initial load.
    if ((!this.l.hash || this.l.hash === '#') && this.l.pathname !== '/') {
      // Direct entry to /page/subpage
      const s = this.sectionFromPathname(this.l.pathname);
      this.drive(s, false);
    } else if (this.l.hash && this.l.hash !== '#') {
      const raw = this.l.hash.slice(1);
      if (this.isSectionSlug(raw)) {
        // Section hash
        const s = this.sectionFromHash(this.l.hash);
        this.settle(() => clean(s));
      } else {
        // Scrollpoint
        const section = this.sectionFromPathname(this.l.pathname);
        this.settle(() => clean(section, raw));
      }
    } else {
      // Root with no hash.
      this.currentSection = '';
    }

    // Intercept clicks on internal links. Only handle section links here.
    this.aEL(
      'click',
      e => {
        const a = e.target?.closest?.('a[href^="#"]');
        if (!a) return;
        const slug = a.getAttribute('href').slice(1);
        if (this.isSectionSlug(slug)) {
          e.preventDefault();
          const s = this.sectionFromHash(`#${slug}`);
          this.drive(s, true);
        }
        // Scrollpoints fall through.
      },
      true
    );

    // Handle hash changes. Distinguish sections vs scrollpoints.
    this.aEL('hashchange', () => {
      if (this._driving) return;
      const raw = this.l.hash.slice(1);
      if (this.isSectionSlug(raw)) {
        const s = this.sectionFromHash(this.l.hash);
        this.settle(() => clean(s));
      } else {
        // Append scrollpoint to current section.
        const section = this.currentSection ?? this.sectionFromPathname(this.l.pathname);
        this.settle(() => clean(section, raw));
      }
    });

    // Back/forward navigation. Restore section without new entry.
    this.aEL('popstate', e => {
      if (this._driving) return;
      const s =
        typeof e.state?.section === 'string'
          ? e.state.section
          : this.sectionFromPathname(this.l.pathname);
      this.drive(s, false);
    });
  }

  /**
   * Determine whether a slug corresponds to a known section. Slugs that are not
   * in the section set are treated as scrollpoints.
   * @param {string} slug
   * @returns {boolean}
   */
  isSectionSlug(slug) {
    // Empty slug maps to home (section '')
    if (slug === '') return true;
    return this.sections.has(slug);
  }

  /**
   * Build a clean URL for a given section and optional scrollpoint.
   * @param {string} section
   * @param {string} [scroll]
   */
  cleanUrl(section, scroll) {
    return `${this.o}/${section || ''}${scroll ? `#${scroll}` : ''}`;
  }

  /**
   * Replace the current history entry with a clean URL. Records the section in
   * history state but not scrollpoint.
   * @param {string} section
   * @param {string} [scroll]
   */
  cleanTo(section, scroll) {
    this.rS({ section }, '', this.cleanUrl(section, scroll));
  }

  /**
   * Drive to a section. After Carrd handles the hash navigation, clean the URL.
   * @param {string} section
   * @param {boolean} push
   */
  drive(section, push) {
    this._driving = true;
    const target = this.hashFor(section);
    if (push) {
      this.l.hash = target;
    } else {
      this.l.replace(target);
    }
    this.settle(() => {
      // Update current section and clean.
      this.currentSection = section;
      this.cleanTo(section);
      this._driving = false;
    });
  }
}

export default new HybridRouter();
