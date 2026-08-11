import { describe, it, expect, beforeEach, vi } from "vitest";
import { Holidays } from "../../src/lib/holidays.js";

const SAMPLE = {
    fixed: {
        "01-01": { name: "New Year", public: true },
        "12-25": { name: "Christmas", public: true }
    },
    easter: [
        { offset: 0, name: "Easter Sunday", public: true },
        { offset: 1, name: "Easter Monday", public: true }
    ],
    periods: [
        {
            name: "Advent",
            public: false,
            start: { type: "advent", offset: 0 },
            end:   { type: "fixed", month: 12, day: 24 }
        },
        {
            name: "Summer break",
            public: false,
            start: { type: "fixed", month: 6, day: 15 },
            end:   { type: "fixed", month: 8, day: 31 }
        }
    ]
};

describe("Holidays.getHolidayForDate", () => {
    it("finds a fixed holiday", () => {
        let h = Holidays.getHolidayForDate(SAMPLE, new Date(2026, 0, 1));
        expect(h).toEqual({ name: "New Year", public: true });
    });

    it("finds an Easter-relative holiday for the correct year", () => {
        // Easter Sunday 2026 = April 5, 2026 (Gregorian, Meeus/Jones/Butcher).
        let h = Holidays.getHolidayForDate(SAMPLE, new Date(2026, 3, 5));
        expect(h).toEqual({ name: "Easter Sunday", public: true });
        let hMon = Holidays.getHolidayForDate(SAMPLE, new Date(2026, 3, 6));
        expect(hMon).toEqual({ name: "Easter Monday", public: true });
    });

    it("returns null for a day with no holiday", () => {
        expect(Holidays.getHolidayForDate(SAMPLE, new Date(2026, 2, 3))).toBeNull();
    });

    it("returns null when data is null", () => {
        expect(Holidays.getHolidayForDate(null, new Date())).toBeNull();
    });
});

describe("Holidays.getHolidaysRange", () => {
    it("returns only the days that have holidays, in date order", () => {
        let range = Holidays.getHolidaysRange(SAMPLE, new Date(2025, 11, 24), 8);
        // Dec 24..Jan 1: only Dec 25 and Jan 1 have holidays.
        expect(range.map((r) => r.name)).toEqual(["Christmas", "New Year"]);
    });

    it("includes today (day 0) when it has a holiday", () => {
        let range = Holidays.getHolidaysRange(SAMPLE, new Date(2026, 0, 1), 0);
        expect(range.length).toBe(1);
        expect(range[0].name).toBe("New Year");
    });
});

describe("Holidays.getPeriodsForDate", () => {
    it("returns an active fixed-range period with correct daysLeft", () => {
        let periods = Holidays.getPeriodsForDate(SAMPLE, new Date(2026, 6, 1)); // July 1
        expect(periods.length).toBe(1);
        expect(periods[0].name).toBe("Summer break");
        expect(periods[0].daysLeft).toBeGreaterThan(0);
    });

    it("returns [] when no period is active", () => {
        let periods = Holidays.getPeriodsForDate(SAMPLE, new Date(2026, 1, 1)); // Feb 1
        expect(periods).toEqual([]);
    });

    it("resolves an advent-type period start", () => {
        // Advent1 2026 is the 4th Sunday before Dec 25, 2026 (Nov 29, 2026).
        let periods = Holidays.getPeriodsForDate(SAMPLE, new Date(2026, 11, 1));
        expect(periods.some((p) => p.name === "Advent")).toBe(true);
    });
});

describe("Holidays.getUpcomingPeriods", () => {
    it("only includes periods that have not started yet, sorted by daysUntil", () => {
        let upcoming = Holidays.getUpcomingPeriods(SAMPLE, new Date(2026, 4, 1), 60); // May 1
        expect(upcoming.length).toBeGreaterThan(0);
        expect(upcoming[0].name).toBe("Summer break");
        for (let i = 1; i < upcoming.length; i++) {
            expect(upcoming[i].daysUntil).toBeGreaterThanOrEqual(upcoming[i - 1].daysUntil);
        }
    });

    it("returns [] when lookaheadDays is 0", () => {
        expect(Holidays.getUpcomingPeriods(SAMPLE, new Date(2026, 4, 1), 0)).toEqual([]);
    });
});

describe("Holidays.loadData (fetch/browser.runtime.getURL plumbing)", () => {
    beforeEach(() => {
        global.browser = { runtime: { getURL: (p) => "moz-extension://x/" + p } };
        global.fetch = vi.fn(() => Promise.resolve({
            ok: true, json: () => Promise.resolve(SAMPLE)
        }));
    });

    it("fetches from the extension-relative data URL and resolves the parsed JSON", async () => {
        let data = await Holidays.loadData("data/holidays", "hu");
        expect(global.fetch).toHaveBeenCalledWith("moz-extension://x/data/holidays/hu.json");
        expect(data).toEqual(SAMPLE);
    });

    it("resolves null for locale 'auto' without fetching", async () => {
        let data = await Holidays.loadData("data/holidays", "auto");
        expect(data).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("resolves null and does not throw on HTTP error", async () => {
        global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
        let data = await Holidays.loadData("data/holidays", "zz");
        expect(data).toBeNull();
    });

    it("supports the optional Node-style callback in addition to the returned Promise", async () => {
        await new Promise((resolve) => {
            Holidays.loadData("data/holidays", "hu", (data) => {
                expect(data).toEqual(SAMPLE);
                resolve();
            });
        });
    });
});
