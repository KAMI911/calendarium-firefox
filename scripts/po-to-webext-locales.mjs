#!/usr/bin/env node
/*
 * po-to-webext-locales.mjs — convert the calendarium@kami911 desklet's
 * gettext catalogs (po/*.po + po/calendarium@kami911.pot) into
 * WebExtension `_locales/<lang>/messages.json` files.
 *
 * Re-runnable: safe to invoke any time the source .po/.pot files change;
 * it fully regenerates each messages.json from scratch.
 *
 * Key derivation: WebExtension message keys must be identifiers
 * (letters/digits/underscores), but the original gettext msgids are full
 * English phrases (e.g. "Day %d of %d"). Rather than hand-maintain a
 * mapping table, this script applies the exact same `slug()` transform
 * that src/lib/i18n.js uses at runtime, so every translated string
 * resolves without an intermediate lookup table. If you add new
 * translatable strings to the source desklet.js / settings-schema.json in
 * the future, re-extract the .pot/.po files first, then re-run this
 * script — no code changes needed here.
 *
 * Usage: node scripts/po-to-webext-locales.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import gettextParser from "gettext-parser";
import { slug } from "../src/lib/i18n.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PO_DIR = path.join(ROOT, "po");
const LOCALES_DIR = path.join(ROOT, "src", "_locales");

const EXTENSION_NAME = "Calendarium";
const EXTENSION_DESCRIPTION =
    "A rich New Tab page with date, moon phase, sun times, zodiac, name " +
    "days, holidays, folk sayings, alternate calendars and optional " +
    "Wikipedia \"on this day\" content — ported from the calendarium@kami911 " +
    "Cinnamon desklet.";

function parseCatalog(filePath) {
    let buf = readFileSync(filePath);
    return gettextParser.po.parse(buf);
}

/** Build { key: { message, description } } from a parsed gettext catalog. */
function catalogToMessages(catalog, { useSource }) {
    let messages = {};
    let ctx = catalog.translations[""] || {};
    for (let msgid of Object.keys(ctx)) {
        if (msgid === "") continue;
        let entry = ctx[msgid];
        let translated = entry.msgstr && entry.msgstr[0];
        let text = useSource ? msgid : (translated || "");
        if (!text) continue; // let WebExtension i18n fall back to default_locale
        let key = slug(msgid);
        if (!key) continue;
        messages[key] = { message: text, description: "Source: \"" + msgid + "\"" };
    }
    return messages;
}

function writeLocale(lang, messages) {
    let dir = path.join(LOCALES_DIR, lang);
    mkdirSync(dir, { recursive: true });
    let full = Object.assign(
        {
            extension_name: { message: EXTENSION_NAME, description: "Extension name shown in about:addons" },
            extension_description: { message: EXTENSION_DESCRIPTION, description: "Extension description shown in about:addons" }
        },
        messages
    );
    // Stable key order for readable diffs.
    let ordered = {};
    for (let key of Object.keys(full).sort()) ordered[key] = full[key];
    writeFileSync(
        path.join(dir, "messages.json"),
        JSON.stringify(ordered, null, 2) + "\n"
    );
    console.log("wrote " + Object.keys(ordered).length + " messages -> src/_locales/" + lang + "/messages.json");
}

function main() {
    let potPath = path.join(PO_DIR, "calendarium@kami911.pot");
    let potCatalog = parseCatalog(potPath);
    writeLocale("en", catalogToMessages(potCatalog, { useSource: true }));

    let poFiles = readdirSync(PO_DIR).filter((f) => f.endsWith(".po"));
    for (let file of poFiles) {
        let lang = path.basename(file, ".po");
        let catalog = parseCatalog(path.join(PO_DIR, file));
        writeLocale(lang, catalogToMessages(catalog, { useSource: false }));
    }
}

main();
