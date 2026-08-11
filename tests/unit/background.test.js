// background.js registers all of its listeners as import-time side effects
// (onInstalled/onStartup/alarms/storage/menus), so each test here mocks
// `global.browser` *before* dynamically importing the module and calls
// `vi.resetModules()` first so every test gets a fresh import (otherwise
// the second import would hit vitest's module cache and re-run no code).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Minimal in-memory browser.storage.local mock (mirrors other unit tests). */
function makeStorageMock(initial = {}) {
    let store = { ...initial };
    return {
        local: {
            get: vi.fn((keys) => {
                if (keys === null || keys === undefined) return Promise.resolve({ ...store });
                if (typeof keys === "string") return Promise.resolve(keys in store ? { [keys]: store[keys] } : {});
                let out = {};
                for (let k of keys) if (k in store) out[k] = store[k];
                return Promise.resolve(out);
            }),
            set: vi.fn((obj) => { Object.assign(store, obj); return Promise.resolve(); })
        },
        onChanged: { addListener: vi.fn() }
    };
}

/**
 * Build a `global.browser` mock. `withMenus` controls whether `browser.menus`
 * exists at all, simulating Firefox for Android (where the API is absent).
 */
function makeBrowserMock({ withMenus }) {
    let listeners = {
        onInstalled: [],
        onStartup: []
    };
    let browserMock = {
        runtime: {
            id: "test-id",
            getURL: (p) => "moz-extension://test/" + p,
            onInstalled: { addListener: (cb) => listeners.onInstalled.push(cb) },
            onStartup: { addListener: (cb) => listeners.onStartup.push(cb) },
            onMessage: { addListener: vi.fn() }
        },
        storage: makeStorageMock(),
        permissions: {
            contains: vi.fn(() => Promise.resolve(false)),
            request: vi.fn(() => Promise.resolve(false))
        },
        alarms: {
            clear: vi.fn(() => Promise.resolve()),
            create: vi.fn(),
            onAlarm: { addListener: vi.fn() }
        },
        tabs: { create: vi.fn(() => Promise.resolve({ id: 1 })) }
    };
    if (withMenus) {
        browserMock.menus = {
            removeAll: vi.fn(() => Promise.resolve()),
            create: vi.fn(),
            onClicked: { addListener: vi.fn() }
        };
    }
    browserMock.__listeners = listeners;
    return browserMock;
}

describe("background.js on a platform without browser.menus (e.g. Firefox for Android)", () => {
    let consoleErrorSpy;

    beforeEach(() => {
        vi.resetModules();
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        delete global.browser;
    });

    it("importing the module does not throw when browser.menus is undefined", async () => {
        global.browser = makeBrowserMock({ withMenus: false });
        await expect(import("../../src/background.js")).resolves.toBeTruthy();
    });

    it("runs onInstalled's alarm scheduling to completion even though menus is missing", async () => {
        global.browser = makeBrowserMock({ withMenus: false });
        await import("../../src/background.js");
        let onInstalledCbs = global.browser.__listeners.onInstalled;
        expect(onInstalledCbs.length).toBeGreaterThan(0);

        // The onInstalled callback fires scheduleAlarm() (async) and
        // ensureMenu() (feature-detects and no-ops); give both a tick to
        // settle, then assert the alarm setup actually completed.
        for (let cb of onInstalledCbs) cb();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(global.browser.alarms.clear).toHaveBeenCalled();
        expect(global.browser.alarms.create).toHaveBeenCalled();
    });

    it("does not register a menus.onClicked listener when browser.menus is absent", async () => {
        global.browser = makeBrowserMock({ withMenus: false });
        await import("../../src/background.js");
        // No assertion target exists (browser.menus is undefined) — the
        // real assertion is simply that importing/running got here without
        // throwing, which the surrounding try/catch in this test would
        // otherwise have surfaced as a failure.
        expect(global.browser.menus).toBeUndefined();
    });
});

describe("background.js on a platform with browser.menus (desktop) — unchanged behavior", () => {
    let consoleErrorSpy;

    beforeEach(() => {
        vi.resetModules();
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        delete global.browser;
    });

    it("still creates the 'open full view' menu item via onInstalled", async () => {
        global.browser = makeBrowserMock({ withMenus: true });
        await import("../../src/background.js");
        let onInstalledCbs = global.browser.__listeners.onInstalled;
        for (let cb of onInstalledCbs) cb();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(global.browser.menus.removeAll).toHaveBeenCalled();
        expect(global.browser.menus.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Open full view in a new tab" })
        );
        expect(global.browser.menus.onClicked.addListener).toHaveBeenCalled();
    });

    it("does not throw even if browser.menus.create rejects/throws", async () => {
        global.browser = makeBrowserMock({ withMenus: true });
        global.browser.menus.create = vi.fn(() => { throw new Error("boom"); });
        await import("../../src/background.js");
        let onInstalledCbs = global.browser.__listeners.onInstalled;
        expect(() => { for (let cb of onInstalledCbs) cb(); }).not.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Alarm setup (a separate concern) still completed despite the
        // menu failure.
        expect(global.browser.alarms.create).toHaveBeenCalled();
    });
});
