/*
 * namedays.js — Name day data loader and query for Calendarium
 *
 * Ported from the calendarium@kami911 Cinnamon desklet's lib/namedays.js.
 * Parsing/query logic (getNamedays, getNamedaysRange) is byte-identical;
 * the I/O primitive was swapped from Gio.File.new_for_path() to
 * fetch(browser.runtime.getURL()).
 *
 * Data format (JSON files in data/namedays/):
 *   { "MM-DD": ["Name1", "Name2", ...], ... }
 *
 * To add a new name day language:
 *   1. Create data/namedays/XX.json with the same format.
 *   2. Add the option to settings/schema.js under "nameday-locale".
 */

export const Namedays = {

    /**
     * Load the name day JSON file for the given locale.
     *
     * @param {string}   dataDir   Extension-relative path to data/namedays (e.g. "data/namedays")
     * @param {string}   locale    Language code ("hu", "de", "en", …)
     * @param {Function} [callback] Optional Node-style callback(data|null)
     * @returns {Promise<Object|null>}  Parsed { "MM-DD": [name, ...] } or null on error
     */
    loadData: function(dataDir, locale, callback) {
        if (!locale || locale === "auto") {
            if (callback) callback(null);
            return Promise.resolve(null);
        }
        let url = browser.runtime.getURL(dataDir + "/" + locale + ".json");
        let promise = fetch(url)
            .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .catch((e) => {
                console.error("Calendarium: failed to load nameday data for '" + locale + "': " + e);
                return null;
            });
        if (callback) { promise.then(callback); }
        return promise;
    },

    /**
     * Build the "MM-DD" lookup key for a given date.
     * @param {Date} date
     * @returns {string}  e.g. "02-14"
     */
    _key: function(date) {
        let m = date.getMonth() + 1;
        let d = date.getDate();
        return (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
    },

    /**
     * Return the list of name day names for a single date.
     * @param {Object|null} data   Loaded data object from loadData()
     * @param {Date}        date
     * @returns {string[]}  Array of name strings (may be empty)
     */
    getNamedays: function(data, date) {
        if (!data) return [];
        return data[this._key(date)] || [];
    },

    /**
     * Return name days for today and the next `days` calendar days.
     * @param {Object|null} data   Loaded data object
     * @param {Date}        date   Start date (usually today)
     * @param {number}      days   Number of additional lookahead days (0 = today only)
     * @returns {Array}  [{ date: Date, names: string[] }, ...]
     */
    getNamedaysRange: function(data, date, days) {
        let result = [];
        for (let i = 0; i <= days; i++) {
            let d = new Date(date);
            d.setDate(d.getDate() + i);
            result.push({
                date:  d,
                names: this.getNamedays(data, d)
            });
        }
        return result;
    }
};

export default Namedays;
