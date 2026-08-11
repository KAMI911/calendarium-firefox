/*
 * geocoder.js — Offline city search for Calendarium
 *
 * Ported from the calendarium@kami911 Cinnamon desklet's lib/geocoder.js.
 * Search/ranking logic is byte-identical; the I/O primitive was swapped
 * from Gio.File.new_for_path() to fetch(browser.runtime.getURL()).
 *
 * Loads a bundled city database (data/cities.json) and performs a
 * case-insensitive prefix/contains search across English names and
 * all local/alternative names (Hungarian, German, French, Spanish, Italian…).
 * No internet required.
 *
 * Usage:
 *   await Geocoder.init();
 *   let results = Geocoder.search("Bécs");
 *   // results = [{name, country, lat, lon, tz}, …]  (up to 5, sorted by relevance)
 */

export const Geocoder = {

    _cities: null,   // loaded lazily
    _loadPromise: null,

    /**
     * Load city database from data/cities.json.
     * Safe to call multiple times; only loads once.
     * @returns {Promise<void>}
     */
    init: function() {
        if (this._cities !== null) return Promise.resolve();
        if (this._loadPromise) return this._loadPromise;

        let self = this;
        this._loadPromise = fetch(browser.runtime.getURL("data/cities.json"))
            .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then((raw) => {
                let cities = [];
                for (let i = 0; i < raw.length; i++) {
                    let r = raw[i];
                    // Build list of all searchable lowercase strings for this city
                    let terms = [r.n.toLowerCase()];
                    if (r.l) {
                        for (let j = 0; j < r.l.length; j++) {
                            terms.push(r.l[j].toLowerCase());
                        }
                    }
                    cities.push({
                        name:    r.n,
                        country: r.c,
                        lat:     r.a,
                        lon:     r.o,
                        tz:      r.z || "",
                        terms:   terms
                    });
                }
                self._cities = cities;
            })
            .catch((e) => {
                console.error("Calendarium: Geocoder failed to load cities: " + e);
                self._cities = [];
            });
        return this._loadPromise;
    },

    /**
     * Search for cities matching the query string (any language).
     * Returns up to 5 results: exact matches first, then prefix, then contains.
     * Must be called after init() has resolved (returns [] otherwise).
     * @param {string} query
     * @returns {Array}  [{name, country, lat, lon, tz}, …]
     */
    search: function(query) {
        if (!this._cities || !query || !query.trim()) return [];
        let q      = query.trim().toLowerCase();
        let exact  = [];
        let prefix = [];
        let middle = [];
        for (let i = 0; i < this._cities.length; i++) {
            let c     = this._cities[i];
            let entry = { name: c.name, country: c.country, lat: c.lat, lon: c.lon, tz: c.tz };
            let matched = false;
            for (let j = 0; j < c.terms.length; j++) {
                let t = c.terms[j];
                if (t === q) {
                    exact.push(entry);
                    matched = true;
                    break;
                } else if (t.indexOf(q) === 0) {
                    prefix.push(entry);
                    matched = true;
                    break;
                } else if (t.indexOf(q) !== -1) {
                    middle.push(entry);
                    matched = true;
                    break;
                }
            }
            if (!matched) continue;
            if (exact.length + prefix.length + middle.length >= 20) break;
        }
        return exact.concat(prefix).concat(middle).slice(0, 5);
    }
};

export default Geocoder;
