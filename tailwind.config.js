/**
 * Tailwind theme tokens for the site palette (see CLAUDE task brief / repo
 * README: cream background, brown text, amber accent, tan panels). This is
 * a real PostCSS build now, replacing the cdn.tailwindcss.com script tag
 * (ADR 0002) — every later page/component should reach for these token
 * names (bg-cream, text-brown, ...) instead of the arbitrary hex literals
 * (`bg-[#FFF0D7]`) the legacy pages use, so the palette lives in one place.
 *
 * `reader-surround` is the one deliberate exception to "no dark theme
 * anywhere": the warm deep neutral the reader's backdrop uses around an
 * open book, everywhere else on the site stays on the light palette above.
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
        "reader-surround": "#241a12",
      },
    },
  },
  plugins: [],
};
