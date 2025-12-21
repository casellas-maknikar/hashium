class HybridRouter {
  constructor() {
    const w = window, l = w.location, h = w.history;
    this.l = l;
    this.o = l.origin;
    this.rS = h.replaceState.bind(h);
    this.aEL = w.addEventListener.bind(w);

    this.SETTLE_MS = 450;
    this._driving = false;

    const i = () => this.init();
    w.document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', i, { once: true })
      : i();
  }

  sectionFromHash(h) {
    return String(h || '').slice(1).replaceAll('--', '/');
  }
  sectionFromPath(p) {
    return decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  }

  drive(section, push) {
    this._driving = true;

    const t = section ? `#${section.replaceAll('/', '--')}` : '#';
    push ? (this.l.hash = t) : this.l.replace(t);

    setTimeout(() => {
      this.rS({ section }, '', `${this.o}/${section || ''}`);
      this._driving = false;
    }, this.SETTLE_MS);
  }

  init() {
    const l = this.l;
    const settleClean = (section) =>
      setTimeout(() => this.rS({ section }, '', `${this.o}/${section || ''}`), this.SETTLE_MS);

    // Initial entry
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      this.drive(this.sectionFromPath(l.pathname), 0);
    } else {
      settleClean(this.sectionFromHash(l.hash));
    }

    // Click
    this.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      this.drive(this.sectionFromHash(a.getAttribute('href')), 1);
    }, 1);

    // Hash cleanup
    this.aEL('hashchange', () => {
      if (this._driving) return;
      settleClean(this.sectionFromHash(l.hash));
    });

    // Back / Forward
    this.aEL('popstate', (e) => {
      if (this._driving) return;
      this.drive(
        typeof e.state?.section === 'string'
          ? e.state.section
          : this.sectionFromPath(l.pathname),
        0
      );
    });
  }
}

export default new HybridRouter();
