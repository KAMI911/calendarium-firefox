import { describe, it, expect, beforeEach, vi } from "vitest";
import { Namedays } from "../../src/lib/namedays.js";

const SAMPLE = {
    "01-01": ["Fruzsina"],
    "01-02": ["Ábel"],
    "12-31": ["Szilveszter"]
};

describe("Namedays.getNamedays", () => {
    it("returns the name list for a date with data", () => {
        expect(Namedays.getNamedays(SAMPLE, new Date(2026, 0, 1))).toEqual(["Fruzsina"]);
    });

    it("returns [] for a date with no data", () => {
        expect(Namedays.getNamedays(SAMPLE, new Date(2026, 5, 15))).toEqual([]);
    });

    it("returns [] when data is null", () => {
        expect(Namedays.getNamedays(null, new Date())).toEqual([]);
    });
});

describe("Namedays.getNamedaysRange", () => {
    it("returns today + N lookahead days in order, wrapping across a year boundary", () => {
        let range = Namedays.getNamedaysRange(SAMPLE, new Date(2025, 11, 31), 2);
        expect(range.length).toBe(3);
        expect(range[0].names).toEqual(["Szilveszter"]);
        expect(range[1].names).toEqual(["Fruzsina"]);
        expect(range[2].names).toEqual(["Ábel"]);
    });

    it("returns just today when days = 0", () => {
        let range = Namedays.getNamedaysRange(SAMPLE, new Date(2026, 0, 1), 0);
        expect(range.length).toBe(1);
    });

    it("handles a leap-year February 29 boundary without throwing", () => {
        let range = Namedays.getNamedaysRange(SAMPLE, new Date(2028, 1, 28), 2);
        expect(range.length).toBe(3);
        expect(range[1].date.getDate()).toBe(29); // 2028 is a leap year
        expect(range[2].date.getMonth()).toBe(2); // rolls into March
    });
});

describe("Namedays.loadData", () => {
    beforeEach(() => {
        global.browser = { runtime: { getURL: (p) => "moz-extension://x/" + p } };
        global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE) }));
    });

    it("fetches the locale JSON via browser.runtime.getURL", async () => {
        let data = await Namedays.loadData("data/namedays", "hu");
        expect(global.fetch).toHaveBeenCalledWith("moz-extension://x/data/namedays/hu.json");
        expect(data).toEqual(SAMPLE);
    });

    it("short-circuits to null for locale 'auto'", async () => {
        let data = await Namedays.loadData("data/namedays", "auto");
        expect(data).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
