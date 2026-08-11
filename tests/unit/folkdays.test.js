import { describe, it, expect, beforeEach, vi } from "vitest";
import { Folkdays } from "../../src/lib/folkdays.js";

const SAMPLE = {
    "01-01": "New Year's saying.",
    "03-19": "József napja: sár, kásza."
};

describe("Folkdays.getSaying", () => {
    it("returns the saying for a date that has one", () => {
        expect(Folkdays.getSaying(SAMPLE, new Date(2026, 0, 1))).toBe("New Year's saying.");
    });

    it("returns null for a date with no saying", () => {
        expect(Folkdays.getSaying(SAMPLE, new Date(2026, 5, 1))).toBeNull();
    });

    it("returns null when data is null", () => {
        expect(Folkdays.getSaying(null, new Date())).toBeNull();
    });

    it("zero-pads single-digit month/day when building the lookup key", () => {
        expect(Folkdays.getSaying(SAMPLE, new Date(2026, 2, 19))).toContain("József");
    });
});

describe("Folkdays.loadData", () => {
    beforeEach(() => {
        global.browser = { runtime: { getURL: (p) => "moz-extension://x/" + p } };
        global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE) }));
    });

    it("fetches the locale JSON via browser.runtime.getURL", async () => {
        let data = await Folkdays.loadData("data/folkdays", "hu");
        expect(global.fetch).toHaveBeenCalledWith("moz-extension://x/data/folkdays/hu.json");
        expect(data).toEqual(SAMPLE);
    });

    it("resolves null (not throwing) on fetch rejection", async () => {
        global.fetch = vi.fn(() => Promise.reject(new Error("network down")));
        let data = await Folkdays.loadData("data/folkdays", "hu");
        expect(data).toBeNull();
    });
});
