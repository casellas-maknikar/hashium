// HybridRouter for Carrd
class HybridRouter {
    constructor() {
        this.l = window.location;
        this.o = this.l.origin;

        // FIX #1: use pushState instead of replaceState so history entries are added
        this.rS = history.pushState.bind(history);

        this.route();
        window.addEventListener('hashchange', this.route.bind(this));
        window.addEventListener('popstate', this.pop.bind(this));
    }

    path(section) {
        return section.replaceAll('--', '/');
    }

    route() {
        const section = this.l.hash.slice(1);
        if (section) {
            // push new entry for each section navigation
            this.rS({ section }, '', `${this.o}/${this.path(section)}`);
        }
    }

    pop(e) {
        if (e.state) {
            const section = e.state.section;
            if (typeof section === 'string') {
                // FIX #2: instead of writing history again, restore the hash
                this.l.hash = '#' + section.replaceAll('/', '--');
            }
        }
    }
}

// default export: runs immediately when script is loaded
export default new HybridRouter();
