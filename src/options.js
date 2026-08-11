/*
 * options.js — generic options page renderer for the Calendarium extension.
 *
 * Renders the settings UI entirely from settings/schema.js (LAYOUT +
 * FIELDS) so every one of the 69 keys from the desklet's
 * settings-schema.json gets a control without being hand-wired here.
 * Persists to browser.storage.local and live-toggles dependent fields'
 * enabled state, mirroring the desklet's `dependency`/`indent` behaviour.
 */

import { LAYOUT, FIELDS, DEFAULTS, isFieldEnabled } from "./settings/schema.js";
import { Geocoder } from "./lib/geocoder.js";
import { _ } from "./lib/i18n.js";

let state = Object.assign({}, DEFAULTS);
let fieldEls = {}; // id -> { row, input }
let geoDebounce = null;

function setStatus(text) {
    let el = document.getElementById("options-status");
    if (!el) return;
    el.textContent = text;
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 2500);
}

async function saveField(id, value) {
    state[id] = value;
    await browser.storage.local.set({ [id]: value });
    applyDependencies();
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
                opt.textContent = label;
                if (value === state[field.id]) opt.selected = true;
                input.appendChild(opt);
            }
            input.addEventListener("change", () => onFieldChanged(field, input.value));
            break;
        }
        case "entry": {
            input = document.createElement("input");
            input.type = "text";
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
    saveField(field.id, value);

    if (field.id === "location-search") {
        scheduleLocationSearch(value);
        return;
    }
    let cityMatch = field.id.match(/^city([123])-name$/);
    if (cityMatch) {
        handleCityNameChange(cityMatch[1], value);
    }
}

async function requestWikipediaPermission(field) {
    let entry = fieldEls[field.id];
    try {
        let resp = await browser.runtime.sendMessage({ type: "requestWikipediaPermission" });
        if (resp && resp.granted) {
            await saveField(field.id, true);
        } else {
            if (entry && entry.input) entry.input.checked = false;
            setStatus(_("Permission was not granted; Wikipedia features stay disabled."));
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
    syncFieldInputs(["city" + n + "-lat", "city" + n + "-lon", "city" + n + "-tz"]);
}

function syncFieldInputs(ids) {
    for (let id of ids) {
        let entry = fieldEls[id];
        if (!entry || !entry.input) continue;
        if (entry.input.type === "checkbox") entry.input.checked = !!state[id];
        else entry.input.value = state[id];
    }
}

function buildField(field) {
    let row = document.createElement("div");
    row.className = "options-field" + (field.indent ? " indent" : "");

    let label = document.createElement("label");
    let labelText = document.createElement("span");
    labelText.className = "field-label";
    labelText.textContent = _(field.description);
    label.appendChild(labelText);
    if (field.tooltip) {
        let tip = document.createElement("span");
        tip.className = "field-tooltip";
        tip.textContent = _(field.tooltip);
        label.appendChild(tip);
    }

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

async function loadState() {
    let stored = await browser.storage.local.get(null);
    state = Object.assign({}, DEFAULTS, stored);
}

async function init() {
    document.getElementById("options-title").textContent = _("Calendarium settings");
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
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}

export { buildPages, applyDependencies, loadState };
