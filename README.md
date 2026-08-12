# Calendarium (Firefox New Tab extension)

A Firefox Manifest V3 extension that shows a rich date/astronomy/calendar
widget: date & time, calendar progress (day of year, ISO week, month
progress, New Year countdown), traditional month names, moon phase,
sunrise/sunset (+ up to 3 extra cities), current weather for the primary
location and each named extra city, Western and Chinese zodiac,
equinox/solstice, name days, folk-calendar sayings, national holidays and
seasonal periods, alternate calendar dates (Julian/Hebrew/Islamic/Persian),
an optional search box, optional Wikipedia "on this day" / "article of the
day" content, and optional Firefox Sync of most settings across devices.
Every section is individually toggleable from the options page.

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
  **"Open full view in a new tab"** (or the popup's footer link), or via
  the keyboard shortcut below.
  `view.html` reuses `newtab.js`/`newtab.css` verbatim — same markup, same
  orchestration — rather than duplicating either, since it has the exact
  same long-lived-tab lifecycle as the New Tab page.

`manifest.json` lives inside `src/` (not at the repo root) because
Firefox/`web-ext` require it at the root of the loadable extension
directory, and every `--source-dir=src` command (`dev`, `build`, `lint`,
`sign`) treats `src/` as that root.

### Keyboard shortcut

`manifest.json` declares a `commands` entry, `open-full-view`, bound by
default to **Ctrl+Shift+Y** (**Command+Shift+Y** on macOS) — pressing it
opens `view.html` in a new tab, the same action as the toolbar button's
"Open full view in a new tab" context menu item. `src/background.js`
extracts that shared action into one `openFullView()` function so the
context-menu click (`browser.menus.onClicked`) and the keyboard shortcut
(`browser.commands.onCommand`) can never drift apart; `browser.commands`
is feature-detected before registering the listener, the same defensive
pattern as `browser.menus`/`browser.theme`/`browser.search` elsewhere in
this codebase. `Ctrl+Shift+K`/`Cmd+Shift+K` was deliberately avoided since
it's Firefox's own default shortcut for the Web Console devtools panel;
users can remap the shortcut at any time under
`about:addons` → gear icon → **Manage Extension Shortcuts**.

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
- Enabling General > Weather > "Show current weather" triggers a
  permission prompt for `api.open-meteo.com`; after granting, current
  temperature and conditions appear for the primary location, and for any
  of the three extra cities (Location tab) that has a name set — reusing
  the same "has a name → show its row" presence signal the sunrise/sunset
  city rows already use, rather than adding a separate per-city checkbox.
  Weather is New Tab / full-view only (not the popup — see below).
- Enabling Advanced > Sync > "Sync settings across devices" mirrors most
  settings to `browser.storage.sync` going forward and, on every load,
  lets any value already in Sync take precedence over this device's local
  copy for the fields that participate — see "Firefox Sync" below for
  exactly which fields that is and why.
- Enabling General > Search > "Show a search box" adds a search field at
  the top of the New Tab / full-view widget (deliberately **not** the
  popup — see below); typing a query and submitting it dispatches to
  your default search engine via `browser.search.search()` (first use
  may prompt for the `search` permission, depending on Firefox version).
  The paired "Search engine" field in Options (shown once the search
  box is enabled) sets the *persistent default*, defaulting to "System
  default" but selectable to any engine installed in Firefox — its
  option list is populated at options-page load time from
  `browser.search.get()` (not knowable statically, unlike every other
  combobox in this schema). Because search engines carry their own icons
  and a native `<select>`/`<option>` can't render an `<img>` inside an
  option reliably, this field (schema type `"engine-select"`) and the
  search box's second, *per-search* engine picker right next to the input
  both render as a small custom dropdown instead — a `<button>` showing
  the current engine's icon + name that expands into a `<ul role="listbox">`
  of icon+name options (`createEngineDropdown()` in `src/lib/render.js`,
  one implementation shared by both mount points), rather than a plain
  `<select>`. Icons come from each `SearchEngine`'s `favIconUrl`
  (`getInstalledSearchEnginesDetailed()`, the `{name, favIconUrl}` sibling
  of the plain-names `getInstalledSearchEngines()` both pickers used to
  share) — normally a local `moz-extension://`-style URL bundled with the
  engine/Firefox itself, so no new host permission is needed for this;
  a missing or failed-to-load icon falls back to a generic 🔍 emoji via the
  `<img>`'s `onerror` handler. The per-search picker starts pre-selected to
  the persistent default but can be changed for one search only, without
  writing anything back to storage; it's hidden entirely when fewer than 2
  engines are installed, since there'd be nothing to choose between.
  Either way, the chosen engine is passed as `search.search()`'s `engine`
  option instead of omitting it.

## Tests & linting

```sh
npm test             # vitest run — unit tests for every ported lib
                      # module, the Wikipedia cache-branch matrix
                      # (mocked fetch + storage.local, no real network),
                      # the shared render/toggle matrix (jsdom, against
                      # both newtab.html and popup.html markup), popup.js
                      # init orchestration, the search-box wiring, the
                      # IndexedDB-backed image store (src/lib/image-store.js,
                      # exercised via the `fake-indexeddb` devDependency
                      # rather than a real browser IndexedDB implementation,
                      # which jsdom doesn't provide), and the settings
                      # import/export validation logic
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
  `image-folder` / `firefox-theme`. Paired settings only take effect for the matching
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
  - `background-folder-picker` — shown only for `image-folder`: a
    hand-special-cased `<input type="file" webkitdirectory multiple>`
    folder picker (there's no generic schema field type for "pick a local
    folder", and the picked images don't map to a single
    `browser.storage.local` scalar — see `src/options.js`'s
    `buildFolderPickerField()`, hand-wired the same way the Wikipedia
    permission flow is), plus a status line ("N images loaded" / "No
    images selected"). Firefox's `webkitdirectory` returns every file
    under the chosen folder recursively, each exposing a
    `webkitRelativePath`; **the actual image bytes are stored in this
    browser profile's IndexedDB** (`src/lib/image-store.js` — database
    `"calendarium-images"`, object store `"backgroundImages"`), **never**
    in `browser.storage.local`/`sync`, since real image data would blow
    past either's practical quota almost immediately. **This means
    folder-picked images do NOT survive an extension reinstall or a move
    to a different Firefox profile/computer** the way every other setting
    does (IndexedDB is origin/profile-scoped, and a reinstalled extension
    gets a fresh `moz-extension://` origin) — re-pick the folder if that
    happens. They're also explicitly **not** included in the
    Import/Export feature below.
  - `background-folder-include-subfolders` — a checkbox, default `false`,
    shown only for `image-folder`: unchecked (default) keeps only images
    directly inside the chosen folder; checked includes every image in
    every subfolder underneath it too. Re-filters the already-picked
    folder immediately when toggled, without requiring a re-pick.
  - `background-rotate` — a checkbox, default `false`, enabled for
    `gradient`, `custom-image-url`, or `image-folder` (the
    `dependencyValue` array case). For `gradient`, cycles through all 14
    built-in gradients in `BACKGROUND_GRADIENT_OPTIONS`' order; for
    `custom-image-url`, cycles through every valid URL listed above (if
    more than one); for `image-folder`, cycles through every stored image
    (if more than one) via `src/lib/image-store.js`'s
    `getAllImageBlobURLs()` — called (and its previous batch of
    `URL.createObjectURL()` object URLs revoked first, to avoid leaking
    memory over a long-lived New Tab session) from
    `src/lib/render.js`'s `applyImageFolderBackground()`, an async
    counterpart to the synchronous `applyBackground()` (parallel to how
    `firefox-theme` is applied by the separate, async
    `applyFirefoxThemeBackground()`). The actual rotation
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

`src/options.js` renders the same four pages (General, Location,
Wikipedia, Advanced) with the same sections as tabs, generically from that schema
(including the `color` and `entry-multiline` field types and the
`dependencyValue` variant of `dependency`, array-valued or not), and
persists every field to `browser.storage.local`
(replacing Cinnamon's per-desklet GSettings-backed `DeskletSettings`).

### Weather

`show-weather` (General > Weather), a checkbox, default `false` — another
Firefox-only addition, not present in the source desklet. Enabling it
requests the `https://api.open-meteo.com/*` optional host permission at
runtime, via `browser.permissions.request()` called synchronously from
inside the checkbox's own `change` handler in `src/options.js`
(`requestWeatherPermission()`) — the exact same pattern as the Wikipedia
permission flow above, and for the same reason: `permissions.request()`
must run inside a real user-input handler in the calling page's own
context, not be relayed through `runtime.sendMessage()` to
`background.js`, or Firefox rejects it with "permissions.request may only
be called from a user input handler" once the transient user-activation
flag is gone by the time a message handler picks it up.

- **API**: [Open-Meteo](https://open-meteo.com)
  (`https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current_weather=true`)
  — free, keyless, CORS-enabled, no account or API key needed, considerably
  simpler to integrate than the Wikipedia feed. `src/lib/weather.js`
  mirrors `src/lib/wikipedia.js`'s shape closely (a small object with a
  `fetchCurrent(lat, lon, callback)` function, `fetch()` for the network
  call, no DOM/browser-UI concerns) and the same *policy* of TTL-based
  caching in `browser.storage.local`, cache key derived from the request's
  coordinates — but the key is the coordinates rounded to a coarse ~0.05°
  grid (`weather:<lat>:<lon>`) rather than a `lang:mmdd` pair, since
  weather is location-scoped, not day/language-scoped, and rounding lets
  nearby-but-not-identical coordinates (repeated geocoder lookups, float
  drift) share one cache entry instead of each making their own request.
  On a network/parse error, a stale cache entry (if any) is served rather
  than returning nothing, the same "degrade gracefully" spirit as
  Wikipedia's offline fallback.
- `weather-cache-hours` (indented under `show-weather`), a spinbutton,
  default `1`, range 1–12 hours — noticeably shorter than
  `wikipedia-cache-hours`' default of 12, since current weather conditions
  go stale far faster than a day's Wikipedia digest.
- The WMO `weathercode` integer Open-Meteo returns is mapped to a short
  emoji + English label by `src/lib/weather.js`'s `getWeatherInfo()`,
  covering every code in the official
  [WMO Weather interpretation codes table](https://open-meteo.com/en/docs)
  (clear/mainly clear/partly cloudy/overcast, fog, drizzle, rain,
  freezing rain, snow, showers, thunderstorm — including hail variants),
  plus a neutral fallback for any future/undocumented code so the render
  never comes out blank. The label text is intentionally left
  untranslated inside `weather.js` itself (same separation of concerns as
  Wikipedia's raw JSON data) — `src/lib/render.js`'s `renderWeather()`
  runs it through `_()` at render time, the same pattern used for
  moon-phase and zodiac names elsewhere in that file.
- **Render**: `renderWeather()` shows temperature + icon/label for the
  primary location (`#cal-weather-primary`) and, for each of the three
  extra cities that has a name set, a small list
  (`#cal-weather-cities`) — reusing the exact same "does this city have a
  name?" presence signal `renderSun()`/`renderCityTimes()` already use for
  the sunrise/sunset city rows, so no additional per-city checkbox exists.
  It is deliberately a separate DOM structure from the sunrise/sunset city
  grid rather than a 6th column bolted onto it, because that grid's own
  visibility is gated by `show-sun`, while weather needs to work
  independently of whether sunrise/sunset display is on. Rendered in
  `src/newtab.html` (and therefore `src/view.html`, which duplicates that
  markup) — **not** the popup, the same boundary the search box already
  draws (see `src/popup.js`, which likewise never renders it): a
  ~380px-wide short-lived popup is a poor fit for a feature built around a
  network fetch + a permission flow. `renderWeather()` itself no-ops
  safely if `popup.html`'s markup (which has no weather elements at all)
  is passed in, since `renderAll()` is shared code.
- **Orchestration**: `src/newtab.js`'s `scheduleWeather()` runs on the
  same 60s refresh cadence as `scheduleWikipedia()` — no separate timer —
  checking the `api.open-meteo.com` permission first, then calling
  `Weather.fetchCurrent()` for the primary location and every named extra
  city. The actual network-call throttling happens inside
  `lib/weather.js` via the cache TTL, exactly like Wikipedia, so calling
  `scheduleWeather()` every 60s is cheap (usually a cache hit, no fetch).

### Firefox Sync (opt-in, scoped to a safe subset of settings)

`sync-settings` (Advanced > Sync), a checkbox, default `false`. When
enabled, `src/options.js`'s `saveField()` best-effort-mirrors every
*syncable* field write to `browser.storage.sync` in addition to its normal
`browser.storage.local` write, and on load (`options.js`, `newtab.js`,
`popup.js`), any value already present in `browser.storage.sync` for a
syncable field takes precedence over this device's local copy — so
multiple signed-in devices converge on the same value for that field, sync
wins on conflict. `sync-settings` itself is bootstrapped from
`browser.storage.local` only (see below for why).

**The quota is the whole reason this is scoped down deliberately.**
`browser.storage.sync` has a hard **100KB total / 8KB per item** quota —
nowhere near enough for every setting this extension has, and Sync can
reject an entire write outright once either limit is hit. Rather than sync
everything and risk one oversized field silently breaking sync for every
other field too, `src/settings/schema.js` defines an explicit, hand-picked
`SYNCABLE_KEYS` allowlist: every schema field that maps to a real
`browser.storage.local` scalar (the two synthetic UI-only field types,
`folder-picker` and `import-export`, are automatically excluded — see
`NON_STORAGE_FIELD_TYPES`), **minus** three keys excluded by name via
`SYNC_EXCLUDED_KEYS`:

- **`background-image-url`** — free-form multiline text, one or more
  image URLs, unbounded in practice. Easily exceeds the 8KB-per-item
  quota on its own.
- **`background-folder-include-subfolders`** — paired with the
  `image-folder` background style. The actual folder contents live in
  this browser profile's IndexedDB (`src/lib/image-store.js`), which is
  origin/profile-scoped and can never sync at all (see that feature's own
  README section above) — excluding this small paired flag too keeps
  "the image-folder feature does not sync" a consistent, easy-to-explain
  story, even though the flag itself would be cheap to sync on its own.
- **`sync-settings`** — the toggle has to be read from
  `browser.storage.local` *before* anything can decide whether to consult
  `browser.storage.sync` at all (a bootstrapping problem: you can't ask
  Sync whether to use Sync), so it can only ever live locally.

Everything else — every checkbox, combobox, single color, single short
text field (city names, timezones, the progress separator, etc.), and
number in the schema — is small (well under a kilobyte each) and safe to
sync.

Every `browser.storage.sync` touch is guarded the same defensive way
`browser.menus`/`browser.theme`/`browser.search` are guarded elsewhere in
this codebase: feature-detected before use, and the call itself wrapped in
try/catch. A rejected write (quota exceeded, or the user simply isn't
signed into Firefox Sync at all — a very common case, and not an error
condition worth surfacing to the user) never blocks or throws past the
local save that already happened; a failed read just leaves the
already-loaded local settings in place. `mergeSyncedSettings()` (in
`settings/schema.js`) is the pure, independently unit-tested merge
function all three entry points call with whatever `browser.storage.sync`
happened to return.

This does **not** cover the IndexedDB-stored `image-folder` background
images, for the same reason Import/Export doesn't (see above) — those
can never leave this browser profile.

### Import / export settings

Advanced > "Import & Export" (schema key `settings-import-export`,
another hand-special-cased field type like `background-folder-picker`
above — see `buildImportExportField()` in `src/options.js`):

- **Export** reads `browser.storage.local.get(null)`, JSON-stringifies it,
  and downloads it as `calendarium-settings-<YYYY-MM-DD>.json` via a
  `Blob` + `URL.createObjectURL` + a temporary `<a download>` click — no
  new permission needed.
- **Import** reads a chosen `.json` file, `JSON.parse`s it, and validates
  it before writing anything: `validateImportedSettings()` (a pure,
  independently unit-tested function — see
  `tests/unit/options-import-export.test.js`) keeps only keys that exist
  in `settings/schema.js`'s `FIELDS` and are actually backed by a
  `browser.storage.local` scalar (i.e. not the two synthetic
  `folder-picker`/`import-export` field types, which have no such value),
  silently dropping everything else — so an export from a newer or older
  version of the extension never crashes the import or injects unknown
  keys. `setStatus()` reports how many keys were imported vs. skipped, and
  the options page immediately re-renders (`buildPages()` +
  `applyDependencies()`) from the newly-written state so the UI reflects
  the import without needing a manual reload.
- This **does not** cover the IndexedDB-stored `image-folder` background
  images described above — those are never read or written by
  export/import, by design (see that section's note on why they can't
  live in `browser.storage.local` in the first place).

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

## CI/CD

The project is hosted on GitHub (`KAMI911/calendarium-firefox`); GitHub
Actions (`.github/workflows/ci.yml`) is the active pipeline. A GitLab
equivalent (`.gitlab-ci.yml`) is also kept in the repo — same stages, same
signing logic — in case the project ever moves there instead; it isn't
currently wired to a GitLab remote.

**GitHub Actions** — two jobs:

- `install-lint-test-build` runs on every push and pull request: `npm ci`,
  `npm run lint`, `vitest run --coverage`, `web-ext build` (unsigned
  `.zip` uploaded as a workflow artifact).
- `sign-and-release` runs only on a pushed tag matching `v<major>.<minor>.<patch>`:
  syncs `manifest.json`/`package.json`'s version from the tag via
  `scripts/set-version.mjs`, signs with `web-ext sign --channel=unlisted`
  (self-distributed, not AMO-listed — see "Publishing to AMO" below for
  what going listed would additionally require), and publishes a GitHub
  Release named after the tag with the signed `.xpi` attached
  (`softprops/action-gh-release`, release notes auto-generated from
  commits).

### Provisioning AMO signing credentials

The `sign-and-release` job needs `WEB_EXT_API_KEY` and
`WEB_EXT_API_SECRET` as GitHub Actions secrets — these are **not**
something that can be generated for you; you must provision them
yourself:

1. Sign in at <https://addons.mozilla.org/developers/addon/api/key/> and
   generate a JWT issuer/secret pair ("Manage API Keys").
2. In this repo on GitHub, go to **Settings → Secrets and variables →
   Actions** and add:
   - `WEB_EXT_API_KEY` = the JWT issuer
   - `WEB_EXT_API_SECRET` = the JWT secret
3. Push a tag matching `v1.2.3` to trigger `sign-and-release`.

### Publishing to AMO as a public ("listed") extension

Everything above produces a self-signed, self-distributed `.xpi` — valid
and installable, but not searchable on addons.mozilla.org. Going public
requires a one-time manual submission through the AMO Developer Hub
(listing metadata, screenshots, category, privacy-practices text — a
first draft of all of this is prepared in `docs/amo-listing.md`) plus
Mozilla's human review; it can't be fully automated from CI. Once listed,
future version updates CAN go through CI by changing `--channel=unlisted`
to `--channel=listed` in the workflow.

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
