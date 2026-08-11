// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getEls, renderSearchBox, submitSearch, initSearchBox } from "../../src/lib/render.js";
import { DEFAULTS } from "../../src/settings/schema.js";

function freshDom() {
    document.body.innerHTML = `
      <form id="cal-search-form" hidden>
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
});
