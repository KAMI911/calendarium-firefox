import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Wikipedia } from "../../src/lib/wikipedia.js";

// Wikipedia's cache prunes any stored entry whose "mmdd" suffix doesn't
// match *today's* real date (mirrors the desklet's file-cache day-suffix
// pruning). Pin the system clock to June 15 so every fixture below (which
// uses month=6, day=15) is treated as "today" and never gets pruned out
// from under a test.

/** Minimal in-memory browser.storage.local mock. */
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

const ONTHISDAY_HU = { births: [{ year: 1900, pages: [{ normalizedtitle: "Someone Hungarian" }] }], deaths: [], events: [] };
const ONTHISDAY_EN = { births: [{ year: 1900, pages: [{ normalizedtitle: "Someone English" }] }], deaths: [], events: [] };
const EMPTY = { births: [], deaths: [], events: [] };
const FEATURED = { tfa: { normalizedtitle: "Featured Thing", extract: "It is great. More text." } };

function jsonResponse(status, body) {
    return Promise.resolve({
        status,
        text: () => Promise.resolve(body === null ? "" : JSON.stringify(body))
    });
}

describe("Wikipedia.fetchOnThisDay", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
        let storage = makeStorageMock();
        global.browser = { storage };
        Wikipedia.CACHE_TTL_SECS = 43200;
    });
    afterEach(() => { vi.useRealTimers(); });

    it("cache-miss: fetches from network and caches the result", async () => {
        global.fetch = vi.fn((url) => {
            expect(url).toContain("/en/onthisday/all/06/15");
            return jsonResponse(200, ONTHISDAY_EN);
        });
        let data = await Wikipedia.fetchOnThisDay(6, 15, "en");
        expect(data).toEqual(ONTHISDAY_EN);
        expect(global.browser.storage.local.set).toHaveBeenCalled();
    });

    it("cache-hit: serves fresh cached content without calling fetch again for the same lang", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, ONTHISDAY_EN));
        await Wikipedia.fetchOnThisDay(6, 15, "en"); // populates cache
        global.fetch.mockClear();
        let data = await Wikipedia.fetchOnThisDay(6, 15, "en"); // should hit cache
        expect(data).toEqual(ONTHISDAY_EN);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("TTL-expiry: re-fetches once the cache entry is older than CACHE_TTL_SECS", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, ONTHISDAY_EN));
        await Wikipedia.fetchOnThisDay(6, 15, "en");
        // Simulate the passage of time by rewriting the cached entry's timestamp.
        let key = "wiki:onthisday:en:0615";
        let entry = (await global.browser.storage.local.get(key))[key];
        await global.browser.storage.local.set({ [key]: { ...entry, cachedAt: Date.now() - 999999999 } });

        global.fetch.mockClear();
        await Wikipedia.fetchOnThisDay(6, 15, "en");
        expect(global.fetch).toHaveBeenCalled();
    });

    it("English fallback: falls back to English when the requested language returns empty content", async () => {
        global.fetch = vi.fn((url) => {
            if (url.includes("/hu/")) return jsonResponse(200, EMPTY);
            if (url.includes("/en/")) return jsonResponse(200, ONTHISDAY_EN);
            throw new Error("unexpected url " + url);
        });
        let data = await Wikipedia.fetchOnThisDay(6, 15, "hu");
        expect(data).toEqual(ONTHISDAY_EN);
    });

    it("English fallback: falls back to English on HTTP 404 for a non-English language", async () => {
        global.fetch = vi.fn((url) => {
            if (url.includes("/hu/")) return jsonResponse(404, null);
            if (url.includes("/en/")) return jsonResponse(200, ONTHISDAY_EN);
            throw new Error("unexpected url " + url);
        });
        let data = await Wikipedia.fetchOnThisDay(6, 15, "hu");
        expect(data).toEqual(ONTHISDAY_EN);
    });

    it("network error: serves stale same-language cache instead of failing", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, ONTHISDAY_EN));
        await Wikipedia.fetchOnThisDay(6, 15, "en");
        let key = "wiki:onthisday:en:0615";
        let entry = (await global.browser.storage.local.get(key))[key];
        await global.browser.storage.local.set({ [key]: { ...entry, cachedAt: Date.now() - 999999999 } });

        global.fetch = vi.fn(() => Promise.reject(new Error("offline")));
        let data = await Wikipedia.fetchOnThisDay(6, 15, "en");
        expect(data).toEqual(ONTHISDAY_EN); // stale cache still served
    });

    it("network error with no cache at all: resolves null rather than throwing", async () => {
        global.fetch = vi.fn(() => Promise.reject(new Error("offline")));
        let data = await Wikipedia.fetchOnThisDay(6, 15, "en");
        expect(data).toBeNull();
    });

    it("never calls fetch for CACHE_TTL_SECS accounting beyond the mocked storage/network (zero real network calls)", async () => {
        // Sanity check that the global.fetch mock is the only network surface touched.
        global.fetch = vi.fn(() => jsonResponse(200, ONTHISDAY_HU));
        await Wikipedia.fetchOnThisDay(3, 1, "hu");
        for (let call of global.fetch.mock.calls) {
            expect(String(call[0])).toMatch(/^https:\/\/api\.wikimedia\.org\//);
        }
    });
});

describe("Wikipedia.fetchFeatured", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
        let storage = makeStorageMock();
        global.browser = { storage };
        Wikipedia.CACHE_TTL_SECS = 43200;
    });
    afterEach(() => { vi.useRealTimers(); });

    it("cache-miss: fetches and caches the featured article", async () => {
        global.fetch = vi.fn((url) => {
            expect(url).toContain("/en/featured/2026/06/15");
            return jsonResponse(200, FEATURED);
        });
        let data = await Wikipedia.fetchFeatured(2026, 6, 15, "en");
        expect(data).toEqual(FEATURED);
    });

    it("falls back to English when the featured article has no tfa for the requested language", async () => {
        global.fetch = vi.fn((url) => {
            if (url.includes("/hu/")) return jsonResponse(200, {});
            if (url.includes("/en/")) return jsonResponse(200, FEATURED);
            throw new Error("unexpected url " + url);
        });
        let data = await Wikipedia.fetchFeatured(2026, 6, 15, "hu");
        expect(data).toEqual(FEATURED);
    });

    it("supports the optional Node-style callback in addition to the returned Promise", async () => {
        global.fetch = vi.fn(() => jsonResponse(200, FEATURED));
        await new Promise((resolve) => {
            Wikipedia.fetchFeatured(2026, 6, 15, "en", (data) => {
                expect(data).toEqual(FEATURED);
                resolve();
            });
        });
    });
});
