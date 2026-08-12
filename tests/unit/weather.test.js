import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Weather, getWeatherInfo } from "../../src/lib/weather.js";

/** Minimal in-memory browser.storage.local mock (mirrors wikipedia.test.js). */
function makeStorageMock() {
    let store = {};
    return {
        _store: store,
        local: {
            get: vi.fn((keys) => {
                if (keys === null || keys === undefined) return Promise.resolve({ ...store });
                if (typeof keys === "string") return Promise.resolve(keys in store ? { [keys]: store[keys] } : {});
                let out = {};
                for (let k of keys) if (k in store) out[k] = store[k];
                return Promise.resolve(out);
            }),
            set: vi.fn((obj) => { Object.assign(store, obj); return Promise.resolve(); }),
            remove: vi.fn((keys) => {
                let list = Array.isArray(keys) ? keys : [keys];
                for (let k of list) delete store[k];
                return Promise.resolve();
            })
        }
    };
}

function jsonResponse(status, body) {
    return Promise.resolve({
        status,
        text: () => Promise.resolve(body === null ? "" : JSON.stringify(body))
    });
}

const CURRENT_WEATHER_OK = { current_weather: { temperature: 21.4, windspeed: 8.1, weathercode: 3, time: "2026-06-15T10:00" } };

describe("Weather.fetchCurrent", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
        let storage = makeStorageMock();
        global.browser = { storage };
        Weather.CACHE_TTL_SECS = 3600;
    });
    afterEach(() => { vi.useRealTimers(); });

    it("cache-miss: fetches from network, caches, and returns the parsed result", async () => {
        global.fetch = vi.fn((url) => {
            expect(url).toContain("https://api.open-meteo.com/v1/forecast");
            expect(url).toContain("latitude=47.5");
            expect(url).toContain("longitude=19.05");
            expect(url).toContain("current_weather=true");
            return jsonResponse(200, CURRENT_WEATHER_OK);
        });
        let data = await Weather.fetchCurrent(47.5, 19.05);
        expect(data).toEqual({ temperature: 21.4, weathercode: 3, windspeed: 8.1 });
        expect(global.browser.storage.local.set).toHaveBeenCalled();
    });

    it("cache-hit: serves fresh cached content without calling fetch again", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, CURRENT_WEATHER_OK));
        await Weather.fetchCurrent(47.5, 19.05); // populates cache
        global.fetch.mockClear();
        let data = await Weather.fetchCurrent(47.5, 19.05); // should hit cache
        expect(data).toEqual({ temperature: 21.4, weathercode: 3, windspeed: 8.1 });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("nearby (but not identical) coordinates share the same rounded cache entry", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, CURRENT_WEATHER_OK));
        await Weather.fetchCurrent(47.4979, 19.0402); // populates cache for the rounded key
        global.fetch.mockClear();
        let data = await Weather.fetchCurrent(47.5021, 19.0398); // rounds to the same ~0.05deg cell
        expect(data).toEqual({ temperature: 21.4, weathercode: 3, windspeed: 8.1 });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("TTL-expiry: re-fetches once the cache entry is older than CACHE_TTL_SECS", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, CURRENT_WEATHER_OK));
        await Weather.fetchCurrent(47.5, 19.05);
        let key = "weather:47.50:19.05";
        let entry = (await global.browser.storage.local.get(key))[key];
        await global.browser.storage.local.set({ [key]: { ...entry, cachedAt: Date.now() - 999999999 } });

        global.fetch.mockClear();
        await Weather.fetchCurrent(47.5, 19.05);
        expect(global.fetch).toHaveBeenCalled();
    });

    it("network error: serves stale cache instead of failing", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, CURRENT_WEATHER_OK));
        await Weather.fetchCurrent(47.5, 19.05);
        let key = "weather:47.50:19.05";
        let entry = (await global.browser.storage.local.get(key))[key];
        await global.browser.storage.local.set({ [key]: { ...entry, cachedAt: Date.now() - 999999999 } });

        global.fetch = vi.fn(() => Promise.reject(new Error("offline")));
        let data = await Weather.fetchCurrent(47.5, 19.05);
        expect(data).toEqual({ temperature: 21.4, weathercode: 3, windspeed: 8.1 }); // stale cache still served
    });

    it("network error with no cache at all: resolves null rather than throwing", async () => {
        global.fetch = vi.fn(() => Promise.reject(new Error("offline")));
        let data = await Weather.fetchCurrent(47.5, 19.05);
        expect(data).toBeNull();
    });

    it("HTTP error status: resolves null (no cache) rather than throwing", async () => {
        global.fetch = vi.fn(() => jsonResponse(500, null));
        let data = await Weather.fetchCurrent(47.5, 19.05);
        expect(data).toBeNull();
    });

    it("malformed response (missing current_weather): resolves null", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, { hourly: {} }));
        let data = await Weather.fetchCurrent(47.5, 19.05);
        expect(data).toBeNull();
    });

    it("malformed response (non-numeric temperature/weathercode): resolves null", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, { current_weather: { temperature: "warm", weathercode: null } }));
        let data = await Weather.fetchCurrent(47.5, 19.05);
        expect(data).toBeNull();
    });

    it("empty response body: resolves null", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, null));
        let data = await Weather.fetchCurrent(47.5, 19.05);
        expect(data).toBeNull();
    });

    it("invalid lat/lon (non-numeric or NaN): resolves null without touching fetch/cache", async () => {
        global.fetch = vi.fn();
        expect(await Weather.fetchCurrent(NaN, 19.05)).toBeNull();
        expect(await Weather.fetchCurrent(47.5, undefined)).toBeNull();
        expect(await Weather.fetchCurrent("47.5", 19.05)).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("supports the optional Node-style callback in addition to the returned Promise", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, CURRENT_WEATHER_OK));
        await new Promise((resolve) => {
            Weather.fetchCurrent(47.5, 19.05, (data) => {
                expect(data).toEqual({ temperature: 21.4, weathercode: 3, windspeed: 8.1 });
                resolve();
            });
        });
    });

    it("never touches a URL outside api.open-meteo.com (zero real network calls beyond the mock)", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, CURRENT_WEATHER_OK));
        await Weather.fetchCurrent(10, 20);
        for (let call of global.fetch.mock.calls) {
            expect(String(call[0])).toMatch(/^https:\/\/api\.open-meteo\.com\//);
        }
    });
});

describe("getWeatherInfo (WMO weather code mapping)", () => {
    it("maps every documented WMO code group to a non-empty emoji + text", () => {
        let codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
            71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
        for (let code of codes) {
            let info = getWeatherInfo(code);
            expect(info.emoji, `code ${code}`).toBeTruthy();
            expect(info.text, `code ${code}`).toBeTruthy();
        }
    });

    it("clear sky (0) and thunderstorm (95) map to distinct, sensible labels", () => {
        expect(getWeatherInfo(0).text).toBe("Clear sky");
        expect(getWeatherInfo(95).text).toBe("Thunderstorm");
    });

    it("falls back to a neutral, non-blank label for an unknown/undocumented code", () => {
        let info = getWeatherInfo(12345);
        expect(info.emoji).toBeTruthy();
        expect(info.text).toBeTruthy();
    });

    it("falls back gracefully for null/undefined codes too", () => {
        expect(getWeatherInfo(null).text).toBeTruthy();
        expect(getWeatherInfo(undefined).text).toBeTruthy();
    });
});
