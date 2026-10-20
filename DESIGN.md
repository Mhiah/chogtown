# Chogtown — Toybox direction

Chogtown as a glossy toy diorama on a bright pastel morning, keeping the original floating 3D town,
its five places and the sheet-per-place structure.

- **Type:** Fredoka (display, rounded) + Nunito (body), Google Fonts.
- **Colour:** lilac canvas #efe7ff, white vinyl surfaces, ink #2b1b5a, royal #7b4cf0, pink #ff7aa8,
  gold #ffbf3c, mint #4fcf9f.
- **Shape:** squishy buttons with a solid lip shadow that collapses on press (5px → 1px), 18–34px radii,
  white cards on lilac, toys with soft drop shadows.
- **Art:** `public/toy/` — Higgsfield renders of Chog #1462 as a vinyl toy (wave, fight, read, trophy,
  selfie, hug), five place icons and a jeet villain, all transparent WebP. `hero.jpg` is the key art.
- **3D town:** sky shifted from twilight to a lilac→peach morning, brighter hemisphere light, white clouds.

References: supercell.com, animalcrossing.nintendo.com, dreamgames.com, pudgypenguins.com,
thatskygame.com, cozyeating.app (Awwwards), Brawl Stars HUD (interfaceingame.com).

## Higgsfield credit log
| Date | What | Credits |
|---|---|---|
| 2026-10-20 | 3 direction key arts (nano_banana_pro 2k) | 6 |
| 2026-10-20 | 6 toy poses (gpt_image_2_5 high, transparent) | 9 |
| 2026-10-20 | 5 place icons + jeet (gpt_image_2_5 medium, transparent) | 3 |
| | **Total** | **18** |
| 2026-10-20 | Diorama: island 4k + island portrait + 5 place close-ups (nano_banana_pro) | 16 |
| | **Running total** | **34** |
| 2026-10-20 | BTC glasses removed: 6 toy poses + hero re-rendered, plus app-icon head (gpt_image_2_5 high) | 12 |
| | **Running total** | **46** |

**Mascot:** the toy Chog's glasses are plain orange lenses, no BTC marks (user: keep it only Chog related).
Favicon set (`src/app/favicon.ico`, `icon.png`, `apple-icon.png`) is the toy's head on a rose tile, cut from `public/toy/wave.webp`.

**Diorama (v2, user feedback "not good enough, I thought it would be like this" on mockup A2):** the
flat three.js town was replaced by Higgsfield renders (`public/town`): the whole island in overview
with tappable place spots and the toy Chog standing on it, and a close-up render of each place behind
its sheet. `src/components/Diorama.tsx`; the old scene stays in `src/town/scene.js`, unused.
