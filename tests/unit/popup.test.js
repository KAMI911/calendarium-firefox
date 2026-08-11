// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getEls, renderAll } from "../../src/lib/render.js";
import { DEFAULTS } from "../../src/settings/schema.js";
import { initApp } from "../../src/popup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(path.resolve(__dirname, "../../src/popup.html"), "utf8");

function freshDom() {
    let bodyMatch = HTML.match(/<body>([\s\S]*)<\/body>/);
    document.body.innerHTML = bodyMatch[1];
    return getEls(document);
}

function baseState(overrides = {}) {
    return Object.assign({}, DEFAULTS, overrides);
}

describe("popup.html markup reuses newtab's DOM ids (shared render.js works against it)", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("exposes every element getEls() expects", () => {
        expect(els.date).toBeTruthy();
        expect(els.time).toBeTruthy();
        expect(els.searchForm).toBeTruthy();
        expect(els.searchInput).toBeTruthy();
    });

    it("has a compact-view 'open full view' link the newtab page doesn't have", () => {
        expect(document.getElementById("cal-open-full-view")).toBeTruthy();
    });

    it("renderAll from the shared module toggles popup sections exactly like the newtab page", () => {
        const NOW = new Date(2026, 5, 15, 10, 30, 0);
        renderAll(els, baseState({ "show-date": false, "show-time": true }), {
            namedayData: null, folkdayData: null, holidayData: null,
            wikiOnThisDay: null, wikiFeatured: null, wikiRotateStep: 0
        }, NOW);
        expect(els.date.hasAttribute("hidden")).toBe(true);
        expect(els.time.hasAttribute("hidden")).toBe(false);
        expect(els.time.textContent).toBe("10:30");
    });
});

/** Minimal in-memory browser.storage.local mock (mirrors tests/unit/wikipedia.test.js). */
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

describe("popup.js initApp orchestration", () => {
    let consoleErrorSpy;

    beforeEach(() => {
        freshDom();
        // loadLocaleData resolves each locale to a real language (jsdom's
        // default navigator.language is "en-US"), so Namedays/Folkdays/
        // Holidays.loadData() will call fetch(); reject it so the loaders
        // exercise their existing catch-and-return-null path instead of
        // hitting the network, exactly like tests/unit/*days.test.js do
        // when they don't care about the fetched payload.
        global.fetch = vi.fn(() => Promise.reject(new Error("no network in tests")));
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        global.browser = {
            runtime: { id: "test-id", getURL: (p) => "moz-extension://test/" + p },
            storage: makeStorageMock(),
            permissions: { contains: vi.fn(() => Promise.resolve(false)) },
            tabs: {
                query: vi.fn(() => Promise.resolve([{ id: 7 }])),
                create: vi.fn(() => Promise.resolve({ id: 99 }))
            }
        };
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        delete global.browser;
        delete global.fetch;
    });

    it("renders the widget from default settings without throwing", async () => {
        await initApp();
        let els = getEls(document);
        expect(els.time.hasAttribute("hidden")).toBe(false);
    });

    it("clicking 'open full view' opens view.html in a new tab", async () => {
        await initApp();
        document.getElementById("cal-open-full-view").click();
        expect(global.browser.tabs.create).toHaveBeenCalledWith({
            url: "moz-extension://test/view.html"
        });
    });
});
