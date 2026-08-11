// @vitest-environment jsdom
//
// newtab.js's background-rotate timer is orchestration (not part of the
// pure/sync lib/render.js functions covered by theme-background.test.js),
// so it needs its own test with fake timers, mirroring the
// browser.storage.local mock pattern used by tests/unit/popup.test.js and
// tests/unit/background.test.js.
//
// `initApp` is imported statically, at the top of this file, BEFORE any
// `beforeEach` sets `global.browser` — this is deliberate (see
// popup.test.js for the same trick): newtab.js's bottom-of-file auto-run
// guard only fires if `browser.runtime.id` already exists at *import*
// time, so importing while `browser` is still undefined means the
// manual `await initApp()` calls below are the only invocations that
// ever run, rather than double-initializing against detached DOM.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getEls } from "../../src/lib/render.js";
import { BACKGROUND_GRADIENT_OPTIONS } from "../../src/settings/schema.js";
import { initApp } from "../../src/newtab.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(path.resolve(__dirname, "../../src/newtab.html"), "utf8");

function freshDom() {
    let bodyMatch = HTML.match(/<body>([\s\S]*)<\/body>/);
    document.body.innerHTML = bodyMatch[1];
    document.body.className = "";
    return getEls(document);
}

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

function makeBrowserMock(stored) {
    return {
        runtime: { id: "test-id", getURL: (p) => "moz-extension://test/" + p },
        storage: makeStorageMock(stored),
        permissions: { contains: vi.fn(() => Promise.resolve(false)) },
        tabs: { getCurrent: vi.fn(() => Promise.resolve({ id: 1 })) }
        // No `theme` key: exercises the same defensive
        // feature-detect-before-calling guard as background.js's
        // ensureMenu() does for browser.menus (see render.js's
        // applyFirefoxThemeBackground and newtab.js's onUpdated wiring).
    };
}

describe("newtab.js background-rotate timer", () => {
    let consoleErrorSpy;

    beforeEach(() => {
        freshDom();
        // loadLocaleData resolves each locale to a real language and calls
        // fetch(); reject it so Namedays/Folkdays/Holidays.loadData() take
        // their existing catch-and-return-null path instead of hitting the
        // network, exactly like popup.test.js does.
        global.fetch = vi.fn(() => Promise.reject(new Error("no network in tests")));
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        delete global.browser;
        delete global.fetch;
        vi.useRealTimers();
    });

    it("cycles through the full gradient list on the configured interval while background-rotate is on", async () => {
        vi.useFakeTimers();
        global.browser = makeBrowserMock({
            "background-style": "gradient",
            "background-rotate": true,
            "background-rotate-minutes": 10
        });
        await initApp();

        let names = Object.values(BACKGROUND_GRADIENT_OPTIONS);
        expect(document.body.classList.contains("calendarium-bg-gradient-" + names[0])).toBe(true);

        await vi.advanceTimersByTimeAsync(10 * 60000);
        expect(document.body.classList.contains("calendarium-bg-gradient-" + names[1])).toBe(true);

        await vi.advanceTimersByTimeAsync(10 * 60000);
        expect(document.body.classList.contains("calendarium-bg-gradient-" + names[2])).toBe(true);
    });

    it("does not advance when background-rotate is off", async () => {
        vi.useFakeTimers();
        global.browser = makeBrowserMock({ "background-style": "gradient", "background-rotate": false });
        await initApp();
        let before = document.body.className;
        await vi.advanceTimersByTimeAsync(60 * 60000);
        expect(document.body.className).toBe(before);
    });

    it("does not advance for a background-style other than gradient/custom-image-url, even with rotate on", async () => {
        vi.useFakeTimers();
        global.browser = makeBrowserMock({ "background-style": "solid-color", "background-rotate": true });
        await initApp();
        let before = document.body.className;
        await vi.advanceTimersByTimeAsync(60 * 60000);
        expect(document.body.className).toBe(before);
    });

    it("pauses rotation while the tab is hidden (document.hidden / visibilitychange) and resumes when visible again", async () => {
        vi.useFakeTimers();
        global.browser = makeBrowserMock({
            "background-style": "gradient", "background-rotate": true, "background-rotate-minutes": 5
        });
        await initApp();
        let names = Object.values(BACKGROUND_GRADIENT_OPTIONS);
        expect(document.body.classList.contains("calendarium-bg-gradient-" + names[0])).toBe(true);

        Object.defineProperty(document, "hidden", { value: true, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));

        // Far more than one rotation interval's worth of time passes while
        // hidden — the timer should have been cleared, so nothing advances.
        await vi.advanceTimersByTimeAsync(60 * 60000);
        expect(document.body.classList.contains("calendarium-bg-gradient-" + names[0])).toBe(true);

        Object.defineProperty(document, "hidden", { value: false, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));

        await vi.advanceTimersByTimeAsync(5 * 60000);
        expect(document.body.classList.contains("calendarium-bg-gradient-" + names[1])).toBe(true);
    });

    it("does not throw when browser.theme is unavailable (e.g. Firefox for Android)", async () => {
        vi.useFakeTimers();
        global.browser = makeBrowserMock({ "background-style": "firefox-theme" });
        await initApp();
        expect(document.body.classList.contains("calendarium-bg-firefox-theme")).toBe(true);
    });
});
