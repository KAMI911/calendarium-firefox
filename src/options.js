/*
 * options.js — generic options page renderer for the Calendarium extension.
 *
 * Renders the settings UI entirely from settings/schema.js (LAYOUT +
 * FIELDS) so every one of the 69 keys from the desklet's
 * settings-schema.json gets a control without being hand-wired here.
 * Persists to browser.storage.local and live-toggles dependent fields'
 * enabled state, mirroring the desklet's `dependency`/`indent` behaviour.
 */

import {
    LAYOUT, FIELDS, DEFAULTS, isFieldEnabled,
    NON_STORAGE_FIELD_TYPES, SYNCABLE_KEYS, isSyncable, mergeSyncedSettings
} from "./settings/schema.js";
import { Geocoder } from "./lib/geocoder.js";
import { _ } from "./lib/i18n.js";
import { getInstalledSearchEnginesDetailed, createEngineDropdown } from "./lib/render.js";
import { addImages, clearImages, getImageCount } from "./lib/image-store.js";

let state = Object.assign({}, DEFAULTS);
let fieldEls = {}; // id -> { row, input }
let geoDebounce = null;
let pickedFolderFiles = null; // FileList from the last folder-picker change, so the
                               // "include subfolders" checkbox can re-filter it live

function setStatus(text) {
    let el = document.getElementById("options-status");
    if (!el) return;
    el.textContent = text;
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 2500);
}

async function saveField(id, value) {
    state[id] = value;
    await browser.storage.local.set({ [id]: value });
    if (state["sync-settings"] && isSyncable(id)) {
        await trySyncSet(id, value);
    }
    applyDependencies();
}

/**
 * Best-effort mirror of a single field to browser.storage.sync — never
 * lets a Sync failure (quota exceeded, not signed into Firefox Sync, API
 * unavailable on this build/platform) block or throw past the local save
 * that already happened in saveField() above. Guarded the same defensive
 * way browser.menus/browser.theme/browser.search are elsewhere in this
 * codebase: feature-detect first, then try/catch the call itself.
 */
async function trySyncSet(id, value) {
    if (typeof browser === "undefined" || !browser.storage || !browser.storage.sync) return;
    try {
        await browser.storage.sync.set({ [id]: value });
    } catch (_e) { /* quota exceeded / not signed in / unavailable — local save already succeeded */ }
}

/**
 * Best-effort read of every syncable key from browser.storage.sync,
 * merged over the already-loaded local `state` (sync wins — see
 * mergeSyncedSettings's doc comment in settings/schema.js). No-ops
 * silently if browser.storage.sync is unavailable or the read fails, same
 * defensive guard as trySyncSet above.
 */
async function mergeSyncSettings() {
    if (typeof browser === "undefined" || !browser.storage || !browser.storage.sync) return;
    try {
        let synced = await browser.storage.sync.get(SYNCABLE_KEYS);
        state = mergeSyncedSettings(state, synced);
    } catch (_e) { /* Sync unavailable/not signed in — fall back to local-only settings */ }
}

function applyDependencies() {
    for (let field of Object.values(FIELDS)) {
        let entry = fieldEls[field.id];
        if (!entry) continue;
        let enabled = isFieldEnabled(field, state);
        entry.row.classList.toggle("disabled", !enabled);
        if (entry.input) entry.input.disabled = !enabled;
    }
}

/**
 * Rebuild the "engine-select" field's custom dropdown (see
 * createEngineDropdown() in lib/render.js) with the user's
 * actually-installed search engines, on top of the "System default" entry
 * the dropdown always includes. Uses the same
 * getInstalledSearchEnginesDetailed() helper as the in-widget per-search
 * picker in lib/render.js, so there's one code path for discovering
 * engines (and their icons), not two — silently leaves just the default
 * option if none are discoverable (API unavailable, permission not yet
 * granted, etc.; see that function's own guarding).
 */
async function populateEngineOptions(container, field) {
    let engines = await getInstalledSearchEnginesDetailed();
    let currentValue = state[field.id];
    let dropdown = createEngineDropdown({
        engines,
        currentValue,
        onSelect: (value) => onFieldChanged(field, value),
        ariaLabel: _(field.description)
    });
    container.textContent = "";
    container.appendChild(dropdown);
    container.dropdown = dropdown;
}

function buildFieldControl(field) {
    let input;
    switch (field.type) {
        case "checkbox": {
            input = document.createElement("input");
            input.type = "checkbox";
            input.checked = !!state[field.id];
            input.addEventListener("change", () => onFieldChanged(field, input.checked));
            break;
        }
        case "combobox": {
            input = document.createElement("select");
            for (let [label, value] of Object.entries(field.options || {})) {
                let opt = document.createElement("option");
                opt.value = value;
                opt.textContent = _(label);
                if (value === state[field.id]) opt.selected = true;
                input.appendChild(opt);
            }
            input.addEventListener("change", () => onFieldChanged(field, input.value));
            break;
        }
        case "engine-select": {
            // Unlike a plain "combobox", the option list isn't known
            // statically (it's whatever search engines the user has
            // installed, only discoverable at runtime via
            // browser.search.get()) AND each option can show the engine's
            // own icon — something a native <select>/<option> can't render
            // reliably, hence the custom dropdown built by
            // createEngineDropdown() (src/lib/render.js), shared with the
            // in-widget per-search picker there. Render a "System default"
            // -only dropdown immediately so the field isn't empty while the
            // engine list is in flight, then replace it once
            // populateEngineOptions() below resolves.
            let container = document.createElement("span");
            container.className = "engine-dropdown-container";
            // Proxy .disabled through to the mounted dropdown so the
            // generic applyDependencies() (entry.input.disabled = ...) keeps
            // working unmodified for this field type too.
            Object.defineProperty(container, "disabled", {
                configurable: true,
                get() { return this.dropdown ? this.dropdown.disabled : false; },
                set(v) { if (this.dropdown) this.dropdown.disabled = v; }
            });
            // Same proxy for .value, so syncFieldInputs()'s generic
            // `entry.input.value = state[id]` also works unmodified if this
            // field is ever included in a syncFieldInputs() call.
            Object.defineProperty(container, "value", {
                configurable: true,
                get() { return this.dropdown ? this.dropdown.value : state[field.id]; },
                set(v) { if (this.dropdown) this.dropdown.value = v; }
            });
            let initialDropdown = createEngineDropdown({
                engines: [],
                currentValue: state[field.id],
                onSelect: (value) => onFieldChanged(field, value),
                ariaLabel: _(field.description)
            });
            container.appendChild(initialDropdown);
            container.dropdown = initialDropdown;
            populateEngineOptions(container, field);
            input = container;
            break;
        }
        case "entry": {
            input = document.createElement("input");
            input.type = "text";
            input.value = state[field.id] != null ? state[field.id] : "";
            input.addEventListener("input", () => onFieldChanged(field, input.value));
            break;
        }
        case "entry-multiline": {
            // e.g. "background-image-url": one value per line, for fields
            // that accept multiple entries (see settings/schema.js's
            // field-shape doc comment and parseImageUrlList() in
            // lib/render.js, which is what actually parses/validates this
            // back out on the render side).
            input = document.createElement("textarea");
            input.rows = 3;
            input.value = state[field.id] != null ? state[field.id] : "";
            input.addEventListener("input", () => onFieldChanged(field, input.value));
            break;
        }
        case "color": {
            input = document.createElement("input");
            input.type = "color";
            input.value = state[field.id] || field.default;
            input.addEventListener("input", () => onFieldChanged(field, input.value));
            break;
        }
        case "spinbutton": {
            input = document.createElement("input");
            input.type = "number";
            if (field.min !== undefined) input.min = String(field.min);
            if (field.max !== undefined) input.max = String(field.max);
            if (field.step !== undefined) input.step = String(field.step);
            input.value = state[field.id];
            input.addEventListener("change", () => onFieldChanged(field, parseFloat(input.value)));
            break;
        }
        case "scale": {
            input = document.createElement("input");
            input.type = "range";
            if (field.min !== undefined) input.min = String(field.min);
            if (field.max !== undefined) input.max = String(field.max);
            if (field.step !== undefined) input.step = String(field.step);
            input.value = state[field.id];
            input.addEventListener("input", () => onFieldChanged(field, parseFloat(input.value)));
            break;
        }
        default:
            input = document.createElement("input");
            input.type = "text";
            input.value = state[field.id];
    }
    return input;
}

function onFieldChanged(field, value) {
    if (field.id === "show-wikipedia" && value === true) {
        requestWikipediaPermission(field);
        return;
    }
    if (field.id === "show-weather" && value === true) {
        requestWeatherPermission(field);
        return;
    }
    saveField(field.id, value);

    if (field.id === "location-search") {
        scheduleLocationSearch(value);
        return;
    }
    let cityMatch = field.id.match(/^city([123])-name$/);
    if (cityMatch) {
        handleCityNameChange(cityMatch[1], value);
    }

    // Re-filter/re-store the already-picked folder (if any) when the
    // "include subfolders" checkbox is toggled, so flipping it takes
    // effect immediately instead of only on the next folder pick.
    if (field.id === "background-folder-include-subfolders" && pickedFolderFiles) {
        let statusEl = document.getElementById("background-folder-picker-status");
        storePickedFolder(pickedFolderFiles, value, statusEl);
    }
}

// browser.permissions.request() must be called synchronously from within a
// user input handler (the checkbox's "change" event) in THIS page's context
// — relaying it through a runtime.sendMessage() to background.js loses the
// transient user-activation flag by the time it arrives there and throws
// "permissions.request may only be called from a user input handler". So the
// request itself happens here; only the post-grant cache warm-up is
// delegated to the background script (a plain fire-and-forget message,
// no activation requirement for that).
const WIKI_HOST_PERMISSION = { origins: ["https://api.wikimedia.org/*"] };

async function requestWikipediaPermission(field) {
    let entry = fieldEls[field.id];
    try {
        let granted = await browser.permissions.request(WIKI_HOST_PERMISSION);
        if (granted) {
            await saveField(field.id, true);
            browser.runtime.sendMessage({ type: "refreshWikipediaNow" }).catch(() => {});
        } else {
            if (entry && entry.input) entry.input.checked = false;
            setStatus(_("Permission was not granted; Wikipedia features stay disabled."));
        }
    } catch (e) {
        if (entry && entry.input) entry.input.checked = false;
        setStatus(String(e));
    }
}

// Same synchronous-user-gesture requirement as WIKI_HOST_PERMISSION above —
// see that constant's doc comment for why this must happen here, in the
// checkbox's own "change" handler, and not be relayed through
// runtime.sendMessage() to background.js.
const WEATHER_HOST_PERMISSION = { origins: ["https://api.open-meteo.com/*"] };

async function requestWeatherPermission(field) {
    let entry = fieldEls[field.id];
    try {
        let granted = await browser.permissions.request(WEATHER_HOST_PERMISSION);
        if (granted) {
            await saveField(field.id, true);
        } else {
            if (entry && entry.input) entry.input.checked = false;
            setStatus(_("Permission was not granted; Weather stays disabled."));
        }
    } catch (e) {
        if (entry && entry.input) entry.input.checked = false;
        setStatus(String(e));
    }
}

function scheduleLocationSearch(query) {
    if (geoDebounce) { clearTimeout(geoDebounce); geoDebounce = null; }
    if (!query || !query.trim()) return;
    geoDebounce = setTimeout(async () => {
        geoDebounce = null;
        await Geocoder.init();
        let results = Geocoder.search(query);
        if (results.length === 0) return;
        let r = results[0];
        await saveField("latitude", r.lat);
        await saveField("longitude", r.lon);
        await saveField("use-manual-location", true);
        syncFieldInputs(["latitude", "longitude", "use-manual-location"]);
        setStatus(_("Location set to") + " " + r.name + (r.country ? ", " + r.country : ""));
    }, 1500);
}

async function handleCityNameChange(n, name) {
    if (!name || !name.trim()) return;
    await Geocoder.init();
    let results = Geocoder.search(name);
    if (results.length === 0) return;
    let r = results[0];
    await saveField("city" + n + "-lat", r.lat);
    await saveField("city" + n + "-lon", r.lon);
    await saveField("city" + n + "-tz", r.tz || "");
    // Also normalize the visible name to the geocoder's canonical
    // capitalization (e.g. typed "london" -> saved/shown "London"), so the
    // input doesn't keep showing whatever raw casing the user typed. This
    // calls saveField() directly rather than going through an input "change"
    // event, so it does NOT re-enter onFieldChanged()/handleCityNameChange()
    // — only real DOM input events do that (see buildFieldControl()'s
    // "entry" case, which fires onFieldChanged from an "input" listener).
    await saveField("city" + n + "-name", r.name);
    syncFieldInputs(["city" + n + "-lat", "city" + n + "-lon", "city" + n + "-tz", "city" + n + "-name"]);
}

function syncFieldInputs(ids) {
    for (let id of ids) {
        let entry = fieldEls[id];
        if (!entry || !entry.input) continue;
        if (entry.input.type === "checkbox") entry.input.checked = !!state[id];
        else entry.input.value = state[id];
    }
}

/** Build the label (description + optional tooltip) shared by every field, generic or hand-special-cased. */
function buildFieldLabel(field) {
    let label = document.createElement("label");
    let labelText = document.createElement("span");
    labelText.className = "field-label";
    // Append the field's unit (e.g. "minutes", "days") in parentheses when
    // the schema declares one — spinbutton/scale fields carry a `units`
    // property that was previously parsed by nothing in this file, so it
    // silently never reached the UI even though every spinbutton had one.
    labelText.textContent = _(field.description) + (field.units ? " (" + _(field.units) + ")" : "");
    label.appendChild(labelText);
    if (field.tooltip) {
        let tip = document.createElement("span");
        tip.className = "field-tooltip";
        tip.textContent = _(field.tooltip);
        label.appendChild(tip);
    }
    return label;
}

/**
 * Read the current image count from IndexedDB (src/lib/image-store.js) and
 * reflect it in the folder-picker's status line — shared by the initial
 * render (so re-opening the options page after a previous pick shows the
 * right count) and every re-pick/re-filter.
 */
async function refreshFolderPickerStatus(statusEl) {
    let count = 0;
    try { count = await getImageCount(); }
    catch (_e) { count = 0; }
    statusEl.textContent = count > 0
        ? _("%d images loaded", count)
        : _("No images selected");
}

/** Filter+store a freshly-picked (or re-filtered) FileList, then refresh the status line. */
async function storePickedFolder(fileList, includeSubfolders, statusEl) {
    await clearImages();
    await addImages(fileList, !!includeSubfolders);
    if (statusEl) await refreshFolderPickerStatus(statusEl);
}

/**
 * Hand-special-cased "folder-picker" field (see settings/schema.js's
 * "background-folder-picker" entry): there's no generic field type for "let
 * the user pick a local folder of images", and the actual image data is
 * stored in IndexedDB (src/lib/image-store.js), not as a single
 * browser.storage.local scalar — so unlike every generic field type in
 * buildFieldControl(), this one is built by hand here, the same way the
 * Wikipedia permission flow is hand-special-cased in onFieldChanged/
 * requestWikipediaPermission above. It still participates in
 * fieldEls/applyDependencies (via the row + the file input itself) so
 * show/hide-on-dependency works exactly like every other field.
 */
function buildFolderPickerField(field) {
    let row = document.createElement("div");
    row.className = "options-field" + (field.indent ? " indent" : "");

    let label = buildFieldLabel(field);

    let container = document.createElement("div");
    container.className = "folder-picker-control";

    let fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = field.id;
    fileInput.multiple = true;
    // webkitdirectory (Firefox honors it despite the "webkit" prefix) is
    // what turns this into a folder picker returning every file under the
    // chosen folder (recursively), each exposing webkitRelativePath.
    fileInput.setAttribute("webkitdirectory", "");
    fileInput.setAttribute("directory", "");

    let statusEl = document.createElement("span");
    statusEl.className = "folder-picker-status";
    statusEl.id = field.id + "-status";
    statusEl.textContent = _("No images selected");
    refreshFolderPickerStatus(statusEl);

    fileInput.addEventListener("change", () => {
        pickedFolderFiles = fileInput.files;
        storePickedFolder(pickedFolderFiles, state["background-folder-include-subfolders"], statusEl);
    });

    container.appendChild(fileInput);
    container.appendChild(statusEl);

    label.htmlFor = field.id;
    row.appendChild(container);
    row.appendChild(label);

    fieldEls[field.id] = { row, input: fileInput };
    return row;
}

/** yyyy-mm-dd for the export filename, from the local date (not UTC, so it matches what the user sees on their clock). */
function todayStamp() {
    let d = new Date();
    let pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/**
 * Pure validation/filtering logic for imported settings, exported for unit
 * testing without any DOM/browser.* involvement. Only keys that exist in
 * `fields` (normally settings/schema.js's FIELDS) are accepted — anything
 * else (a stray key from a newer/older export, accidental garbage) is
 * silently dropped rather than written to storage.local, and the two
 * synthetic field types that have no single storage.local value of their
 * own ("folder-picker", "import-export" — see their FIELDS entries) are
 * never accepted either, since there's nothing meaningful to import for
 * them (folder-picked images live in IndexedDB — see the note next to the
 * Import/Export section and in the README). NON_STORAGE_FIELD_TYPES is
 * imported from settings/schema.js, shared with the Firefox Sync
 * allowlist (isSyncable()) for the same reason.
 */
export function validateImportedSettings(parsed, fields = FIELDS) {
    let known = new Set(
        Object.values(fields)
            .filter((f) => !NON_STORAGE_FIELD_TYPES.has(f.type))
            .map((f) => f.id)
    );
    let accepted = {};
    let importedCount = 0;
    let skippedCount = 0;
    let skippedKeys = [];

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (let [key, value] of Object.entries(parsed)) {
            if (known.has(key)) {
                accepted[key] = value;
                importedCount++;
            } else {
                skippedCount++;
                skippedKeys.push(key);
            }
        }
    }
    return { accepted, importedCount, skippedCount, skippedKeys };
}

async function handleExportSettings() {
    try {
        let all = await browser.storage.local.get(null);
        let json = JSON.stringify(all, null, 2);
        let blob = new Blob([json], { type: "application/json" });
        let url = URL.createObjectURL(blob);
        let a = document.createElement("a");
        a.href = url;
        a.download = "calendarium-settings-" + todayStamp() + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus(_("Settings exported."));
    } catch (e) {
        setStatus(_("Export failed") + ": " + String(e));
    }
}

async function handleImportFile(file) {
    if (!file) return;
    let text;
    try {
        text = await file.text();
    } catch (e) {
        setStatus(_("Import failed") + ": " + String(e));
        return;
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (_e) {
        setStatus(_("Import failed: the file is not valid JSON."));
        return;
    }
    let { accepted, importedCount, skippedCount } = validateImportedSettings(parsed, FIELDS);
    await browser.storage.local.set(accepted);
    await loadState();
    buildPages();
    applyDependencies();
    setStatus(_("Imported %d setting(s), skipped %d unrecognized key(s).", importedCount, skippedCount));
}

/**
 * Hand-special-cased "import-export" field (settings/schema.js's
 * "settings-import-export" entry) — export/import don't map to a single
 * browser.storage.local scalar either, so like the folder picker above,
 * the actual DOM control is built here rather than by buildFieldControl().
 * Explicitly does NOT cover the IndexedDB-stored folder images from the
 * "folder-picker" field above — see the note rendered alongside it and in
 * the README.
 */
function buildImportExportField(field) {
    let row = document.createElement("div");
    row.className = "options-field" + (field.indent ? " indent" : "");

    let label = buildFieldLabel(field);

    let container = document.createElement("div");
    container.className = "import-export-control";

    let exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.id = field.id + "-export";
    exportBtn.textContent = _("Export settings");
    exportBtn.addEventListener("click", handleExportSettings);

    let importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.textContent = _("Import settings");

    let importInput = document.createElement("input");
    importInput.type = "file";
    importInput.id = field.id;
    importInput.accept = "application/json";
    importInput.hidden = true;
    importInput.addEventListener("change", () => {
        let file = importInput.files && importInput.files[0];
        handleImportFile(file);
        importInput.value = "";
    });
    importBtn.addEventListener("click", () => importInput.click());

    container.appendChild(exportBtn);
    container.appendChild(importBtn);
    container.appendChild(importInput);

    row.appendChild(container);
    row.appendChild(label);

    fieldEls[field.id] = { row, input: importInput };
    return row;
}

function buildField(field) {
    if (field.type === "folder-picker") return buildFolderPickerField(field);
    if (field.type === "import-export") return buildImportExportField(field);

    let row = document.createElement("div");
    row.className = "options-field" + (field.indent ? " indent" : "");

    let label = buildFieldLabel(field);

    let input = buildFieldControl(field);
    label.htmlFor = field.id;
    input.id = field.id;

    row.appendChild(input);
    row.appendChild(label);

    fieldEls[field.id] = { row, input };
    return row;
}

function buildSection(sectionKey) {
    let section = LAYOUT[sectionKey];
    let el = document.createElement("section");
    el.className = "options-section";
    let h2 = document.createElement("h2");
    h2.textContent = _(section.title);
    el.appendChild(h2);
    for (let keyId of section.keys) {
        let field = FIELDS[keyId];
        if (!field) continue;
        el.appendChild(buildField(field));
    }
    return el;
}

function buildPages() {
    let tabsEl = document.getElementById("options-tabs");
    let pagesEl = document.getElementById("options-pages");
    tabsEl.innerHTML = "";
    pagesEl.innerHTML = "";

    LAYOUT.pages.forEach((pageKey, idx) => {
        let page = LAYOUT[pageKey];
        let tab = document.createElement("button");
        tab.type = "button";
        tab.className = "options-tab";
        tab.textContent = _(page.title);
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", idx === 0 ? "true" : "false");
        tab.addEventListener("click", () => selectPage(pageKey));
        tabsEl.appendChild(tab);

        let pageEl = document.createElement("div");
        pageEl.className = "options-page" + (idx === 0 ? " active" : "");
        pageEl.dataset.page = pageKey;
        for (let sectionKey of page.sections) {
            pageEl.appendChild(buildSection(sectionKey));
        }
        pagesEl.appendChild(pageEl);
    });
}

function selectPage(pageKey) {
    for (let tab of document.querySelectorAll(".options-tab")) {
        let idx = Array.from(tab.parentElement.children).indexOf(tab);
        tab.setAttribute("aria-selected", LAYOUT.pages[idx] === pageKey ? "true" : "false");
    }
    for (let pageEl of document.querySelectorAll(".options-page")) {
        pageEl.classList.toggle("active", pageEl.dataset.page === pageKey);
    }
}

/**
 * Safety net for the rare case where the user changes Firefox's UI
 * language while this options page is already open: unlike newtab.js
 * (which re-renders, and therefore re-translates, every ~60s anyway),
 * this page only builds its labels once on load, so a live language
 * switch wouldn't otherwise show up until the page is closed and
 * reopened. Rebuilding fieldEls/buildPages() from scratch re-reads every
 * _()-translated string against whatever browser.i18n reports *now*, at
 * negligible cost (it's just DOM, no network) — cheap enough to do
 * whenever the tab regains focus rather than trying to detect an actual
 * language change (no such event exists in the WebExtension APIs).
 */
function refreshTranslations() {
    let activePage = document.querySelector(".options-page.active");
    let activePageKey = (activePage && activePage.dataset.page) || LAYOUT.pages[0];
    let title = _("Calendarium settings");
    document.getElementById("options-title").textContent = title;
    document.title = title;
    buildPages();
    selectPage(activePageKey);
    applyDependencies();
}

if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshTranslations();
    });
}

async function loadState() {
    let stored = await browser.storage.local.get(null);
    state = Object.assign({}, DEFAULTS, stored);
    if (state["sync-settings"]) {
        await mergeSyncSettings();
    }
}

async function init() {
    let title = _("Calendarium settings");
    document.getElementById("options-title").textContent = title;
    document.title = title;
    await loadState();
    buildPages();
    applyDependencies();

    // Reflect the real granted permission state for the Wikipedia checkbox
    // (in case it was revoked outside the options page).
    try {
        let resp = await browser.runtime.sendMessage({ type: "checkWikipediaPermission" });
        if (resp && !resp.granted && state["show-wikipedia"]) {
            state["show-wikipedia"] = false;
            await browser.storage.local.set({ "show-wikipedia": false });
            syncFieldInputs(["show-wikipedia"]);
            applyDependencies();
        }
    } catch (_e) { /* background not reachable yet — ignore */ }

    // Same reconciliation for the Weather checkbox — no background-script
    // round trip needed here since browser.permissions.contains() is a
    // synchronous-enough, non-user-activation-gated check that options.js
    // can just call directly (unlike permissions.request()).
    try {
        if (typeof browser !== "undefined" && browser.permissions && browser.permissions.contains) {
            let granted = await browser.permissions.contains(WEATHER_HOST_PERMISSION);
            if (!granted && state["show-weather"]) {
                state["show-weather"] = false;
                await browser.storage.local.set({ "show-weather": false });
                syncFieldInputs(["show-weather"]);
                applyDependencies();
            }
        }
    } catch (_e) { /* ignore */ }
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}

export { buildPages, applyDependencies, loadState, selectPage, refreshTranslations };
