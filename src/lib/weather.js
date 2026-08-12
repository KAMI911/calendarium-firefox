/*
 * weather.js — Optional current-weather feature for Calendarium.
 *
 * Mirrors src/lib/wikipedia.js's shape closely: a small, testable public
 * API (`fetchCurrent`) backed by a TTL-based browser.storage.local cache,
 * fetch() swapped in for the network call, no DOM/browser-UI concerns.
 * Unlike Wikipedia (a day-scoped, per-language cache), weather is
 * location-scoped: the cache key is the request's latitude/longitude
 * rounded to a coarse grid, so nearby-but-not-identical coordinates (e.g.
 * two geocoder lookups for slightly different points in the same city)
 * share one cache entry rather than each making their own network call.
 *
 * API: Open-Meteo (https://open-meteo.com) — free, keyless, CORS-enabled.
 * `current_weather=true` returns a `current_weather` object shaped like
 * `{ temperature, windspeed, winddirection, weathercode, time, ... }`
 * (temperature in °C, matching every other unit already used in this
 * extension). No API key, no auth header, no rate-limit registration
 * needed — considerably simpler than the Wikipedia integration.
 */

// ── WMO weather interpretation codes ───────────────────────────────────
// https://open-meteo.com/en/docs (the "WMO Weather interpretation codes"
// table) — every documented code is covered so renderWeather() never has
// to fall back to a blank label. `text` is the English source string; it
// is intentionally NOT translated here (this module has no i18n
// dependency, same as wikipedia.js) — callers run it through lib/i18n.js's
// `_()` at render time, exactly like moon-phase/zodiac names are handled
// in lib/render.js.
const WEATHER_CODES = {
    0:  { emoji: "☀️", text: "Clear sky" },
    1:  { emoji: "🌤️", text: "Mainly clear" },
    2:  { emoji: "⛅", text: "Partly cloudy" },
    3:  { emoji: "☁️", text: "Overcast" },
    45: { emoji: "🌫️", text: "Fog" },
    48: { emoji: "🌫️", text: "Depositing rime fog" },
    51: { emoji: "🌦️", text: "Light drizzle" },
    53: { emoji: "🌦️", text: "Moderate drizzle" },
    55: { emoji: "🌧️", text: "Dense drizzle" },
    56: { emoji: "🌧️", text: "Light freezing drizzle" },
    57: { emoji: "🌧️", text: "Dense freezing drizzle" },
    61: { emoji: "🌦️", text: "Slight rain" },
    63: { emoji: "🌧️", text: "Moderate rain" },
    65: { emoji: "🌧️", text: "Heavy rain" },
    66: { emoji: "🌧️", text: "Light freezing rain" },
    67: { emoji: "🌧️", text: "Heavy freezing rain" },
    71: { emoji: "🌨️", text: "Slight snow fall" },
    73: { emoji: "🌨️", text: "Moderate snow fall" },
    75: { emoji: "🌨️", text: "Heavy snow fall" },
    77: { emoji: "🌨️", text: "Snow grains" },
    80: { emoji: "🌧️", text: "Slight rain showers" },
    81: { emoji: "🌧️", text: "Moderate rain showers" },
    82: { emoji: "🌧️", text: "Violent rain showers" },
    85: { emoji: "🌨️", text: "Slight snow showers" },
    86: { emoji: "🌨️", text: "Heavy snow showers" },
    95: { emoji: "⛈️", text: "Thunderstorm" },
    96: { emoji: "⛈️", text: "Thunderstorm with slight hail" },
    99: { emoji: "⛈️", text: "Thunderstorm with heavy hail" }
};

/** Map a WMO `weathercode` integer to `{ emoji, text }`. Unknown codes get a neutral fallback rather than a blank render. */
export function getWeatherInfo(code) {
    return WEATHER_CODES[code] || { emoji: "🌡️", text: "Unknown conditions" };
}

export const Weather = {

    CACHE_PREFIX:   "weather:",
    CACHE_TTL_SECS: 3600, // 1 hour default; caller sets this from "weather-cache-hours" before each call

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Round a coordinate to a coarse ~0.05° grid (~5.5km at the equator) so
     * nearby-but-not-identical coordinates (repeated geocoder lookups,
     * float drift, etc.) share the same cache entry instead of each making
     * their own network request.
     */
    _roundCoord: function(v) {
        return Math.round(v * 20) / 20;
    },

    _cacheKey: function(lat, lon) {
        return this.CACHE_PREFIX + this._roundCoord(lat).toFixed(2) + ":" + this._roundCoord(lon).toFixed(2);
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
            console.error("Calendarium: weather cache write failed: " + e);
        }
    },

    /**
     * Perform the Open-Meteo request and parse its `current_weather`
     * object into `{ temperature, weathercode, windspeed }`, or return
     * null on any HTTP/network/parse error, or a malformed/missing
     * `current_weather` payload.
     */
    _fetch: async function(lat, lon) {
        let url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat +
                   "&longitude=" + lon + "&current_weather=true";
        try {
            let resp = await fetch(url);
            if (resp.status !== 200) {
                console.warn("Calendarium: weather HTTP " + resp.status + " for " + url);
                return null;
            }
            let text = await resp.text();
            if (!text) return null;
            let json = JSON.parse(text);
            let cw = json && json.current_weather;
            if (!cw || typeof cw.temperature !== "number" || typeof cw.weathercode !== "number") {
                console.warn("Calendarium: weather response missing current_weather for " + url);
                return null;
            }
            return {
                temperature: cw.temperature,
                weathercode: cw.weathercode,
                windspeed: typeof cw.windspeed === "number" ? cw.windspeed : null
            };
        } catch (e) {
            console.warn("Calendarium: weather fetch error: " + e);
            return null;
        }
    },

    // ── Public API ───────────────────────────────────────────────────────

    /**
     * Fetch the current weather for (lat, lon).
     *
     * Cache policy (deliberately simpler than Wikipedia's — there is no
     * language fallback dimension here):
     *   - Fresh cache            → return cached, no network call.
     *   - Cache miss/stale       → fetch from network; on success, cache +
     *     return; on failure, fall back to stale cache (if any) rather
     *     than returning null outright, so a transient network blip
     *     doesn't blank out an already-populated widget.
     *
     * @param {number}   lat
     * @param {number}   lon
     * @param {Function} [callback] Called with the result object or null
     * @returns {Promise<{temperature:number, weathercode:number, windspeed:number|null}|null>}
     */
    fetchCurrent: async function(lat, lon, callback) {
        let result = await this._fetchCurrent(lat, lon);
        if (callback) callback(result);
        return result;
    },

    _fetchCurrent: async function(lat, lon) {
        if (typeof lat !== "number" || typeof lon !== "number" ||
            !Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
        }
        let key = this._cacheKey(lat, lon);

        if (await this._isCacheFresh(key)) {
            let entry = await this._readCacheEntry(key);
            if (entry && entry.data) return entry.data;
        }

        let data = await this._fetch(lat, lon);
        if (data) {
            await this._writeCache(key, data);
            return data;
        }

        // Network/parse error — serve stale cache rather than nothing.
        let entry = await this._readCacheEntry(key);
        return entry ? entry.data : null;
    }
};

export default Weather;
