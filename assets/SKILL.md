---
name: aurora-design
description: Use this skill to generate well-branded interfaces and assets for Aurora (a clean, modern music-streaming service), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map
- `README.md` — brand context, content & visual foundations, iconography
- `colors_and_type.css` — drop-in CSS variables (aurora-*, surface-*, semantic h1/h2/body)
- `assets/` — logo (`aurora-logo.svg`), hero image
- `preview/` — small spec cards (colors, type, components) — open any in a browser to inspect
- `ui_kits/web_app/` — full React click-thru of the Aurora web player (open `index.html`)
- `ui_kits/web_app/source/` — verbatim React source from the upstream repo (`AsP3X/aurora`)
