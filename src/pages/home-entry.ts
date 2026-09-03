/**
 * Fallback for the Editions carousel's scale/glow/text animation on
 * browsers without `animation-timeline: view()` (Firefox, Safari < 18):
 * drives the same three Web Animations manually from scroll position.
 * Chromium and Safari 18+ skip this entirely — the CSS in home.css
 * already animates them declaratively.
 */
if (!CSS.supports("(animation-timeline: view()) and (animation-range: entry)")) {
  const scroller = document.querySelector<HTMLElement>(".scroller");
  const slides = document.querySelectorAll<HTMLElement>(".vector-slide");

  if (scroller && slides.length > 0) {
    const animations = new Map<HTMLElement, { slide: Animation; overlay: Animation; text: Animation }>();

    slides.forEach((slide) => {
      const overlay = slide.querySelector<HTMLElement>(".overlay");
      const text = slide.querySelector<HTMLElement>(".edition-text");
      if (!overlay || !text) return;

      const slideAnim = slide.animate({ transform: ["scale(0.85)", "scale(1)", "scale(0.85)"] }, { duration: 1, fill: "both" });
      slideAnim.pause();

      const overlayAnim = overlay.animate(
        {
          backgroundColor: [
            "transparent",
            "rgb(163 138 99 / 0.6)",
            "rgb(234 156 30 / 0.35)",
            "rgb(163 138 99 / 0.6)",
            "transparent",
          ],
        },
        { duration: 1, fill: "both" }
      );
      overlayAnim.pause();

      const textAnim = text.animate({ opacity: ["0", "0.5", "1", "0.5", "0"] }, { duration: 1, fill: "both" });
      textAnim.pause();

      animations.set(slide, { slide: slideAnim, overlay: overlayAnim, text: textAnim });
    });

    const tick = (): void => {
      const scrollerRect = scroller.getBoundingClientRect();
      slides.forEach((slide) => {
        const anims = animations.get(slide);
        if (!anims) return;
        const slideRect = slide.getBoundingClientRect();
        const progress = (slideRect.left + slideRect.width / 2 - scrollerRect.left) / scrollerRect.width;
        const p = Math.max(0, Math.min(1, progress));
        anims.slide.currentTime = p;
        anims.overlay.currentTime = p;
        anims.text.currentTime = p;
      });
    };

    scroller.addEventListener("scroll", tick);
    window.addEventListener("resize", tick);
    tick();
  }
}
