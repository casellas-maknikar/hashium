class CarrdRouter {
  constructor() {
    const {
      location,
      history,
      addEventListener
    } = window;
    this.l = location;
    this.o = location.origin;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.init();
  }
  path(str) {
    return str.replaceAll('---', '/');
  }
  route() {
    const section = this.path(this.l.hash.slice(1));
    this.rS({
      section
    }, '', `${this.o}/${section}`);
  }
  init() {
    this.aEL('load', () => this.route());
    this.aEL('hashchange', () => setTimeout(() => this.route(), 0));
    this.aEL('popstate', e => {
      const section = e.state?.section;
      if (typeof section === 'string') {
        this.rS(e.state, '', `${this.o}/${section}`);
      }
    });
  }
}
export default new CarrdRouter();
