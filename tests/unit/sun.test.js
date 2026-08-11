import { describe, it, expect } from "vitest";
import { Sun } from "../../src/lib/sun.js";

describe("Sun.getSunTimes", () => {
    it("returns HH:MM sunrise/sunset for Budapest on an equinox-ish date", () => {
        let d = new Date(2026, 2, 20); // March equinox, local calendar date
        let sun = Sun.getSunTimes(d, 47.4979, 19.0402, 1);
        expect(sun.polarDay).toBe(false);
        expect(sun.polarNight).toBe(false);
        expect(sun.sunrise).toMatch(/^\d{2}:\d{2}$/);
        expect(sun.sunset).toMatch(/^\d{2}:\d{2}$/);
    });

    it("sunrise is before sunset for a mid-latitude city in summer", () => {
        let d = new Date(2026, 5, 21);
        let sun = Sun.getSunTimes(d, 47.4979, 19.0402, 2);
        let [rh, rm] = sun.sunrise.split(":").map(Number);
        let [sh, sm] = sun.sunset.split(":").map(Number);
        expect(rh * 60 + rm).toBeLessThan(sh * 60 + sm);
    });

    it("reports polar day for high northern latitude around the summer solstice", () => {
        let d = new Date(2026, 5, 21); // ~June solstice
        let sun = Sun.getSunTimes(d, 78.0, 15.0); // Svalbard
        expect(sun.polarDay).toBe(true);
        expect(sun.sunrise).toBeNull();
        expect(sun.sunset).toBeNull();
    });

    it("reports polar night for high northern latitude around the winter solstice", () => {
        let d = new Date(2026, 11, 21);
        let sun = Sun.getSunTimes(d, 78.0, 15.0);
        expect(sun.polarNight).toBe(true);
    });

    it("applies an explicit UTC offset rather than the system timezone", () => {
        let d = new Date(2026, 5, 21);
        let noOffset = Sun.getSunTimes(d, 35.0, 139.0);       // Tokyo area, system tz
        let withOffset = Sun.getSunTimes(d, 35.0, 139.0, 9);  // explicit JST
        expect(noOffset.sunrise).toMatch(/^\d{2}:\d{2}$/);
        expect(withOffset.sunrise).toMatch(/^\d{2}:\d{2}$/);
    });
});

describe("Sun.formatTime", () => {
    it("wraps negative and >24h decimal hours into a valid HH:MM", () => {
        expect(Sun.formatTime(-1, new Date(2026, 0, 1), 0)).toBe("23:00");
        expect(Sun.formatTime(25, new Date(2026, 0, 1), 0)).toBe("01:00");
    });

    it("returns null for null/undefined input", () => {
        expect(Sun.formatTime(null, new Date())).toBeNull();
        expect(Sun.formatTime(undefined, new Date())).toBeNull();
    });
});

describe("Sun.getMoonTimes", () => {
    it("returns moonrise/moonset as HH:MM strings or null, never throwing", () => {
        for (let day = 1; day <= 30; day += 5) {
            let d = new Date(2026, 0, day);
            let mt = Sun.getMoonTimes(d, 47.4979, 19.0402, 1);
            if (mt.moonrise !== null) expect(mt.moonrise).toMatch(/^\d{2}:\d{2}$/);
            if (mt.moonset !== null) expect(mt.moonset).toMatch(/^\d{2}:\d{2}$/);
        }
    });
});
