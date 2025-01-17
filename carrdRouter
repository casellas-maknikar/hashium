export default class CarrdRouter {
  constructor() {
    this.sections = this.loadMarkersJSON();
    this.initialize();
  }

  // Converts path delimiters between '---' and '/' for routing logic
  convertPath = (path, toSlash = true) =>
    path.replaceAll(toSlash ? "---" : "/", toSlash ? "/" : "---");

  // Checks if CSS transitions are active on the element.
  transitionsEnabled = (el) => {
    const { transitionDuration, transitionDelay } = getComputedStyle(el);
    const p = (t) => parseFloat(t) * (t.includes("ms") ? 1 : 1000) || 0;
    return transitionDuration
      .split(",")
      .some((d, i) => p(d) + p(transitionDelay.split(",")[i] || 0) > 0);
  };

  loadMarkersJSON = () => {
    const hfConf = document.getElementById("hfHidden");
    if (!hfConf) return {};
    try {
      return JSON.parse(hfConf.textContent);
    } catch {
      return {};
    }
  };

  hfHidden = (id) => {
    const markers = {
      header: document.getElementById("header"),
      footer: document.getElementById("footer"),
    };
    if (!markers.header || !markers.footer) return;
    const { hideHeader, hideFooter } = this.sections[id] || {};
    const toggles = [
      [markers.header, hideHeader],
      [markers.footer, hideFooter],
    ];
    toggles.forEach(([el, hide]) => {
      el.style.display = hide ? "none" : "";
      el.classList.toggle("hidden", !!hide);
    });
  };

  activateSectionWithTransitions = async (target) => {
    const activeSection = document.querySelector("section.active");

    if (activeSection && activeSection !== target) {
      if (this.transitionsEnabled(activeSection)) {
        activeSection.classList.replace("active", "inactive");
        await new Promise((resolve) => {
          const transitionHandler = ({ propertyName }) => {
            if (propertyName === "opacity") {
              activeSection.style.display = "none";
              activeSection.removeEventListener(
                "transitionend",
                transitionHandler
              );
              resolve();
            }
          };
          activeSection.addEventListener("transitionend", transitionHandler);
        });
        this.activateTargetSection(target);
      } else {
        activeSection.style.display = "none";
        activeSection.classList.remove("active");
        this.activateTargetSection(target, false);
      }
    } else {
      activeSection
        ? (target.style.display = "")
        : this.activateTargetSection(target, false);
    }
  };

  activateTargetSection = (target, useTransitions = true) => {
    if (useTransitions && this.transitionsEnabled(target)) {
      target.classList.add("inactive");
      target.style.display = "";
      target.offsetTop; // Trigger reflow
      target.classList.replace("inactive", "active");
      Object.assign(target.style, {
        minHeight: `${target.scrollHeight}px`,
        maxHeight: `${target.scrollHeight}px`,
        minWidth: `${target.scrollWidth}px`,
        maxWidth: `${target.scrollWidth}px`,
      });

      target.addEventListener(
        "transitionend",
        function handler({ propertyName }) {
          if (propertyName === "opacity") {
            Object.assign(target.style, {
              minHeight: "",
              maxHeight: "",
              minWidth: "",
              maxWidth: "",
            });
            target.removeEventListener("transitionend", handler);
          }
        }
      );
    } else {
      target.style.display = "";
      target.classList.add("active");
    }
    this.hfHidden(target.id.replace("-section", ""));
  };

  navigateToSection = (path, replaceState = false) => {
    const cleanPath = this.convertPath(path);
    const sectionId = ["", "home"].includes(cleanPath.replace(/^\//, ""))
      ? "home"
      : this.convertPath(cleanPath.replace(/^\//, ""), false);
    const targetSection = document.getElementById(`${sectionId}-section`);

    if (targetSection) {
      this.activateSectionWithTransitions(targetSection);
      if (!replaceState) history.pushState(null, "", cleanPath);
      this.hfHidden(sectionId);
    }
  };

  scrollToPoint = (el, path) => {
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      if (path) history.replaceState(null, "", path);
    }
  };

  handleURL = () => {
    const { pathname, hash } = window.location;

    if (hash) {
      const scrollElement = document.querySelector(
        `[data-scroll-id="${hash.substring(1)}"]`
      );
      scrollElement
        ? this.scrollToPoint(scrollElement, pathname)
        : (history.replaceState(null, "", pathname + hash.replace("#", "")),
          this.navigateToSection(pathname + hash.replace("#", ""), true));
    } else {
      this.navigateToSection(pathname, true);
    }
    this.forceConvertHyphens();
  };

  forceConvertHyphens = () => window.location.pathname.includes("---") && history.replaceState(null, "", this.convertPath(window.location.pathname));

  initialize = () => {
    this.forceConvertHyphens();
    ["popstate", "hashchange"].forEach((evt) =>
      window.addEventListener(evt, this.handleURL)
    );
    this.handleURL();
    document.addEventListener("click", ({ target }) => {
      const link = target.closest('a[href^="#"]');
      link &&
        (event.preventDefault(),
        this.scrollToPoint(
          document.querySelector(
            `[data-scroll-id="${link.getAttribute("href").substring(1)}"]`
          ) ||
            this.navigateToSection("/" + link.getAttribute("href").substring(1))
        ));
    });
  };
}
