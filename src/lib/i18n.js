/*
 * i18n.js — shared translation helper for the Calendarium extension.
 *
 * WebExtension message keys must be valid identifiers (letters, digits,
 * underscores), but the desklet's original translatable strings are full
 * English sentences/phrases used directly as gettext msgids (e.g.
 * "Day %d of %d"). Rather than hand-maintain a string→key table, both this
 * module and scripts/po-to-webext-locales.mjs apply the same deterministic
 * `slug()` transform to derive a message key from the English source
 * string, so a translation always resolves without an intermediate table.
 */

/** Deterministic slug: "Day %d of %d" → "day_n_of_n". */
export function slug(text) {
    return String(text)
        .trim()
        .toLowerCase()
        .replace(/%d/g, "n")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/**
 * Translate an English source string via browser.i18n.getMessage, falling
 * back to the source string itself (with %d placeholders substituted from
 * `args`, in order) when no translation is available.
 */
export function _(text, ...args) {
    if (!text) return "";
    let key = slug(text);
    let msg = null;
    try {
        if (typeof browser !== "undefined" && browser.i18n) {
            msg = browser.i18n.getMessage(key, args.map(String));
        }
    } catch (_e) { /* ignore — fall through to source string */ }
    let out = msg || text;
    for (let a of args) out = out.replace("%d", String(a));
    return out;
}

export default { slug, _ };
