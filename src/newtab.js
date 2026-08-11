/*
 * newtab.js — New Tab page entry point for the Calendarium extension.
 *
 * All section rendering (getEls, render<Section>, renderAll, search-box
 * wiring, and the small pure helpers such as strftime) lives in
 * src/lib/render.js and is shared with src/popup.js. This file only owns
 * the orchestration that is specific to living on the New Tab page: a
 * full refresh every 60s, a 1s sub-tick only when seconds or city time
 * are shown, and a Wikipedia rotation counter advanced on the same
 * cadence — mirroring the original desklet's tick cadence.
 *
 * src/view.html (the standalone full-view page, opened via the toolbar
 * action's "Open full view in a new tab" context menu item) reuses this
 * exact file and markup as-is, since it has the same long-lived-tab
 * lifecycle as the New Tab page — no separate view.js is needed.
 */

import { Namedays } from "./lib/namedays.js";
import { Folkdays } from "./lib/folkdays.js";
import { Holidays } from "./lib/holidays.js";
import { Wikipedia } from "./lib/wikipedia.js";
import { DEFAULTS } from "./settings/schema.js";
import {
    getEls, renderAll, renderTime, renderCityTimes,
    renderWikiOnThisDay, renderWikiFeatured, initSearchBox,
    resolveLocale, applyThemeMode, applyBackground
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

/** Resolve the tab id search results should open in: the tab this page itself is running in. */
async function resolveOwnTabId() {
    if (typeof browser === "undefined" || !browser.tabs || !browser.tabs.getCurrent) return null;
    let tab = await browser.tabs.getCurrent();
    return tab ? tab.id : null;
}

function initApp() {
    let els = getEls(document);
    let data = { namedayData: null, folkdayData: null, holidayData: null, wikiOnThisDay: null, wikiFeatured: null, wikiRotateStep: 0 };
    let state = Object.assign({}, DEFAULTS);
    let fullTimer = null;
    let clockTimer = null;

    initSearchBox(els, resolveOwnTabId);

    function isHidden() {
        return typeof document !== "undefined" && "hidden" in document && document.hidden;
    }

    function scheduleClock() {
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
        if (isHidden()) return;
        if ((state["show-time"] && state["show-seconds"]) || state["show-city-time"]) {
            clockTimer = setInterval(() => {
                let now = new Date();
                renderTime(els, state, now);
                renderCityTimes(els, state);
            }, 1000);
        }
    }

    async function scheduleWikipedia(now) {
        if (!state["show-wikipedia"]) {
            data.wikiOnThisDay = null;
            data.wikiFeatured = null;
            renderWikiOnThisDay(els, state, null, 0);
            renderWikiFeatured(els, state, null);
            return;
        }
        let hasPerm = false;
        try {
            hasPerm = await browser.permissions.contains({ origins: ["https://api.wikimedia.org/*"] });
        } catch (_e) { /* ignore */ }
        if (!hasPerm) return;

        let m = now.getMonth() + 1, d = now.getDate(), y = now.getFullYear();
        let lang = resolveLocale(state["wikipedia-lang"], ["en", "de", "hu", "fr", "es", "it"], "en");
        Wikipedia.CACHE_TTL_SECS = (state["wikipedia-cache-hours"] || 12) * 3600;

        if (data.wikiOnThisDay) renderWikiOnThisDay(els, state, data.wikiOnThisDay, data.wikiRotateStep);

        if (state["show-wiki-births"] || state["show-wiki-deaths"] || state["show-wiki-events"]) {
            Wikipedia.fetchOnThisDay(m, d, lang, (result) => {
                if (!result) return;
                data.wikiOnThisDay = result;
                renderWikiOnThisDay(els, state, data.wikiOnThisDay, data.wikiRotateStep);
            });
        }
        if (state["show-wiki-featured"]) {
            Wikipedia.fetchFeatured(y, m, d, lang, (result) => {
                data.wikiFeatured = result;
                renderWikiFeatured(els, state, data.wikiFeatured);
            });
        }
    }

    async function refresh() {
        if (fullTimer) { clearTimeout(fullTimer); fullTimer = null; }
        let now = new Date();
        renderAll(els, state, data, now);
        data.wikiRotateStep = (data.wikiRotateStep || 0) + 1;
        scheduleWikipedia(now);
        if (!isHidden()) fullTimer = setTimeout(refresh, 60000);
        scheduleClock();
    }

    async function reload() {
        state = await loadSettings();
        applyThemeMode(document.documentElement, state);
        applyBackground(document.body, state);
        data = Object.assign(data, await loadLocaleData(state));
        data.wikiRotateStep = 0;
        data.wikiOnThisDay = null;
        refresh();
    }

    if (typeof browser !== "undefined" && browser.storage) {
        browser.storage.onChanged.addListener(() => reload());
    }

    // Pause the 60s/1s timers while this tab is hidden (backgrounded), so a
    // pile of unfocused New Tab pages don't keep ticking for nothing; catch
    // up immediately when it becomes visible again. Data loading (reload())
    // always runs once up front regardless of visibility.
    if (typeof document !== "undefined" && "hidden" in document) {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                if (fullTimer) { clearTimeout(fullTimer); fullTimer = null; }
                if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
            } else {
                refresh();
            }
        });
    }

    reload();
}

if (typeof document !== "undefined" && typeof browser !== "undefined" && browser.runtime && browser.runtime.id) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
    } else {
        initApp();
    }
}
