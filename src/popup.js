/*
 * popup.js — toolbar action popup entry point for the Calendarium extension.
 *
 * Renders the exact same widget as newtab.js/view.html, using the shared
 * render<Section> functions from src/lib/render.js against popup.html's
 * DOM — no render logic is duplicated here.
 *
 * Orchestration is intentionally simpler than newtab.js's, because a
 * popup only exists while the user has it open: one full render on load,
 * plus a 1s clock tick (only while the popup is visible) for seconds /
 * city-time display. There is no 60s full-refresh timer or Wikipedia
 * rotation counter — a popup is rarely open long enough for either to
 * matter, and both are cleaned up automatically when the popup closes
 * (the whole document is torn down), unlike the New Tab page's
 * long-lived timers which are cleared explicitly.
 */

import { Namedays } from "./lib/namedays.js";
import { Folkdays } from "./lib/folkdays.js";
import { Holidays } from "./lib/holidays.js";
import { Wikipedia } from "./lib/wikipedia.js";
import { DEFAULTS } from "./settings/schema.js";
import {
    getEls, renderAll, renderTime, renderCityTimes,
    renderWikiOnThisDay, renderWikiFeatured, initSearchBox,
    resolveLocale, applyThemeMode
} from "./lib/render.js";

async function loadSettings() {
    let stored = (typeof browser !== "undefined") ? await browser.storage.local.get(null) : {};
    return Object.assign({}, DEFAULTS, stored);
}

async function loadLocaleData(state) {
    let ndLang = resolveLocale(state["nameday-locale"], ["hu", "de", "en", "fr", "es", "it"], "en");
    let fdLang = resolveLocale(state["folkday-locale"], ["hu", "de", "en", "fr", "es", "it"], "hu");
    let hlLang = resolveLocale(state["holiday-locale"], ["hu", "de", "en", "fr", "es", "it"], "hu");
    let [namedayData, folkdayData, holidayData] = await Promise.all([
        Namedays.loadData("data/namedays", ndLang),
        Folkdays.loadData("data/folkdays", fdLang),
        Holidays.loadData("data/holidays", hlLang)
    ]);
    return { namedayData, folkdayData, holidayData };
}

/** Resolve the tab id search results should open in: the active tab in the current window. */
async function resolveActiveTabId() {
    if (typeof browser === "undefined" || !browser.tabs || !browser.tabs.query) return null;
    let tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return (tabs && tabs[0]) ? tabs[0].id : null;
}

async function fetchWikipediaOnce(state, els, data) {
    if (!state["show-wikipedia"]) return;
    let hasPerm = false;
    try {
        hasPerm = await browser.permissions.contains({ origins: ["https://api.wikimedia.org/*"] });
    } catch (_e) { /* ignore */ }
    if (!hasPerm) return;

    let now = new Date();
    let m = now.getMonth() + 1, d = now.getDate(), y = now.getFullYear();
    let lang = resolveLocale(state["wikipedia-lang"], ["en", "de", "hu", "fr", "es", "it"], "en");
    Wikipedia.CACHE_TTL_SECS = (state["wikipedia-cache-hours"] || 12) * 3600;

    if (state["show-wiki-births"] || state["show-wiki-deaths"] || state["show-wiki-events"]) {
        Wikipedia.fetchOnThisDay(m, d, lang, (result) => {
            if (!result) return;
            data.wikiOnThisDay = result;
            renderWikiOnThisDay(els, state, data.wikiOnThisDay, 0);
        });
    }
    if (state["show-wiki-featured"]) {
        Wikipedia.fetchFeatured(y, m, d, lang, (result) => {
            data.wikiFeatured = result;
            renderWikiFeatured(els, state, data.wikiFeatured);
        });
    }
}

async function initApp() {
    let els = getEls(document);
    let state = await loadSettings();
    // Theme mode (light/dark/auto) applies everywhere, including the popup;
    // background-style (solid color / gradient / custom image) intentionally
    // does not — the popup always uses the plain theme palette, since a
    // background image/gradient behind a ~380px-wide scrollable box adds
    // visual noise without much payoff. See applyBackground's doc comment.
    applyThemeMode(document.documentElement, state);
    let localeData = await loadLocaleData(state);
    let data = Object.assign({ wikiOnThisDay: null, wikiFeatured: null, wikiRotateStep: 0 }, localeData);

    initSearchBox(els, resolveActiveTabId);

    let openFullViewBtn = document.getElementById("cal-open-full-view");
    if (openFullViewBtn) {
        openFullViewBtn.addEventListener("click", () => {
            browser.tabs.create({ url: browser.runtime.getURL("view.html") });
            try { if (typeof window !== "undefined") window.close(); } catch (_e) { /* ignore */ }
        });
    }

    function render() {
        renderAll(els, state, data, new Date());
    }

    render();
    fetchWikipediaOnce(state, els, data);

    let clockTimer = null;
    if ((state["show-time"] && state["show-seconds"]) || state["show-city-time"]) {
        clockTimer = setInterval(() => {
            let now = new Date();
            renderTime(els, state, now);
            renderCityTimes(els, state);
        }, 1000);
    }
    if (typeof window !== "undefined") {
        window.addEventListener("unload", () => {
            if (clockTimer) clearInterval(clockTimer);
        });
    }
}

if (typeof document !== "undefined" && typeof browser !== "undefined" && browser.runtime && browser.runtime.id) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
    } else {
        initApp();
    }
}

export { initApp };
