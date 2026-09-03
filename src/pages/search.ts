/**
 * Wires the search box on the home and in-house pages (both built by
 * scripts/build-pages.ts's searchBar() helper) to filter the Publication
 * cards/slides on that page by title. A no-op on any page without a
 * ".page-search-input" — the coming-soon pages import this same
 * site-entry.ts bundle but never render a search box.
 */
const input = document.querySelector<HTMLInputElement>(".page-search-input");

if (input) {
  const items = document.querySelectorAll<HTMLElement>("[data-search]");
  const emptyNote = document.querySelector<HTMLElement>(".search-empty-note");

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    let visibleCount = 0;
    items.forEach((item) => {
      const matches = query === "" || (item.dataset.search ?? "").includes(query);
      // A class, not the `hidden` attribute: several card/slide elements
      // set their own `display` in author CSS (.vector-slide, .pub-card
      // is a flex/grid item), which overrides the UA [hidden] default
      // regardless of specificity — only an explicit rule can win that.
      item.classList.toggle("is-search-hidden", !matches);
      if (matches) visibleCount += 1;
    });
    if (emptyNote) emptyNote.hidden = query === "" || visibleCount > 0;
  });
}
