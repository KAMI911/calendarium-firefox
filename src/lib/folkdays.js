/*
 * folkdays.js — Folk calendar saying loader for Calendarium
 *
 * Ported from the calendarium@kami911 Cinnamon desklet's lib/folkdays.js.
 * Parsing/query logic (getSaying) is byte-identical; the I/O primitive was
 * swapped from Gio.File.new_for_path() to fetch(browser.runtime.getURL()).
 *
 * Data format (JSON files in data/folkdays/):
 *   { "MM-DD": "Folk saying text for this day", ... }
 *
 * To add a new language:
 *   1. Create data/folkdays/XX.json with the same "MM-DD": "saying" format.
 *   2. Add the option to settings/schema.js under "folkday-locale".
 */

export const Folkdays = {

    /**
     * Load the folk saying JSON file for the given locale.
     *
     * @param {string}   dataDir   Extension-relative path to data/folkdays/ (e.g. "data/folkdays")
     * @param {string}   locale    Language code ("hu", "de", "en", …)
     * @param {Function} [callback] Optional Node-style callback(data|null)
     * @returns {Promise<Object|null>}  Parsed { "MM-DD": "saying" } or null on error
     */
    loadData: function(dataDir, locale, callback) {
        let url = browser.runtime.getURL(dataDir + "/" + locale + ".json");
        let promise = fetch(url)
            .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .catch((e) => {
                console.error("Calendarium: failed to load folkday data for '" + locale + "': " + e);
                return null;
            });
        if (callback) { promise.then(callback); }
        return promise;
    },

    /**
     * Return the folk saying for the given date, or null if none exists.
     *
     * @param {Object|null} data   Loaded data object from loadData()
     * @param {Date}        date
     * @returns {string|null}
     */
    getSaying: function(data, date) {
        if (!data) return null;
        let m  = date.getMonth() + 1;
        let d  = date.getDate();
        let key = (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
        return data[key] || null;
    }
};

export default Folkdays;
