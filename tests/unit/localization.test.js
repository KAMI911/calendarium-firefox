import { describe, it, expect } from "vitest";
import { Localization } from "../../src/lib/localization.js";

describe("Localization.getTraditionalMonthName", () => {
    it("returns 12 distinct names for hu, en, de", () => {
        for (let lang of ["hu", "en", "de"]) {
            let names = new Set();
            for (let m = 0; m < 12; m++) {
                let name = Localization.getTraditionalMonthName(lang, m);
                expect(name).toBeTruthy();
                names.add(name);
            }
            expect(names.size).toBe(12);
        }
    });

    it("returns the correct Old Hungarian name for January (Boldogasszony hava)", () => {
        expect(Localization.getTraditionalMonthName("hu", 0)).toBe("Boldogasszony hava");
    });

    it("returns '' for an unknown language", () => {
        expect(Localization.getTraditionalMonthName("xx", 0)).toBe("");
    });

    it("returns '' for an out-of-range month index", () => {
        expect(Localization.getTraditionalMonthName("en", -1)).toBe("");
        expect(Localization.getTraditionalMonthName("en", 12)).toBe("");
    });
});
