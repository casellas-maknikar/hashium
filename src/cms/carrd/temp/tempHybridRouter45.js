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
    this._scroll = null;

    const init = () => this.init();
    w.document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', init, { once: true })
      : init();
  }

  path = s => String(s || '').replaceAll('--', '/');
  unpath = s => String(s || '').replaceAll('/', '--');

  sectionFromHash(h) {
    const v = String(h || '').slice(1);
    return v.includes('--') || v === '' ? this.path(v) : null;
  }

  sectionFromPathname = p =>
    decodeURIComponent(String(p || '').replace(/^\/+/, ''));

  hashFor = s => (s ? `#${this.unpath(s)}` : '#');

  cleanUrl(section, scroll) {
    return `${this.o}/${section || ''}${scroll ? `#${scroll}` : ''}`;
  }

  settle = fn => setTimeout(fn, this.SETTLE_MS);

  cleanTo(section) {
    this.rS(
      { section },
      '',
      this.cleanUrl(section, this._scroll)
    );
  }

  drive(section, push) {
    this._driving = true;
    this._scroll = null;

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
      if (s !== null) this.settle(() => this.cleanTo(s));
    }

    // Click interception
    this.aEL(
      'click',
      e => {
        const a = e.target?.closest?.('a[href^="#"]');
        if (!a) return;

        const h = a.getAttribute('href').slice(1);
        const s = this.sectionFromHash('#' + h);

        if (s !== null) {
          e.preventDefault();
          this.drive(s, true);
        }
      },
      true
    );

    // Hash change
    this.aEL('hashchange', () => {
      if (this._driving) return;

      const raw = this.l.hash.slice(1);
      const s = this.sectionFromHash('#' + raw);

      if (s !== null) {
        this._scroll = null;
        this.settle(() => this.cleanTo(s));
      } else {
        // secondary fragment (scrollpoint)
        this._scroll = raw;
        this.settle(() => {
          this.rS(
            history.state,
            '',
            this.cleanUrl(
              history.state?.section || this.sectionFromPathname(this.l.pathname),
              this._scroll
            )
          );
        });
      }
    });

    // Back / Forward
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
