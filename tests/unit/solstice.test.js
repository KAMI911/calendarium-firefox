import { describe, it, expect } from "vitest";
import { Solstice } from "../../src/lib/solstice.js";

describe("Solstice.getForYear", () => {
    it("returns the 4 seasonal events for 2026 in the expected month order", () => {
        let s = Solstice.getForYear(2026);
        expect(s.spring.getUTCMonth()).toBe(2);  // March
        expect(s.summer.getUTCMonth()).toBe(5);  // June
        expect(s.autumn.getUTCMonth()).toBe(8);  // September
        expect(s.winter.getUTCMonth()).toBe(11); // December
    });

    it("matches known reference dates for 2026 within 1 day", () => {
        // Published approximate UTC dates for 2026 equinoxes/solstices.
        let s = Solstice.getForYear(2026);
        expect(s.spring.getUTCDate()).toBeGreaterThanOrEqual(19);
        expect(s.spring.getUTCDate()).toBeLessThanOrEqual(21);
        expect(s.summer.getUTCDate()).toBeGreaterThanOrEqual(20);
        expect(s.summer.getUTCDate()).toBeLessThanOrEqual(22);
        expect(s.winter.getUTCDate()).toBeGreaterThanOrEqual(20);
        expect(s.winter.getUTCDate()).toBeLessThanOrEqual(22);
    });
});

describe("Solstice.getNext", () => {
    it("returns the spring equinox when queried just after the winter solstice", () => {
        let ev = Solstice.getNext(new Date(2026, 0, 5));
        expect(ev.nameKey).toBe("Spring equinox");
        expect(ev.daysUntil).toBeGreaterThan(0);
    });

    it("returns daysUntil = 0 when queried on the event's local calendar day", () => {
        let s = Solstice.getForYear(2026);
        let localMidnight = new Date(s.summer.getFullYear(), s.summer.getMonth(), s.summer.getDate());
        let ev = Solstice.getNext(localMidnight);
        expect(ev.daysUntil).toBe(0);
        expect(ev.nameKey).toBe("Summer solstice");
    });

    it("rolls over into next year's spring equinox when queried after the winter solstice", () => {
        let ev = Solstice.getNext(new Date(2026, 11, 25));
        expect(ev.nameKey).toBe("Spring equinox");
        expect(ev.date.getUTCFullYear()).toBe(2027);
    });
});
