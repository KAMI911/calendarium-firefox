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
import { Weather } from "./lib/weather.js";
import { DEFAULTS, SYNCABLE_KEYS, mergeSyncedSettings } from "./settings/schema.js";
import {
    getEls, renderAll, renderTime, renderCityTimes,
    renderWikiOnThisDay, renderWikiFeatured, renderWeather, initSearchBox,
    resolveLocale, applyThemeMode, applyBackground,
    applyIconSize, applyPanelOpacity, applyFirefoxThemeBackground,
    applyImageFolderBackground, DEFAULT_LAT, DEFAULT_LON
} from "./lib/render.js";

async function loadSettings() {
    let stored = (typeof browser !== "undefined") ? await browser.storage.local.get(null) : {};
    let state = Object.assign({}, DEFAULTS, stored);
    // Firefox Sync (opt-in via "sync-settings") — see settings/schema.js's
    // SYNCABLE_KEYS/mergeSyncedSettings doc comment. Guarded the same
    // defensive way browser.menus/browser.theme/browser.search are
    // elsewhere: feature-detect, then try/catch the call itself, falling
    // back to local-only settings silently.
    if (state["sync-settings"] && typeof browser !== "undefined" && browser.storage && browser.storage.sync) {
        try {
            let synced = await browser.storage.sync.get(SYNCABLE_KEYS);
            state = mergeSyncedSettings(state, synced);
        } catch (_e) { /* Sync unavailable/not signed in — fall back to local-only settings */ }
    }
    return state;
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
    let data = {
        namedayData: null, folkdayData: null, holidayData: null,
        wikiOnThisDay: null, wikiFeatured: null, wikiRotateStep: 0,
        weather: { primary: null, cities: [null, null, null] }
    };
    let state = Object.assign({}, DEFAULTS);
    let fullTimer = null;
    let clockTimer = null;
    let bgRotateTimer = null;
    let bgRotateStep = 0;

    initSearchBox(els, resolveOwnTabId, () => state["search-engine"]);

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

    /**
     * "background-rotate" timer — cycles the gradient (or, for
     * custom-image-url, the parsed multi-line URL list) over time. Purely
     * a per-tab visual effect (nothing needs to survive the page being
     * closed), so this is a plain setInterval alongside the clock/refresh
     * timers above, not a browser.alarms entry in the background script.
     * Follows the same isHidden()/visibilitychange pause pattern as those.
     */
    function scheduleBackgroundRotation() {
        if (bgRotateTimer) { clearInterval(bgRotateTimer); bgRotateTimer = null; }
        if (isHidden()) return;
        let style = state["background-style"];
        let rotatable = style === "gradient" || style === "custom-image-url" || style === "image-folder";
        if (!state["background-rotate"] || !rotatable) return;
        let minutes = Math.max(1, state["background-rotate-minutes"] || 30);
        bgRotateTimer = setInterval(() => {
            bgRotateStep++;
            applyBackground(document.body, state, bgRotateStep);
            if (style === "image-folder") applyImageFolderBackground(document.body, state, bgRotateStep);
        }, minutes * 60000);
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

    /**
     * Fetch current weather for the primary location and every named extra
     * city, same permission-check-then-fetch shape as scheduleWikipedia()
     * above — the actual network-call gating (cache TTL) lives inside
     * lib/weather.js itself, exactly like Wikipedia, so this just needs to
     * call it on the same 60s refresh cadence rather than owning a
     * separate timer.
     */
    async function scheduleWeather() {
        if (!state["show-weather"]) {
            data.weather = { primary: null, cities: [null, null, null] };
            renderWeather(els, state, data.weather);
            return;
        }
        let hasPerm = false;
        try {
            hasPerm = await browser.permissions.contains({ origins: ["https://api.open-meteo.com/*"] });
        } catch (_e) { /* ignore */ }
        if (!hasPerm) return;

        Weather.CACHE_TTL_SECS = (state["weather-cache-hours"] || 1) * 3600;
        if (!data.weather) data.weather = { primary: null, cities: [null, null, null] };
        renderWeather(els, state, data.weather);

        let lat = state["use-manual-location"] ? state["latitude"]  : DEFAULT_LAT;
        let lon = state["use-manual-location"] ? state["longitude"] : DEFAULT_LON;
        Weather.fetchCurrent(lat, lon, (result) => {
            data.weather.primary = result;
            renderWeather(els, state, data.weather);
        });

        let cityKeys = [
            ["city1-name", "city1-lat", "city1-lon"],
            ["city2-name", "city2-lat", "city2-lon"],
            ["city3-name", "city3-lat", "city3-lon"]
        ];
        cityKeys.forEach(([nameKey, latKey, lonKey], i) => {
            let name = state[nameKey];
            if (!name || !name.trim()) return;
            Weather.fetchCurrent(state[latKey], state[lonKey], (result) => {
                data.weather.cities[i] = result;
                renderWeather(els, state, data.weather);
            });
        });
    }

    async function refresh() {
        if (fullTimer) { clearTimeout(fullTimer); fullTimer = null; }
        let now = new Date();
        renderAll(els, state, data, now);
        data.wikiRotateStep = (data.wikiRotateStep || 0) + 1;
        scheduleWikipedia(now);
        scheduleWeather();
        if (!isHidden()) fullTimer = setTimeout(refresh, 60000);
        scheduleClock();
    }

    async function reload() {
        state = await loadSettings();
        applyThemeMode(document.documentElement, state);
        applyIconSize(els.container, state);
        applyPanelOpacity(els.container, state);
        bgRotateStep = 0;
        applyBackground(document.body, state, bgRotateStep);
        if (state["background-style"] === "firefox-theme") applyFirefoxThemeBackground(document.body);
        if (state["background-style"] === "image-folder") applyImageFolderBackground(document.body, state, bgRotateStep);
        scheduleBackgroundRotation();
        data = Object.assign(data, await loadLocaleData(state));
        data.wikiRotateStep = 0;
        data.wikiOnThisDay = null;
        data.weather = { primary: null, cities: [null, null, null] };
        refresh();
    }

    if (typeof browser !== "undefined" && browser.storage) {
        browser.storage.onChanged.addListener(() => reload());
    }

    // Live-update the "Firefox theme colors" background style when the
    // user switches their active Firefox Theme while this page stays
    // open — feature-detected the same defensive way as everywhere else
    // browser.theme is touched (see applyFirefoxThemeBackground's doc
    // comment). Registered once, not per-reload, since the setting it
    // reacts to (state["background-style"]) is re-read on every firing.
    if (typeof browser !== "undefined" && browser.theme && browser.theme.onUpdated
        && typeof browser.theme.onUpdated.addListener === "function") {
        try {
            browser.theme.onUpdated.addListener(() => {
                if (state["background-style"] === "firefox-theme") applyFirefoxThemeBackground(document.body);
            });
        } catch (_e) { /* ignore — e.g. unsupported platform */ }
    }

    // Pause the 60s/1s/background-rotation timers while this tab is hidden
    // (backgrounded), so a pile of unfocused New Tab pages don't keep
    // ticking for nothing; catch up immediately when it becomes visible
    // again. Data loading (reload()) always runs once up front regardless
    // of visibility.
    if (typeof document !== "undefined" && "hidden" in document) {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                if (fullTimer) { clearTimeout(fullTimer); fullTimer = null; }
                if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
                if (bgRotateTimer) { clearInterval(bgRotateTimer); bgRotateTimer = null; }
            } else {
                refresh();
                scheduleBackgroundRotation();
            }
        });
    }

    return reload();
}

if (typeof document !== "undefined" && typeof browser !== "undefined" && browser.runtime && browser.runtime.id) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
    } else {
        initApp();
    }
}

export { initApp };
