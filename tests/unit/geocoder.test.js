import { describe, it, expect, beforeEach, vi } from "vitest";
import { Geocoder } from "../../src/lib/geocoder.js";

const RAW_CITIES = [
    { n: "Vienna", c: "Austria", a: 48.2082, o: 16.3738, z: "Europe/Vienna", l: ["Wien", "Bécs"] },
    { n: "Budapest", c: "Hungary", a: 47.4979, o: 19.0402, z: "Europe/Budapest", l: ["Buda-Pest"] },
    { n: "Vienne", c: "France", a: 45.5256, o: 4.8748, z: "Europe/Paris" }
];

describe("Geocoder", () => {
    beforeEach(() => {
        // Reset module-level cache between tests.
        Geocoder._cities = null;
        Geocoder._loadPromise = null;
        global.browser = { runtime: { getURL: (p) => "moz-extension://x/" + p } };
        global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(RAW_CITIES) }));
    });

    it("init() fetches data/cities.json exactly once even if called concurrently", async () => {
        await Promise.all([Geocoder.init(), Geocoder.init(), Geocoder.init()]);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith("moz-extension://x/data/cities.json");
    });

    it("search() returns [] before init() resolves", () => {
        expect(Geocoder.search("Vienna")).toEqual([]);
    });

    it("finds a city by its primary English name (exact match ranked first)", async () => {
        await Geocoder.init();
        let results = Geocoder.search("Vienna");
        expect(results[0].name).toBe("Vienna");
    });

    it("matches an alternate-language name (Bécs = Hungarian for Vienna)", async () => {
        await Geocoder.init();
        let results = Geocoder.search("Bécs");
        expect(results.some((r) => r.name === "Vienna")).toBe(true);
    });

    it("is case-insensitive", async () => {
        await Geocoder.init();
        let results = Geocoder.search("BUDAPEST");
        expect(results.some((r) => r.name === "Budapest")).toBe(true);
    });

    it("ranks exact matches before prefix/contains matches", async () => {
        await Geocoder.init();
        let results = Geocoder.search("vienna");
        // "Vienna" is an exact match; "Vienne" only contains it as a prefix.
        expect(results[0].name).toBe("Vienna");
    });

    it("returns [] for an empty or whitespace-only query", async () => {
        await Geocoder.init();
        expect(Geocoder.search("")).toEqual([]);
        expect(Geocoder.search("   ")).toEqual([]);
    });

    it("caps results at 5", async () => {
        let many = Array.from({ length: 20 }, (_, i) => ({
            n: "Testville" + i, c: "Testland", a: 0, o: 0
        }));
        global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(many) }));
        await Geocoder.init();
        expect(Geocoder.search("testville").length).toBeLessThanOrEqual(5);
    });

    it("returns lat/lon/tz fields for a matched city", async () => {
        await Geocoder.init();
        let [vienna] = Geocoder.search("Vienna");
        expect(vienna).toMatchObject({ name: "Vienna", country: "Austria", lat: 48.2082, lon: 16.3738, tz: "Europe/Vienna" });
    });
});
