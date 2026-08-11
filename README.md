# Calendarium (Firefox New Tab extension)

A Firefox Manifest V3 extension that replaces the New Tab page with a
rich date/astronomy/calendar widget: date & time, calendar progress (day
of year, ISO week, month progress, New Year countdown), traditional
month names, moon phase, sunrise/sunset (+ up to 3 extra cities), Western
and Chinese zodiac, equinox/solstice, name days, folk-calendar sayings,
national holidays and seasonal periods, alternate calendar dates
(Julian/Hebrew/Islamic/Persian), and optional Wikipedia "on this day" /
"article of the day" content. Every section is individually toggleable
from the options page.

`manifest.json` lives inside `src/` (not at the repo root) because
Firefox/`web-ext` require it at the root of the loadable extension
directory, and every `--source-dir=src` command (`dev`, `build`, `lint`,
`sign`) treats `src/` as that root.

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
| `desklet.js` UI layer (GJS/St/Clutter) | **Rewritten** as plain DOM `render<Section>(els, state, ...)` functions in `src/newtab.js`, one per original `_update*` method, with the same tick cadence (60 s full refresh, 1 s sub-tick only when seconds or city time are shown, Wikipedia rotation counter). |
| `settings-schema.json` | **Transcribed** into `src/settings/schema.js` (all 66 keys, defaults, dependencies, combobox options); `src/options.js` renders the entire options UI generically from this schema. |
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

## Tests & linting

```sh
npm test             # vitest run — unit tests for every ported lib
                      # module, the Wikipedia cache-branch matrix
                      # (mocked fetch + storage.local, no real network),
                      # and the newtab render/toggle matrix (jsdom)
npm run test:coverage
npm run lint          # eslint (flat config) + web-ext lint --source-dir=src
```

## Options page ↔ desklet settings mapping

`src/settings/schema.js` is a straight transcription of the desklet's
`settings-schema.json` — same storage keys (kebab-case, e.g. `show-date`),
same defaults, same `dependency`/`indent` relationships, same combobox
option sets. `src/options.js` renders the same three pages (General,
Location, Wikipedia) with the same sections as tabs, generically from that
schema, and persists every field to `browser.storage.local` (replacing
Cinnamon's per-desklet GSettings-backed `DeskletSettings`).

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
  relying on this in daily use.
