// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    getEls, renderDate, renderTime, renderProgress, renderTraditional,
    renderFolkday, renderHoliday, renderMoon,
    renderZodiac, renderNamedays, renderAltCal,
    renderWikiOnThisDay, renderWikiFeatured, renderAll,
    strftime, getISOWeek, wrapText, formatTzOffset, resolveLocale
} from "../../src/newtab.js";
import { DEFAULTS } from "../../src/settings/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(path.resolve(__dirname, "../../src/newtab.html"), "utf8");

function freshDom() {
    let bodyMatch = HTML.match(/<body>([\s\S]*)<\/body>/);
    document.body.innerHTML = bodyMatch[1];
    return getEls(document);
}

function baseState(overrides = {}) {
    return Object.assign({}, DEFAULTS, overrides);
}

const NOW = new Date(2026, 5, 15, 10, 30, 0); // June 15, 2026, 10:30 local

describe("small pure helpers", () => {
    it("getISOWeek returns 1 for the first ISO week of a year", () => {
        // Jan 4 is always in ISO week 1.
        expect(getISOWeek(new Date(2026, 0, 4))).toBe(1);
    });

    it("wrapText never produces a line longer than maxCols unless a single word exceeds it", () => {
        let text = "the quick brown fox jumps over the lazy dog again and again";
        let wrapped = wrapText(text, 20);
        for (let line of wrapped.split("\n")) {
            expect(line.length).toBeLessThanOrEqual(20);
        }
    });

    it("formatTzOffset formats positive/negative/half-hour offsets", () => {
        expect(formatTzOffset(1)).toBe("UTC+1");
        expect(formatTzOffset(-5)).toBe("UTC-5");
        expect(formatTzOffset(5.5)).toBe("UTC+5:30");
        expect(formatTzOffset(null)).toBe("");
    });

    it("resolveLocale falls back when 'auto' matches no supported language", () => {
        expect(resolveLocale("hu", ["hu", "en"], "en")).toBe("hu");
        expect(resolveLocale("auto", [], "en")).toBe("en");
    });

    it("strftime renders %Y-%m-%d correctly", () => {
        expect(strftime(new Date(2026, 5, 5), "%Y-%m-%d")).toBe("2026-06-05");
    });
});

describe("renderDate / renderTime toggle matrix", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("hides the date element when show-date is false", () => {
        renderDate(els, baseState({ "show-date": false }), NOW);
        expect(els.date.hasAttribute("hidden")).toBe(true);
    });

    it("shows a formatted date when show-date is true (preset format)", () => {
        renderDate(els, baseState({ "show-date": true, "date-format-preset": "%Y-%m-%d" }), NOW);
        expect(els.date.hasAttribute("hidden")).toBe(false);
        expect(els.date.textContent).toBe("2026-06-15");
    });

    it("uses the custom format when the preset is the 'custom' sentinel", () => {
        renderDate(els, baseState({
            "show-date": true, "date-format-preset": "custom", "date-format-custom": "%Y/%m/%d"
        }), NOW);
        expect(els.date.textContent).toBe("2026/06/15");
    });

    it("hides the time element when show-time is false", () => {
        renderTime(els, baseState({ "show-time": false }), NOW);
        expect(els.time.hasAttribute("hidden")).toBe(true);
    });

    it("shows 24h time without seconds by default", () => {
        renderTime(els, baseState({ "show-time": true }), NOW);
        expect(els.time.textContent).toBe("10:30");
    });

    it("shows 12h time with AM/PM when time-format is 12h", () => {
        renderTime(els, baseState({ "show-time": true, "time-format": "12h" }), NOW);
        expect(els.time.textContent).toBe("10:30 AM");
    });

    it("shows seconds when show-seconds is true", () => {
        renderTime(els, baseState({ "show-time": true, "show-seconds": true }), NOW);
        expect(els.time.textContent).toBe("10:30:00");
    });
});

describe("renderProgress", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("hides both progress rows when all four toggles are off", () => {
        renderProgress(els, baseState({
            "show-day-of-year": false, "show-week-number": false,
            "show-month-progress": false, "show-new-year-countdown": false
        }), NOW);
        expect(els.progressRow1.hasAttribute("hidden")).toBe(true);
        expect(els.progressRow2.hasAttribute("hidden")).toBe(true);
    });

    it("computes day-of-year text for a known date", () => {
        renderProgress(els, baseState({ "show-day-of-year": true }), new Date(2026, 0, 1));
        expect(els.dayOfYear.textContent).toBe("Day 1 of 365");
    });

    it("computes day-of-year against 366 in a leap year", () => {
        renderProgress(els, baseState({ "show-day-of-year": true }), new Date(2028, 0, 1));
        expect(els.dayOfYear.textContent).toBe("Day 1 of 366");
    });

    it("shows the New Year countdown with the configured separator", () => {
        renderProgress(els, baseState({
            "show-day-of-year": true, "show-new-year-countdown": true, "progress-separator": "|"
        }), new Date(2026, 11, 31));
        expect(els.newYear.textContent).toContain("1 days until New Year");
        expect(els.newYear.textContent.startsWith(" | ")).toBe(true);
    });
});

describe("renderTraditional", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("is hidden when show-traditional is false", () => {
        renderTraditional(els, baseState({ "show-traditional": false }), NOW);
        expect(els.traditional.hasAttribute("hidden")).toBe(true);
    });

    it("shows the Old Hungarian June name when traditional-lang is hu", () => {
        renderTraditional(els, baseState({ "show-traditional": true, "traditional-lang": "hu" }), NOW);
        expect(els.traditional.textContent).toBe("Szent Iván hava");
        expect(els.traditional.hasAttribute("hidden")).toBe(false);
    });
});

describe("renderFolkday", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("hides when disabled", () => {
        renderFolkday(els, baseState({ "show-folkdays": false }), { "06-15": "A saying" }, NOW);
        expect(els.folkday.hasAttribute("hidden")).toBe(true);
    });

    it("shows the saying for today's date when enabled and data present", () => {
        renderFolkday(els, baseState({ "show-folkdays": true }), { "06-15": "A saying" }, NOW);
        expect(els.folkday.hasAttribute("hidden")).toBe(false);
        expect(els.folkday.textContent).toBe("A saying");
    });

    it("hides when enabled but there is no saying for today", () => {
        renderFolkday(els, baseState({ "show-folkdays": true }), { "01-01": "New Year" }, NOW);
        expect(els.folkday.hasAttribute("hidden")).toBe(true);
    });
});

describe("renderHoliday", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    const HOLIDAY_DATA = { fixed: { "06-15": { name: "Test Holiday", public: true } }, easter: [] };

    it("shows a public holiday with a star prefix and 'public holiday' suffix", () => {
        renderHoliday(els, baseState({ "show-holidays": true }), HOLIDAY_DATA, NOW);
        expect(els.holiday.hasAttribute("hidden")).toBe(false);
        expect(els.holiday.textContent).toContain("Test Holiday");
        expect(els.holiday.textContent).toContain("public holiday");
        expect(els.holiday.className).toBe("calendarium-holiday-public");
    });

    it("shows 'weekend' on a Saturday even with no holiday data", () => {
        let saturday = new Date(2026, 5, 20); // June 20, 2026 is a Saturday
        renderHoliday(els, baseState({ "show-holidays": true }), { fixed: {}, easter: [] }, saturday);
        expect(els.holiday.hasAttribute("hidden")).toBe(false);
        expect(els.holiday.textContent).toContain("weekend");
    });

    it("hides on a weekday with no holiday", () => {
        let monday = new Date(2026, 5, 15); // June 15 2026 is Monday, but has our test holiday
        renderHoliday(els, baseState({ "show-holidays": true }), { fixed: {}, easter: [] }, monday);
        expect(els.holiday.hasAttribute("hidden")).toBe(true);
    });
});

describe("renderMoon", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("hides the whole row when show-moon is false", () => {
        renderMoon(els, baseState({ "show-moon": false }), NOW);
        expect(els.moonRow.hasAttribute("hidden")).toBe(true);
    });

    it("shows an icon always, and the name/age only when their toggles are on", () => {
        renderMoon(els, baseState({ "show-moon": true, "show-moon-name": false, "show-moon-age": true }), NOW);
        expect(els.moonRow.hasAttribute("hidden")).toBe(false);
        expect(els.moonIcon.textContent.length).toBeGreaterThan(0);
        expect(els.moonText.hasAttribute("hidden")).toBe(true);
        expect(els.moonAge.hasAttribute("hidden")).toBe(false);
        expect(els.moonAge.textContent).toMatch(/^· \d+\.\d days$/);
    });
});

describe("renderZodiac display modes", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("hides both parts when both are 'none'", () => {
        renderZodiac(els, baseState({ "zodiac-western-display": "none", "zodiac-chinese-display": "none" }), NOW);
        expect(els.zodiacRow.hasAttribute("hidden")).toBe(true);
    });

    it("shows icon-only for western when configured", () => {
        renderZodiac(els, baseState({ "zodiac-western-display": "icon-only", "zodiac-chinese-display": "none" }), NOW);
        expect(els.zodiacWesternIcon.hasAttribute("hidden")).toBe(false);
        expect(els.zodiacWesternText.hasAttribute("hidden")).toBe(true);
        expect(els.zodiacWesternIcon.textContent).toBe("♊"); // Gemini on June 15
    });

    it("shows text-only for chinese when configured", () => {
        renderZodiac(els, baseState({ "zodiac-western-display": "none", "zodiac-chinese-display": "text-only" }), NOW);
        expect(els.zodiacChineseIcon.hasAttribute("hidden")).toBe(true);
        expect(els.zodiacChineseText.hasAttribute("hidden")).toBe(false);
    });
});

describe("renderNamedays two-column vs one-column layout", () => {
    let els;
    let DATA;
    beforeEach(() => {
        els = freshDom();
        DATA = {
            "06-15": ["Today Person"], "06-16": ["Day1 Person"], "06-17": ["Day2 Person"],
            "06-18": ["Day3 Person"], "06-19": ["Day4 Person"]
        };
    });

    it("shows today's names with the 'Name days' prefix", () => {
        renderNamedays(els, baseState({ "show-namedays": true, "nameday-lookahead": 4 }), DATA, NOW);
        expect(els.namedayToday.textContent).toBe("Name days: Today Person");
    });

    it("packs two lookahead days per row when nameday-two-columns is true", () => {
        renderNamedays(els, baseState({
            "show-namedays": true, "nameday-lookahead": 4, "nameday-two-columns": true
        }), DATA, NOW);
        let firstRow = els.namedayFuture.querySelector(".calendarium-nameday-row");
        expect(firstRow.hasAttribute("hidden")).toBe(false);
        expect(firstRow.children[0].textContent).toContain("Day1 Person");
        expect(firstRow.children[1].textContent).toContain("Day2 Person");
    });

    it("puts one lookahead day per row when nameday-two-columns is false", () => {
        renderNamedays(els, baseState({
            "show-namedays": true, "nameday-lookahead": 4, "nameday-two-columns": false
        }), DATA, NOW);
        let firstRow = els.namedayFuture.querySelector(".calendarium-nameday-row");
        expect(firstRow.children[0].textContent).toContain("Day1 Person");
        expect(firstRow.children[1].hasAttribute("hidden")).toBe(true);
    });

    it("hides all rows when show-namedays is false", () => {
        renderNamedays(els, baseState({ "show-namedays": false }), DATA, NOW);
        expect(els.namedayToday.hasAttribute("hidden")).toBe(true);
        for (let row of els.namedayFuture.querySelectorAll(".calendarium-nameday-row")) {
            expect(row.hasAttribute("hidden")).toBe(true);
        }
    });
});

describe("renderAltCal", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("is hidden when no alternate calendar toggle is on", () => {
        renderAltCal(els, baseState(), NOW);
        expect(els.altcal.hasAttribute("hidden")).toBe(true);
    });

    it("shows one line per enabled calendar", () => {
        renderAltCal(els, baseState({ "show-julian": true, "show-hebrew": true }), NOW);
        expect(els.altcal.hasAttribute("hidden")).toBe(false);
        expect(els.altcal.textContent.split("\n").length).toBe(2);
        expect(els.altcal.textContent).toContain("Julian date");
        expect(els.altcal.textContent).toContain("Hebrew date");
    });
});

describe("renderWikiOnThisDay / renderWikiFeatured", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("hides everything when show-wikipedia is false, even with data present", () => {
        renderWikiOnThisDay(els, baseState({ "show-wikipedia": false }), { births: [{ year: 1900, pages: [{ normalizedtitle: "X" }] }] }, 0);
        expect(els.wikiBirthsHeader.hasAttribute("hidden")).toBe(true);
        expect(els.wikiBirths.hasAttribute("hidden")).toBe(true);
    });

    it("shows births when enabled and data present", () => {
        renderWikiOnThisDay(els, baseState({ "show-wikipedia": true, "show-wiki-births": true }),
            { births: [{ year: 1900, pages: [{ normalizedtitle: "Someone Notable" }] }], deaths: [], events: [] }, 0);
        expect(els.wikiBirthsHeader.hasAttribute("hidden")).toBe(false);
        expect(els.wikiBirths.textContent).toContain("1900: Someone Notable");
    });

    it("renders the featured article header + wrapped extract", () => {
        renderWikiFeatured(els, baseState({ "show-wikipedia": true, "show-wiki-featured": true }), {
            tfa: { normalizedtitle: "Big Topic", extract: "First sentence. Second sentence." }
        });
        expect(els.wikiFeaturedHeader.hasAttribute("hidden")).toBe(false);
        expect(els.wikiFeatured.textContent).toContain("Big Topic: First sentence.");
    });

    it("stays hidden for featured when show-wiki-featured is off", () => {
        renderWikiFeatured(els, baseState({ "show-wikipedia": true, "show-wiki-featured": false }), {
            tfa: { normalizedtitle: "Big Topic", extract: "Text." }
        });
        expect(els.wikiFeatured.hasAttribute("hidden")).toBe(true);
    });
});

describe("renderAll (full-refresh smoke test)", () => {
    it("runs every section renderer without throwing, for default settings", () => {
        let els = freshDom();
        expect(() => renderAll(els, baseState(), {
            namedayData: null, folkdayData: null, holidayData: null,
            wikiOnThisDay: null, wikiFeatured: null, wikiRotateStep: 0
        }, NOW)).not.toThrow();
    });

    it("runs without throwing when every section is enabled", () => {
        let els = freshDom();
        let allOn = baseState();
        for (let key of Object.keys(allOn)) {
            if (key.startsWith("show-")) allOn[key] = true;
        }
        expect(() => renderAll(els, allOn, {
            namedayData: { "06-15": ["A"] },
            folkdayData: { "06-15": "Saying" },
            holidayData: { fixed: { "06-15": { name: "H", public: true } }, easter: [], periods: [] },
            wikiOnThisDay: { births: [], deaths: [], events: [] },
            wikiFeatured: { tfa: { normalizedtitle: "T", extract: "E." } },
            wikiRotateStep: 3
        }, NOW)).not.toThrow();
    });
});
