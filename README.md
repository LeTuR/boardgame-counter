# boardgame-counter

A phone-first PWA for keeping score in board games. Add players, tap `+`/`−`
by a step of 1, 5 or 10, undo mistakes, start a new game with the same table.
Everything stays on the device (`localStorage`) and works offline once loaded.

```mermaid
flowchart LR
  tap[Tap + / −] --> update["update(players)"]
  update --> history[push previous state to undo history]
  update --> save[localStorage]
  update --> render[re-render list]
  sw[Service worker] -. precached build .-> offline[Works offline / installable]
```

## Install on a phone

Open the deployed site, then *Add to Home screen* (Android Chrome) or
*Share → Add to Home Screen* (iOS Safari).

## Develop

```sh
npm install
npm run dev        # dev server
npm run build      # typecheck + production build into dist/
npm run test:e2e   # Playwright against the production build, Pixel 7 viewport
```

First run of the tests needs a browser: `npx playwright install chromium`, or
point `PW_CHROMIUM` at an existing Chromium binary.

Pre-commit hooks run with [prek](https://github.com/j178/prek): `prek install`.

## Deploy

CI runs the typecheck and e2e tests on every PR. Pushes to `main` also deploy
`dist/` to GitHub Pages — enable it once under *Settings → Pages → Source:
GitHub Actions*.
