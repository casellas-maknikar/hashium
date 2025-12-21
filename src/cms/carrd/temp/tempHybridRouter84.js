class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.h = h;

    // originals
    t._origReplaceState = h.replaceState.bind(h);
    t._origPushState = h.pushState.bind(h);

    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    t._rootId = '';
    t.DEBUG = 0;
    t.log = (...args) => { if (t.DEBUG) console.log('[HybridRouter]', ...args); };

    // scrollpoint helpers
    t.SP_PARAM = 'sp';
    t._spIntent = '';      // 'test'
    t._spSection = '';     // 'page'
    t._spCleanupTimer = 0;

    (d.readyState === 'loading'
      ? d.addEventListener.bind(d, 'DOMContentLoaded')
      : (f) => f()
    )(() => t.init(), { once: 1 });
  }

  // --- section helpers (your existing mapping) ---
  sectionFromHash(h) { return String(h || '').slice(1).replaceAll('--', '/'); }
  sectionFromPath(p) { return decodeURIComponent(String(p || '').replace(/^\/+/, '')); }

  detectRootId() {
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return (s && s.id) ? s.id : 'home';
  }

  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  // --- scrollpoint detection (Carrd) ---
  isScrollPointId(id) {
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  isScrollPointHash(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;
    const id = raw.startsWith('#') ? raw.slice(1) : raw;
    return this.isScrollPointId(id);
  }

  // --- query helpers ---
  getSpFromUrl() {
    const u = new URL(this.l.href);
    const v = u.searchParams.get(this.SP_PARAM);
    return v ? String(v) : '';
  }

  setSpOnUrl(section, spId, push) {
    const u = new URL(this.o + '/' + (section || ''));
    if (spId) u.searchParams.set(this.SP_PARAM, spId);
    const url = u.toString();

    const state = { section, sp: spId || '' };
    (push ? this._origPushState : this._origReplaceState)(state, '', url);
    this.log('setSpOnUrl', { section, spId, push, url });
  }

  clearHashKeepQuery(section) {
    // Keep /page?sp=test but remove #test (Carrd might keep fighting hashes)
    const u = new URL(this.l.href);
    u.hash = '';
    // Ensure path matches canonical section
    u.pathname = '/' + (section || '');
    this._origReplaceState({ section, sp: this.getSpFromUrl() }, '', u.toString());
    this.log('clearHashKeepQuery', u.toString());
  }

  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    return this.sectionFromPath(this.l.pathname) || '';
  }

  // --- Carrd section drive (your approach) ---
  drive(section, push) {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    t._driving = 1;

    const hh = t.hashFor(section);
    push ? (l.hash = hh) : l.replace(hh);

    setTimeout(() => {
      // IMPORTANT: keep query string if present (e.g., ?sp=test)
      const u = new URL(t.o + '/' + (section || ''));
      const sp = t.getSpFromUrl();
      if (sp) u.searchParams.set(t.SP_PARAM, sp);

      t._origReplaceState({ section, sp }, '', u.toString());
      t._driving = 0;
    }, ms);
  }

  // --- Scrollpoint execution (let Carrd do it) ---
  triggerCarrdScrollpoint(spId) {
    if (!spId) return;
    if (!this.isScrollPointId(spId)) return;

    // Setting hash triggers Carrd's own scroll logic + animation
    this.l.hash = `#${spId}`;
    this.log('triggerCarrdScrollpoint ->', `#${spId}`);
  }

  // After scrollpoint scroll starts, we keep URL as ?sp=test and remove the hash after it settles.
  scheduleHashCleanup(section) {
    if (this._spCleanupTimer) clearTimeout(this._spCleanupTimer);

    // Give Carrd time to read hash and initiate scroll animation.
    // Then remove the hash (URL stays shareable via ?sp=).
    this._spCleanupTimer = setTimeout(() => {
      this.clearHashKeepQuery(section);
      this._spCleanupTimer = 0;
    }, 650);
  }

  init() {
    const t = this, l = t.l, o = t.o, ms = t.SETTLE_MS;

    t._rootId = t.detectRootId();

    const settleClean = (section) => setTimeout(() => {
      // preserve current ?sp=
      const u = new URL(o + '/' + (section || ''));
      const sp = t.getSpFromUrl();
      if (sp) u.searchParams.set(t.SP_PARAM, sp);
      t._origReplaceState({ section, sp }, '', u.toString());
    }, ms);

    // 1) Initial entry: if URL has ?sp=test, we should scroll to it after Carrd section is active.
    const initialSp = t.getSpFromUrl();

    // 2) Initial section handling (your original)
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // After initial settle, if sp exists, trigger it via Carrd hash.
    if (initialSp) {
      setTimeout(() => {
        const section = t.currentSectionCanonical();
        t.triggerCarrdScrollpoint(initialSp);
        t.scheduleHashCleanup(section);
      }, ms + 50);
    }

    // Click handler
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href') || '#';
      if (!href || href === '#') return;

      const id = href.startsWith('#') ? href.slice(1) : href;

      // If it's a scrollpoint, DO NOT preventDefault; let Carrd do its scroll.
      // But we ALSO set ?sp= in the canonical URL so the deep link persists.
      if (t.isScrollPointId(id)) {
        const section = t.currentSectionCanonical();
        t.setSpOnUrl(section, id, true);     // URL becomes /page?sp=test
        // Let Carrd handle scroll via its own logic (click + hashchange)
        // In case Carrd rewrites hash weirdly, ensure it gets #id:
        setTimeout(() => t.triggerCarrdScrollpoint(id), 0);
        t.scheduleHashCleanup(section);
        return;
      }

      // Otherwise treat as section navigation (your router)
      e.preventDefault();
      const s = t.sectionFromHash(href);
      // Clear any sp when switching sections (optional; change if you want to carry it)
      t.setSpOnUrl(s, '', false);
      t.drive(s, 1);
    }, 1);

    // hashchange handler
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // If hash is a scrollpoint, convert it to ?sp= and clean hash after it starts scrolling.
      if (t.isScrollPointHash(l.hash)) {
        const spId = l.hash.slice(1);
        const section = t.currentSectionCanonical();

        // Ensure canonical URL has ?sp= (replace, not push)
        t.setSpOnUrl(section, spId, false);

        // Let Carrd scroll (it already is, because hashchange fired)
        t.scheduleHashCleanup(section);
        return;
      }

      // Root hash handling
      if (l.hash === '#') return t.drive('', 0);

      // Section hash -> clean URL (preserving any sp)
      settleClean(t.sectionFromHash(l.hash));
    });

    // Back/forward
    t.aEL('popstate', (e) => {
      if (t._driving) return;

      const section =
        typeof e.state?.section === 'string'
          ? e.state.section
          : t.sectionFromPath(l.pathname);

      // If the URL has ?sp=, trigger scrollpoint after ensuring Carrd is on section
      const sp = t.getSpFromUrl();

      t.drive(section, 0);

      if (sp) {
        setTimeout(() => {
          t.triggerCarrdScrollpoint(sp);
          t.scheduleHashCleanup(section);
        }, ms + 50);
      }
    });
  }
}

window.hybridRouter = new HybridRouter();
export default window.hybridRouter;
