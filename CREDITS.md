# Credits

Third-party material the apps ship, request or are built on. Each licence below is the one the
source states in this tree or in the package's own `package.json` or metadata.

## Map

Files the investigator app ships or requests for its globe. Each vendored set has a licence note
beside it; the notes name the upstream sources and hold the upstream licence files. The basemap
style's upstream file states its licences (BSD 3-Clause for code, CC BY 4.0 for design) and links
to their texts; the licence file of OSM Liberty, stored beside it, holds the BSD conditions and
disclaimer the style keeps from OSM Bright.

| What | Source | License | Where |
|---|---|---|---|
| Basemap style "Liberty" | [OpenFreeMap](https://openfreemap.org) ([hyperknot/openfreemap-styles](https://github.com/hyperknot/openfreemap-styles)), a fork of OSM Liberty, itself a fork of OSM Bright | code BSD 3-Clause, design CC BY 4.0 | `frontend/investigator/src/lib/globe/basemap/liberty.json`, note in `frontend/investigator/public/basemap/LICENSE.txt` |
| Sprite sheet | the same style; Maki POI icon set | CC0 1.0 Universal | `frontend/investigator/public/basemap/sprites/` |
| Glyph ranges of Noto Sans (Regular, Bold, Italic; Latin ranges) | as served by OpenFreeMap | SIL Open Font License 1.1 | `frontend/investigator/public/basemap/fonts/` |
| World layer: oceans, land borders, country label points | [Natural Earth](https://www.naturalearthdata.com) 1:110m, from [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) at v5.1.2 | public domain | `frontend/investigator/public/data/world/world.json`, note in `LICENSE.txt` beside it |
| Map tiles (requested at run time, not stored): vector tiles and the Natural Earth shaded relief | `tiles.openfreemap.org` | credit shown in the app: OpenFreeMap, (c) OpenMapTiles, data from OpenStreetMap; Natural Earth is public domain | not in the repo |

The style, sprites, glyphs and world data were fetched once on 2026-11-14 by
`scripts/fetch-basemap-assets.mjs`. The app never runs that script.

## Time zone data

| What | Source | License | Where |
|---|---|---|---|
| UTC offset bands for the globe's time zone overlay | [treyerl/timezones](https://github.com/treyerl/timezones) | MIT | `frontend/investigator/public/data/timezones.geojson`, note in `timezones.LICENSE.txt` beside it |

## Fonts

| Family | Used in | Project | License | Where |
|---|---|---|---|---|
| Atkinson Hyperlegible Mono | investigator | [googlefonts/atkinson-hyperlegible-next-mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono) | SIL Open Font License 1.1 | `frontend/investigator/public/fonts/OFL-AtkinsonMono.txt` |
| Hanken Grotesk | investigator (the file ships and the stylesheet declares it; no rule uses it today) | [marcologous/hanken-grotesk](https://github.com/marcologous/hanken-grotesk) | SIL Open Font License 1.1 | `frontend/investigator/public/fonts/OFL-HankenGrotesk.txt` |
| Atkinson Hyperlegible Next | investigator | [googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next) | SIL Open Font License 1.1 | `frontend/investigator/public/fonts/OFL-AtkinsonNext.txt` |
| Fraunces | customer | npm package `@fontsource-variable/fraunces` 5.2.9 | SIL Open Font License 1.1 | the package's `LICENSE` file |
| Hanken Grotesk | customer | npm package `@fontsource-variable/hanken-grotesk` 5.2.8 | SIL Open Font License 1.1 | the package's `LICENSE` file |

## Libraries

Direct runtime dependencies, with the licence each package states.

Investigator app (`frontend/investigator/package.json`):

| Package | License |
|---|---|
| maplibre-gl 5 | BSD-3-Clause |
| react, react-dom 19 | MIT |
| zustand 5 | MIT |
| lucide-react | ISC |

Customer app (`frontend/customer/package.json`): react, react-dom (MIT), zustand (MIT), lucide-react
(ISC), and the two font packages above.

Backend (`backend/requirements.txt`):

| Package | License |
|---|---|
| fastapi | MIT |
| uvicorn | BSD-3-Clause |
| pyproj | MIT |
| scikit-learn | BSD-3-Clause |
| numpy | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| joblib | BSD-3-Clause |
| httpx | BSD-3-Clause |
| python-dotenv | BSD-3-Clause |

The scenario generator under `backend/generators/concordia/` is not needed to run the apps and
none of the commands in the README installs its packages. It is built on Concordia
([google-deepmind/concordia](https://github.com/google-deepmind/concordia), package
`gdm-concordia` 2.4.0, Apache 2.0).

Test and build tools (vitest, eslint, Playwright, ruff, black, mypy, pytest and others) are not
listed. They are not part of what the apps ship.
