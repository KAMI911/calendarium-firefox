/*
 * wikipedia.js — Optional Wikipedia online features for Calendarium
 *
 * Ported from the calendarium@kami911 Cinnamon desklet's lib/wikipedia.js.
 * Same public API shape (fetchOnThisDay, fetchFeatured, CACHE_TTL_SECS),
 * same cache policy (fresh-cache / empty-cache-refetch / network-fallback-to-
 * English / stale-cache-on-network-error), same English pre-warm behaviour.
 *
 * Soup.Session → fetch(); GLib.get_user_cache_dir() JSON-file cache with
 * day-suffix pruning → browser.storage.local entries keyed by
 * "wiki:<type>:<lang>:<mmdd>" (or "wiki:<type>-<year>:<lang>:<mmdd>" for
 * featured-article-by-year), each storing { data, cachedAt } so freshness
 * can be checked without a separate metadata read. Pruning of stale-day
 * entries happens lazily inside _ensureCacheDir() (called at the start of
 * every fetch) instead of via a directory enumeration.
 *
 * IMPORTANT: the real Wikimedia REST endpoints used by the source desklet
 * live under api.wikimedia.org (NOT <lang>.wikipedia.org) — confirmed by
 * reading the original Soup URLs. The extension's
 * `optional_host_permissions` therefore requests https://api.wikimedia.org/*.
 * Double-check these endpoints are still live/unchanged if births/deaths/
 * events/featured content stops appearing — Wikimedia has, in the past,
 * migrated feed consumers from api.wikimedia.org to the newer
 * <lang>.wikipedia.org/api/rest_v1/feed/... REST API.
 *
 * All network operations are asynchronous; callback(data) is called on
 * completion with the parsed response object, or callback(null) on error.
 */

export const Wikipedia = {

    CACHE_PREFIX:   "wiki:",
    CACHE_TTL_SECS: 43200,   // 12 hours default; caller sets this before each call

    // ── Internal helpers ─────────────────────────────────────────────────

    _todaySuffix: function() {
        let now = new Date();
        let mm = (now.getMonth() + 1 < 10 ? '0' : '') + (now.getMonth() + 1);
        let dd = (now.getDate()      < 10 ? '0' : '') + now.getDate();
        return mm + dd;
    },

    /**
     * Remove any cached entries whose mmdd suffix does not match today.
     * Mirrors the original file-based cache's day-suffix pruning.
     */
    _pruneOldCache: async function() {
        let todaySuffix = this._todaySuffix();
        let all = await browser.storage.local.get(null);
        let toRemove = [];
        for (let key of Object.keys(all)) {
            if (!key.startsWith(this.CACHE_PREFIX)) continue;
            let mmdd = key.split(":").pop();
            if (mmdd !== todaySuffix) toRemove.push(key);
        }
        if (toRemove.length > 0) await browser.storage.local.remove(toRemove);
    },

    _ensureCacheDir: function() {
        // No directory to create with storage.local; just prune stale entries.
        return this._pruneOldCache();
    },

    _cacheKey: function(type, lang, month, day) {
        let mm = (month < 10 ? '0' : '') + month;
        let dd = (day   < 10 ? '0' : '') + day;
        return this.CACHE_PREFIX + type + ":" + lang + ":" + mm + dd;
    },

    _readCacheEntry: async function(key) {
        let obj = await browser.storage.local.get(key);
        return obj[key] || null;
    },

    _isCacheFresh: async function(key) {
        let entry = await this._readCacheEntry(key);
        if (!entry) return false;
        let ageSecs = (Date.now() - entry.cachedAt) / 1000;
        return ageSecs < this.CACHE_TTL_SECS;
    },

    _writeCache: async function(key, data) {
        try {
            await browser.storage.local.set({ [key]: { data: data, cachedAt: Date.now() } });
        } catch (e) {
            console.error("Calendarium: Wikipedia cache write failed: " + e);
        }
    },

    _deleteCache: async function(key) {
        try { await browser.storage.local.remove(key); } catch (_e) { /* ignore */ }
    },

    /**
     * Perform a GET request, parse JSON, return { data, status }.
     * On error, { data: null, status } (status 0 = network/parse error).
     */
    _fetch: async function(url) {
        let ua = "Calendarium/1.0 (calendarium@kami911.firefox WebExtension; " +
                 "https://github.com/linuxmint/cinnamon-spices-desklets)";
        try {
            let resp = await fetch(url, {
                headers: { "Api-User-Agent": ua }
            });
            if (resp.status !== 200) {
                console.warn("Calendarium: Wikipedia HTTP " + resp.status + " for " + url);
                return { data: null, status: resp.status };
            }
            let text = await resp.text();
            if (!text) return { data: null, status: resp.status };
            return { data: JSON.parse(text), status: resp.status };
        } catch (e) {
            console.warn("Calendarium: Wikipedia fetch error: " + e);
            return { data: null, status: 0 };
        }
    },

    // ── Content validators ───────────────────────────────────────────────

    /** Returns true if the onthisday response has at least one non-empty section. */
    _hasOnThisDayContent: function(data) {
        return !!(data && (
            (data.births   && data.births.length   > 0) ||
            (data.deaths   && data.deaths.length   > 0) ||
            (data.events   && data.events.length   > 0) ||
            (data.selected && data.selected.length > 0)
        ));
    },

    /** Returns true if the featured response contains a featured article (tfa). */
    _hasFeaturedContent: function(data) {
        return !!(data && data.tfa);
    },

    // ── Background English pre-fetch ─────────────────────────────────────

    /**
     * Silently fetch and cache the English onthisday data in the background.
     * No-op if English cache is already fresh.
     */
    _ensureEnglishOnThisDay: async function(month, day) {
        let key = this._cacheKey("onthisday", "en", month, day);
        if (await this._isCacheFresh(key)) return;
        let mm = (month < 10 ? '0' : '') + month;
        let dd = (day   < 10 ? '0' : '') + day;
        let url = "https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/" + mm + "/" + dd;
        let { data } = await this._fetch(url);
        if (this._hasOnThisDayContent(data)) await this._writeCache(key, data);
    },

    /**
     * Silently fetch and cache the English featured article in the background.
     * No-op if English cache is already fresh.
     */
    _ensureEnglishFeatured: async function(year, month, day) {
        let key = this._cacheKey("featured_" + year, "en", month, day);
        if (await this._isCacheFresh(key)) return;
        let mm = (month < 10 ? '0' : '') + month;
        let dd = (day   < 10 ? '0' : '') + day;
        let url = "https://api.wikimedia.org/feed/v1/wikipedia/en/featured/" + year + "/" + mm + "/" + dd;
        let { data } = await this._fetch(url);
        if (this._hasFeaturedContent(data)) await this._writeCache(key, data);
    },

    // ── Public API ───────────────────────────────────────────────────────

    /**
     * Fetch "On This Day" data (births, deaths, events) from Wikipedia.
     *
     * Cache policy:
     *   - Fresh cache with content       → return cached, pre-warm English in background
     *   - Fresh cache but empty content  → skip cache, re-fetch to trigger fallback
     *   - Network returns content        → cache + return, pre-warm English in background
     *   - Network returns empty/404      → fall back to English (cached or fetched)
     *   - Network error                  → serve stale cache (this lang, then English)
     *
     * @param {number}   month     1–12
     * @param {number}   day       1–31
     * @param {string}   lang      Language code ("en", "de", "hu", …)
     * @param {Function} [callback] Called with parsed response object or null
     * @returns {Promise<Object|null>}
     */
    fetchOnThisDay: async function(month, day, lang, callback) {
        let result = await this._fetchOnThisDay(month, day, lang);
        if (callback) callback(result);
        return result;
    },

    _fetchOnThisDay: async function(month, day, lang) {
        await this._ensureCacheDir();
        let key = this._cacheKey("onthisday", lang, month, day);

        if (await this._isCacheFresh(key)) {
            let entry = await this._readCacheEntry(key);
            let cached = entry ? entry.data : null;
            if (this._hasOnThisDayContent(cached)) {
                if (lang !== "en") this._ensureEnglishOnThisDay(month, day); // fire-and-forget
                return cached;
            }
            if (lang === "en") return cached;
            // Non-English cache is fresh but empty — delete and re-fetch
            await this._deleteCache(key);
        }
        return this._fetchOnThisDayNet(month, day, lang, key);
    },

    _fetchOnThisDayNet: async function(month, day, lang, key) {
        let mm = (month < 10 ? '0' : '') + month;
        let dd = (day   < 10 ? '0' : '') + day;
        let url = "https://api.wikimedia.org/feed/v1/wikipedia/" + lang +
                  "/onthisday/all/" + mm + "/" + dd;
        let { data, status } = await this._fetch(url);

        if (data) {
            if (this._hasOnThisDayContent(data)) {
                await this._writeCache(key, data);
                if (lang !== "en") this._ensureEnglishOnThisDay(month, day); // fire-and-forget
                return data;
            }
            if (lang !== "en") {
                console.warn("Calendarium: Wikipedia onthisday empty for '" + lang + "', falling back to English");
                return this._fetchOnThisDay(month, day, "en");
            }
            return data;
        }

        if ((status === 404 || status === 400) && lang !== "en") {
            console.warn("Calendarium: Wikipedia onthisday HTTP " + status + " for '" + lang + "', falling back to English");
            return this._fetchOnThisDay(month, day, "en");
        }

        if (status === 0) {
            // Network error — serve stale cache if available
            let entry = await this._readCacheEntry(key);
            let stale = entry ? entry.data : null;
            if (this._hasOnThisDayContent(stale)) {
                console.warn("Calendarium: Wikipedia offline — using stale cache for '" + lang + "'");
                return stale;
            }
            if (lang !== "en") {
                let enKey = this._cacheKey("onthisday", "en", month, day);
                let enEntry = await this._readCacheEntry(enKey);
                let enStale = enEntry ? enEntry.data : null;
                if (enStale) console.warn("Calendarium: Wikipedia offline — using stale English cache");
                return enStale;
            }
            return null;
        }

        return null;
    },

    /**
     * Fetch the Wikipedia "Featured Article" for a given date.
     *
     * Same cache policy as fetchOnThisDay.
     *
     * @param {number}   year
     * @param {number}   month     1–12
     * @param {number}   day       1–31
     * @param {string}   lang      Language code
     * @param {Function} [callback] Called with parsed response object or null
     * @returns {Promise<Object|null>}
     */
    fetchFeatured: async function(year, month, day, lang, callback) {
        let result = await this._fetchFeatured(year, month, day, lang);
        if (callback) callback(result);
        return result;
    },

    _fetchFeatured: async function(year, month, day, lang) {
        await this._ensureCacheDir();
        let key = this._cacheKey("featured_" + year, lang, month, day);

        if (await this._isCacheFresh(key)) {
            let entry = await this._readCacheEntry(key);
            let cached = entry ? entry.data : null;
            if (this._hasFeaturedContent(cached)) {
                if (lang !== "en") this._ensureEnglishFeatured(year, month, day); // fire-and-forget
                return cached;
            }
            if (lang === "en") return cached;
            await this._deleteCache(key);
        }
        return this._fetchFeaturedNet(year, month, day, lang, key);
    },

    _fetchFeaturedNet: async function(year, month, day, lang, key) {
        let mm = (month < 10 ? '0' : '') + month;
        let dd = (day   < 10 ? '0' : '') + day;
        let url = "https://api.wikimedia.org/feed/v1/wikipedia/" + lang + "/featured/" +
                  year + "/" + mm + "/" + dd;
        let { data, status } = await this._fetch(url);

        if (data) {
            if (this._hasFeaturedContent(data)) {
                await this._writeCache(key, data);
                if (lang !== "en") this._ensureEnglishFeatured(year, month, day); // fire-and-forget
                return data;
            }
            if (lang !== "en") {
                console.warn("Calendarium: Wikipedia featured no tfa for '" + lang + "', falling back to English");
                return this._fetchFeatured(year, month, day, "en");
            }
            return data;
        }

        if ((status === 404 || status === 400) && lang !== "en") {
            console.warn("Calendarium: Wikipedia featured HTTP " + status + " for '" + lang + "', falling back to English");
            return this._fetchFeatured(year, month, day, "en");
        }

        if (status === 0) {
            let entry = await this._readCacheEntry(key);
            let stale = entry ? entry.data : null;
            if (this._hasFeaturedContent(stale)) {
                console.warn("Calendarium: Wikipedia offline — using stale cache for '" + lang + "'");
                return stale;
            }
            if (lang !== "en") {
                let enKey = this._cacheKey("featured_" + year, "en", month, day);
                let enEntry = await this._readCacheEntry(enKey);
                let enStale = enEntry ? enEntry.data : null;
                if (enStale) console.warn("Calendarium: Wikipedia offline — using stale English cache");
                return enStale;
            }
            return null;
        }

        return null;
    }
};

export default Wikipedia;
