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
    w.document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', init, { once: true })
      : init();
  }

  path = s => String(s || '').replaceAll('--', '/');
  unpath = s => String(s || '').replaceAll('/', '--');
  sectionFromHash = h => this.path(String(h || '').slice(1));
  sectionFromPathname = p => decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  hashFor = s => (s ? `#${this.unpath(s)}` : '#');
  cleanUrl = s => `${this.o}/${s || ''}`;
  settle = fn => setTimeout(fn, this.SETTLE_MS);

  cleanTo(section) {
    this.rS({ section }, '', this.cleanUrl(section));
  }

  drive(section, push) {
    this._driving = true;
    const target = this.hashFor(section);

    push ? (this.l.hash = target) : this.l.replace(target);

    this.settle(() => {
      this.cleanTo(section);
      this._driving = false;
    });
  }

  init() {
    // Initial load
    if ((!this.l.hash || this.l.hash === '#') && this.l.pathname !== '/') {
      this.drive(this.sectionFromPathname(this.l.pathname), false);
    } else {
      const s = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(s));
    }

    // Click interception
    this.aEL(
      'click',
      e => {
        const a = e.target?.closest?.('a[href^="#"]');
        if (!a) return;
        e.preventDefault();
        this.drive(this.sectionFromHash(a.getAttribute('href')), true);
      },
      true
    );

    // Hash change cleanup
    this.aEL('hashchange', () => {
      if (this._driving) return;
      const s = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(s));
    });

    // Back / Forward
    this.aEL('popstate', e => {
      if (this._driving) return;
      const s =
        typeof e.state?.section === 'string'
          ? e.state.section
          : this.sectionFromPathname(this.l.pathname);
      this.drive(s, false);
    });
  }
}

export default new HybridRouter();
