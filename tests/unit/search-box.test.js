// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getEls, renderSearchBox, submitSearch, initSearchBox,
    getInstalledSearchEngines, getInstalledSearchEnginesDetailed,
    populateSearchEngineSelect, createEngineDropdown
} from "../../src/lib/render.js";
import { DEFAULTS } from "../../src/settings/schema.js";

function freshDom() {
    document.body.innerHTML = `
      <form id="cal-search-form" hidden>
        <span id="cal-search-engine-select" hidden></span>
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

    it("sets a translated placeholder on the search input", () => {
        initSearchBox(els, null);
        expect(els.searchInput.placeholder).toBeTruthy();
    });

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
        // Pick "Bing" through the real dropdown UI (button + listbox), not
        // by poking a .value setter — this exercises the actual click path.
        let toggle = els.searchEngineSelect.querySelector(".engine-dropdown-toggle");
        toggle.click();
        let bingOption = [...els.searchEngineSelect.querySelectorAll(".engine-dropdown-option")]
            .find((b) => b.textContent.includes("Bing"));
        bingOption.click();

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

describe("getInstalledSearchEnginesDetailed", () => {
    afterEach(() => { delete global.browser; });

    it("returns [] when browser.search is unavailable", async () => {
        global.browser = {};
        expect(await getInstalledSearchEnginesDetailed()).toEqual([]);
    });

    it("returns {name, favIconUrl} pairs, defaulting favIconUrl to null when absent", async () => {
        global.browser = {
            search: {
                get: () => Promise.resolve([
                    { name: "Google", favIconUrl: "moz-extension://abc/google.png" },
                    { name: "Bing" }
                ])
            }
        };
        expect(await getInstalledSearchEnginesDetailed()).toEqual([
            { name: "Google", favIconUrl: "moz-extension://abc/google.png" },
            { name: "Bing", favIconUrl: null }
        ]);
    });
});

describe("createEngineDropdown", () => {
    afterEach(() => { document.body.innerHTML = ""; });

    it("always includes a 'System default' entry plus every given engine", () => {
        let dropdown = createEngineDropdown({ engines: [{ name: "Google" }, { name: "Bing" }], currentValue: "default" });
        let names = [...dropdown.querySelectorAll(".engine-dropdown-option")].map((b) => b.textContent);
        expect(names.some((n) => n.includes("Google"))).toBe(true);
        expect(names.some((n) => n.includes("Bing"))).toBe(true);
        expect(dropdown.querySelectorAll(".engine-dropdown-option").length).toBe(3);
    });

    it("starts closed, opens on toggle click, and shows the option list", () => {
        let dropdown = createEngineDropdown({ engines: [{ name: "Google" }], currentValue: "default" });
        document.body.appendChild(dropdown);
        let list = dropdown.querySelector(".engine-dropdown-list");
        let toggle = dropdown.querySelector(".engine-dropdown-toggle");
        expect(list.hidden).toBe(true);
        toggle.click();
        expect(list.hidden).toBe(false);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
    });

    it("selecting an option calls onSelect with its value, updates .value, and closes the list", () => {
        let onSelect = vi.fn();
        let dropdown = createEngineDropdown({ engines: [{ name: "Google" }, { name: "Bing" }], currentValue: "default", onSelect });
        document.body.appendChild(dropdown);
        dropdown.querySelector(".engine-dropdown-toggle").click();
        let bingOption = [...dropdown.querySelectorAll(".engine-dropdown-option")].find((b) => b.textContent.includes("Bing"));
        bingOption.click();

        expect(onSelect).toHaveBeenCalledWith("Bing");
        expect(dropdown.value).toBe("Bing");
        expect(dropdown.querySelector(".engine-dropdown-list").hidden).toBe(true);
    });

    it("closes on Escape without changing the selection", () => {
        let onSelect = vi.fn();
        let dropdown = createEngineDropdown({ engines: [{ name: "Google" }], currentValue: "default", onSelect });
        document.body.appendChild(dropdown);
        let toggle = dropdown.querySelector(".engine-dropdown-toggle");
        toggle.click();
        expect(dropdown.querySelector(".engine-dropdown-list").hidden).toBe(false);

        toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(dropdown.querySelector(".engine-dropdown-list").hidden).toBe(true);
        expect(onSelect).not.toHaveBeenCalled();
        expect(dropdown.value).toBe("default");
    });

    it("closes when clicking outside the control", () => {
        let dropdown = createEngineDropdown({ engines: [{ name: "Google" }], currentValue: "default" });
        document.body.appendChild(dropdown);
        let outside = document.createElement("div");
        document.body.appendChild(outside);

        dropdown.querySelector(".engine-dropdown-toggle").click();
        expect(dropdown.querySelector(".engine-dropdown-list").hidden).toBe(false);

        outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(dropdown.querySelector(".engine-dropdown-list").hidden).toBe(true);
    });

    it(".disabled proxies to the toggle button's disabled state", () => {
        let dropdown = createEngineDropdown({ engines: [{ name: "Google" }], currentValue: "default" });
        expect(dropdown.disabled).toBe(false);
        dropdown.disabled = true;
        expect(dropdown.querySelector(".engine-dropdown-toggle").disabled).toBe(true);
        expect(dropdown.disabled).toBe(true);
    });
});

describe("populateSearchEngineSelect", () => {
    let container;
    beforeEach(() => {
        document.body.innerHTML = `<span id="sel" hidden></span>`;
        container = document.getElementById("sel");
    });
    afterEach(() => { delete global.browser; });

    it("stays hidden and empty when fewer than 2 engines are discoverable", async () => {
        global.browser = { search: { get: () => Promise.resolve([{ name: "Google" }]) } };
        await populateSearchEngineSelect(container, "default");
        expect(container.hasAttribute("hidden")).toBe(true);
        expect(container.dropdown).toBeNull();
    });

    it("mounts a dropdown with 'System default' + every engine and unhides when 2+ are discoverable", async () => {
        global.browser = { search: { get: () => Promise.resolve([{ name: "Google" }, { name: "DuckDuckGo" }]) } };
        await populateSearchEngineSelect(container, "default");
        expect(container.hasAttribute("hidden")).toBe(false);
        expect(container.dropdown).toBeTruthy();
        let names = [...container.querySelectorAll(".engine-dropdown-option")].map((b) => b.textContent);
        expect(names.some((n) => n.includes("Google"))).toBe(true);
        expect(names.some((n) => n.includes("DuckDuckGo"))).toBe(true);
    });

    it("pre-selects the persisted default engine when it's among the installed ones", async () => {
        global.browser = { search: { get: () => Promise.resolve([{ name: "Google" }, { name: "DuckDuckGo" }]) } };
        await populateSearchEngineSelect(container, "DuckDuckGo");
        expect(container.dropdown.value).toBe("DuckDuckGo");
    });

    it("falls back to 'default' when the persisted engine isn't among the installed ones", async () => {
        global.browser = { search: { get: () => Promise.resolve([{ name: "Google" }, { name: "DuckDuckGo" }]) } };
        await populateSearchEngineSelect(container, "SomeRemovedEngine");
        expect(container.dropdown.value).toBe("default");
    });

    it("does not throw when the container is null", async () => {
        await expect(populateSearchEngineSelect(null, "default")).resolves.toBeUndefined();
    });
});
