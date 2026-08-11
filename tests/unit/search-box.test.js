// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getEls, renderSearchBox, submitSearch, initSearchBox,
    getInstalledSearchEngines, populateSearchEngineSelect
} from "../../src/lib/render.js";
import { DEFAULTS } from "../../src/settings/schema.js";

function freshDom() {
    document.body.innerHTML = `
      <form id="cal-search-form" hidden>
        <select id="cal-search-engine-select" hidden></select>
        <input id="cal-search-input" type="search">
        <button type="submit">Search</button>
      </form>
      <div id="cal-date"></div>
    `;
    return getEls(document);
}

describe("renderSearchBox", () => {
    let els;
    beforeEach(() => { els = freshDom(); });

    it("hides the search form when show-search-box is false (the default)", () => {
        renderSearchBox(els, Object.assign({}, DEFAULTS));
        expect(els.searchForm.hasAttribute("hidden")).toBe(true);
    });

    it("shows the search form when show-search-box is true", () => {
        renderSearchBox(els, Object.assign({}, DEFAULTS, { "show-search-box": true }));
        expect(els.searchForm.hasAttribute("hidden")).toBe(false);
    });
});

describe("submitSearch", () => {
    afterEach(() => { delete global.browser; });

    it("does nothing for an empty/whitespace-only query", async () => {
        global.browser = { search: { search: vi.fn() } };
        await submitSearch("   ", null);
        expect(global.browser.search.search).not.toHaveBeenCalled();
    });

    it("does nothing when browser.search is unavailable (permission/API missing)", async () => {
        global.browser = {};
        await expect(submitSearch("weather", null)).resolves.toBeUndefined();
    });

    it("calls browser.search.search with the trimmed query", async () => {
        let searchMock = vi.fn(() => Promise.resolve());
        global.browser = { search: { search: searchMock } };
        await submitSearch("  weather forecast  ", null);
        expect(searchMock).toHaveBeenCalledWith({ query: "weather forecast" });
    });

    it("includes a resolved tabId when resolveTabId is given", async () => {
        let searchMock = vi.fn(() => Promise.resolve());
        global.browser = { search: { search: searchMock } };
        await submitSearch("weather", async () => 42);
        expect(searchMock).toHaveBeenCalledWith({ query: "weather", tabId: 42 });
    });

    it("swallows errors from browser.search.search (e.g. permission not granted)", async () => {
        let searchMock = vi.fn(() => Promise.reject(new Error("no permission")));
        global.browser = { search: { search: searchMock } };
        await expect(submitSearch("weather", null)).resolves.toBeUndefined();
    });

    it("includes the chosen engine when one other than 'default' is given", async () => {
        let searchMock = vi.fn(() => Promise.resolve());
        global.browser = { search: { search: searchMock } };
        await submitSearch("weather", null, "DuckDuckGo");
        expect(searchMock).toHaveBeenCalledWith({ query: "weather", engine: "DuckDuckGo" });
    });

    it("omits the engine field for 'default' (use Firefox's own default engine)", async () => {
        let searchMock = vi.fn(() => Promise.resolve());
        global.browser = { search: { search: searchMock } };
        await submitSearch("weather", null, "default");
        expect(searchMock).toHaveBeenCalledWith({ query: "weather" });
    });
});

describe("initSearchBox", () => {
    let els;
    beforeEach(() => { els = freshDom(); });
    afterEach(() => { delete global.browser; });

    it("wires the form's submit event to call browser.search.search and clear the input", async () => {
        let searchMock = vi.fn(() => Promise.resolve());
        global.browser = { search: { search: searchMock } };
        initSearchBox(els, null);

        els.searchInput.value = "capital of hungary";
        els.searchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

        // submitSearch is fire-and-forget from the submit handler; flush microtasks.
        await Promise.resolve();
        await Promise.resolve();

        expect(searchMock).toHaveBeenCalledWith({ query: "capital of hungary" });
        expect(els.searchInput.value).toBe("");
    });

    it("does not throw when the form/input are missing from the DOM", () => {
        expect(() => initSearchBox({}, null)).not.toThrow();
    });

    it("passes the result of getEngine() through to browser.search.search as the engine", async () => {
        let searchMock = vi.fn(() => Promise.resolve());
        global.browser = { search: { search: searchMock } };
        initSearchBox(els, null, () => "Bing");

        els.searchInput.value = "capital of hungary";
        els.searchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        await Promise.resolve();

        expect(searchMock).toHaveBeenCalledWith({ query: "capital of hungary", engine: "Bing" });
    });

    it("uses the per-search engine picker's current value, overriding getEngine(), when 2+ engines make it visible", async () => {
        let searchMock = vi.fn(() => Promise.resolve());
        global.browser = {
            search: {
                search: searchMock,
                get: () => Promise.resolve([{ name: "DuckDuckGo" }, { name: "Bing" }])
            }
        };
        initSearchBox(els, null, () => "default");
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

        expect(els.searchEngineSelect.hasAttribute("hidden")).toBe(false);
        els.searchEngineSelect.value = "Bing";
        els.searchInput.value = "weather";
        els.searchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await Promise.resolve(); await Promise.resolve();

        expect(searchMock).toHaveBeenCalledWith({ query: "weather", engine: "Bing" });
    });
});

describe("getInstalledSearchEngines", () => {
    afterEach(() => { delete global.browser; });

    it("returns [] when browser.search is unavailable", async () => {
        global.browser = {};
        expect(await getInstalledSearchEngines()).toEqual([]);
    });

    it("returns [] when browser.search.get() rejects", async () => {
        global.browser = { search: { get: () => Promise.reject(new Error("nope")) } };
        expect(await getInstalledSearchEngines()).toEqual([]);
    });

    it("returns the engine names, filtering out malformed entries", async () => {
        global.browser = {
            search: { get: () => Promise.resolve([{ name: "Google" }, null, { noName: true }, { name: "Bing" }]) }
        };
        expect(await getInstalledSearchEngines()).toEqual(["Google", "Bing"]);
    });
});

describe("populateSearchEngineSelect", () => {
    let select;
    beforeEach(() => {
        document.body.innerHTML = `<select id="sel" hidden></select>`;
        select = document.getElementById("sel");
    });
    afterEach(() => { delete global.browser; });

    it("stays hidden when fewer than 2 engines are discoverable", async () => {
        global.browser = { search: { get: () => Promise.resolve([{ name: "Google" }]) } };
        await populateSearchEngineSelect(select, "default");
        expect(select.hasAttribute("hidden")).toBe(true);
    });

    it("populates 'System default' + every engine and unhides when 2+ are discoverable", async () => {
        global.browser = { search: { get: () => Promise.resolve([{ name: "Google" }, { name: "DuckDuckGo" }]) } };
        await populateSearchEngineSelect(select, "default");
        expect(select.hasAttribute("hidden")).toBe(false);
        expect([...select.options].map((o) => o.value)).toEqual(["default", "Google", "DuckDuckGo"]);
    });

    it("pre-selects the persisted default engine when it's among the installed ones", async () => {
        global.browser = { search: { get: () => Promise.resolve([{ name: "Google" }, { name: "DuckDuckGo" }]) } };
        await populateSearchEngineSelect(select, "DuckDuckGo");
        expect(select.value).toBe("DuckDuckGo");
    });

    it("falls back to 'default' when the persisted engine isn't among the installed ones", async () => {
        global.browser = { search: { get: () => Promise.resolve([{ name: "Google" }, { name: "DuckDuckGo" }]) } };
        await populateSearchEngineSelect(select, "SomeRemovedEngine");
        expect(select.value).toBe("default");
    });

    it("does not throw when selectEl is null", async () => {
        await expect(populateSearchEngineSelect(null, "default")).resolves.toBeUndefined();
    });
});
