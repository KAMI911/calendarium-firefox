import { describe, it, expect } from "vitest";
import { Calendars } from "../../src/lib/calendars.js";
import { Solstice } from "../../src/lib/solstice.js";

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

describe("Calendars.toFrenchRepublican — equinox-based (not arithmetic) conversion", () => {
    it("the historical epoch (22 September 1792) is 1 Vendémiaire, an 1", () => {
        let r = Calendars.toFrenchRepublican(1792, 9, 22);
        expect(r).toEqual({ year: 1, month: 1, day: 1, sansculottide: -1 });
        expect(Calendars.formatFrenchRepublican(1792, 9, 22)).toBe("1 Vendémiaire, an 1");
    });

    it("a date shortly before the autumn equinox falls in the previous Republican year's cycle", () => {
        // The 2025 autumn equinox falls on 22 Sept 2025; 20 Sept 2025 hasn't
        // reached it yet, so it must still belong to the cycle that began at
        // the 2024 equinox (an 233), not the 2025 one (an 234).
        let before = Calendars.toFrenchRepublican(2025, 9, 20);
        let after  = Calendars.toFrenchRepublican(2025, 9, 24);
        expect(before.year).toBe(after.year - 1);
    });

    it("handles a Sansculottide (intercalary) day distinctly from a month day", () => {
        // 18 Sept 1795 is the 2nd Sansculottide of an 3, in the sextile
        // (366-day) cycle that runs from the 1794 to the 1795 autumn
        // equinox — see the leap-year test below for how this was found.
        let r = Calendars.toFrenchRepublican(1795, 9, 18);
        expect(r.sansculottide).toBe(1);
        expect(r.month).toBe(0);
        expect(Calendars.formatFrenchRepublican(1795, 9, 18)).toBe("Jour du Génie, an 3");
    });

    it("a real 366-day (sextile) equinox-to-equinox gap produces a 6th Sansculottide day", () => {
        // Computed directly from Solstice.getForYear(): the autumn equinox
        // of 1794 to the autumn equinox of 1795 spans 366 real calendar
        // days (confirmed via Solstice.getForYear(1794).autumn and
        // Solstice.getForYear(1795).autumn), so an 3 (1794-1795) is a
        // sextile year with 6 intercalary days instead of the usual 5.
        let a1794 = Solstice.getForYear(1794).autumn;
        let a1795 = Solstice.getForYear(1795).autumn;
        let m1 = new Date(a1794.getFullYear(), a1794.getMonth(), a1794.getDate());
        let m2 = new Date(a1795.getFullYear(), a1795.getMonth(), a1795.getDate());
        let gapDays = Math.round((m2.getTime() - m1.getTime()) / 86400000);
        expect(gapDays).toBe(366);

        // 22 September 1795 is the 6th and last Sansculottide of that
        // sextile year: "Jour de la Révolution".
        let r = Calendars.toFrenchRepublican(1795, 9, 22);
        expect(r).toEqual({ year: 3, month: 0, day: 0, sansculottide: 5 });
        expect(Calendars.formatFrenchRepublican(1795, 9, 22)).toBe("Jour de la Révolution, an 3");

        // The following day rolls over into the next Republican year, 1 Vendémiaire.
        let next = Calendars.toFrenchRepublican(1795, 9, 23);
        expect(next).toEqual({ year: 4, month: 1, day: 1, sansculottide: -1 });
    });

    it("handles the month boundary from Fructidor (day 30) into the Sansculottides", () => {
        // 16 Sept 1795 = 30 Fructidor an 3 (last day of the 12th month);
        // 17 Sept 1795 = the 1st Sansculottide day of the same year.
        let lastOfFructidor = Calendars.toFrenchRepublican(1795, 9, 16);
        expect(lastOfFructidor).toEqual({ year: 3, month: 12, day: 30, sansculottide: -1 });

        let firstSansculottide = Calendars.toFrenchRepublican(1795, 9, 17);
        expect(firstSansculottide).toEqual({ year: 3, month: 0, day: 0, sansculottide: 0 });
        expect(Calendars.formatFrenchRepublican(1795, 9, 17)).toBe("Jour de la Vertu, an 3");
    });

    it("formatFrenchRepublican produces a non-empty string for an arbitrary present-day date", () => {
        expect(Calendars.formatFrenchRepublican(2026, 6, 1).length).toBeGreaterThan(0);
    });
});
