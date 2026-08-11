# AMO listing content (for the "listed" public submission)

Copy-paste these into the AMO Developer Hub submission form
(https://addons.mozilla.org/developers/addon/submit/distribution → "On this site").
The extension's `default_locale` is `en`, so submit the English text as the
primary listing; add a Hungarian localization afterwards from the same form
if you want a translated store page (optional, separate step).

## Name

Calendarium

## Summary (short, ~250 char max)

A rich New Tab & homepage widget: date, moon phase, sun times, zodiac, name
days, holidays, folk sayings, alternate calendars, and optional Wikipedia
"on this day" content. Also available as a toolbar popup and full-page view.

## Full description

Calendarium turns your New Tab page (and, optionally, your homepage) into a
glanceable daily almanac:

- Date & time, with day-of-year, ISO week number, and month/New Year
  countdown
- Moon phase, age, moonrise/moonset
- Sunrise & sunset for your location plus up to 3 extra cities
- Western & Chinese zodiac
- Name days, national holidays, folk-calendar sayings, and seasonal periods
- Alternate calendar dates: Julian, Hebrew, Islamic, Persian
- Optional Wikipedia "on this day" births/deaths/events and article of the
  day (only fetched if you enable it — requests a separate permission)
- Light/dark theme (follows your system, or set manually) and independent
  background customization (solid color, gradient, or your own image URL)
- Optional search box using your default search engine

Every section is individually toggleable from the options page. Besides the
New Tab/homepage override, Calendarium is also available as a one-click
toolbar popup and as a standalone full-page view (right-click the toolbar
button → "Open full view in a new tab") — so it's useful even if you don't
want it taking over your New Tab page.

This is an open-source port (GPL-3.0) of the `calendarium@kami911` Cinnamon
desktop widget to a modern Firefox WebExtension — all astronomical/calendar
calculations are the same well-tested algorithms from the original, just
running in the browser.

## Category

New Tab Tools

## Tags (optional, pick a few)

calendar, new tab, moon phase, sunrise sunset, zodiac, name days, holidays,
wikipedia, homepage

## Support email

kami911@gmail.com

## License

GPL-3.0 (see LICENSE in the source)

## Data collection / privacy practices question

Calendarium does not collect, transmit, or sell any personal or usage data.
All calendar/astronomical calculations run locally in the browser. The only
network request it ever makes is an optional, user-enabled fetch to the
public Wikimedia API (`https://api.wikimedia.org/*`) to show "on this day"
content — this sends only the date and language, nothing about the user.
Settings are stored locally via `browser.storage.local` and never leave the
device. No analytics, no telemetry, no third-party trackers.

## Permissions justification (if AMO review asks)

- `storage` — save the user's settings locally.
- `alarms` — schedule the periodic Wikipedia cache refresh at the user's
  configured interval.
- `search` — submit the optional search-box query to the user's default
  search engine.
- `menus` — add the "Open full view in a new tab" toolbar-button context
  menu item.
- `optional_host_permissions: https://api.wikimedia.org/*` — only requested
  when the user explicitly enables the Wikipedia section in Options; used
  solely to fetch public "on this day" content.

## Screenshots

Suggested captures (from `npm run dev` or the installed extension):
1. New Tab page with the widget showing (light or dark theme).
2. Options page, General tab.
3. Toolbar popup.
4. Options page, Background/Appearance section (shows the theme + custom
   background controls).
