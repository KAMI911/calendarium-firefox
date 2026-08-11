# Calendarium (Firefox New Tab extension)

A Firefox Manifest V3 extension that shows a rich date/astronomy/calendar
widget: date & time, calendar progress (day of year, ISO week, month
progress, New Year countdown), traditional month names, moon phase,
sunrise/sunset (+ up to 3 extra cities), Western and Chinese zodiac,
equinox/solstice, name days, folk-calendar sayings, national holidays and
seasonal periods, alternate calendar dates (Julian/Hebrew/Islamic/Persian),
an optional search box, and optional Wikipedia "on this day" / "article of
the day" content. Every section is individually toggleable from the
options page.

## Three ways to use it

The same widget is available in three places, all sharing one render
layer (`src/lib/render.js`) and one settings store
(`browser.storage.local`, configured from the same options page):

- **New Tab page** (`src/newtab.html` + `src/newtab.js`) — overrides
  Firefox's New Tab page. Full widget, long-lived tick loop (60 s full
  refresh, 1 s sub-tick, Wikipedia rotation).
- **Toolbar button popup** (`src/popup.html` + `src/popup.js`) — click
  the extension's toolbar icon for a compact (≈380px-wide, scrollable)
  popup rendering of the same sections your settings have enabled. Popup
  orchestration is deliberately simpler than the New Tab page's: one full
  render on open, plus a 1 s clock tick only while the popup stays open —
  no 60 s refresh timer or Wikipedia rotation, since a popup rarely stays
  open long enough for either to matter. A footer link ("Open full view")
  jumps to the standalone view below.
- **Standalone full view** (`src/view.html`) — the same full-size widget
  as the New Tab page, opened in its own tab. Since `moz-extension://`
  extension URLs are randomized per install and can't be bookmarked ahead
  of time, reach it via the toolbar button's right-click context menu →
  **"Open full view in a new tab"** (or the popup's footer link).
  `view.html` reuses `newtab.js`/`newtab.css` verbatim — same markup, same
  orchestration — rather than duplicating either, since it has the exact
  same long-lived-tab lifecycle as the New Tab page.

`manifest.json` lives inside `src/` (not at the repo root) because
Firefox/`web-ext` require it at the root of the loadable extension
directory, and every `--source-dir=src` command (`dev`, `build`, `lint`,
`sign`) treats `src/` as that root.

## Firefox for Android support

The extension is compatible with Firefox for Android (`manifest.json`
declares `browser_specific_settings.gecko.gecko_android`, without which
Android treats it as desktop-only and won't offer it as installable at
all), but the on-Android experience differs from desktop in one
significant way:

- **What works:** the toolbar **action popup** (`popup.html`) and the
  **options page** (`options.html`, via `options_ui`) are both supported
  on Android, so all settings and a compact widget view are reachable.
  The **standalone full view** (`view.html`) is also reachable — either
  from the popup's "Open full view" footer link, or (on the desktop
  builds of Firefox that support `browser.menus`) via the toolbar
  button's right-click context menu. Wikipedia caching
  (`browser.alarms` + `browser.storage.local`) works identically to
  desktop.
- **What doesn't work:** `chrome_url_overrides.newtab` and
  `chrome_settings_overrides.homepage` are not implemented on Firefox
  for Android — Android silently ignores both keys rather than failing,
  but in practice this means the New Tab/homepage widget never appears
  there. The popup and the full view are the real entry points on
  mobile.
- **API availability guards:** `browser.menus`/`browser.contextMenus`
  (used for the toolbar button's "Open full view in a new tab" context
  menu) has historically had limited/no support on Android,
  `browser.search.search()` (used for the optional search box) may
  likewise be unavailable on a given platform/build, and the same is true
  of `browser.theme` (used for the `firefox-theme` background-style — see
  the settings-mapping section above). All three call sites
  (`src/background.js`'s `ensureMenu()`, `src/lib/render.js`'s
  `submitSearch()` and `applyFirefoxThemeBackground()`) feature-detect the
  API before calling it and wrap the actual call in try/catch, so a
  missing or rejecting API degrades silently (no menu item / no-op search
  submit / theme-default-equivalent background) instead of throwing and
  breaking the rest of initialization or rendering.

This has been verified via `web-ext lint` and the automated test suite
(which mocks `browser.menus`/`browser.search`/`browser.theme` as
`undefined` to simulate Android — see `tests/unit/background.test.js`,
`tests/unit/search-box.test.js`, and `tests/unit/theme-background.test.js`),
not by sideloading on a physical
Android device; if you're deploying to Android, it's worth confirming
the popup/options/full-view flow manually on-device at least once.

## Relationship to `calendarium@kami911`

This extension is a port of the
[`calendarium@kami911`](https://github.com/linuxmint/cinnamon-spices-desklets)
Cinnamon desklet to a standalone Firefox WebExtension. It is a separate
project/repository — not a fork of the cinnamon-spices-desklets monorepo,
since that repo's validation/CI tooling is Cinnamon-specific.

### What was reused vs rewritten

| Area | Treatment |
| --- | --- |
| `lib/moon.js`, `sun.js`, `solstice.js`, `zodiac.js`, `calendars.js`, `localization.js` | **Ported verbatim.** Every algorithm/formula is byte-identical to the desklet; only wrapped in ES module `export` syntax. |
| `lib/folkdays.js`, `holidays.js`, `namedays.js`, `geocoder.js` | **Parsing/query logic ported verbatim**, I/O swapped from `Gio.File.new_for_path()` to `fetch(browser.runtime.getURL(...))`, and the loaders made Promise-based (still callable with an optional Node-style `callback` for API-shape compatibility). |
| `data/namedays/*.json`, `data/folkdays/*.json`, `data/holidays/*.json`, `data/cities.json` | **Copied verbatim.** |
| `lib/wikipedia.js` | **Ported with the same cache policy** (fresh-cache / empty-cache-refetch / network-error-fallback / English pre-warm), `Soup` → `fetch()`, the GLib file cache → `browser.storage.local` entries keyed by `type:lang:mmdd`. Same public API shape (`fetchOnThisDay`, `fetchFeatured`, `CACHE_TTL_SECS`). |
| `desklet.js` UI layer (GJS/St/Clutter) | **Rewritten** as plain DOM `render<Section>(els, state, ...)` functions in `src/lib/render.js`, one per original `_update*` method. `src/newtab.js` and `src/popup.js` each own their own tick orchestration on top of that shared render layer (see "Three ways to use it" above); the New Tab cadence mirrors the desklet's (60 s full refresh, 1 s sub-tick only when seconds or city time are shown, Wikipedia rotation counter). |
| `settings-schema.json` | **Transcribed** into `src/settings/schema.js` (all 66 keys, defaults, dependencies, combobox options), plus one Firefox-only addition not present in the source desklet: `show-search-box` (see below); `src/options.js` renders the entire options UI generically from this schema. |
| `po/*.po` + `.pot` | **Converted** to WebExtension `_locales/<lang>/messages.json` via `scripts/po-to-webext-locales.mjs` (re-runnable — see below). No strings were retranslated. |

### Wikipedia endpoint note

The desklet's `lib/wikipedia.js` calls `api.wikimedia.org/feed/v1/wikipedia/<lang>/...`
(confirmed by reading the original Soup request URLs — **not**
`<lang>.wikipedia.org/api/rest_v1/...`). The port keeps the same
endpoints and requests `https://api.wikimedia.org/*` as an optional host
permission. If births/deaths/events/featured content stops populating,
check whether Wikimedia has since retired this feed API in favor of the
per-language REST API.

## Setup

```sh
npm install
```

## Development

```sh
npm run dev     # launches a real Firefox instance via web-ext with the
                 # extension loaded (open a New Tab to see it; the
                 # Extensions > Calendarium > Preferences page is the
                 # options UI)
```

Manual smoke test checklist (also see `.gitlab-ci.yml`'s `test`/`build`
stages, which is what CI actually enforces — automated cross-browser
extension E2E isn't reliably scriptable in CI):

- New Tab shows the widget with the default sections visible.
- Every checkbox on the options page toggles its New Tab section live.
- Typing a city under Location > "Search city" auto-fills latitude/longitude
  after ~1.5 s; typing an extra-city name auto-fills its lat/lon/timezone.
- Enabling "Enable Wikipedia features" on the Wikipedia tab triggers a
  permission prompt for `api.wikimedia.org`; after granting, the Wikipedia
  section populates on the New Tab page within a few seconds.
- Clicking the toolbar button opens the compact popup with the same
  enabled sections; right-clicking it and choosing "Open full view in a
  new tab" opens `view.html` in a new tab with the full-size widget.
- Enabling General > Search > "Show a search box" adds a search field at
  the top of the New Tab / popup / full-view widget; typing a query and
  submitting it dispatches to your default search engine via
  `browser.search.search()` (first use may prompt for the `search`
  permission, depending on Firefox version).

## Tests & linting

```sh
npm test             # vitest run — unit tests for every ported lib
                      # module, the Wikipedia cache-branch matrix
                      # (mocked fetch + storage.local, no real network),
                      # the shared render/toggle matrix (jsdom, against
                      # both newtab.html and popup.html markup), popup.js
                      # init orchestration, and the search-box wiring
npm run test:coverage
npm run lint          # eslint (flat config) + web-ext lint --source-dir=src
```

## Options page ↔ desklet settings mapping

`src/settings/schema.js` is a straight transcription of the desklet's
`settings-schema.json` — same storage keys (kebab-case, e.g. `show-date`),
same defaults, same `dependency`/`indent` relationships, same combobox
option sets — plus a handful of Firefox-only keys with no desklet
equivalent:

- `show-search-box` (General > Search), a checkbox, default `false`, that
  toggles the search box rendered at the top of the widget.
- `theme-mode` (General > Appearance), a combobox — `auto` (default) /
  `light` / `dark`. Controls the widget's light/dark color palette
  (`src/newtab.css`'s `--cal-*` custom properties, imported by
  `popup.css` too) on all three surfaces — New Tab/homepage, popup, and
  full view. `auto` follows the OS/browser's `prefers-color-scheme`;
  `light`/`dark` force that palette regardless of the OS preference by
  having `src/lib/render.js`'s `applyThemeMode()` stamp
  `data-theme="light"`/`data-theme="dark"` on `<html>`, which
  `newtab.css` gives priority over the `prefers-color-scheme` media
  query in both directions.
- `icon-size` (General > Appearance), a combobox — `small` (14px) /
  `medium` (20px, default) / `large` (30px), matching the original
  desklet's own pixel values. Sets a `--cal-icon-size` CSS custom property
  on `#calendarium-container` via `src/lib/render.js`'s `applyIconSize()`,
  which the moon-phase symbol (`#cal-moon-icon`) and the western/Chinese
  zodiac symbols (`.calendarium-zodiac-icon`, in `newtab.css`) read from.
  Applies on all three surfaces, including the popup — it only affects
  elements inside the widget's own container, never the page chrome.
- `bg-opacity` (General > Appearance), a scale from `0.0` (default,
  fully transparent) to `1.0` (fully opaque). **Not** the same thing as
  `background-style` below — this is an older, distinct setting ported
  from the original desklet: a semi-transparent panel color painted only
  behind `#calendarium-container` (the element holding the date/time/
  moon/etc. rows), via `src/lib/render.js`'s `applyPanelOpacity()`. The
  panel color itself is light/dark-theme-aware (`rgba(0,0,0,…)` against an
  effectively-dark palette, `rgba(255,255,255,…)` against an effectively-
  light one — see `isEffectiveDarkTheme()`) rather than the original
  desklet's hardcoded black, since this port also supports a light theme.
  Applies on all three surfaces, including the popup, for the same reason
  as `icon-size` above.
- `background-style` (General > Background), a combobox — `theme-default`
  (default, follows `theme-mode`'s palette) / `solid-color` / `gradient`
  (14 built-in CSS gradients, no image assets) / `custom-image-url` /
  `firefox-theme`. Paired settings only take effect for the matching
  style, via the same `dependency`/`indent` mechanism as e.g.
  `date-format-preset` → `date-format-custom`, extended with an optional
  `dependencyValue` for value-equality (not just truthy) dependencies —
  `dependencyValue` may also be an array for "applies to more than one
  option" fields (OR semantics; see `background-rotate` below):
  - `background-color` — an `<input type="color">`-backed hex value,
    shown only when `background-style` is `solid-color`.
  - `background-gradient` — shown only for `gradient`.
  - `background-image-url` — an `entry-multiline` field (a `<textarea>`,
    the one field type beyond the desklet's original set), shown only for
    `custom-image-url`: one or more plain HTTPS/`data:image:` URLs, one
    per line. Used strictly as a CSS `background-image: url(...)`, never
    evaluated as script/markup; each line is validated against an
    allowlisted scheme independently (`parseImageUrlList()` in
    `lib/render.js`), so one bad line doesn't drop the rest.
  - `background-rotate` — a checkbox, default `false`, enabled for either
    `gradient` or `custom-image-url` (the `dependencyValue` array case).
    For `gradient`, cycles through all 14 built-in gradients in
    `BACKGROUND_GRADIENT_OPTIONS`' order; for `custom-image-url`, cycles
    through every valid URL listed above (if more than one). The actual
    timer lives in `src/newtab.js`'s `scheduleBackgroundRotation()` — a
    plain `setInterval` alongside the existing clock/refresh timers (not
    `browser.alarms`, since this is a purely visual per-tab effect that
    doesn't need to survive the page being closed), paused/resumed by the
    same `isHidden()`/`visibilitychange` logic as those.
  - `background-rotate-minutes` — a spinbutton, default `30`, range
    1–1440, depends (truthily) on `background-rotate`.

  `background-style` is **independent from `theme-mode`** and `theme-
  default`/`solid-color`/`gradient`/`custom-image-url` are all **not**
  related to Firefox's own New Tab wallpaper picker, which has no public
  WebExtension API to read or set — those are the extension's own
  background, applied only to the New Tab/homepage/full-view pages via
  `src/lib/render.js`'s `applyBackground()`.

  `firefox-theme` is different: it reads colors (`theme.colors.
  ntp_background`/`frame`/`toolbar`, in that preference order) and/or a
  background image (`theme.images.theme_frame` or the first of
  `theme.images.additional_backgrounds`) from the browser's **currently
  active, installed Firefox Theme** via `browser.theme.getCurrent()` — a
  real, documented WebExtension API for Firefox Themes (the things
  installed from addons.mozilla.org/themes and switched under
  about:addons > Themes). This is a genuinely different subsystem from,
  and should not be confused with, the New Tab page's own built-in
  Activity-Stream wallpaper picker mentioned above — that one really has
  no extension-accessible API; `browser.theme` does. Applied
  asynchronously by `applyFirefoxThemeBackground()` (separate from the
  synchronous `applyBackground()` class toggle, since fetching the active
  theme is inherently async), guarded the same defensive way `background.
  js`'s `ensureMenu()` guards `browser.menus` — feature-detected before
  calling, with any throw/rejection/absence falling back silently to the
  `theme-default`-equivalent palette (e.g. when the active theme is
  Firefox's own default theme, which has no useful colors/images to read).
  `browser.theme.onUpdated` (also feature-detected) live-updates the
  background if the user switches Firefox Themes while a New Tab page
  stays open. Requires the `"theme"` permission (`src/manifest.json`).

  The toolbar popup always keeps the plain theme palette for all of
  `background-style`'s options — `popup.js` never calls `applyBackground()`
  or `applyFirefoxThemeBackground()` (see `src/popup.css`'s doc comment
  for why) — though it does apply `icon-size`/`bg-opacity`, as noted above.

`src/options.js` renders the same three pages (General, Location,
Wikipedia) with the same sections as tabs, generically from that schema
(including the `color` and `entry-multiline` field types and the
`dependencyValue` variant of `dependency`, array-valued or not), and
persists every field to `browser.storage.local`
(replacing Cinnamon's per-desklet GSettings-backed `DeskletSettings`).

## Regenerating translations

```sh
npm run po:generate   # runs scripts/po-to-webext-locales.mjs
```

Re-run this any time `po/*.po` or `po/calendarium@kami911.pot` change
upstream. It regenerates `src/_locales/<lang>/messages.json` for
`en` (from the `.pot`, used as `default_locale`), `hu`, `de`, `es`, `fr`,
`it` from scratch — translation keys are derived deterministically from
each English source string via `slug()` (see `src/lib/i18n.js`), so no
hand-maintained string→key table needs to stay in sync.

## Building

```sh
npm run build   # web-ext build --source-dir=src --artifacts-dir=dist
                 # produces an unsigned .zip in dist/
```

## CI/CD (GitLab)

Pipeline stages: `install → lint → test → build → sign`.

- `install`/`lint`/`test`/`build` run on every push/MR (cached
  `node_modules/` keyed on `package-lock.json`).
- `sign` (and the follow-up `release` job) only run when a tag matching
  `v<major>.<minor>.<patch>` is pushed. `sign` runs
  `scripts/set-version.mjs` to sync `manifest.json`'s version from the
  tag, then `web-ext sign` to produce a signed, AMO-listed `.xpi`;
  `release` attaches it to a GitLab Release via `release-cli`.

### Provisioning AMO signing credentials

The `sign` job needs `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` as masked
CI/CD variables — these are **not** something that can be generated for
you; you must provision them yourself:

1. Sign in at <https://addons.mozilla.org/developers/addon/api/key/> and
   generate a JWT issuer/secret pair ("Manage API Keys").
2. In this project on GitLab, go to **Settings → CI/CD → Variables** and
   add:
   - `WEB_EXT_API_KEY` = the JWT issuer
   - `WEB_EXT_API_SECRET` = the JWT secret
   - Mark both **Masked** (and **Protected** if you only tag releases
     from protected branches).
3. Push a tag matching `v1.2.3` to trigger `sign` + `release`.

## Known gaps / TODOs

- Icon sizes: `src/icons/` includes `icon-48.png`, `icon-96.png`,
  `icon-128.png` (generated from the desklet's `icon.png` via
  ImageMagick `convert`) plus the original 512×512 `icon.png`.
- The Wikipedia REST endpoint assumption (`api.wikimedia.org/feed/v1/...`)
  should be spot-checked against a live response before shipping — see
  the note in `src/lib/wikipedia.js` and above.
- Traditional month names only cover `hu`/`en`/`de` (identical to the
  source desklet — `lib/localization.js` was ported verbatim).
- `npm run dev` / manual Firefox smoke testing has not been run in this
  environment (no GUI Firefox available); please run it once before
  relying on this in daily use — in particular the popup/full-view/
  search-box additions have only been exercised via jsdom unit tests, not
  a real Firefox window.
- The "Open full view in a new tab" context menu item's title is a plain
  English string (`src/background.js`), not run through the `_()` /
  `browser.i18n` translation layer like the rest of the UI, since
  `browser.menus` titles are created once at install/startup time outside
  any page's localized context and the `po/*.po` → `_locales` pipeline
  doesn't currently have a slot for background-script strings. Worth
  revisiting if this extension gains more background-originated UI text.
