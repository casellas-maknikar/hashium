const locRef     = window.location;
const originRef  = locRef.origin;
const replaceState = window.history.replaceState.bind(window.history);
const addEvent     = window.addEventListener.bind(window);

class HybridRouter {
  #loc  = locRef;
  #orig = originRef;
  #rS   = replaceState;
  #aEL  = addEvent;

  constructor() {
    Object.freeze(this);
    this.init();
  }

  path(str) {
    return str.replaceAll('--', '/');
  }

  route() {
    const section = this.path(this.#loc.hash.slice(1));
    this.#rS({ section }, '', `${this.#orig}/${section}`);
  }

  init() {
    this.#aEL('load',       () => this.route());
    this.#aEL('hashchange', () => setTimeout(() => this.route(), 0));
    this.#aEL('popstate',   e => {
      const section = e.state?.section;
      if (typeof section === 'string') {
        this.#rS(e.state, '', `${this.#orig}/${section}`);
      }
    });
  }
}

const router = new HybridRouter();
export default Object.freeze(router);
