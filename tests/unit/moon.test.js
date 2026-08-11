import { describe, it, expect } from "vitest";
import { Moon } from "../../src/lib/moon.js";

describe("Moon.toJulianDate", () => {
    it("matches the known JD for 2000-01-01 12:00 UTC (J2000.0 epoch)", () => {
        let d = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
        expect(Moon.toJulianDate(d)).toBeCloseTo(2451545.0, 6);
    });
});

describe("Moon.getMoonPhase", () => {
    it("returns New Moon (age wrapped to just under one synodic month) at the anchor instant", () => {
        // elapsed = jd - KNOWN_NEW_MOON_JD is ~0 at the anchor, but floating
        // point puts it a hair negative, so `age % SYNODIC_MONTH` wraps to
        // just under a full synodic month rather than exactly 0. The phase
        // bucketing (phase > 0.9375) correctly classifies this as New Moon.
        let anchor = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        let phase = Moon.getMoonPhase(anchor);
        expect(phase.age).toBeCloseTo(Moon.SYNODIC_MONTH, 0);
        expect(phase.phaseIndex).toBe(0);
        expect(phase.phaseName).toBe("New Moon");
    });

    it("reaches Full Moon roughly half a synodic month after the anchor", () => {
        let anchorMs = Date.UTC(2000, 0, 6, 18, 14, 0);
        let halfway = new Date(anchorMs + (Moon.SYNODIC_MONTH / 2) * 86400000);
        let phase = Moon.getMoonPhase(halfway);
        expect(phase.phaseIndex).toBe(4);
        expect(phase.phaseName).toBe("Full Moon");
    });

    it("returns the same phase index one full synodic month later (periodicity)", () => {
        let anchor = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        let oneMonthLater = new Date(anchor.getTime() + Moon.SYNODIC_MONTH * 86400000);
        let phaseAnchor = Moon.getMoonPhase(anchor);
        let phaseLater  = Moon.getMoonPhase(oneMonthLater);
        expect(phaseLater.phaseIndex).toBe(phaseAnchor.phaseIndex);
        expect(phaseLater.age).toBeCloseTo(phaseAnchor.age, 1);
    });

    it("age is always within [0, SYNODIC_MONTH)", () => {
        for (let i = 0; i < 50; i++) {
            let d = new Date(Date.UTC(2020, 0, 1 + i * 37, 3, 0, 0));
            let phase = Moon.getMoonPhase(d);
            expect(phase.age).toBeGreaterThanOrEqual(0);
            expect(phase.age).toBeLessThan(Moon.SYNODIC_MONTH);
            expect(phase.phaseIndex).toBeGreaterThanOrEqual(0);
            expect(phase.phaseIndex).toBeLessThanOrEqual(7);
        }
    });

    it("returns a symbol/name pair for every phase index", () => {
        expect(Moon.PHASE_SYMBOLS.length).toBe(8);
        expect(Moon.PHASE_NAMES.length).toBe(8);
    });
});
