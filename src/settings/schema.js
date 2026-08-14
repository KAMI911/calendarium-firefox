/*
 * settings/schema.js — Settings schema for the Calendarium Firefox extension
 *
 * Transcribed from the calendarium@kami911 Cinnamon desklet's
 * settings-schema.json (66 keys), plus one Firefox-only addition
 * ("show-search-box", not present in the source desklet — see
 * section-search below). Storage keys are kept identical
 * (kebab-case, e.g. "show-date") so options.js / newtab.js / background.js
 * share one source of truth via browser.storage.local.
 *
 * Field shape:
 *   {
 *     id:          storage key (kebab-case, matches settings-schema.json)
 *     type:        "checkbox" | "combobox" | "entry" | "spinbutton" | "scale"
 *     default:     default value
 *     description: label text (English; also used as the i18n message key
 *                  base — see _locales/en/messages.json "settings_<id>" keys)
 *     tooltip:     optional help text
 *     dependency:  optional storage key that must be truthy for this field
 *                  to be enabled/shown; if `dependencyValue` is also set,
 *                  the dependency key's current value must strictly equal
 *                  it instead of merely being truthy (used for fields that
 *                  only apply to one combobox option among several, e.g.
 *                  "background-color" only when "background-style" is
 *                  "solid-color"). `dependencyValue` may also be an array,
 *                  in which case the dependency key's value must equal any
 *                  one of the array's entries (OR semantics — used for
 *                  fields that apply to more than one combobox option,
 *                  e.g. "background-rotate" when "background-style" is
 *                  either "gradient" or "custom-image-url")
 *     dependencyValue: optional — see `dependency` above
 *     indent:      optional bool, purely a UI hint (nest under dependency)
 *     options:     for combobox — { label: value, ... } (label order preserved)
 *     min/max/step/units: for spinbutton/scale
 *   }
 */

export const LAYOUT = {
    pages: ["page-general", "page-location", "page-wikipedia", "page-advanced"],

    "page-general": {
        title: "General",
        sections: [
            "section-search", "section-datetime", "section-progress", "section-traditional",
            "section-folkdays", "section-holidays", "section-moon",
            "section-sun", "section-weather", "section-zodiac", "section-namedays",
            "section-altcal", "section-appearance", "section-background"
        ]
    },
    "page-location": {
        title: "Location",
        sections: ["section-location"]
    },
    "page-wikipedia": {
        title: "Wikipedia",
        sections: ["section-wikipedia"]
    },
    // Sync + Import/Export are split into their own page (rather than living
    // under "page-general") since they're less "everyday" settings than the
    // rest of General — set apart here to help preserve compatibility
    // (a device-to-device / version-to-version concern) rather than being
    // mixed in with widget-display preferences.
    "page-advanced": {
        title: "Advanced",
        sections: ["section-sync", "section-import-export"]
    },

    "section-search":       { title: "Search", keys: ["show-search-box", "search-engine"] },
    "section-datetime":     { title: "Date and Time", keys: ["show-date", "date-format-preset", "date-format-custom", "show-time", "time-format", "show-seconds"] },
    "section-progress":     { title: "Calendar Highlights", keys: ["show-day-of-year", "show-week-number", "show-month-progress", "show-new-year-countdown", "progress-separator"] },
    "section-traditional":  { title: "Traditional Month Names", keys: ["show-traditional", "traditional-lang"] },
    "section-folkdays":     { title: "Folk Calendar Sayings", keys: ["show-folkdays", "folkday-locale"] },
    "section-holidays":     { title: "National Holidays", keys: ["show-holidays", "holiday-locale", "holiday-lookahead", "show-period-upcoming", "period-upcoming-lookahead"] },
    "section-moon":         { title: "Moon Phase", keys: ["show-moon", "show-moon-name", "show-moon-age", "show-moonrise"] },
    "section-sun":          { title: "Sunrise and Sunset", keys: ["show-sun", "show-solstice"] },
    "section-weather":      { title: "Weather", keys: ["show-weather", "weather-cache-hours"] },
    "section-altcal":       { title: "Alternate Calendars", keys: ["show-julian", "show-hebrew", "show-islamic", "show-persian", "show-french-republican"] },
    "section-location":     {
        title: "Location",
        keys: [
            "use-manual-location", "location-search", "latitude", "longitude",
            "city1-name", "city1-lat", "city1-lon", "city1-tz",
            "city2-name", "city2-lat", "city2-lon", "city2-tz",
            "city3-name", "city3-lat", "city3-lon", "city3-tz",
            "show-city-time", "show-city-tz-offset"
        ]
    },
    "section-zodiac":       { title: "Zodiac", keys: ["zodiac-western-display", "zodiac-chinese-display"] },
    "section-namedays":     { title: "Name Days", keys: ["show-namedays", "nameday-locale", "nameday-lookahead", "nameday-two-columns"] },
    "section-wikipedia":    {
        title: "Wikipedia (Internet Required)",
        keys: [
            "show-wikipedia", "wikipedia-lang", "show-wiki-events", "show-wiki-births",
            "show-wiki-deaths", "show-wiki-featured", "wikipedia-items-count",
            "wikipedia-rotate-minutes", "wikipedia-cache-hours"
        ]
    },
    "section-appearance":   { title: "Appearance", keys: ["theme-mode", "icon-size", "bg-opacity"] },
    "section-sync":         { title: "Sync", keys: ["sync-settings"] },
    "section-background":   {
        title: "Background",
        keys: [
            "background-style", "background-color", "background-gradient", "background-image-url",
            "background-folder-picker", "background-folder-include-subfolders",
            "background-rotate", "background-rotate-trigger", "background-rotate-mode", "background-rotate-minutes"
        ]
    },
    "section-import-export": { title: "Import & Export", keys: ["settings-import-export"] }
};

const LOCALE_OPTIONS_SYSTEM = { "System language": "auto", "Hungarian": "hu", "German": "de", "English": "en", "French": "fr", "Spanish": "es", "Italian": "it" };
const WIKI_LOCALE_OPTIONS   = { "System language": "auto", "English": "en", "German": "de", "Hungarian": "hu", "French": "fr", "Spanish": "es", "Italian": "it" };
const DISPLAY_MODE_OPTIONS  = { "Icon and text": "icon-and-text", "Icon only": "icon-only", "Text only": "text-only", "None (hidden)": "none" };

/**
 * Named CSS gradients offered by the "background-gradient" combobox — the
 * values are also the CSS class-name suffixes used by newtab.css
 * (`.calendarium-bg-gradient-<value>`) and are validated against by
 * lib/render.js's applyBackground() before being written to a class name,
 * so keep the two lists in sync if you add/remove one here. This is also
 * the rotation order used when "background-rotate" is enabled and
 * "background-style" is "gradient" (see applyBackground()'s rotateStep
 * parameter) — the original 6 (sunset..slate) keep their exact names/
 * values; everything after "Slate" was added later purely to widen the
 * choice and the rotation pool.
 */
export const BACKGROUND_GRADIENT_OPTIONS = {
    "Sunset": "sunset",
    "Ocean": "ocean",
    "Forest": "forest",
    "Aurora": "aurora",
    "Candy": "candy",
    "Slate": "slate",
    "Meadow": "meadow",
    "Berry": "berry",
    "Lagoon": "lagoon",
    "Twilight": "twilight",
    "Ember": "ember",
    "Mint": "mint",
    "Lavender": "lavender",
    "Copper": "copper"
};

export const FIELDS = {
    "show-search-box": { id: "show-search-box", type: "checkbox", default: false, description: "Show a search box (uses your default search engine)" },
    "search-engine": {
        id: "search-engine", type: "engine-select", default: "default", indent: true,
        dependency: "show-search-box",
        description: "Search engine",
        tooltip: "\"System default\" uses whatever Firefox's default search engine is. Picking a specific one always uses that engine instead, regardless of your Firefox default.",
        // Populated at render time from browser.search.get() — see
        // options.js's "engine-select" case, since the installed engine
        // list is only known at runtime, not something a static schema
        // can declare.
        options: { "System default": "default" }
    },

    "show-date":          { id: "show-date", type: "checkbox", default: true,  description: "Show date" },
    "date-format-preset": {
        id: "date-format-preset", type: "combobox", default: "%A, %d. %B %Y",
        description: "Date format",
        tooltip: "Select a predefined date format, or choose Custom to enter your own strftime string below.",
        options: {
            "Friday, 22. February 2026  (%A, %d. %B %Y)":    "%A, %d. %B %Y",
            "22. February 2026          (%d. %B %Y)":        "%d. %B %Y",
            "22. Feb 2026               (%d. %b %Y)":        "%d. %b %Y",
            "22 Feb 2026                (%d %b %Y)":         "%d %b %Y",
            "Fri, 22 Feb 2026           (%a, %d %b %Y)":     "%a, %d %b %Y",
            "Friday, February 22, 2026  (%A, %B %d, %Y)":    "%A, %B %d, %Y",
            "February 22, 2026          (%B %d, %Y)":        "%B %d, %Y",
            "Feb 22, 2026               (%b %d, %Y)":        "%b %d, %Y",
            "2026-02-22                 (%Y-%m-%d)":         "%Y-%m-%d",
            "22/02/2026                 (%d/%m/%Y)":         "%d/%m/%Y",
            "02/22/2026                 (%m/%d/%Y)":         "%m/%d/%Y",
            "22.02.2026                 (%d.%m.%Y)":         "%d.%m.%Y",
            "2026. February 22., Friday (%Y. %B %d., %A)":   "%Y. %B %d., %A",
            "2026. February 22.         (%Y. %B %d.)":       "%Y. %B %d.",
            "2026. 02. 22.              (%Y. %m. %d.)":      "%Y. %m. %d.",
            "Custom (enter strftime string below)":          "custom"
        }
    },
    "date-format-custom": {
        id: "date-format-custom", type: "entry", default: "%A, %d. %B %Y", indent: true,
        description: "Custom date format (strftime) — only active when 'Custom' is selected above",
        tooltip: "strftime codes: %A=full weekday  %a=short weekday  %d=day  %B=full month  %b=short month  %Y=4-digit year  %y=2-digit year  %m=month number  %j=day of year  %H=hour(24h)  %I=hour(12h)  %M=minute  %p=AM/PM.  Example: %Y. %B %d., %A"
    },
    "show-time":    { id: "show-time", type: "checkbox", default: true, description: "Show time" },
    "time-format":  { id: "time-format", type: "combobox", default: "24h", description: "Time format", options: { "24-hour": "24h", "12-hour (AM/PM)": "12h" } },
    "show-seconds": { id: "show-seconds", type: "checkbox", default: false, description: "Show seconds" },

    "show-day-of-year":         { id: "show-day-of-year", type: "checkbox", default: true, description: "Show day of year (e.g. Day 52 of 365)" },
    "show-week-number":         { id: "show-week-number", type: "checkbox", default: true, description: "Show ISO week number" },
    "show-month-progress":      { id: "show-month-progress", type: "checkbox", default: true, description: "Show month highlights (day / days in month)" },
    "show-new-year-countdown":  { id: "show-new-year-countdown", type: "checkbox", default: true, description: "Show days until New Year" },
    "progress-separator":       { id: "progress-separator", type: "entry", default: "·", description: "Separator character between calendar items" },

    "show-traditional": { id: "show-traditional", type: "checkbox", default: false, description: "Show traditional month name" },
    "traditional-lang": {
        id: "traditional-lang", type: "combobox", default: "auto", dependency: "show-traditional", indent: true,
        description: "Traditional month name tradition",
        options: { "System language": "auto", "Old Hungarian": "hu", "Old English (Anglo-Saxon)": "en", "Old German": "de" }
    },

    "show-folkdays":  { id: "show-folkdays", type: "checkbox", default: false, description: "Show folk calendar saying for today" },
    "folkday-locale": { id: "folkday-locale", type: "combobox", default: "auto", dependency: "show-folkdays", indent: true, description: "Folk saying language", options: LOCALE_OPTIONS_SYSTEM },

    "show-holidays":  { id: "show-holidays", type: "checkbox", default: true, description: "Show national holidays and weekends" },
    "holiday-locale": { id: "holiday-locale", type: "combobox", default: "auto", dependency: "show-holidays", indent: true, description: "Holiday calendar", options: LOCALE_OPTIONS_SYSTEM },
    "holiday-lookahead": { id: "holiday-lookahead", type: "spinbutton", default: 10, min: 0, max: 30, step: 1, units: "days", description: "Show upcoming holidays (days ahead)", dependency: "show-holidays", indent: true },
    "show-period-upcoming": { id: "show-period-upcoming", type: "checkbox", default: false, description: "Show upcoming seasonal periods (days ahead)", dependency: "show-holidays", indent: true },
    "period-upcoming-lookahead": { id: "period-upcoming-lookahead", type: "spinbutton", default: 30, min: 1, max: 90, step: 1, units: "days", description: "Upcoming periods lookahead (days)", dependency: "show-period-upcoming", indent: true },

    "show-moon":      { id: "show-moon", type: "checkbox", default: true, description: "Show moon phase" },
    "show-moon-name": { id: "show-moon-name", type: "checkbox", default: true, description: "Show moon phase name", dependency: "show-moon", indent: true },
    "show-moon-age":  { id: "show-moon-age", type: "checkbox", default: true, description: "Show moon age (days since new moon)", dependency: "show-moon", indent: true },
    "show-moonrise":  { id: "show-moonrise", type: "checkbox", default: false, description: "Show moonrise and moonset times" },

    "show-sun":      { id: "show-sun", type: "checkbox", default: true, description: "Show sunrise and sunset times" },
    "show-solstice": { id: "show-solstice", type: "checkbox", default: false, description: "Show equinox and solstice" },

    "show-weather": {
        id: "show-weather", type: "checkbox", default: false,
        description: "Show current weather (uses Open-Meteo, requires Internet)",
        tooltip: "Shows current temperature and conditions for your primary location and for any extra city below that has a name set. Enabling this requests permission to contact api.open-meteo.com, a free keyless weather API — no account or API key needed."
    },
    "weather-cache-hours": {
        id: "weather-cache-hours", type: "spinbutton", default: 1, min: 1, max: 12, step: 1, units: "hours",
        description: "Cache duration for weather data", dependency: "show-weather", indent: true,
        tooltip: "How long to keep weather data in the local cache before fetching fresh data. Lower values fetch more often; higher values reduce network usage. Weather changes faster than Wikipedia's daily content, so this defaults much lower than the Wikipedia cache."
    },

    "use-manual-location": { id: "use-manual-location", type: "checkbox", default: false, description: "Use manual location (default: Budapest, Hungary)" },
    "location-search": { id: "location-search", type: "entry", default: "", dependency: "use-manual-location", indent: true, description: "Search city to auto-fill coordinates", tooltip: "Type a city name — coordinates are filled in automatically after 1.5 seconds." },
    "latitude":  { id: "latitude", type: "spinbutton", default: 47.4979, min: -90.0, max: 90.0, step: 0.0001, units: "degrees", description: "Latitude (positive = North)", dependency: "use-manual-location", indent: true },
    "longitude": { id: "longitude", type: "spinbutton", default: 19.0402, min: -180.0, max: 180.0, step: 0.0001, units: "degrees", description: "Longitude (positive = East)", dependency: "use-manual-location", indent: true },

    "city1-name": { id: "city1-name", type: "entry", default: "", description: "City 1 name (leave empty to disable)", tooltip: "Label for an additional city. Leave empty to hide." },
    "city1-lat":  { id: "city1-lat", type: "spinbutton", default: 0.0, min: -90.0, max: 90.0, step: 0.0001, units: "degrees", description: "City 1 latitude" },
    "city1-lon":  { id: "city1-lon", type: "spinbutton", default: 0.0, min: -180.0, max: 180.0, step: 0.0001, units: "degrees", description: "City 1 longitude" },
    "city1-tz":   { id: "city1-tz", type: "entry", default: "", description: "City 1 timezone (IANA, e.g. Europe/Vienna)", tooltip: "Filled automatically when using city search. You can also enter an IANA timezone name manually, e.g. America/New_York." },

    "city2-name": { id: "city2-name", type: "entry", default: "", description: "City 2 name (leave empty to disable)" },
    "city2-lat":  { id: "city2-lat", type: "spinbutton", default: 0.0, min: -90.0, max: 90.0, step: 0.0001, units: "degrees", description: "City 2 latitude" },
    "city2-lon":  { id: "city2-lon", type: "spinbutton", default: 0.0, min: -180.0, max: 180.0, step: 0.0001, units: "degrees", description: "City 2 longitude" },
    "city2-tz":   { id: "city2-tz", type: "entry", default: "", description: "City 2 timezone (IANA, e.g. America/New_York)", tooltip: "Filled automatically when using city search. You can also enter an IANA timezone name manually." },

    "city3-name": { id: "city3-name", type: "entry", default: "", description: "City 3 name (leave empty to disable)" },
    "city3-lat":  { id: "city3-lat", type: "spinbutton", default: 0.0, min: -90.0, max: 90.0, step: 0.0001, units: "degrees", description: "City 3 latitude" },
    "city3-lon":  { id: "city3-lon", type: "spinbutton", default: 0.0, min: -180.0, max: 180.0, step: 0.0001, units: "degrees", description: "City 3 longitude" },
    "city3-tz":   { id: "city3-tz", type: "entry", default: "", description: "City 3 timezone (IANA, e.g. Asia/Tokyo)", tooltip: "Filled automatically when using city search. You can also enter an IANA timezone name manually." },

    "show-city-time":      { id: "show-city-time", type: "checkbox", default: true, description: "Show current local time for each city" },
    "show-city-tz-offset": { id: "show-city-tz-offset", type: "checkbox", default: false, description: "Show UTC offset for each city (e.g. UTC+1)" },

    "zodiac-western-display": { id: "zodiac-western-display", type: "combobox", default: "icon-and-text", description: "Western zodiac display", tooltip: "Choose what to show for the western zodiac sign.", options: DISPLAY_MODE_OPTIONS },
    "zodiac-chinese-display": { id: "zodiac-chinese-display", type: "combobox", default: "icon-and-text", description: "Chinese zodiac display", tooltip: "Choose what to show for the Chinese zodiac year (animal and element).", options: DISPLAY_MODE_OPTIONS },

    "show-namedays":       { id: "show-namedays", type: "checkbox", default: true, description: "Show name days" },
    "nameday-locale":      { id: "nameday-locale", type: "combobox", default: "auto", dependency: "show-namedays", indent: true, description: "Name day calendar", options: LOCALE_OPTIONS_SYSTEM },
    "nameday-lookahead":   { id: "nameday-lookahead", type: "spinbutton", default: 4, min: 0, max: 10, step: 1, units: "days", description: "Show upcoming name days (days ahead)", dependency: "show-namedays", indent: true },
    "nameday-two-columns": { id: "nameday-two-columns", type: "checkbox", default: true, description: "Show future name days in two columns", dependency: "show-namedays", indent: true },

    "show-wikipedia": { id: "show-wikipedia", type: "checkbox", default: false, description: "Enable Wikipedia features (requires Internet)" },
    "wikipedia-lang": { id: "wikipedia-lang", type: "combobox", default: "auto", dependency: "show-wikipedia", indent: true, description: "Wikipedia language", options: WIKI_LOCALE_OPTIONS },
    "show-wiki-events":   { id: "show-wiki-events", type: "checkbox", default: true, description: "Show notable events on this day", dependency: "show-wikipedia", indent: true },
    "show-wiki-births":   { id: "show-wiki-births", type: "checkbox", default: true, description: "Show notable births on this day", dependency: "show-wikipedia", indent: true },
    "show-wiki-deaths":   { id: "show-wiki-deaths", type: "checkbox", default: true, description: "Show notable deaths on this day", dependency: "show-wikipedia", indent: true },
    "show-wiki-featured": { id: "show-wiki-featured", type: "checkbox", default: false, description: "Show article of the day", dependency: "show-wikipedia", indent: true },
    "wikipedia-items-count":    { id: "wikipedia-items-count", type: "spinbutton", default: 3, min: 1, max: 10, step: 1, units: "items", description: "Items shown per section", tooltip: "How many births, deaths, and events to display at a time. The list rotates periodically, cycling through all available entries from the cache.", dependency: "show-wikipedia", indent: true },
    "wikipedia-rotate-minutes": { id: "wikipedia-rotate-minutes", type: "spinbutton", default: 5, min: 1, max: 60, step: 1, units: "minutes", description: "Rotate items every N minutes", tooltip: "How often to advance to the next set of items. Set to 1 to rotate every minute.", dependency: "show-wikipedia", indent: true },
    "wikipedia-cache-hours":    { id: "wikipedia-cache-hours", type: "spinbutton", default: 12, min: 1, max: 48, step: 1, units: "hours", description: "Cache duration for Wikipedia data", tooltip: "How long to keep Wikipedia data in the local cache before fetching fresh data. Lower values fetch more often; higher values reduce network usage.", dependency: "show-wikipedia", indent: true },

    "theme-mode": {
        id: "theme-mode", type: "combobox", default: "auto",
        description: "Color theme",
        tooltip: "\"Match system\" follows your OS/browser light or dark preference automatically. Light/Dark force that palette regardless of the system setting, on the New Tab page, popup, and full view alike.",
        options: { "Match system": "auto", "Light": "light", "Dark": "dark" }
    },
    "icon-size":  { id: "icon-size", type: "combobox", default: "medium", description: "Icon and symbol size", tooltip: "Controls the display size of moon phase and zodiac symbols.", options: { "Small": "small", "Medium": "medium", "Large": "large" } },
    "bg-opacity": {
        id: "bg-opacity", type: "scale", default: 0.0, min: 0.0, max: 1.0, step: 0.05,
        description: "Background opacity",
        tooltip: "0 = fully transparent (default), 1 = a solid opaque panel behind the widget's own text content, independent of the page background below. The panel color follows the light/dark theme so text always stays legible."
    },

    "background-style": {
        id: "background-style", type: "combobox", default: "theme-default",
        description: "Page background (New Tab / homepage / full view)",
        tooltip: "This is the extension's own background, independent of Firefox's built-in New Tab wallpaper picker (which extensions cannot read or set). \"Theme default\" follows the light/dark palette above. \"Firefox theme colors\" reads your installed Firefox Theme's colors via the browser.theme API — a real, separate WebExtension API for installed Themes, not the New Tab wallpaper picker — falling back to the default palette if the active theme has no useful colors. \"Image folder\" lets you pick a local folder of images to rotate through, stored in this browser profile's IndexedDB rather than in your synced settings — see the note under that option. The toolbar popup always uses the plain theme palette, regardless of this setting.",
        options: {
            "Theme default": "theme-default",
            "Solid color": "solid-color",
            "Gradient": "gradient",
            "Custom image URL": "custom-image-url",
            "Image folder": "image-folder",
            "Firefox theme colors": "firefox-theme"
        }
    },
    "background-color": {
        id: "background-color", type: "color", default: "#1b1b1f", indent: true,
        dependency: "background-style", dependencyValue: "solid-color",
        description: "Background color"
    },
    "background-gradient": {
        id: "background-gradient", type: "combobox", default: "sunset", indent: true,
        dependency: "background-style", dependencyValue: "gradient",
        description: "Gradient", options: BACKGROUND_GRADIENT_OPTIONS
    },
    "background-image-url": {
        id: "background-image-url", type: "entry-multiline", default: "", indent: true,
        dependency: "background-style", dependencyValue: "custom-image-url",
        description: "Custom background image URL(s)",
        tooltip: "One or more direct https:// (or data:image/...) image URLs, one per line. Used only as a CSS background-image — never evaluated as script or markup. Invalid lines are skipped individually rather than rejecting the whole list. With more than one URL and \"Rotate backgrounds\" enabled below, they rotate the same way the built-in gradients do."
    },
    "background-folder-picker": {
        id: "background-folder-picker", type: "folder-picker", indent: true,
        dependency: "background-style", dependencyValue: "image-folder",
        description: "Background image folder",
        tooltip: "Pick a local folder of images to rotate through as your background. Images are read once at pick time and stored in this browser profile's IndexedDB — NOT in your synced/exported settings — so they do NOT survive an extension reinstall or a move to a different Firefox profile/computer; re-pick the folder if that happens. This control has no single storage.local value of its own (see src/lib/image-store.js) — it only participates in the schema so it can be shown/hidden like every other field."
    },
    "background-folder-include-subfolders": {
        id: "background-folder-include-subfolders", type: "checkbox", default: false, indent: true,
        dependency: "background-style", dependencyValue: "image-folder",
        description: "Include images from subfolders",
        tooltip: "When unchecked (default), only images directly inside the chosen folder are used. When checked, images in every subfolder underneath it are included too."
    },
    "background-rotate": {
        id: "background-rotate", type: "checkbox", default: false,
        dependency: "background-style", dependencyValue: ["gradient", "custom-image-url", "image-folder"],
        description: "Rotate backgrounds automatically",
        tooltip: "For \"Gradient\", cycles through all built-in gradients. For \"Custom image URL\" or \"Image folder\", cycles through every image (if more than one). Has no effect for the other background styles."
    },
    "background-rotate-trigger": {
        id: "background-rotate-trigger", type: "combobox", default: "interval",
        dependency: "background-rotate", indent: true,
        description: "Rotate",
        tooltip: "\"On a timer\" switches every N minutes (see below) for as long as a New Tab/full-view page stays open. \"Each time a new tab opens\" picks once when the page loads and then stays put — no periodic switching while that tab remains open.",
        options: { "On a timer": "interval", "Each time a new tab opens": "on-open" }
    },
    "background-rotate-mode": {
        id: "background-rotate-mode", type: "combobox", default: "sequential",
        dependency: "background-rotate", indent: true,
        description: "Order",
        tooltip: "\"In order\" cycles through the list the same way every time. \"Randomly\" picks a different one each rotation, with repeats possible.",
        options: { "In order": "sequential", "Randomly": "random" }
    },
    "background-rotate-minutes": {
        id: "background-rotate-minutes", type: "spinbutton", default: 30, min: 1, max: 1440, step: 1, units: "minutes",
        dependency: "background-rotate", indent: true,
        description: "Rotate every",
        tooltip: "How often to switch to the next background while rotation is enabled. Only applies when \"Rotate\" (above) is set to \"On a timer\" — ignored for \"Each time a new tab opens\"."
    },

    "sync-settings": {
        id: "sync-settings", type: "checkbox", default: false,
        description: "Sync settings across devices via Firefox Sync",
        tooltip: "When enabled, most settings (toggles, colors, single text fields, numbers) are also written to browser.storage.sync, and on load take precedence over this device's local copy — so multiple signed-in devices converge on the same settings. Firefox Sync has a strict quota (100KB total, 8KB per item), so a few fields never sync: the custom background image URL(s) (can be long or many), the \"include subfolders\" folder-picker flag (the folder/images themselves can never sync — they live in this browser profile's IndexedDB), and this toggle itself (it has to be readable locally before anything can decide whether to consult Sync at all). Requires being signed into Firefox Sync — if you aren't, or a write exceeds quota, saves quietly stay local-only."
    },

    "settings-import-export": {
        id: "settings-import-export", type: "import-export",
        description: "Import / export settings",
        tooltip: "Export downloads all of your settings as a JSON file; Import reads one back in, keeping only keys this version of Calendarium recognizes (unrecognized keys — e.g. from a newer or older version — are silently skipped). This does NOT include folder-picked background images (see \"Background image folder\" above) — those live in this browser profile's IndexedDB and are never part of the exported file."
    },

    "show-julian":  { id: "show-julian", type: "checkbox", default: false, description: "Show Julian calendar date" },
    "show-hebrew":  { id: "show-hebrew", type: "checkbox", default: false, description: "Show Hebrew calendar date" },
    "show-islamic": { id: "show-islamic", type: "checkbox", default: false, description: "Show Islamic calendar date" },
    "show-persian": { id: "show-persian", type: "checkbox", default: false, description: "Show Persian calendar date" },
    "show-french-republican": { id: "show-french-republican", type: "checkbox", default: false, description: "Show French Republican calendar date" }
};

/** Flat { "show-date": true, ... } default-value map, derived from FIELDS. */
export const DEFAULTS = Object.freeze(
    Object.fromEntries(Object.values(FIELDS).map((f) => [f.id, f.default]))
);

/** Return true if `field` should be enabled given the current settings object. */
export function isFieldEnabled(field, settings) {
    if (!field.dependency) return true;
    if (field.dependencyValue !== undefined) {
        if (Array.isArray(field.dependencyValue)) return field.dependencyValue.includes(settings[field.dependency]);
        return settings[field.dependency] === field.dependencyValue;
    }
    return !!settings[field.dependency];
}

// ══════════════════════════════════════════════════════════════════════
// Firefox Sync (browser.storage.sync) allowlist
//
// Sync has a strict quota (100KB total, 8KB per item — see MDN's
// StorageArea documentation for browser.storage.sync), nowhere near
// enough for every setting this extension has. Rather than sync
// everything and let large/unsyncable fields silently blow the quota (and
// potentially block *other* fields from syncing too, since Sync failures
// are whole-call), SYNCABLE_KEYS is an explicit, hand-picked allowlist:
// every FIELDS key that maps to a real storage.local scalar (i.e. not one
// of the two synthetic UI-only field types — see NON_STORAGE_FIELD_TYPES,
// shared with options.js's import/export validation for the same reason)
// MINUS a short, explicit exclusion list:
//
//   - "background-image-url": free-form multiline text, potentially many
//     URLs — easily exceeds the 8KB-per-item quota on its own.
//   - "background-folder-include-subfolders": the folder-picker feature's
//     actual folder/images live in this browser profile's IndexedDB and
//     can never sync (IndexedDB is profile/origin-scoped) — excluding
//     this one small paired flag too keeps that feature's "does not sync"
//     story consistent, even though the flag itself is cheap to sync.
//   - "sync-settings": the sync toggle itself must be readable from
//     storage.local BEFORE anything can decide whether to consult
//     storage.sync at all (bootstrapping), so it can only ever live
//     locally.
// ══════════════════════════════════════════════════════════════════════

/** Field types with no single storage.local scalar of their own — shared by options.js's import/export validation and the Sync allowlist below. */
export const NON_STORAGE_FIELD_TYPES = new Set(["folder-picker", "import-export"]);

/** Keys explicitly excluded from Firefox Sync even though they are valid storage.local scalars — see the module doc comment above for why each one is here. */
export const SYNC_EXCLUDED_KEYS = new Set([
    "background-image-url",
    "background-folder-include-subfolders",
    "sync-settings"
]);

/** True if `key` is a plain storage.local scalar eligible for Firefox Sync mirroring. */
export function isSyncable(key) {
    let field = FIELDS[key];
    if (!field) return false;
    if (NON_STORAGE_FIELD_TYPES.has(field.type)) return false;
    if (SYNC_EXCLUDED_KEYS.has(key)) return false;
    return true;
}

/** Every FIELDS key eligible for Firefox Sync — see isSyncable(). */
export const SYNCABLE_KEYS = Object.freeze(Object.keys(FIELDS).filter(isSyncable));

/**
 * Merge a synced-settings object over a local-settings object, keeping
 * only keys in `syncableKeys` (default SYNCABLE_KEYS) and only where
 * `syncedState` actually has that key — sync wins for any key it defines,
 * local (or DEFAULTS, already folded into localState by the caller) wins
 * otherwise. Pure and side-effect-free so it can be unit tested without
 * any browser.* mocking; the actual browser.storage.sync.get() call is
 * made by each entry point (options.js / newtab.js / popup.js) and its
 * result passed in here.
 */
export function mergeSyncedSettings(localState, syncedState, syncableKeys = SYNCABLE_KEYS) {
    let merged = Object.assign({}, localState);
    if (!syncedState) return merged;
    for (let key of syncableKeys) {
        if (Object.prototype.hasOwnProperty.call(syncedState, key)) {
            merged[key] = syncedState[key];
        }
    }
    return merged;
}

export default { LAYOUT, FIELDS, DEFAULTS, isFieldEnabled, isSyncable, SYNCABLE_KEYS, mergeSyncedSettings };
