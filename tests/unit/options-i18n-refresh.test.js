// @vitest-environment jsdom
//
// Safety net for the rare "user changes Firefox's UI language while the
// options page is already open" case: unlike newtab.js (which re-renders,
// and therefore re-translates, on its ~60s refresh timer anyway), options.js
// only builds its labels once on load. refreshTranslations() rebuilds the
// whole page from the current state so every _()-translated string is
// re-read, and is wired to fire on visibilitychange (tab regains focus) —
// see options.js's own doc comment above it for the rationale.
import { describe, it, expect, beforeEach, vi } from "vitest";

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

describe("options.js refreshTranslations() (i18n safety net)", () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <h1 id="options-title"></h1>
            <nav id="options-tabs"></nav>
            <div id="options-pages"></div>
            <p id="options-status"></p>
        `;
        global.browser = {
            storage: { local: makeLocalMock({}) },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) },
            permissions: { contains: vi.fn(() => Promise.resolve(true)) }
        };
    });

    it("rebuilds the page content (fresh DOM nodes) without throwing", async () => {
        let { buildPages, loadState, refreshTranslations } = await import("../../src/options.js");
        await loadState();
        buildPages();

        let before = document.getElementById("show-date");
        expect(before).toBeTruthy();

        expect(() => refreshTranslations()).not.toThrow();

        let after = document.getElementById("show-date");
        expect(after).toBeTruthy();
        expect(after).not.toBe(before); // buildPages() clears innerHTML and recreates everything
    });

    it("preserves the currently active page/tab across a refresh, instead of resetting to the first page", async () => {
        let { buildPages, loadState, selectPage, refreshTranslations } = await import("../../src/options.js");
        await loadState();
        buildPages();

        selectPage("page-location");
        expect(document.querySelector('.options-page[data-page="page-location"]').classList.contains("active")).toBe(true);

        refreshTranslations();

        expect(document.querySelector('.options-page[data-page="page-location"]').classList.contains("active")).toBe(true);
        expect(document.querySelector('.options-page[data-page="page-general"]').classList.contains("active")).toBe(false);
    });

    it("re-applies field state (e.g. a checkbox reflecting the persisted value) after refresh", async () => {
        global.browser.storage.local = makeLocalMock({ "show-date": false });
        let { buildPages, loadState, refreshTranslations } = await import("../../src/options.js");
        await loadState();
        buildPages();
        refreshTranslations();

        expect(document.getElementById("show-date").checked).toBe(false);
    });

    it("runs automatically when the document's visibility changes to visible", async () => {
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();

        let before = document.getElementById("show-date");

        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));

        let after = document.getElementById("show-date");
        expect(after).not.toBe(before);
    });

    it("does NOT rebuild when the document becomes hidden (only on regaining visibility)", async () => {
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();

        let before = document.getElementById("show-date");

        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));

        expect(document.getElementById("show-date")).toBe(before);
    });
});
