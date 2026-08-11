/*
 * lib/render.js — shared DOM render layer for the Calendarium extension.
 *
 * Re-implements every `_update*` method of the calendarium@kami911 Cinnamon
 * desklet (desklet.js) as a pure `render<Section>(els, state, ...)` function
 * operating on plain DOM nodes, instead of GJS/St/Clutter actors.
 *
 * This module is intentionally free of any orchestration (timers, storage
 * reads, permission checks): it is imported identically by every entry
 * point that renders the widget —
 *   - src/newtab.js  (New Tab override, full widget, long-lived tick loop)
 *   - src/popup.js   (toolbar action popup, compact widget, short-lived)
 *   - src/view.html  (standalone full view, reuses newtab.js's markup and
 *                      orchestration directly — see that file)
 * — so the section-rendering logic is written and tested exactly once.
 *
 * All render functions are side-effect-free beyond mutating the DOM nodes
 * they are given, so tests/unit/render.test.js can exercise them directly
 * with jsdom fixtures and a fixed Date/state, without booting the
 * extension runtime.
 */

import { Moon } from "./moon.js";
import { Sun } from "./sun.js";
import { Zodiac } from "./zodiac.js";
import { Localization } from "./localization.js";
import { Namedays } from "./namedays.js";
import { Folkdays } from "./folkdays.js";
import { Holidays } from "./holidays.js";
import { Solstice } from "./solstice.js";
import { Calendars } from "./calendars.js";
import { _, slug } from "./i18n.js";
import { BACKGROUND_GRADIENT_OPTIONS } from "../settings/schema.js";

export { _, slug };

// ── Default location: Budapest, Hungary (matches the original desklet) ────
export const DEFAULT_LAT = 47.4979;
export const DEFAULT_LON = 19.0402;

// ══════════════════════════════════════════════════════════════════════
// Small pure helpers ported from desklet.js
// ══════════════════════════════════════════════════════════════════════

/** ISO 8601 week number (1–53). */
export function getISOWeek(date) {
    let d      = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    let dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Word-wrap text to at most maxCols characters per line.
 * Splits on spaces; never breaks mid-word unless the word itself is longer.
 */
export function wrapText(text, maxCols) {
    if (!text) return "";
    let words = text.split(" ");
    let lines = [];
    let line  = "";
    for (let w of words) {
        if (!line) {
            line = w;
        } else if (line.length + 1 + w.length <= maxCols) {
            line += " " + w;
        } else {
            lines.push(line);
            line = w;
        }
    }
    if (line) lines.push(line);
    return lines.join("\n");
}

/** Format a UTC offset in hours as a "UTC±H" or "UTC±H:MM" string. */
export function formatTzOffset(offsetHours) {
    if (offsetHours === null || offsetHours === undefined) return "";
    let sign = offsetHours >= 0 ? "+" : "-";
    let abs  = Math.abs(offsetHours);
    let h    = Math.floor(abs);
    let m    = Math.round((abs - h) * 60);
    let str  = "UTC" + sign + h;
    if (m > 0) str += ":" + (m < 10 ? "0" : "") + m;
    return str;
}

/**
 * Resolve a locale setting value.
 * If value is "auto", detect the first browser UI language that appears in
 * the `supported` list; fall back to `fallback` if none match.
 */
export function resolveLocale(value, supported, fallback) {
    if (value && value !== "auto") return value;
    let candidates = [];
    try {
        if (typeof navigator !== "undefined") {
            if (navigator.languages) candidates.push(...navigator.languages);
            if (navigator.language) candidates.push(navigator.language);
        }
    } catch (_e) { /* ignore */ }
    for (let c of candidates) {
        if (!c) continue;
        let lang = c.split("-")[0].split("_")[0].toLowerCase();
        if (lang && supported.indexOf(lang) !== -1) return lang;
    }
    return fallback;
}

/** Get the current UTC offset in hours for an IANA timezone string, or null. */
export function getCityUtcOffsetHours(tzStr) {
    if (!tzStr || !tzStr.trim()) return null;
    try {
        let now     = new Date();
        let tzDate  = new Date(now.toLocaleString("en-US", { timeZone: tzStr.trim() }));
        let utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
        let hours   = (tzDate.getTime() - utcDate.getTime()) / 3600000;
        return Math.round(hours * 4) / 4; // snap to nearest quarter hour
    } catch (_e) {
        return null;
    }
}

/** Get the short timezone abbreviation (e.g. "CET") for an IANA timezone string. */
export function getCityTzAbbr(tzStr) {
    if (!tzStr || !tzStr.trim()) return "";
    try {
        let parts = new Intl.DateTimeFormat("en-US", {
            timeZone: tzStr.trim(), timeZoneName: "short"
        }).formatToParts(new Date());
        let part = parts.find((p) => p.type === "timeZoneName");
        return part ? part.value : "";
    } catch (_e) {
        return "";
    }
}

/** Get "HH:MM" local time in an IANA timezone. */
export function getCityTimeStr(tzStr) {
    if (!tzStr || !tzStr.trim()) return "";
    try {
        return new Intl.DateTimeFormat("en-GB", {
            timeZone: tzStr.trim(), hour: "2-digit", minute: "2-digit", hour12: false
        }).format(new Date());
    } catch (_e) {
        return "";
    }
}

/**
 * Minimal strftime — supports every code used by settings/schema.js's
 * "date-format-preset" options plus the custom-format tooltip's code list.
 */
export function strftime(date, fmt) {
    let pad = (n, w = 2) => String(n).padStart(w, "0");
    let weekdayLong  = new Intl.DateTimeFormat(undefined, { weekday: "long"  }).format(date);
    let weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
    let monthLong    = new Intl.DateTimeFormat(undefined, { month: "long"  }).format(date);
    let monthShort   = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
    let Y = date.getFullYear();
    let hour24 = date.getHours();
    let hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    let dayOfYear = Math.floor(
        (Date.UTC(Y, date.getMonth(), date.getDate()) - Date.UTC(Y, 0, 1)) / 86400000
    ) + 1;
    let map = {
        "%A": weekdayLong, "%a": weekdayShort,
        "%B": monthLong,   "%b": monthShort,
        "%Y": String(Y),   "%y": pad(Y % 100),
        "%m": pad(date.getMonth() + 1), "%d": pad(date.getDate()),
        "%j": pad(dayOfYear, 3),
        "%H": pad(hour24), "%I": pad(hour12),
        "%M": pad(date.getMinutes()), "%S": pad(date.getSeconds()),
        "%p": hour24 < 12 ? "AM" : "PM", "%%": "%"
    };
    return fmt.replace(/%[A-Za-z%]/g, (tok) => (tok in map ? map[tok] : tok));
}

// ══════════════════════════════════════════════════════════════════════
// DOM element lookup
// ══════════════════════════════════════════════════════════════════════

/** Query all element refs the widget markup declares, from the given root (default document). */
export function getEls(root = document) {
    let q = (id) => root.getElementById ? root.getElementById(id) : root.querySelector("#" + id);
    return {
        container: q("calendarium-container"),
        searchForm: q("cal-search-form"),
        searchInput: q("cal-search-input"),
        date: q("cal-date"),
        time: q("cal-time"),
        progressRow1: q("cal-progress-row1"),
        progressRow2: q("cal-progress-row2"),
        dayOfYear: q("cal-day-of-year"),
        newYear: q("cal-new-year"),
        weekNumber: q("cal-week-number"),
        monthProgress: q("cal-month-progress"),
        traditional: q("cal-traditional"),
        folkday: q("cal-folkday"),
        holiday: q("cal-holiday"),
        holidayUpcoming: q("cal-holiday-upcoming"),
        period: q("cal-period"),
        periodUpcoming: q("cal-period-upcoming"),
        moonRow: q("cal-moon-row"),
        moonIcon: q("cal-moon-icon"),
        moonText: q("cal-moon-text"),
        moonAge: q("cal-moon-age"),
        moonriseRow: q("cal-moonrise-row"),
        moonrise: q("cal-moonrise"),
        moonset: q("cal-moonset"),
        sunRow: q("cal-sun-row"),
        sunrise: q("cal-sunrise"),
        sunset: q("cal-sunset"),
        cityGrid: q("cal-city-grid"),
        zodiacRow: q("cal-zodiac-row"),
        zodiacWesternPart: q("cal-zodiac-western-part"),
        zodiacWesternIcon: q("cal-zodiac-western-icon"),
        zodiacWesternText: q("cal-zodiac-western-text"),
        zodiacChinesePart: q("cal-zodiac-chinese-part"),
        zodiacChineseIcon: q("cal-zodiac-chinese-icon"),
        zodiacChineseText: q("cal-zodiac-chinese-text"),
        solstice: q("cal-solstice"),
        namedayToday: q("cal-nameday-today"),
        namedayFuture: q("cal-nameday-future"),
        wikiEventsHeader: q("cal-wiki-events-header"),
        wikiEvents: q("cal-wiki-events"),
        wikiBirthsHeader: q("cal-wiki-births-header"),
        wikiBirths: q("cal-wiki-births"),
        wikiDeathsHeader: q("cal-wiki-deaths-header"),
        wikiDeaths: q("cal-wiki-deaths"),
        wikiFeaturedHeader: q("cal-wiki-featured-header"),
        wikiFeatured: q("cal-wiki-featured"),
        altcal: q("cal-altcal")
    };
}

function show(el, visible) {
    if (!el) return;
    if (visible) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
}

// ══════════════════════════════════════════════════════════════════════
// Render functions — one per desklet.js `_update*` method
// ══════════════════════════════════════════════════════════════════════

export function renderSearchBox(els, state) {
    show(els.searchForm, !!state["show-search-box"]);
}

export function renderDate(els, state, now) {
    show(els.date, !!state["show-date"]);
    if (!state["show-date"]) return;
    let preset   = state["date-format-preset"] || "";
    let isCustom = preset.indexOf("%") === -1;
    let fmt = isCustom ? (state["date-format-custom"] || "%A, %d. %B %Y") : preset;
    try { els.date.textContent = strftime(now, fmt); }
    catch (_e) { els.date.textContent = "--"; }
}

export function renderTime(els, state, now) {
    show(els.time, !!state["show-time"]);
    if (!state["show-time"]) return;
    let fmt;
    if (state["time-format"] === "12h") {
        fmt = state["show-seconds"] ? "%I:%M:%S %p" : "%I:%M %p";
    } else {
        fmt = state["show-seconds"] ? "%H:%M:%S" : "%H:%M";
    }
    try { els.time.textContent = strftime(now, fmt); }
    catch (_e) { els.time.textContent = "--:--"; }
}

export function renderProgress(els, state, now) {
    let y = now.getFullYear();
    let todayUTC = Date.UTC(y, now.getMonth(), now.getDate());

    show(els.dayOfYear, !!state["show-day-of-year"]);
    if (state["show-day-of-year"]) {
        let dayOfYear = Math.floor((todayUTC - Date.UTC(y, 0, 1)) / 86400000) + 1;
        let isLeap     = (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
        let daysInYear = isLeap ? 366 : 365;
        els.dayOfYear.textContent = _("Day %d of %d", dayOfYear, daysInYear);
        els.dayOfYear.title = _("Day of year") + ": " + dayOfYear + " / " + daysInYear;
    }

    show(els.weekNumber, !!state["show-week-number"]);
    if (state["show-week-number"]) {
        let weekNum = getISOWeek(now);
        els.weekNumber.textContent = _("Week %d", weekNum);
        els.weekNumber.title = _("Week number") + ": " + weekNum;
    }

    show(els.monthProgress, !!state["show-month-progress"]);
    if (state["show-month-progress"]) {
        let dayOfMonth  = now.getDate();
        let daysInMonth = new Date(y, now.getMonth() + 1, 0).getDate();
        let monthName   = new Intl.DateTimeFormat(undefined, { month: "long" }).format(now);
        let sep = (state["progress-separator"] || "·").charAt(0);
        let mpPrefix = state["show-week-number"] ? " " + sep + " " : "";
        els.monthProgress.textContent =
            mpPrefix + monthName + " " + sep + " " + dayOfMonth + "/" + daysInMonth + " " + _("days");
        els.monthProgress.title = _("Month highlights") + ": " + dayOfMonth + " / " + daysInMonth;
    }

    show(els.newYear, !!state["show-new-year-countdown"]);
    if (state["show-new-year-countdown"]) {
        let days = Math.round((Date.UTC(y + 1, 0, 1) - todayUTC) / 86400000);
        let sep  = (state["progress-separator"] || "·").charAt(0);
        let nyPrefix = state["show-day-of-year"] ? " " + sep + " " : "";
        els.newYear.textContent = nyPrefix + days + " " + _("days until New Year");
        try {
            els.newYear.title = strftime(new Date(y + 1, 0, 1), "%A, %B %d, %Y");
        } catch (_e) { els.newYear.title = ""; }
    }

    show(els.progressRow1, !!(state["show-day-of-year"] || state["show-new-year-countdown"]));
    show(els.progressRow2, !!(state["show-week-number"] || state["show-month-progress"]));
}

export function renderTraditional(els, state, now) {
    if (!state["show-traditional"]) { show(els.traditional, false); return; }
    let lang = resolveLocale(state["traditional-lang"], ["hu", "de", "en"], "en");
    let name = Localization.getTraditionalMonthName(lang, now.getMonth());
    show(els.traditional, !!(name && name.trim()));
    els.traditional.textContent = name || "";
}

export function renderFolkday(els, state, folkdayData, now) {
    if (!state["show-folkdays"]) { show(els.folkday, false); return; }
    let saying = Folkdays.getSaying(folkdayData, now);
    show(els.folkday, !!(saying && saying.trim()));
    els.folkday.textContent = saying ? wrapText(saying, 48) : "";
}

export function renderHoliday(els, state, holidayData, now) {
    let isWeekend = (now.getDay() === 0 || now.getDay() === 6);
    let holiday = state["show-holidays"] ? Holidays.getHolidayForDate(holidayData, now) : null;

    if (!holiday && !isWeekend) {
        show(els.holiday, false);
    } else {
        let parts = [];
        if (holiday) {
            let prefix = holiday.public ? "★ " : "";
            parts.push(prefix + holiday.name);
            if (holiday.public) parts.push(_("public holiday"));
        }
        if (isWeekend) parts.push(_("weekend"));
        els.holiday.className = (holiday && holiday.public) ? "calendarium-holiday-public" : "calendarium-holiday";
        els.holiday.textContent = parts.join(" · ");
        show(els.holiday, true);
    }

    let lookahead = state["holiday-lookahead"] || 0;
    if (!state["show-holidays"] || lookahead === 0) {
        show(els.holidayUpcoming, false);
    } else {
        let tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        let upcoming = Holidays.getHolidaysRange(holidayData, tomorrow, lookahead - 1);
        if (upcoming.length === 0) {
            show(els.holidayUpcoming, false);
        } else {
            let lines = upcoming.map((h) => {
                let d = h.date;
                let prefix = h.public ? "★ " : "";
                return (d.getMonth() + 1) + "/" + d.getDate() + ": " + prefix + h.name;
            });
            els.holidayUpcoming.textContent = lines.join("\n");
            show(els.holidayUpcoming, true);
        }
    }

    let periods = state["show-holidays"] ? Holidays.getPeriodsForDate(holidayData, now) : [];
    if (periods.length === 0) {
        show(els.period, false);
    } else {
        els.period.textContent = periods
            .map((p) => "\u{1F4C5} " + p.name + " · " + p.daysLeft + " " + _("days left"))
            .join("\n");
        show(els.period, true);
    }

    let lookaheadPeriods = state["period-upcoming-lookahead"] || 30;
    if (!state["show-period-upcoming"]) {
        show(els.periodUpcoming, false);
    } else {
        let upcoming = Holidays.getUpcomingPeriods(holidayData, now, lookaheadPeriods);
        if (upcoming.length === 0) {
            show(els.periodUpcoming, false);
        } else {
            els.periodUpcoming.textContent = upcoming
                .map((p) => "▶ " + p.name + " · " + p.daysUntil + " " + _("days"))
                .join("\n");
            show(els.periodUpcoming, true);
        }
    }
}

export function renderMoon(els, state, now) {
    show(els.moonRow, !!state["show-moon"]);
    if (!state["show-moon"]) return;

    let moon = Moon.getMoonPhase(now);
    let phaseName = _(moon.phaseName);

    els.moonIcon.textContent = moon.phaseSymbol || "";
    els.moonIcon.title = _("Moon phase") + ": " + phaseName;

    show(els.moonText, !!state["show-moon-name"]);
    els.moonText.textContent = phaseName;

    show(els.moonAge, !!state["show-moon-age"]);
    if (state["show-moon-age"]) {
        let ageText = moon.age.toFixed(1) + " " + _("days");
        els.moonAge.textContent = "· " + ageText;
        els.moonAge.title = _("Moon age") + ": " + ageText;
    }
}

export function renderMoonTimes(els, state, now) {
    show(els.moonriseRow, !!state["show-moonrise"]);
    if (!state["show-moonrise"]) return;

    let lat = state["use-manual-location"] ? state["latitude"]  : DEFAULT_LAT;
    let lon = state["use-manual-location"] ? state["longitude"] : DEFAULT_LON;
    let mt  = Sun.getMoonTimes(now, lat, lon);

    let riseStr = mt.moonrise || _("No data");
    let setStr  = mt.moonset  || _("No data");

    els.moonrise.textContent = "☾↑ " + riseStr;
    els.moonset.textContent  = "☾↓ " + setStr;
    els.moonrise.title = _("Moonrise") + ": " + riseStr;
    els.moonset.title  = _("Moonset")  + ": " + setStr;
}

function sunStr(sun, key) {
    if (sun.polarDay)   return _("Polar day");
    if (sun.polarNight) return _("Polar night");
    return sun[key] || _("No data");
}

/** Build (or update) the 3-row × 5-column city grid inside els.cityGrid. */
function ensureCityGridRows(els) {
    if (els._cityRows) return els._cityRows;
    let doc = els.cityGrid.ownerDocument || document;
    let rows = [];
    for (let i = 0; i < 3; i++) {
        let name    = doc.createElement("span");
        let time    = doc.createElement("span");
        let tzLabel = doc.createElement("span");
        let sunrise = doc.createElement("span");
        let sunset  = doc.createElement("span");
        name.className    = "calendarium-city-name";
        time.className    = "calendarium-city-time";
        tzLabel.className = "calendarium-city-tz";
        sunrise.className = "calendarium-city";
        sunset.className  = "calendarium-city";
        els.cityGrid.appendChild(name);
        els.cityGrid.appendChild(time);
        els.cityGrid.appendChild(tzLabel);
        els.cityGrid.appendChild(sunrise);
        els.cityGrid.appendChild(sunset);
        rows.push({ name, time, tzLabel, sunrise, sunset });
    }
    els._cityRows = rows;
    return rows;
}

export function renderCityTimes(els, state) {
    let rows = ensureCityGridRows(els);
    let names = [state["city1-name"], state["city2-name"], state["city3-name"]];
    let tzs   = [state["city1-tz"],   state["city2-tz"],   state["city3-tz"]];
    for (let i = 0; i < 3; i++) {
        if (!names[i] || !names[i].trim()) continue;
        let offset = getCityUtcOffsetHours(tzs[i]);

        let timeStr = "";
        let abbr = "";
        if (tzs[i] && tzs[i].trim()) {
            if (state["show-city-time"]) {
                let t = getCityTimeStr(tzs[i]);
                timeStr = t ? " " + t : "";
            }
            abbr = getCityTzAbbr(tzs[i]);
        }
        rows[i].time.textContent = timeStr;
        show(rows[i].time, !!(state["show-city-time"] && timeStr !== ""));

        let tzStr = "";
        if (state["show-city-tz-offset"] && offset !== null) {
            tzStr = " " + formatTzOffset(offset);
            if (abbr) tzStr += " (" + abbr + ")";
        }
        rows[i].tzLabel.textContent = tzStr;
        show(rows[i].tzLabel, !!(state["show-city-tz-offset"] && tzStr !== ""));
    }
}

export function renderSun(els, state, now) {
    show(els.sunRow, !!state["show-sun"]);

    let rows = ensureCityGridRows(els);
    let names = [state["city1-name"], state["city2-name"], state["city3-name"]];
    let lats  = [state["city1-lat"],  state["city2-lat"],  state["city3-lat"]];
    let lons  = [state["city1-lon"],  state["city2-lon"],  state["city3-lon"]];
    let tzs   = [state["city1-tz"],   state["city2-tz"],   state["city3-tz"]];

    let anyCity = false;
    for (let i = 0; i < 3; i++) {
        let has = !!(state["show-sun"] && names[i] && names[i].trim());
        if (has) anyCity = true;
        show(rows[i].name, has);
        show(rows[i].sunrise, has);
        show(rows[i].sunset, has);
        if (!has) { show(rows[i].time, false); show(rows[i].tzLabel, false); }
    }
    show(els.cityGrid, anyCity);

    if (!state["show-sun"]) return;

    let lat = state["use-manual-location"] ? state["latitude"]  : DEFAULT_LAT;
    let lon = state["use-manual-location"] ? state["longitude"] : DEFAULT_LON;
    let sun = Sun.getSunTimes(now, lat, lon);

    let sunriseStr = sunStr(sun, "sunrise");
    let sunsetStr  = sunStr(sun, "sunset");

    els.sunrise.textContent = "☀ " + sunriseStr;
    els.sunset.textContent  = "☽ " + sunsetStr;
    els.sunrise.title = _("Sunrise") + ": " + sunriseStr;
    els.sunset.title  = _("Sunset")  + ": " + sunsetStr;

    for (let i = 0; i < 3; i++) {
        if (!(names[i] && names[i].trim())) continue;
        let offset = getCityUtcOffsetHours(tzs[i]);
        let cs = Sun.getSunTimes(now, lats[i], lons[i], offset);
        rows[i].name.textContent = names[i];
        rows[i].sunrise.textContent = "☀ " + sunStr(cs, "sunrise");
        rows[i].sunset.textContent  = "☽ " + sunStr(cs, "sunset");
    }

    renderCityTimes(els, state);
}

export function renderZodiac(els, state, now) {
    let wMode = state["zodiac-western-display"] || "icon-and-text";
    let cMode = state["zodiac-chinese-display"] || "icon-and-text";
    let wVisible = wMode !== "none";
    let cVisible = cMode !== "none";

    show(els.zodiacWesternPart, wVisible);
    show(els.zodiacChinesePart, cVisible);
    show(els.zodiacRow, wVisible || cVisible);

    if (wVisible) {
        let w = Zodiac.getWesternZodiac(now);
        let name = _(w.name) || "";
        show(els.zodiacWesternIcon, wMode !== "text-only");
        show(els.zodiacWesternText, wMode !== "icon-only");
        els.zodiacWesternIcon.textContent = w.symbol || "";
        els.zodiacWesternText.textContent = name;
        els.zodiacWesternIcon.title = _("Western zodiac") + ": " + name;
    }

    if (cVisible) {
        let c = Zodiac.getChineseZodiac(now.getFullYear(), now.getMonth() + 1, now.getDate());
        let text = _(c.elementKey) + " " + _(c.animalKey);
        show(els.zodiacChineseIcon, cMode !== "text-only");
        show(els.zodiacChineseText, cMode !== "icon-only");
        els.zodiacChineseIcon.textContent = c.symbol || "";
        els.zodiacChineseText.textContent = text;
        els.zodiacChineseIcon.title = _("Chinese zodiac") + ": " + text;
    }
}

export function renderSolstice(els, state, now) {
    show(els.solstice, !!state["show-solstice"]);
    if (!state["show-solstice"]) return;
    let ev = Solstice.getNext(now);
    if (!ev) { show(els.solstice, false); return; }
    let name = _(ev.nameKey);
    els.solstice.textContent = ev.daysUntil === 0
        ? "☀ " + name
        : "☀ " + name + " · " + ev.daysUntil + " " + _("days");
}

function namedayLabel(entry, dayIndex) {
    if (!entry || !entry.names || entry.names.length === 0) return null;
    let names = entry.names.join(", ");
    let prefix;
    if (dayIndex === 0) prefix = _("Name days") + ": ";
    else if (dayIndex === 1) prefix = _("Tomorrow") + ": ";
    else if (entry.date) prefix = (entry.date.getMonth() + 1) + "/" + entry.date.getDate() + ": ";
    else prefix = "";
    return prefix + names;
}

function ensureNamedayRows(els, count = 10) {
    if (els._namedayRows) return els._namedayRows;
    let doc = els.namedayFuture.ownerDocument || document;
    let rows = [];
    for (let i = 0; i < count; i++) {
        let row   = doc.createElement("div");
        let left  = doc.createElement("span");
        let right = doc.createElement("span");
        row.className   = "calendarium-nameday-row";
        left.className  = "calendarium-nameday-sub";
        right.className = "calendarium-nameday-sub";
        row.appendChild(left);
        row.appendChild(right);
        els.namedayFuture.appendChild(row);
        rows.push({ row, left, right });
    }
    els._namedayRows = rows;
    return rows;
}

export function renderNamedays(els, state, namedayData, now) {
    let lookahead = state["nameday-lookahead"] || 0;
    let twoCol    = !!state["nameday-two-columns"];
    let range     = Namedays.getNamedaysRange(namedayData, now, lookahead);
    let rows      = ensureNamedayRows(els);

    if (!state["show-namedays"]) {
        show(els.namedayToday, false);
        els.namedayToday.textContent = "";
    } else {
        let todayText = namedayLabel(range[0], 0);
        show(els.namedayToday, !!todayText);
        els.namedayToday.textContent = todayText || "";
    }

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        let r = rows[rowIdx];
        if (!state["show-namedays"]) {
            show(r.row, false);
            r.left.textContent = ""; r.right.textContent = "";
            continue;
        }
        if (twoCol) {
            let dayA = rowIdx * 2 + 1;
            let dayB = rowIdx * 2 + 2;
            let labelA = dayA <= lookahead ? namedayLabel(range[dayA], dayA) : null;
            let labelB = dayB <= lookahead ? namedayLabel(range[dayB], dayB) : null;
            if (!labelA && !labelB) {
                show(r.row, false);
                r.left.textContent = ""; r.right.textContent = "";
            } else {
                show(r.row, true);
                r.left.textContent = labelA || "";
                show(r.right, !!labelB);
                r.right.textContent = labelB || "";
            }
        } else {
            let dayIdx = rowIdx + 1;
            let label = dayIdx <= lookahead ? namedayLabel(range[dayIdx], dayIdx) : null;
            show(r.row, !!label);
            show(r.right, false);
            r.left.textContent = label || "";
            r.right.textContent = "";
        }
    }
}

export function renderAltCal(els, state, now) {
    let anyEnabled = state["show-julian"] || state["show-hebrew"] || state["show-islamic"] || state["show-persian"];
    show(els.altcal, !!anyEnabled);
    if (!anyEnabled) return;

    let y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    let lines = [];
    if (state["show-julian"])  lines.push(_("Julian date")  + ": " + Calendars.formatJulian(y, m, d));
    if (state["show-hebrew"])  lines.push(_("Hebrew date")  + ": " + Calendars.formatHebrew(y, m, d));
    if (state["show-islamic"]) lines.push(_("Islamic date") + ": " + Calendars.formatIslamic(y, m, d));
    if (state["show-persian"]) lines.push(_("Persian date") + ": " + Calendars.formatPersian(y, m, d));
    els.altcal.textContent = lines.join("\n");
}

/** Rotate an array by `step * n` items and take the next `n`, wrapping around. */
function rotateSlice(arr, step, n) {
    if (!arr || arr.length === 0) return [];
    let start = (step * n) % arr.length;
    let result = [];
    for (let i = 0; i < n; i++) result.push(arr[(start + i) % arr.length]);
    return result;
}

function wikiEntryText(e) {
    let year  = e.year ? e.year + ": " : "";
    let title = (e.pages && e.pages[0]) ? e.pages[0].normalizedtitle : (e.text || "");
    return year + title;
}

export function renderWikiOnThisDay(els, state, data, rotateStep) {
    show(els.wikiEventsHeader, false); show(els.wikiEvents, false);
    show(els.wikiBirthsHeader, false); show(els.wikiBirths, false);
    show(els.wikiDeathsHeader, false); show(els.wikiDeaths, false);

    if (!data || !state["show-wikipedia"]) return;

    let n     = Math.max(1, state["wikipedia-items-count"] || 3);
    let every = Math.max(1, state["wikipedia-rotate-minutes"] || 5);
    let step  = Math.floor((rotateStep || 0) / every);

    if (state["show-wiki-births"] && data.births && data.births.length > 0) {
        let items = rotateSlice(data.births, step, n).map(wikiEntryText);
        els.wikiBirthsHeader.textContent = _("Births on this day");
        els.wikiBirths.textContent = items.map((s) => wrapText(s, 48)).join("\n");
        show(els.wikiBirthsHeader, true); show(els.wikiBirths, true);
    }
    if (state["show-wiki-deaths"] && data.deaths && data.deaths.length > 0) {
        let items = rotateSlice(data.deaths, step, n).map(wikiEntryText);
        els.wikiDeathsHeader.textContent = _("Deaths on this day");
        els.wikiDeaths.textContent = items.map((s) => wrapText(s, 48)).join("\n");
        show(els.wikiDeathsHeader, true); show(els.wikiDeaths, true);
    }
    if (state["show-wiki-events"] && data.events && data.events.length > 0) {
        let items = rotateSlice(data.events, step, n).map(wikiEntryText);
        els.wikiEventsHeader.textContent = _("Events on this day");
        els.wikiEvents.textContent = items.map((s) => wrapText(s, 48)).join("\n");
        show(els.wikiEventsHeader, true); show(els.wikiEvents, true);
    }
}

export function renderWikiFeatured(els, state, data) {
    show(els.wikiFeaturedHeader, false);
    show(els.wikiFeatured, false);
    if (!state["show-wikipedia"] || !state["show-wiki-featured"]) return;
    if (!data || !data.tfa) return;

    let tfa     = data.tfa;
    let title   = tfa.normalizedtitle || tfa.title || "";
    let extract = tfa.extract || "";
    let dot     = extract.indexOf(". ");
    if (dot > 0) extract = extract.substring(0, dot + 1);
    let combined = title + (extract ? (": " + extract) : "");
    els.wikiFeaturedHeader.textContent = _("Article of the day");
    els.wikiFeatured.textContent = wrapText(combined, 48);
    show(els.wikiFeaturedHeader, true);
    show(els.wikiFeatured, true);
}

/** Run every render<Section> function for a full refresh (mirrors desklet._refresh). */
export function renderAll(els, state, data, now) {
    renderSearchBox(els, state);
    renderDate(els, state, now);
    renderTime(els, state, now);
    renderProgress(els, state, now);
    renderTraditional(els, state, now);
    renderFolkday(els, state, data.folkdayData, now);
    renderHoliday(els, state, data.holidayData, now);
    renderMoon(els, state, now);
    renderMoonTimes(els, state, now);
    renderSun(els, state, now);
    renderZodiac(els, state, now);
    renderSolstice(els, state, now);
    renderNamedays(els, state, data.namedayData, now);
    renderAltCal(els, state, now);
    renderWikiOnThisDay(els, state, data.wikiOnThisDay, data.wikiRotateStep || 0);
    renderWikiFeatured(els, state, data.wikiFeatured);
}

// ══════════════════════════════════════════════════════════════════════
// Theme mode (light / dark / auto) and background-style application
//
// Both are driven by settings/schema.js keys ("theme-mode",
// "background-style" + its paired "background-color" /
// "background-gradient" / "background-image-url") and applied here so the
// logic is written and tested once, exactly like every render<Section>
// function above.
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// Icon size ("icon-size" setting) — small/medium/large, applied as a CSS
// custom property on the widget's own container element so newtab.css's
// #cal-moon-icon and .calendarium-zodiac-icon selectors (and anything
// else that wants icon-sized symbols later) can just read var(--cal-icon-size)
// instead of every render function knowing about the setting directly.
// ══════════════════════════════════════════════════════════════════════

const ICON_SIZES_PX = { small: "14px", medium: "20px", large: "30px" };

/** Set --cal-icon-size on `el` (normally the #calendarium-container element) from the "icon-size" setting. */
export function applyIconSize(el, state) {
    if (!el) return;
    let size = (state && state["icon-size"]) || "medium";
    el.style.setProperty("--cal-icon-size", ICON_SIZES_PX[size] || ICON_SIZES_PX.medium);
}

// ══════════════════════════════════════════════════════════════════════
// Panel opacity ("bg-opacity" setting) — NOT the same thing as
// "background-style" (which paints document.body / the whole page). This
// is the older, distinct desklet setting: a semi-transparent panel color
// applied only to the widget's own content wrapper (#calendarium-container),
// so the date/time/moon/etc. text stays legible regardless of whatever the
// page-level background underneath happens to be. 0 = fully transparent
// (default, current look), 1 = a fully opaque panel.
// ══════════════════════════════════════════════════════════════════════

function prefersDarkColorScheme() {
    try {
        if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
            return !!window.matchMedia("(prefers-color-scheme: dark)").matches;
        }
    } catch (_e) { /* ignore — e.g. jsdom without matchMedia support */ }
    return false;
}

/**
 * Resolve whether the *effective* palette is dark, mirroring applyThemeMode's
 * own auto/light/dark cascade — used only to pick a light-vs-dark-aware
 * panel color for applyPanelOpacity, so the bg-opacity panel reads
 * reasonably against either palette instead of always being black (which
 * would fight a light theme's page background/text colors).
 */
export function isEffectiveDarkTheme(state) {
    let mode = state && state["theme-mode"];
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return prefersDarkColorScheme();
}

/**
 * Apply "bg-opacity" to `el` (normally the #calendarium-container element,
 * never document.body/the viewport — see the module doc comment above).
 * Uses rgba(0,0,0,opacity) against an effectively-dark palette or
 * rgba(255,255,255,opacity) against an effectively-light one, so the panel
 * darkens/lightens the same direction the surrounding page already leans,
 * rather than always defaulting to the original desklet's hardcoded black
 * (which read fine against the desklet's own always-dark corner widget,
 * but would look wrong pinned under light-theme text here).
 */
export function applyPanelOpacity(el, state) {
    if (!el) return;
    let raw = state && state["bg-opacity"];
    let opacity = typeof raw === "number" ? raw : parseFloat(raw);
    if (!Number.isFinite(opacity)) opacity = 0;
    opacity = Math.max(0, Math.min(1, opacity));
    if (opacity <= 0) {
        el.style.backgroundColor = "";
        return;
    }
    let rgb = isEffectiveDarkTheme(state) ? "0, 0, 0" : "255, 255, 255";
    el.style.backgroundColor = "rgba(" + rgb + ", " + opacity + ")";
}

/**
 * Set (or clear) `data-theme` on `root` (normally `document.documentElement`)
 * from the "theme-mode" setting.
 *
 * Cascade, by design:
 *   - "auto" (default): no `data-theme` attribute is set at all, so the
 *     CSS `@media (prefers-color-scheme: dark)` block — guarded with
 *     `:root:not([data-theme="light"])` — is the only thing deciding the
 *     palette, i.e. the OS/browser preference wins.
 *   - "light" / "dark": `data-theme` is set explicitly. newtab.css then
 *     keys its dark-mode custom-property overrides off
 *     `:root[data-theme="dark"]` in addition to the prefers-color-scheme
 *     media query, and guards that media query with `:not([data-theme="light"])`
 *     — so an explicit choice always wins over the OS preference in both
 *     directions (forced light on a dark OS, forced dark on a light OS).
 */
export function applyThemeMode(root, state) {
    if (!root) return;
    let mode = state && state["theme-mode"];
    if (mode === "light" || mode === "dark") {
        root.setAttribute("data-theme", mode);
    } else {
        root.removeAttribute("data-theme");
    }
}

const BACKGROUND_STYLES = ["theme-default", "solid-color", "gradient", "custom-image-url", "firefox-theme"];
const VALID_GRADIENTS = new Set(Object.values(BACKGROUND_GRADIENT_OPTIONS));
const GRADIENT_ORDER = Object.values(BACKGROUND_GRADIENT_OPTIONS);

/** Very small allowlist: only http(s) and data:image/* URLs may ever reach a CSS background-image. */
function isSafeBackgroundImageUrl(url) {
    if (!url || typeof url !== "string") return false;
    let trimmed = url.trim();
    if (/^https?:\/\/\S+$/i.test(trimmed)) return true;
    if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(trimmed)) return true;
    return false;
}

/**
 * Parse the (possibly multi-line) "background-image-url" setting into a
 * list of individually-validated URLs — one per non-blank line. Invalid
 * lines are skipped individually (never rejects the whole list), matching
 * the field's tooltip in settings/schema.js.
 */
export function parseImageUrlList(raw) {
    if (!raw || typeof raw !== "string") return [];
    return raw.split("\n")
        .map((line) => line.trim())
        .filter((line) => isSafeBackgroundImageUrl(line));
}

/**
 * Apply the "background-style" setting (and its paired color/gradient/url
 * setting) to `el` (normally `document.body` on the New Tab / homepage /
 * full-view pages — the toolbar popup intentionally never calls this, see
 * popup.js, so its background always just follows the plain theme
 * palette from applyThemeMode/newtab.css).
 *
 * `rotateStep` (default 0) selects which candidate to show when
 * "background-rotate" is enabled: for "gradient" it indexes into
 * BACKGROUND_GRADIENT_OPTIONS' value order; for "custom-image-url" it
 * indexes into the parsed multi-line URL list (parseImageUrlList). This
 * function stays a pure, synchronous, single-shot "paint the current
 * step" operation — the actual timer that increments rotateStep over time
 * lives in newtab.js (see scheduleBackgroundRotation there), exactly like
 * every other tick-driven concern (clock, Wikipedia rotation) is kept out
 * of this module.
 *
 * "firefox-theme" only toggles the CSS class here — its actual colors/
 * image come from `browser.theme.getCurrent()`, an async API, so they're
 * applied separately by applyFirefoxThemeBackground() (see below).
 *
 * Only ever reaches the DOM via `el.classList` and `el.style.*` property
 * assignment (CSSOM), never `innerHTML`/`eval` — see isSafeBackgroundImageUrl
 * for the custom-image-url allowlist.
 */
export function applyBackground(el, state, rotateStep = 0) {
    if (!el) return;
    let style = (state && state["background-style"]) || "theme-default";
    if (BACKGROUND_STYLES.indexOf(style) === -1) style = "theme-default";

    for (let s of BACKGROUND_STYLES) el.classList.remove("calendarium-bg-" + s);
    for (let g of VALID_GRADIENTS) el.classList.remove("calendarium-bg-gradient-" + g);
    el.classList.add("calendarium-bg-" + style);

    el.style.backgroundColor = "";
    el.style.backgroundImage = "";

    if (style === "solid-color") {
        let color = (state && state["background-color"]) || "#1b1b1f";
        if (/^#[0-9a-fA-F]{3,8}$/.test(color)) el.style.backgroundColor = color;
    } else if (style === "gradient") {
        let name = (state && state["background-gradient"]) || "sunset";
        if (state && state["background-rotate"] && GRADIENT_ORDER.length > 0) {
            name = GRADIENT_ORDER[Math.abs(rotateStep || 0) % GRADIENT_ORDER.length];
        }
        if (!VALID_GRADIENTS.has(name)) name = "sunset";
        el.classList.add("calendarium-bg-gradient-" + name);
    } else if (style === "custom-image-url") {
        let urls = parseImageUrlList(state && state["background-image-url"]);
        let url = null;
        if (urls.length > 0) {
            url = (state && state["background-rotate"] && urls.length > 1)
                ? urls[Math.abs(rotateStep || 0) % urls.length]
                : urls[0];
        }
        if (url) el.style.backgroundImage = "url(" + JSON.stringify(url) + ")";
    }
    // "firefox-theme": nothing more to do here — see applyFirefoxThemeBackground().
}

// ══════════════════════════════════════════════════════════════════════
// "firefox-theme" background-style — reads the ACTIVE, INSTALLED Firefox
// Theme's colors/background image via browser.theme.getCurrent(), a real,
// documented WebExtension API (https://developer.mozilla.org/docs/Mozilla/
// Add-ons/WebExtensions/API/theme). This is genuinely different from, and
// NOT the same subsystem as, the built-in New Tab page's own
// Activity-Stream wallpaper picker — that one has no public WebExtension
// API and cannot be read or set by an extension (see applyBackground's
// doc comment / README's Background section for that distinction). Do not
// conflate the two: "Firefox Themes" (browser.theme) are the things
// installed from addons.mozilla.org/themes and switchable under
// about:addons > Themes; the New Tab wallpaper picker is a separate,
// inaccessible, built-in feature of about:newtab itself.
// ══════════════════════════════════════════════════════════════════════

/** Coerce a ThemeColor (CSS string, or [r,g,b]/[r,g,b,a] array) into a CSS color string, or null. */
function normalizeThemeColor(c) {
    if (!c) return null;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
        if (c.length === 4) return "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + c[3] + ")";
        if (c.length === 3) return "rgb(" + c[0] + ", " + c[1] + ", " + c[2] + ")";
    }
    return null;
}

const THEME_COLOR_KEYS = ["ntp_background", "frame", "toolbar"];

/**
 * Apply the active Firefox Theme's colors/background image to `el`
 * (normally `document.body`). Guarded exactly like background.js's
 * ensureMenu() guards `browser.menus`: feature-detect `browser.theme`
 * before calling it, and never let a throw/rejection here break the rest
 * of rendering. Degrades gracefully in every case —
 *   - `browser.theme` unavailable (e.g. Firefox for Android): no-op,
 *     leaving the `calendarium-bg-firefox-theme` CSS class (which simply
 *     resolves to var(--cal-page-bg), i.e. the same as theme-default) as
 *     the only thing in effect.
 *   - `browser.theme.getCurrent()` throws/rejects: same fallback.
 *   - the active theme has no useful `colors`/`images` (e.g. Firefox's own
 *     default theme): same fallback — no inline color/image is set, so
 *     the CSS class's theme-default-equivalent background shows through.
 */
export async function applyFirefoxThemeBackground(el) {
    if (!el) return;
    el.style.backgroundColor = "";
    el.style.backgroundImage = "";
    if (typeof browser === "undefined" || !browser.theme || !browser.theme.getCurrent) return;
    try {
        let theme = await browser.theme.getCurrent();
        let colors = theme && theme.colors;
        if (colors) {
            for (let key of THEME_COLOR_KEYS) {
                let css = normalizeThemeColor(colors[key]);
                if (css) { el.style.backgroundColor = css; break; }
            }
        }
        let images = theme && theme.images;
        let img = images && (images.theme_frame ||
            (Array.isArray(images.additional_backgrounds) && images.additional_backgrounds[0]));
        if (img) {
            el.style.backgroundImage = "url(" + JSON.stringify(img) + ")";
            el.style.backgroundSize = "cover";
            el.style.backgroundPosition = "center";
        }
    } catch (_e) {
        el.style.backgroundColor = "";
        el.style.backgroundImage = "";
    }
}

// ══════════════════════════════════════════════════════════════════════
// Search box wiring — shared by every entry point that renders
// `cal-search-form`. Submitting dispatches the typed query to the user's
// configured default search engine via `browser.search.search()` (the
// "search" permission), rather than reimplementing a search UI.
// ══════════════════════════════════════════════════════════════════════

/**
 * Submit `query` to the user's default search engine.
 * `resolveTabId` is an optional async function returning the tab id the
 * search results should open in (each entry point resolves "the current
 * tab" differently — see newtab.js / popup.js). Silently no-ops if the
 * `browser.search` API or permission is unavailable.
 */
export async function submitSearch(query, resolveTabId) {
    if (!query || !query.trim()) return;
    if (typeof browser === "undefined" || !browser.search || !browser.search.search) return;
    let searchOptions = { query: query.trim() };
    try {
        let tabId = resolveTabId ? await resolveTabId() : null;
        if (tabId !== null && tabId !== undefined) searchOptions.tabId = tabId;
    } catch (_e) { /* ignore — fall back to searching without an explicit tabId */ }
    try {
        await browser.search.search(searchOptions);
    } catch (_e) { /* ignore — e.g. permission not yet granted */ }
}

/** Wire up els.searchForm's submit event to call submitSearch and clear the input. */
export function initSearchBox(els, resolveTabId) {
    if (!els.searchForm || !els.searchInput) return;
    els.searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        let query = els.searchInput.value;
        els.searchInput.value = "";
        submitSearch(query, resolveTabId);
    });
}
