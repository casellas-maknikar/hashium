class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.rS = h.replaceState.bind(h);
    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    // detected root section id (first Carrd section)
    t._rootId = '';

    // suppress follow-up click after pointerdown/mousedown interception
    t._suppressClickUntil = 0;

    (d.readyState === 'loading'
      ? d.addEventListener.bind(d, 'DOMContentLoaded')
      : (f) => f()
    )(() => t.init(), { once: 1 });
  }

  sectionFromHash(h) { return String(h || '').slice(1).replaceAll('--', '/'); }
  sectionFromPath(p) { return decodeURIComponent(String(p || '').replace(/^\/+/, '')); }

  detectRootId() {
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return (s && s.id) ? s.id : 'home';
  }

  // Canonical root is '' (clean URL "/"), but Carrd needs a real id to switch sections.
  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  // Best-effort current canonical section: use history.state if present, else pathname
  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    return this.sectionFromPath(this.l.pathname) || '';
  }

  // ---- Scrollpoint helpers ----

  allScrollPoints() {
    return Array.from(document.querySelectorAll('[data-scroll-id]'));
  }

  getScrollElFromHash(hashOrId) {
    const raw = String(hashOrId || '');
    if (!raw || raw === '#') return null;
    const id = raw.startsWith('#') ? raw.slice(1) : raw;
    return document.querySelector(`[data-scroll-id="${id}"]`);
  }

  isScrollPointHash(hashOrId) {
    return !!this.getScrollElFromHash(hashOrId);
  }

  prevNextScrollPoints(el) {
    const points = this.allScrollPoints();
    const i = points.indexOf(el);
    return {
      prev: (i > 0) ? points[i - 1] : null,
      next: (i >= 0 && i < points.length - 1) ? points[i + 1] : null,
    };
  }

  isInvisibleScrollPoint(el) {
    // Your confirmed example uses data-scroll-invisible="1"
    return String(el?.getAttribute('data-scroll-invisible') || '') === '1';
  }

  scrollPrefs(el) {
    const behavior = (el.getAttribute('data-scroll-behavior') || 'default').toLowerCase();

    let offset = parseFloat(el.getAttribute('data-scroll-offset') || '0');
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(-10, Math.min(10, offset));

    let speed = parseFloat(el.getAttribute('data-scroll-speed') || '3');
    if (!Number.isFinite(speed)) speed = 3;
    speed = Math.max(1, Math.min(5, speed));

    return { behavior, offset, speed };
  }

  // speed: 1 very slow -> 5 very fast (duration decreases as speed increases)
  speedToDurationMs(speed) {
    // Tune if you want it even closer to Carrd feel
    // 1: 1400ms, 2: 950ms, 3: 600ms, 4: 330ms, 5: 180ms
    return [0, 1400, 950, 600, 330, 180][Math.round(speed)] || 600;
  }

  // offset: -10..10 (0 default). Interpreting as small pixel steps.
  // If you ever confirm Carrd uses a different unit, change OFFSET_STEP_PX.
  offsetToPixels(offset) {
    const OFFSET_STEP_PX = 10; // 1 unit = 10px => max 100px shift
    return offset * OFFSET_STEP_PX;
  }

  // Compute Y target based on YOUR rule set
  computeScrollTargetY(el) {
    const { behavior, offset } = this.scrollPrefs(el);
    const { prev, next } = this.prevNextScrollPoints(el);
    const offsetPx = this.offsetToPixels(offset);

    const yNow = window.scrollY;
    const absTop = (node) => yNow + node.getBoundingClientRect().top;
    const absBottom = (node) => yNow + node.getBoundingClientRect().bottom;

    let yTarget;

    if (behavior === 'previous') {
      // align to bottom edge of previous scrollpoint element
      if (prev) yTarget = absBottom(prev);
      else yTarget = absTop(el); // fallback to default
    } else if (behavior === 'center') {
      // center between this scrollpoint and the next one
      if (next) {
        const a = absTop(el);
        const b = absTop(next);
        const mid = (a + b) / 2;
        yTarget = mid - (window.innerHeight / 2);
      } else {
        yTarget = absTop(el); // fallback to default
      }
    } else {
      // default: scroll to the scrollpoint element itself
      yTarget = absTop(el);
    }

    yTarget = Math.max(0, yTarget - offsetPx);
    return yTarget;
  }

  // Animated scroll using Carrd-ish prefs
  scrollToEl(el) {
    if (!el) return;

    const { speed } = this.scrollPrefs(el);
    const duration = this.speedToDurationMs(speed);

    const yStart = window.scrollY;
    const yTarget = this.computeScrollTargetY(el);
    const dy = yTarget - yStart;

    if (Math.abs(dy) < 1) return;

    const ease = (t) => (t < 0.5)
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const run = () => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        window.scrollTo(0, yStart + dy * ease(t));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    // Layout-safe timing
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  // ---- Router core ----

  drive(section, push) {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    t._driving = 1;

    const hh = t.hashFor(section);
    push ? (l.hash = hh) : l.replace(hh);

    setTimeout(() => {
      t.rS({ section }, '', `${t.o}/${section || ''}`);
      t._driving = 0;
    }, ms);
  }

  init() {
    const t = this, l = t.l, o = t.o, rS = t.rS, ms = t.SETTLE_MS;

    t._rootId = t.detectRootId();

    const clean = (section) => rS({ section }, '', `${o}/${section || ''}`);
    const settleClean = (section) => setTimeout(() => clean(section), ms);

    // -----------------------------
    // Scrollpoint interception (preempt Carrd)
    // -----------------------------
    const interceptScrollpoint = (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href') || '#';
      if (!href || href === '#') return;

      const el = t.getScrollElFromHash(href);
      if (!el) return; // not a scrollpoint

      e.preventDefault();
      e.stopImmediatePropagation();

      t._suppressClickUntil = Date.now() + 1000;

      const section = t.currentSectionCanonical();
      const invisible = t.isInvisibleScrollPoint(el);

      // Mask URL as /page[#id] WITHOUT touching location.hash
      rS({ section }, '', `${o}/${section || ''}${invisible ? '' : href}`);

      // Scroll using Carrd scrollpoint prefs
      t.scrollToEl(el);
    };

    t.aEL('pointerdown', interceptScrollpoint, true);
    t.aEL('mousedown', interceptScrollpoint, true);

    // suppress the click if we intercepted pointerdown/mousedown
    t.aEL('click', (e) => {
      if (Date.now() <= t._suppressClickUntil) {
        const a = e.target?.closest?.('a[href^="#"]');
        if (a) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    }, true);

    // -----------------------------
    // Initial entry: handle /page#test if test is a scrollpoint
    // -----------------------------
    const initialEl = t.getScrollElFromHash(l.hash);
    if (initialEl) {
      const section = t.sectionFromPath(l.pathname) || '';

      // Drive to section so it's visible
      t.drive(section, 0);

      setTimeout(() => {
        t.scrollToEl(initialEl);

        const invisible = t.isInvisibleScrollPoint(initialEl);
        rS({ section }, '', `${o}/${section || ''}${invisible ? '' : l.hash}`);
      }, ms + 30);

      return;
    }

    // Original init behavior
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // -----------------------------
    // Normal section click routing (original)
    // -----------------------------
    t.aEL('click', (e) => {
      if (Date.now() <= t._suppressClickUntil) return;

      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      e.preventDefault();

      const href = a.getAttribute('href') || '#';
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // -----------------------------
    // Hash cleanup (original; ignore scrollpoints)
    // -----------------------------
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // If hash becomes a scrollpoint, treat as secondary fragment
      const el = t.getScrollElFromHash(l.hash);
      if (el) {
        const section = t.currentSectionCanonical();
        const invisible = t.isInvisibleScrollPoint(el);
        rS({ section }, '', `${o}/${section || ''}${invisible ? '' : l.hash}`);
        t.scrollToEl(el);
        return;
      }

      if (l.hash === '#') return t.drive('', 0);
      settleClean(t.sectionFromHash(l.hash));
    });

    // -----------------------------
    // Back / Forward (original)
    // -----------------------------
    t.aEL('popstate', (e) => {
      if (t._driving) return;
      t.drive(
        typeof e.state?.section === 'string' ? e.state.section : t.sectionFromPath(l.pathname),
        0
      );
    });
  }
}

export default new HybridRouter();
