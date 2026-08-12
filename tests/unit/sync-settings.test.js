// @vitest-environment jsdom
//
// Firefox Sync (opt-in "sync-settings") coverage: the pure allowlist/merge
// logic in settings/schema.js (isSyncable / SYNCABLE_KEYS /
// mergeSyncedSettings), and options.js's saveField()/loadState()
// integration — best-effort sync writes on save, sync-wins merge on load,
// and graceful degradation when browser.storage.sync is unavailable or
// rejects. Mirrors the browser.storage.local mock pattern used throughout
// the other unit tests (options-schema.test.js, background.test.js, ...).
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    FIELDS, SYNCABLE_KEYS, SYNC_EXCLUDED_KEYS, NON_STORAGE_FIELD_TYPES,
    isSyncable, mergeSyncedSettings, DEFAULTS
} from "../../src/settings/schema.js";

describe("isSyncable / SYNCABLE_KEYS (the Firefox Sync allowlist)", () => {
    it("excludes background-image-url (unbounded multiline text, easily exceeds the 8KB-per-item quota)", () => {
        expect(isSyncable("background-image-url")).toBe(false);
        expect(SYNCABLE_KEYS).not.toContain("background-image-url");
    });

    it("excludes background-folder-include-subfolders (paired with folder/IndexedDB state that can never sync)", () => {
        expect(isSyncable("background-folder-include-subfolders")).toBe(false);
        expect(SYNCABLE_KEYS).not.toContain("background-folder-include-subfolders");
    });

    it("excludes sync-settings itself (must be readable locally before Sync can even be consulted)", () => {
        expect(isSyncable("sync-settings")).toBe(false);
        expect(SYNCABLE_KEYS).not.toContain("sync-settings");
    });

    it("excludes the two synthetic non-storage field types (folder-picker, import-export)", () => {
        expect(isSyncable("background-folder-picker")).toBe(false);
        expect(isSyncable("settings-import-export")).toBe(false);
        for (let field of Object.values(FIELDS)) {
            if (NON_STORAGE_FIELD_TYPES.has(field.type)) {
                expect(SYNCABLE_KEYS).not.toContain(field.id);
            }
        }
    });

    it("returns false for an unknown key", () => {
        expect(isSyncable("not-a-real-field")).toBe(false);
    });

    it("includes ordinary scalar fields — toggles, combobox, entry, spinbutton, color", () => {
        expect(isSyncable("show-date")).toBe(true);
        expect(isSyncable("time-format")).toBe(true);
        expect(isSyncable("progress-separator")).toBe(true);
        expect(isSyncable("wikipedia-cache-hours")).toBe(true);
        expect(isSyncable("background-color")).toBe(true);
        expect(isSyncable("show-weather")).toBe(true);
        expect(isSyncable("weather-cache-hours")).toBe(true);
    });

    it("SYNCABLE_KEYS is exactly FIELDS minus SYNC_EXCLUDED_KEYS minus non-storage field types", () => {
        let expected = Object.keys(FIELDS).filter((id) => {
            if (SYNC_EXCLUDED_KEYS.has(id)) return false;
            if (NON_STORAGE_FIELD_TYPES.has(FIELDS[id].type)) return false;
            return true;
        });
        expect([...SYNCABLE_KEYS].sort()).toEqual(expected.sort());
    });
});

describe("mergeSyncedSettings (pure local-vs-sync merge precedence)", () => {
    it("sync values win over local values for syncable keys", () => {
        let local = Object.assign({}, DEFAULTS, { "show-date": false, "time-format": "24h" });
        let synced = { "show-date": true, "time-format": "12h" };
        let merged = mergeSyncedSettings(local, synced);
        expect(merged["show-date"]).toBe(true);
        expect(merged["time-format"]).toBe("12h");
    });

    it("local values are kept for keys sync doesn't define", () => {
        let local = Object.assign({}, DEFAULTS, { "show-date": false });
        let merged = mergeSyncedSettings(local, {});
        expect(merged["show-date"]).toBe(false);
    });

    it("never lets a non-syncable key (e.g. background-image-url) be overridden by a synced value", () => {
        let local = Object.assign({}, DEFAULTS, { "background-image-url": "https://example.com/local.jpg" });
        let synced = { "background-image-url": "https://example.com/synced.jpg" };
        let merged = mergeSyncedSettings(local, synced);
        expect(merged["background-image-url"]).toBe("https://example.com/local.jpg");
    });

    it("null/undefined syncedState is a safe no-op, returning a copy of local", () => {
        let local = Object.assign({}, DEFAULTS);
        expect(mergeSyncedSettings(local, null)).toEqual(local);
        expect(mergeSyncedSettings(local, undefined)).toEqual(local);
    });

    it("respects a custom syncableKeys list (for testing a narrower allowlist)", () => {
        let local = { a: 1, b: 2 };
        let synced = { a: 99, b: 99 };
        let merged = mergeSyncedSettings(local, synced, ["a"]);
        expect(merged).toEqual({ a: 99, b: 2 });
    });

    it("does not mutate the local object passed in", () => {
        let local = Object.assign({}, DEFAULTS, { "show-date": false });
        mergeSyncedSettings(local, { "show-date": true });
        expect(local["show-date"]).toBe(false);
    });
});

/** Minimal in-memory browser.storage.local mock (mirrors other unit tests). */
function makeLocalMock(initial = {}) {
    let store = { ...initial };
    return {
        get: vi.fn((keys) => {
            if (keys === null || keys === undefined) return Promise.resolve({ ...store });
            if (typeof keys === "string") return Promise.resolve(keys in store ? { [keys]: store[keys] } : {});
            let out = {};
            for (let k of keys) if (k in store) out[k] = store[k];
            return Promise.resolve(out);
        }),
        set: vi.fn((obj) => { Object.assign(store, obj); return Promise.resolve(); })
    };
}

describe("options.js Firefox Sync integration (jsdom)", () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <h1 id="options-title"></h1>
            <nav id="options-tabs"></nav>
            <div id="options-pages"></div>
            <p id="options-status"></p>
        `;
    });

    it("saveField() mirrors a syncable field to browser.storage.sync when sync-settings is on", async () => {
        let localStore = { "sync-settings": true };
        global.browser = {
            storage: {
                local: makeLocalMock(localStore),
                sync: { get: vi.fn(() => Promise.resolve({})), set: vi.fn(() => Promise.resolve()) }
            },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();

        let input = document.getElementById("show-date");
        input.checked = false;
        input.dispatchEvent(new Event("change"));
        await new Promise((r) => setTimeout(r, 0));

        expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ "show-date": false });
    });

    it("saveField() never mirrors a non-syncable field (background-image-url) even when sync-settings is on", async () => {
        let localStore = { "sync-settings": true, "background-style": "custom-image-url" };
        global.browser = {
            storage: {
                local: makeLocalMock(localStore),
                sync: { get: vi.fn(() => Promise.resolve({})), set: vi.fn(() => Promise.resolve()) }
            },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();

        let input = document.getElementById("background-image-url");
        input.value = "https://example.com/a.jpg";
        input.dispatchEvent(new Event("input"));
        await new Promise((r) => setTimeout(r, 0));

        expect(global.browser.storage.sync.set).not.toHaveBeenCalled();
    });

    it("saveField() does not touch browser.storage.sync at all when sync-settings is off", async () => {
        let localStore = { "sync-settings": false };
        global.browser = {
            storage: {
                local: makeLocalMock(localStore),
                sync: { get: vi.fn(() => Promise.resolve({})), set: vi.fn(() => Promise.resolve()) }
            },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();

        let input = document.getElementById("show-date");
        input.checked = false;
        input.dispatchEvent(new Event("change"));
        await new Promise((r) => setTimeout(r, 0));

        expect(global.browser.storage.sync.set).not.toHaveBeenCalled();
    });

    it("loadState() merges browser.storage.sync values over local ones when sync-settings is on", async () => {
        let localStore = { "sync-settings": true, "show-date": false };
        global.browser = {
            storage: {
                local: makeLocalMock(localStore),
                sync: { get: vi.fn(() => Promise.resolve({ "show-date": true })), set: vi.fn(() => Promise.resolve()) }
            },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();

        expect(document.getElementById("show-date").checked).toBe(true);
    });

    it("loadState() never consults browser.storage.sync when sync-settings is off", async () => {
        let localStore = { "sync-settings": false };
        let syncGet = vi.fn(() => Promise.resolve({ "show-date": true }));
        global.browser = {
            storage: { local: makeLocalMock(localStore), sync: { get: syncGet, set: vi.fn(() => Promise.resolve()) } },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
        let { loadState } = await import("../../src/options.js");
        await loadState();
        expect(syncGet).not.toHaveBeenCalled();
    });

    it("degrades gracefully (no throw) when browser.storage.sync is entirely absent (e.g. unsupported build)", async () => {
        let localStore = { "sync-settings": true };
        global.browser = {
            storage: { local: makeLocalMock(localStore) }, // no .sync at all
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
        let { buildPages, loadState } = await import("../../src/options.js");
        await expect(loadState()).resolves.toBeUndefined();
        expect(() => buildPages()).not.toThrow();

        let input = document.getElementById("show-date");
        input.checked = false;
        expect(() => input.dispatchEvent(new Event("change"))).not.toThrow();
    });

    it("degrades gracefully when browser.storage.sync.set rejects (e.g. quota exceeded)", async () => {
        let localStore = { "sync-settings": true };
        global.browser = {
            storage: {
                local: makeLocalMock(localStore),
                sync: { get: vi.fn(() => Promise.resolve({})), set: vi.fn(() => Promise.reject(new Error("QuotaExceededError"))) }
            },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();

        let input = document.getElementById("show-date");
        input.checked = false;
        expect(() => input.dispatchEvent(new Event("change"))).not.toThrow();
        await new Promise((r) => setTimeout(r, 0));

        // The local write still succeeded despite the sync rejection.
        expect(global.browser.storage.local.set).toHaveBeenCalledWith({ "show-date": false });
    });

    it("degrades gracefully when browser.storage.sync.get rejects on load (e.g. not signed into Firefox Sync)", async () => {
        let localStore = { "sync-settings": true, "show-date": false };
        global.browser = {
            storage: {
                local: makeLocalMock(localStore),
                sync: { get: vi.fn(() => Promise.reject(new Error("not signed in"))), set: vi.fn(() => Promise.resolve()) }
            },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
        let { buildPages, loadState } = await import("../../src/options.js");
        await expect(loadState()).resolves.toBeUndefined();
        buildPages();
        // Falls back to the local value rather than throwing/blanking the field.
        expect(document.getElementById("show-date").checked).toBe(false);
    });
});
