class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l; t.o = l.origin; t.h = h;
    t.rS = h.replaceState.bind(h);
    t.pS = h.pushState.bind(h);
    t.aEL = w.addEventListener.bind(w);

    t.SETTLE_MS = 125;
    t._driving = 0;
    t._rootId = '';
    t._suppressClickUntil = 0;
    t._lastSectionHashCleaned = '';
    t._lastSectionHashCleanedAt = 0;

    const onReady = (d.readyState === 'loading')
      ? (fn) => d.addEventListener('DOMContentLoaded', fn, { once: 1 })
      : (fn) => fn();
    onReady(() => t.init());
  }

  sectionFromHash(h) { return String(h || '').slice(1).replaceAll('--', '/'); }
  sectionFromPath(p) { return decodeURIComponent(String(p || '').replace(/^\/+/, '')); }

  detectRootId() {
    const s = document.querySelector('#main section[id]') || document.querySelector('main section[id]') || document.querySelector('section[id]');
    return (s && s.id) ? s.id : 'home';
  }

  hashFor(section) { return !section ? `#${this._rootId}` : `#${section.replaceAll('/', '--')}`; }

  currentSectionCanonical() {
    const s = history.state?.section;
    return (typeof s === 'string') ? s : (this.sectionFromPath(this.l.pathname) || '');
  }

  allScrollPoints() { return Array.from(document.querySelectorAll('[data-scroll-id]')); }

  getScrollElFromHash(hashOrId) {
    const raw = String(hashOrId || '');
    if (!raw || raw === '#') return null;
    const id = raw.startsWith('#') ? raw.slice(1) : raw;
    return document.querySelector(`[data-scroll-id="${id}"]`);
  }

  scrollIdFromHash(hashOrId) {
    const raw = String(hashOrId || '');
    if (!raw || raw === '#') return '';
    return raw.startsWith('#') ? raw.slice(1) : raw;
  }

  prevNextScrollPoints(el) {
    const points = this.allScrollPoints(), i = points.indexOf(el);
    return { prev: (i > 0) ? points[i - 1] : null, next: (i >= 0 && i < points.length - 1) ? points[i + 1] : null };
  }

  isInvisibleScrollPoint(el) { return String(el?.getAttribute('data-scroll-invisible') || '') === '1'; }

  scrollPrefs(el) {
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const num = (s, d) => { const n = parseFloat(s); return Number.isFinite(n) ? n : d; };
    return {
      behavior: (el.getAttribute('data-scroll-behavior') || 'default').toLowerCase(),
      offset: clamp(num(el.getAttribute('data-scroll-offset'), 0), -10, 10),
      speed: clamp(num(el.getAttribute('data-scroll-speed'), 3), 1, 5),
    };
  }

  speedToDurationMs(speed) { return [0, 1400, 950, 600, 330, 180][Math.round(speed)] || 600; }
  offsetToPixels(offset) { return offset * 10; }

  computeScrollTargetY(el) {
    const { behavior, offset } = this.scrollPrefs(el);
    const { prev, next } = this.prevNextScrollPoints(el);
    const yNow = window.scrollY;
    const absTop = (n) => yNow + n.getBoundingClientRect().top;
    const absBottom = (n) => yNow + n.getBoundingClientRect().bottom;
    let yTarget;
    if (behavior === 'previous') yTarget = prev ? absBottom(prev) : absTop(el);
    else if (behavior === 'center') {
      if (next) {
        const a = absTop(el), b = absTop(next);
        yTarget = ((a + b) / 2) - (window.innerHeight / 2);
      } else yTarget = absTop(el);
    } else yTarget = absTop(el);
    return Math.max(0, yTarget - this.offsetToPixels(offset));
  }

  scrollToEl(el) {
    if (!el) return;
    const { speed } = this.scrollPrefs(el);
    const duration = this.speedToDurationMs(speed);
    const yStart = window.scrollY;
    const yTarget = this.computeScrollTargetY(el);
    const dy = yTarget - yStart;
    if (Math.abs(dy) < 1) return;

    const ease = (t) => (t < 0.5) ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const run = () => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        window.scrollTo(0, yStart + dy * ease(t));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  scrollToSectionTop() { window.scrollTo(0, 0); }

  writeScrollUrl(section, hash, invisible, push) {
    const scrollId = this.scrollIdFromHash(hash);
    const url = `${this.o}/${section || ''}${invisible ? '' : hash}`;
    (push ? this.pS : this.rS)({ section, scrollId }, '', url);
  }

  shouldPushScroll(section, scrollId) {
    const cs = history.state || {};
    const curSection = (typeof cs.section === 'string') ? cs.section : (this.sectionFromPath(this.l.pathname) || '');
    const curScrollId = (typeof cs.scrollId === 'string') ? cs.scrollId : '';
    return !(curSection === section && curScrollId === scrollId);
  }

  shouldPushSection(section) {
    const cs = history.state || {};
    const curSection = (typeof cs.section === 'string') ? cs.section : (this.sectionFromPath(this.l.pathname) || '');
    const curScrollId = (typeof cs.scrollId === 'string') ? cs.scrollId : '';
    return !(curSection === section && curScrollId === '');
  }

  drive(section, push) {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    if (push && !t.shouldPushSection(section || '')) push = 0;
    t._driving = 1;
    const hh = t.hashFor(section);
    push ? (l.hash = hh) : l.replace(hh);
    setTimeout(() => { t.rS({ section }, '', `${t.o}/${section || ''}`); t._driving = 0; }, ms);
  }

  init() {
    const t = this, l = t.l, o = t.o, ms = t.SETTLE_MS;
    t._rootId = t.detectRootId();

    const settle = (fn, extra = 0) => setTimeout(fn, ms + extra);
    const cleanUrl = (section) => t.rS({ section }, '', `${o}/${section || ''}`);

    const interceptScrollpoint = (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href') || '#';
      if (!href || href === '#') return;
      const el = t.getScrollElFromHash(href);
      if (!el) return;

      e.preventDefault(); e.stopImmediatePropagation();
      t._suppressClickUntil = Date.now() + 1000;

      const section = t.currentSectionCanonical();
      const scrollId = t.scrollIdFromHash(href);
      const invisible = t.isInvisibleScrollPoint(el);
      const push = t.shouldPushScroll(section, scrollId);

      t.writeScrollUrl(section, href, invisible, push);
      t.scrollToEl(el);
    };

    t.aEL('pointerdown', interceptScrollpoint, true);
    t.aEL('mousedown', interceptScrollpoint, true);

    t.aEL('click', (e) => {
      if (Date.now() > t._suppressClickUntil) return;
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);

    const initialEl = t.getScrollElFromHash(l.hash);
    if (initialEl) {
      const section = t.sectionFromPath(l.pathname) || '';
      const invisible = t.isInvisibleScrollPoint(initialEl);
      t.drive(section, 0);
      settle(() => { t.scrollToEl(initialEl); t.writeScrollUrl(section, l.hash, invisible, false); }, 30);
      return;
    }

    if ((!l.hash || l.hash === '#') && l.pathname !== '/') t.drive(t.sectionFromPath(l.pathname), 0);
    else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      setTimeout(() => cleanUrl(s), ms);
      if (l.hash === '#') t.drive('', 0);
    }

    t.aEL('click', (e) => {
      if (Date.now() <= t._suppressClickUntil) return;
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href') || '#';
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, t.shouldPushSection(s) ? 1 : 0);
    }, 1);

    t.aEL('hashchange', () => {
      if (t._driving) return;

      const el = t.getScrollElFromHash(l.hash);
      if (el) {
        const section = t.currentSectionCanonical();
        t.writeScrollUrl(section, l.hash, t.isInvisibleScrollPoint(el), false);
        t.scrollToEl(el);
        return;
      }

      if (!l.hash || l.hash === '#') return;

      const now = Date.now();
      if (t._lastSectionHashCleaned === l.hash && (now - t._lastSectionHashCleanedAt) < (t.SETTLE_MS + 100)) return;
      t._lastSectionHashCleaned = l.hash; t._lastSectionHashCleanedAt = now;

      const targetSection = t.sectionFromHash(l.hash);
      setTimeout(() => cleanUrl(targetSection), ms);
    });

    t.aEL('popstate', (e) => {
      if (t._driving) return;

      const section = (typeof e.state?.section === 'string') ? e.state.section : t.sectionFromPath(l.pathname);
      const scrollId = (typeof e.state?.scrollId === 'string') ? e.state.scrollId : '';
      const hash = scrollId ? `#${scrollId}` : '';

      if (!scrollId) {
        t.drive(section, 0);
        settle(() => { t.scrollToSectionTop(); t.rS({ section, scrollId: '' }, '', `${t.o}/${section || ''}`); }, 30);
        return;
      }

      const sectionHash = t.hashFor(section);
      if (l.hash !== sectionHash) { t._driving = 1; l.replace(sectionHash); }

      settle(() => {
        const el = t.getScrollElFromHash(hash);
        if (el) {
          t.scrollToEl(el);
          t.writeScrollUrl(section, hash, t.isInvisibleScrollPoint(el), false);
        } else {
          t.scrollToSectionTop();
          t.rS({ section, scrollId: '' }, '', `${t.o}/${section || ''}`);
        }
        t._driving = 0;
      }, 30);
    });
  }
}

export default new HybridRouter();
