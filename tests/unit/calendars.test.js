import { describe, it, expect } from "vitest";
import { Calendars } from "../../src/lib/calendars.js";

describe("Calendars.toJulian", () => {
    it("lags 13 days behind the Gregorian calendar in the 2020s", () => {
        // Well-established calendrical constant for 1900-03-01..2100-02-28:
        // Julian calendar date = Gregorian date minus 13 days.
        let j = Calendars.toJulian(2026, 3, 14);
        expect(j).toEqual({ year: 2026, month: 3, day: 1 });
    });

    it("handles a month rollover correctly", () => {
        let j = Calendars.toJulian(2026, 2, 5); // Feb 5 - 13d = Jan 23
        expect(j).toEqual({ year: 2026, month: 1, day: 23 });
    });

    it("handles a year rollover correctly", () => {
        let j = Calendars.toJulian(2026, 1, 10); // Jan 10 - 13d = Dec 28, 2025
        expect(j).toEqual({ year: 2025, month: 12, day: 28 });
    });

    it("formatJulian appends the O.S. suffix", () => {
        expect(Calendars.formatJulian(2026, 3, 14)).toMatch(/O\.S\.$/);
    });
});

describe("Calendars Hebrew / Islamic / Persian conversions — structural invariants", () => {
    it("toHebrew returns a plausible month (1-13) and positive day", () => {
        for (let m = 1; m <= 12; m++) {
            let h = Calendars.toHebrew(2026, m, 15);
            expect(h.month).toBeGreaterThanOrEqual(1);
            expect(h.month).toBeLessThanOrEqual(13);
            expect(h.day).toBeGreaterThanOrEqual(1);
            expect(h.day).toBeLessThanOrEqual(30);
        }
    });

    it("toIslamic returns a plausible month (1-12) and day (1-30)", () => {
        for (let m = 1; m <= 12; m++) {
            let i = Calendars.toIslamic(2026, m, 15);
            expect(i.month).toBeGreaterThanOrEqual(1);
            expect(i.month).toBeLessThanOrEqual(12);
            expect(i.day).toBeGreaterThanOrEqual(1);
            expect(i.day).toBeLessThanOrEqual(30);
        }
    });

    it("toPersian returns a plausible month (1-12) and day (1-31)", () => {
        for (let m = 1; m <= 12; m++) {
            let p = Calendars.toPersian(2026, m, 15);
            expect(p.month).toBeGreaterThanOrEqual(1);
            expect(p.month).toBeLessThanOrEqual(12);
            expect(p.day).toBeGreaterThanOrEqual(1);
            expect(p.day).toBeLessThanOrEqual(31);
        }
    });

    it("consecutive Gregorian days advance the Islamic day by exactly 1 (mod month length)", () => {
        let d1 = Calendars.toIslamic(2026, 6, 14);
        let d2 = Calendars.toIslamic(2026, 6, 15);
        if (d1.month === d2.month) {
            expect(d2.day).toBe(d1.day + 1);
        } else {
            expect(d2.day).toBe(1);
        }
    });

    it("Hebrew and Islamic years are far larger than the Gregorian year (different epochs)", () => {
        expect(Calendars.toHebrew(2026, 6, 1).year).toBeGreaterThan(5000);
        expect(Calendars.toIslamic(2026, 6, 1).year).toBeGreaterThan(1300);
        expect(Calendars.toIslamic(2026, 6, 1).year).toBeLessThan(1600);
    });

    it("formatHebrew/formatIslamic/formatPersian all produce non-empty strings", () => {
        expect(Calendars.formatHebrew(2026, 6, 1).length).toBeGreaterThan(0);
        expect(Calendars.formatIslamic(2026, 6, 1).length).toBeGreaterThan(0);
        expect(Calendars.formatPersian(2026, 6, 1).length).toBeGreaterThan(0);
    });
});
