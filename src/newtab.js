/*
 * newtab.js — New Tab page renderer for the Calendarium extension.
 *
 * Re-implements every `_update*` method of the calendarium@kami911 Cinnamon
 * desklet (desklet.js) as a pure `render<Section>(els, state, ...)` function
 * operating on plain DOM nodes declared in newtab.html, instead of
 * GJS/St/Clutter actors. Tick orchestration mirrors the original: a full
 * refresh every 60s, a 1s sub-tick only when seconds or city time are
 * shown, and a Wikipedia rotation counter advanced on the same cadence.
 *
 * All render functions are exported and side-effect-free beyond mutating
 * the DOM nodes they are given, so tests/unit/newtab-render.test.js can
 * exercise them directly with jsdom fixtures and a fixed Date/state,
 * without booting the extension runtime.
 */

import { Moon } from "./lib/moon.js";
import { Sun } from "./lib/sun.js";
import { Zodiac } from "./lib/zodiac.js";
import { Localization } from "./lib/localization.js";
import { Namedays } from "./lib/namedays.js";
import { Folkdays } from "./lib/folkdays.js";
import { Holidays } from "./lib/holidays.js";
import { Wikipedia } from "./lib/wikipedia.js";
import { Solstice } from "./lib/solstice.js";
import { Calendars } from "./lib/calendars.js";
import { _, slug } from "./lib/i18n.js";
import { DEFAULTS } from "./settings/schema.js";

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

/** Query all element refs newtab.html declares, from the given root (default document). */
export function getEls(root = document) {
    let q = (id) => root.getElementById ? root.getElementById(id) : root.querySelector("#" + id);
    return {
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
// Orchestration (only runs inside the real extension — guarded so the
// module stays import-safe under jsdom/vitest with no `browser` global).
// ══════════════════════════════════════════════════════════════════════

async function loadSettings() {
    let stored = (typeof browser !== "undefined") ? await browser.storage.local.get(null) : {};
    return Object.assign({}, DEFAULTS, stored);
}

async function loadLocaleData(state) {
    let ndLang = resolveLocale(state["nameday-locale"], ["hu", "de", "en", "fr", "es", "it"], "en");
    let fdLang = resolveLocale(state["folkday-locale"], ["hu", "de", "en", "fr", "es", "it"], "hu");
    let hlLang = resolveLocale(state["holiday-locale"], ["hu", "de", "en", "fr", "es", "it"], "hu");
    let [namedayData, folkdayData, holidayData] = await Promise.all([
        Namedays.loadData("data/namedays", ndLang),
        Folkdays.loadData("data/folkdays", fdLang),
        Holidays.loadData("data/holidays", hlLang)
    ]);
    return { namedayData, folkdayData, holidayData };
}

function initApp() {
    let els = getEls(document);
    let data = { namedayData: null, folkdayData: null, holidayData: null, wikiOnThisDay: null, wikiFeatured: null, wikiRotateStep: 0 };
    let state = Object.assign({}, DEFAULTS);
    let fullTimer = null;
    let clockTimer = null;

    function scheduleClock() {
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
        if ((state["show-time"] && state["show-seconds"]) || state["show-city-time"]) {
            clockTimer = setInterval(() => {
                let now = new Date();
                renderTime(els, state, now);
                renderCityTimes(els, state);
            }, 1000);
        }
    }

    async function scheduleWikipedia(now) {
        if (!state["show-wikipedia"]) {
            data.wikiOnThisDay = null;
            data.wikiFeatured = null;
            renderWikiOnThisDay(els, state, null, 0);
            renderWikiFeatured(els, state, null);
            return;
        }
        let hasPerm = false;
        try {
            hasPerm = await browser.permissions.contains({ origins: ["https://api.wikimedia.org/*"] });
        } catch (_e) { /* ignore */ }
        if (!hasPerm) return;

        let m = now.getMonth() + 1, d = now.getDate(), y = now.getFullYear();
        let lang = resolveLocale(state["wikipedia-lang"], ["en", "de", "hu", "fr", "es", "it"], "en");
        Wikipedia.CACHE_TTL_SECS = (state["wikipedia-cache-hours"] || 12) * 3600;

        if (data.wikiOnThisDay) renderWikiOnThisDay(els, state, data.wikiOnThisDay, data.wikiRotateStep);

        if (state["show-wiki-births"] || state["show-wiki-deaths"] || state["show-wiki-events"]) {
            Wikipedia.fetchOnThisDay(m, d, lang, (result) => {
                if (!result) return;
                data.wikiOnThisDay = result;
                renderWikiOnThisDay(els, state, data.wikiOnThisDay, data.wikiRotateStep);
            });
        }
        if (state["show-wiki-featured"]) {
            Wikipedia.fetchFeatured(y, m, d, lang, (result) => {
                data.wikiFeatured = result;
                renderWikiFeatured(els, state, data.wikiFeatured);
            });
        }
    }

    async function refresh() {
        if (fullTimer) { clearTimeout(fullTimer); fullTimer = null; }
        let now = new Date();
        renderAll(els, state, data, now);
        data.wikiRotateStep = (data.wikiRotateStep || 0) + 1;
        scheduleWikipedia(now);
        fullTimer = setTimeout(refresh, 60000);
        scheduleClock();
    }

    async function reload() {
        state = await loadSettings();
        data = Object.assign(data, await loadLocaleData(state));
        data.wikiRotateStep = 0;
        data.wikiOnThisDay = null;
        refresh();
    }

    if (typeof browser !== "undefined" && browser.storage) {
        browser.storage.onChanged.addListener(() => reload());
    }

    reload();
}

if (typeof document !== "undefined" && typeof browser !== "undefined" && browser.runtime && browser.runtime.id) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
    } else {
        initApp();
    }
}
