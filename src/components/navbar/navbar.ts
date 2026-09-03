/**
 * Site navigation, as a custom element.
 *
 * Replaces the old navbar.js, which had a sitewide bug: closeDrawer() added a
 * `.closing` class and waited 290ms for an animation, but the keyframes it
 * depended on (slideOutRight, backdropFadeOut) were defined only inside
 * index.html — and even there inside an unclosed `@keyframes slide-text`
 * block, so they never existed at all. On every page the drawer therefore sat
 * frozen for 290ms and then vanished with no animation. Here the animation is
 * owned by the component's own stylesheet, and close waits on the real
 * `animationend` event rather than a hardcoded timeout that can drift out of
 * sync with the CSS.
 */
const LINKS: readonly { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/editor.html", label: "Editor" },
  { href: "/writer.html", label: "Writer" },
  { href: "/in-house.html", label: "In-house" },
  { href: "/feedback.html", label: "Feedback" },
];

function currentPath(): string {
  const path = window.location.pathname;
  return path === "" || path === "/index.html" ? "/" : path;
}

function linkMarkup(extraClass: string): string {
  const here = currentPath();
  return LINKS.map((l) => {
    const active = l.href === here;
    return `<li><a href="${l.href}" class="${extraClass}${active ? " is-current" : ""}"${
      active ? ' aria-current="page"' : ""
    }>${l.label}</a></li>`;
  }).join("");
}

export class SiteNavbar extends HTMLElement {
  private drawer: HTMLDialogElement | null = null;

  connectedCallback(): void {
    this.innerHTML = `
      <nav class="site-nav" aria-label="Primary">
        <a class="site-nav-logo" href="/">
          <img src="/images/logo.webp" alt="${"Ente Salabhanjika"} home" width="100" height="100" />
        </a>
        <ul class="site-nav-links">${linkMarkup("site-nav-link")}</ul>
        <button type="button" class="site-nav-toggle" aria-expanded="false" aria-label="Open menu">
          <span aria-hidden="true">&#9776;</span>
        </button>
      </nav>
      <dialog class="site-drawer" aria-label="Menu">
        <div class="site-drawer-head">
          <button type="button" class="site-drawer-close" aria-label="Close menu"><span aria-hidden="true">&times;</span></button>
        </div>
        <ul class="site-drawer-links">${linkMarkup("site-drawer-link")}</ul>
      </dialog>
    `;

    this.drawer = this.querySelector("dialog");
    const toggle = this.querySelector<HTMLButtonElement>(".site-nav-toggle");
    const close = this.querySelector<HTMLButtonElement>(".site-drawer-close");
    if (!this.drawer || !toggle) return;

    toggle.addEventListener("click", () => {
      this.drawer?.showModal();
      toggle.setAttribute("aria-expanded", "true");
    });
    close?.addEventListener("click", () => void this.close());
    this.drawer.addEventListener("click", (e) => {
      if (e.target === this.drawer) void this.close();
    });
    this.drawer.addEventListener("cancel", (e) => {
      e.preventDefault();
      void this.close();
    });
    this.querySelectorAll(".site-drawer-link").forEach((link) =>
      link.addEventListener("click", () => void this.close())
    );
  }

  /** Waits on the real animationend rather than a hardcoded timeout, so the close cannot drift out of sync with the stylesheet — the bug in the old navbar.js. */
  private async close(): Promise<void> {
    const drawer = this.drawer;
    if (!drawer?.open) return;
    this.querySelector(".site-nav-toggle")?.setAttribute("aria-expanded", "false");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      drawer.close();
      return;
    }

    drawer.classList.add("is-closing");
    await new Promise<void>((done) => {
      const finish = (): void => {
        drawer.removeEventListener("animationend", finish);
        done();
      };
      drawer.addEventListener("animationend", finish);
      // Guard: if the animation is absent for any reason, do not hang the drawer open.
      window.setTimeout(finish, 600);
    });
    drawer.classList.remove("is-closing");
    drawer.close();
  }
}

if (!customElements.get("site-navbar")) customElements.define("site-navbar", SiteNavbar);
