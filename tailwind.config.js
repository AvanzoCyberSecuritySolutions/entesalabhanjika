/**
 * Tailwind theme tokens for the site palette (see CLAUDE task brief / repo
 * README: cream background, brown text, amber accent, tan panels). This is
 * a real PostCSS build now, replacing the cdn.tailwindcss.com script tag
 * (ADR 0002) — every later page/component should reach for these token
 * names (bg-cream, text-brown, ...) instead of the arbitrary hex literals
 * (`bg-[#FFF0D7]`) the legacy pages use, so the palette lives in one place.
 *
 * No dark exception: the reader's backdrop around an open book used to be
 * a deliberate dark neutral (`reader-surround`, #241a12) — removed, the
 * reader now stays on the same light palette as the rest of the site.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ["./src/pages/**/*.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FFF0D7",
        brown: "#7B3D00",
        amber: "#EA9C1E",
        tan: "#DBC5A1",
      },
    },
  },
  plugins: [],
};
