class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.h = h;
    t.rS = h.replaceState.bind(h);
    t.pS = h.pushState.bind(h);
    t.aEL = w.addEventListener.bind(w);

    t.SETTLE_MS = 125;
    t._driving = 0;
    t._rootId = '';
    t._suppressClickUntil = 0;

    (d.readyState === 'loading'
      ? d.addEventListener.bind(d, 'DOMContentLoaded')
      : (f) => f()
    )(() => t.init(), { once: true });
  }

  /* -------------------------------------------------- */
  /* Helpers                                            */
  /* -------------------------------------------------- */

  sectionFromHash(h) {
    return String(h || '').slice(1).replaceAll('--', '/');
  }

  sectionFromPath(p) {
    return decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  }

  detectRootId() {
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return s?.id || 'home';
  }

  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    return this.sectionFromPath(this.l.pathname) || '';
  }

  /* -------------------------------------------------- */
  /* Scrollpoints                                       */
  /* -------------------------------------------------- */

  allScrollPoints() {
    return Array.from(document.querySelectorAll('[data-scroll-id]'));
  }

  getScrollElFromHash(h) {
    const id = String(h || '').replace(/^#/, '');
    return id ? document.querySelector(`[data-scroll-id="${id}"]`) : null;
  }

  scrollIdFromHash(h) {
    return String(h || '').replace(/^#/, '');
  }

  isInvisibleScrollPoint(el) {
    return el?.getAttribute('data-scroll-invisible') === '1';
  }

  prevNextScrollPoints(el) {
    const pts = this.allScrollPoints();
    const i = pts.indexOf(el);
    return {
      prev: i > 0 ? pts[i - 1] : null,
      next: i >= 0 && i < pts.length - 1 ? pts[i + 1] : null,
    };
  }

  scrollPrefs(el) {
    const behavior = (el.getAttribute('data-scroll-behavior') || 'default').toLowerCase();
    let offset = parseFloat(el.getAttribute('data-scroll-offset') || '0');
    let speed = parseFloat(el.getAttribute('data-scroll-speed') || '3');

    offset = Number.isFinite(offset) ? Math.max(-10, Math.min(10, offset)) : 0;
    speed = Number.isFinite(speed) ? Math.max(1, Math.min(5, speed)) : 3;

    return { behavior, offset, speed };
  }

  speedToDurationMs(speed) {
    return [0, 1400, 950, 600, 330, 180][Math.round(speed)] || 600;
  }

  offsetToPixels(offset) {
    return offset * 10;
  }

  computeScrollTargetY(el) {
    const { behavior, offset } = this.scrollPrefs(el);
    const { prev, next } = this.prevNextScrollPoints(el);
    const yNow = window.scrollY;
    const absTop = n => yNow + n.getBoundingClientRect().top;
    const absBottom = n => yNow + n.getBoundingClientRect().bottom;

    let y;
    if (behavior === 'previous' && prev) {
      y = absBottom(prev);
    } else if (behavior === 'center' && next) {
      y = ((absTop(el) + absTop(next)) / 2) - window.innerHeight / 2;
    } else {
      y = absTop(el);
    }

    return Math.max(0, y - this.offsetToPixels(offset));
  }

  scrollToEl(el) {
    if (!el) return;

    const { speed } = this.scrollPrefs(el);
    const dur = this.speedToDurationMs(speed);
    const y0 = window.scrollY;
    const y1 = this.computeScrollTargetY(el);
    const dy = y1 - y0;

    if (Math.abs(dy) < 1) return;

    const ease = t => t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, y0 + dy * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  scrollToSectionTop() {
    window.scrollTo(0, 0);
  }

  /* -------------------------------------------------- */
  /* URL + State                                        */
  /* -------------------------------------------------- */

  writeScrollUrl(section, hash, invisible, push) {
    const scrollId = this.scrollIdFromHash(hash);
    const url = `${this.o}/${section || ''}${invisible ? '' : hash}`;
    const state = { section, scrollId };
    (push ? this.pS : this.rS)(state, '', url);
  }

  shouldPushScroll(section, scrollId) {
    const cs = history.state || {};
    return !(cs.section === section && cs.scrollId === scrollId);
  }

  drive(section, push) {
    const hh = this.hashFor(section);
    this._driving = 1;
    push ? (this.l.hash = hh) : this.l.replace(hh);
    setTimeout(() => {
      this.rS({ section }, '', `${this.o}/${section || ''}`);
      this._driving = 0;
    }, this.SETTLE_MS);
  }

  /* -------------------------------------------------- */
  /* Init                                               */
  /* -------------------------------------------------- */

  init() {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    t._rootId = t.detectRootId();

    /* ---- Scrollpoint interception ---- */
    const intercept = e => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href');
      const el = t.getScrollElFromHash(href);
      if (!el) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      t._suppressClickUntil = Date.now() + 1000;

      const section = t.currentSectionCanonical();
      const scrollId = t.scrollIdFromHash(href);
      const invisible = t.isInvisibleScrollPoint(el);
      const push = t.shouldPushScroll(section, scrollId);

      t.writeScrollUrl(section, href, invisible, push);
      t.scrollToEl(el);
    };

    t.aEL('pointerdown', intercept, true);
    t.aEL('mousedown', intercept, true);

    t.aEL('click', e => {
      if (Date.now() <= t._suppressClickUntil) {
        const a = e.target?.closest?.('a[href^="#"]');
        if (a) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    }, true);

    /* ---- Initial load with fragment ---- */
    const initialEl = t.getScrollElFromHash(l.hash);
    if (initialEl) {
      const section = t.sectionFromPath(l.pathname) || '';
      const invisible = t.isInvisibleScrollPoint(initialEl);

      t.drive(section, false);
      setTimeout(() => {
        t.scrollToEl(initialEl);
        t.writeScrollUrl(section, l.hash, invisible, false);
      }, ms + 30);
      return;
    }

    /* ---- Normal init ---- */
    if (!l.hash && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), false);
    }

    /* ---- Section clicks ---- */
    t.aEL('click', e => {
      if (Date.now() <= t._suppressClickUntil) return;
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href');
      if (!href || href === '#') return;

      e.preventDefault();
      t.drive(t.sectionFromHash(href), true);
    }, true);

    /* ---- hashchange (Carrd normalization) ---- */
    t.aEL('hashchange', () => {
      if (t._driving) return;
      const el = t.getScrollElFromHash(l.hash);
      if (el) {
        const section = t.currentSectionCanonical();
        const invisible = t.isInvisibleScrollPoint(el);
        t.writeScrollUrl(section, l.hash, invisible, false);
        t.scrollToEl(el);
      }
    });

    /* -------------------------------------------------- */
    /* Back / Forward (FINAL FIX)                          */
    /* -------------------------------------------------- */

    t.aEL('popstate', e => {
      if (t._driving) return;

      const section =
        typeof e.state?.section === 'string'
          ? e.state.section
          : t.sectionFromPath(l.pathname);

      const scrollId = typeof e.state?.scrollId === 'string' ? e.state.scrollId : '';
      const hash = scrollId ? `#${scrollId}` : '';

      // Base section → restore top
      if (!scrollId) {
        t.drive(section, false);
        setTimeout(() => {
          t.scrollToSectionTop();
          t.rS({ section, scrollId: '' }, '', `${t.o}/${section || ''}`);
        }, ms + 30);
        return;
      }

      // Fragment restore → force section activation FIRST
      const sectionHash = t.hashFor(section);
      if (l.hash !== sectionHash) {
        t._driving = 1;
        l.replace(sectionHash);
      }

      setTimeout(() => {
        const el = t.getScrollElFromHash(hash);
        if (el) {
          t.scrollToEl(el);
          const invisible = t.isInvisibleScrollPoint(el);
          t.writeScrollUrl(section, hash, invisible, false);
        } else {
          t.scrollToSectionTop();
          t.rS({ section, scrollId: '' }, '', `${t.o}/${section || ''}`);
        }
        t._driving = 0;
      }, ms + 30);
    });
  }
}

export default new HybridRouter();
