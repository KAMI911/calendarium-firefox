/*
 * background.js — MV3 event page for the Calendarium extension.
 *
 * Responsibilities:
 *   - Periodically refresh the Wikipedia cache via browser.alarms, honoring
 *     the user's "wikipedia-cache-hours" setting, so newtab.js can render
 *     from a warm cache immediately on every New Tab open.
 *   - Handle the browser.permissions.request() flow for the optional
 *     "https://api.wikimedia.org/*" host permission, triggered by a message
 *     from options.js when the user enables the Wikipedia section.
 *
 * This is an event page (not a persistent background page): it may be
 * unloaded between events by Firefox and is re-started on the next alarm
 * or message, so all state is re-derived from browser.storage.local on
 * every wake-up rather than held in module-level variables across calls.
 */

import { Wikipedia } from "./lib/wikipedia.js";
import { DEFAULTS } from "./settings/schema.js";

const WIKI_ALARM_NAME = "calendarium-wikipedia-refresh";
const WIKI_HOST_PERMISSION = { origins: ["https://api.wikimedia.org/*"] };
const OPEN_VIEW_MENU_ID = "calendarium-open-full-view";

/** Resolve "auto" locale settings the same way newtab.js does, minimal version for background use. */
function resolveLang(value, supported, fallback) {
    if (value && value !== "auto") return value;
    let langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
    for (let l of langs) {
        if (!l) continue;
        let short = l.split("-")[0].toLowerCase();
        if (supported.indexOf(short) !== -1) return short;
    }
    return fallback;
}

async function getSettings() {
    let stored = await browser.storage.local.get(null);
    return Object.assign({}, DEFAULTS, stored);
}

async function hasWikipediaPermission() {
    try {
        return await browser.permissions.contains(WIKI_HOST_PERMISSION);
    } catch (_e) {
        return false;
    }
}

/** Fetch/refresh the Wikipedia cache for "today" in the configured language. */
async function refreshWikipediaCache() {
    let settings = await getSettings();
    if (!settings["show-wikipedia"]) return;
    if (!(await hasWikipediaPermission())) return;

    let now = new Date();
    let month = now.getMonth() + 1;
    let day = now.getDate();
    let year = now.getFullYear();
    let lang = resolveLang(settings["wikipedia-lang"], ["en", "de", "hu", "fr", "es", "it"], "en");

    Wikipedia.CACHE_TTL_SECS = (settings["wikipedia-cache-hours"] || 12) * 3600;

    try {
        if (settings["show-wiki-events"] || settings["show-wiki-births"] || settings["show-wiki-deaths"]) {
            await Wikipedia.fetchOnThisDay(month, day, lang);
        }
        if (settings["show-wiki-featured"]) {
            await Wikipedia.fetchFeatured(year, month, day, lang);
        }
    } catch (e) {
        console.error("Calendarium background: Wikipedia refresh failed: " + e);
    }
}

/** (Re)schedule the periodic alarm at the user's configured cache interval. */
async function scheduleAlarm() {
    let settings = await getSettings();
    let hours = settings["wikipedia-cache-hours"] || 12;
    // Refresh at half the cache TTL so the cache rarely goes stale between
    // alarms, with a sensible floor/ceiling.
    let periodMinutes = Math.max(15, Math.min(360, (hours * 60) / 2));
    await browser.alarms.clear(WIKI_ALARM_NAME);
    browser.alarms.create(WIKI_ALARM_NAME, { periodInMinutes: periodMinutes, delayInMinutes: 1 });
}

/**
 * Open view.html (the standalone full view) in a new tab — the single
 * place that actually does this, shared by both the toolbar button's
 * right-click "Open full view in a new tab" context menu item
 * (browser.menus.onClicked below) and the "open-full-view" keyboard
 * shortcut (browser.commands.onCommand below), so the two triggers can
 * never drift apart.
 */
function openFullView() {
    browser.tabs.create({ url: browser.runtime.getURL("view.html") });
}

/**
 * (Re)create the toolbar action's "Open full view in a new tab" context
 * menu item. Idempotent: removeAll() first so re-running it (e.g. on
 * every `web-ext run` reload during development, which re-fires
 * onInstalled without a real reinstall) never hits a duplicate-id error.
 */
async function ensureMenu() {
    if (typeof browser === "undefined" || !browser.menus) return;
    try {
        await browser.menus.removeAll();
    } catch (_e) { /* ignore */ }
    try {
        browser.menus.create({
            id: OPEN_VIEW_MENU_ID,
            title: "Open full view in a new tab",
            contexts: ["action"]
        });
    } catch (e) {
        console.error("Calendarium background: failed to create menu: " + e);
    }
}

browser.runtime.onInstalled.addListener(() => { scheduleAlarm(); ensureMenu(); });
browser.runtime.onStartup.addListener(() => { scheduleAlarm(); ensureMenu(); });

if (typeof browser !== "undefined" && browser.menus) {
    browser.menus.onClicked.addListener((info) => {
        if (info.menuItemId === OPEN_VIEW_MENU_ID) openFullView();
    });
}

// Keyboard shortcut (manifest.json's "commands" entry) — same handler as
// the context-menu item above, feature-detected the same defensive way as
// browser.menus/browser.theme/browser.search elsewhere in this codebase
// (browser.commands has historically had limited/no support on some
// platforms, e.g. older Firefox for Android builds).
if (typeof browser !== "undefined" && browser.commands) {
    browser.commands.onCommand.addListener((command) => {
        if (command === "open-full-view") openFullView();
    });
}

browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === WIKI_ALARM_NAME) refreshWikipediaCache();
});

// React to settings changes that affect scheduling (cache-hours) by
// re-scheduling the alarm; wikipedia enable/disable is handled by the
// permission-request flow below, not here.
browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes["wikipedia-cache-hours"]) scheduleAlarm();
    if (changes["show-wikipedia"] && changes["show-wikipedia"].newValue) {
        refreshWikipediaCache();
    }
});

browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (!message || typeof message !== "object") return undefined;

    if (message.type === "checkWikipediaPermission") {
        return hasWikipediaPermission().then((granted) => ({ granted }));
    }

    if (message.type === "refreshWikipediaNow") {
        return refreshWikipediaCache().then(() => ({ ok: true }));
    }

    return undefined;
});
