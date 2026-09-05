# Rachel app icon

ImageGen source asset: `rachel-icon.png` (2026-09-05).

An ivory paper field, charcoal lowercase r shaped like a folded bookmark, and a coral fold. The image has no baked-in outer rounding; the operating system applies its icon mask.

Run `node scripts/gen-icons.mjs` from the project root to derive the PWA, Apple touch, maskable and browser favicon assets. The script uses the Sharp version supplied by Next.js. Keep the source outside `public` so the service worker does not precache the full-resolution master.
