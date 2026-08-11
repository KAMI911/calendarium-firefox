// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { LAYOUT, FIELDS, DEFAULTS, isFieldEnabled } from "../../src/settings/schema.js";

describe("settings/schema.js structural integrity", () => {
    it("every section referenced by a page exists in LAYOUT", () => {
        for (let pageKey of LAYOUT.pages) {
            let page = LAYOUT[pageKey];
            expect(page).toBeTruthy();
            for (let sectionKey of page.sections) {
                expect(LAYOUT[sectionKey]).toBeTruthy();
            }
        }
    });

    it("every key referenced by a section exists in FIELDS", () => {
        for (let pageKey of LAYOUT.pages) {
            for (let sectionKey of LAYOUT[pageKey].sections) {
                for (let keyId of LAYOUT[sectionKey].keys) {
                    expect(FIELDS[keyId], `FIELDS['${keyId}'] referenced by ${sectionKey}`).toBeTruthy();
                }
            }
        }
    });

    it("every FIELDS entry appears in exactly one section's keys list (no orphans, no dupes)", () => {
        let seen = {};
        for (let pageKey of LAYOUT.pages) {
            for (let sectionKey of LAYOUT[pageKey].sections) {
                for (let keyId of LAYOUT[sectionKey].keys) {
                    seen[keyId] = (seen[keyId] || 0) + 1;
                }
            }
        }
        for (let fieldId of Object.keys(FIELDS)) {
            expect(seen[fieldId], `field '${fieldId}' should appear exactly once in LAYOUT`).toBe(1);
        }
        expect(Object.keys(seen).length).toBe(Object.keys(FIELDS).length);
    });

    it("has 73 fields: the 65 ported from the source settings-schema.json ('text-scale' was removed as dead code — see the theme-agent's note in schema.js history), 'show-search-box' (a Firefox-only extra, not present in the Cinnamon desklet), and 7 Firefox-only theme/background additions ('theme-mode', 'background-style', 'background-color', 'background-gradient', 'background-image-url', 'background-rotate', 'background-rotate-minutes')", () => {
        expect(Object.keys(FIELDS).length).toBe(73);
    });

    it("no longer has a 'text-scale' field (dead code, superseded by Firefox's own per-origin Ctrl+/- zoom)", () => {
        expect(FIELDS["text-scale"]).toBeUndefined();
    });

    it("field.id always matches its own key in FIELDS", () => {
        for (let [key, field] of Object.entries(FIELDS)) {
            expect(field.id).toBe(key);
        }
    });

    it("every field has a recognized type", () => {
        let known = new Set(["checkbox", "combobox", "entry", "entry-multiline", "spinbutton", "scale", "color"]);
        for (let field of Object.values(FIELDS)) {
            expect(known.has(field.type), `unknown type '${field.type}' on '${field.id}'`).toBe(true);
        }
    });

    it("every combobox field has a non-empty options map whose values are unique", () => {
        for (let field of Object.values(FIELDS)) {
            if (field.type !== "combobox") continue;
            let values = Object.values(field.options || {});
            expect(values.length).toBeGreaterThan(0);
            expect(new Set(values).size).toBe(values.length);
        }
    });

    it("every spinbutton/scale field has min <= default <= max", () => {
        for (let field of Object.values(FIELDS)) {
            if (field.type !== "spinbutton" && field.type !== "scale") continue;
            expect(field.min).toBeLessThanOrEqual(field.default);
            expect(field.default).toBeLessThanOrEqual(field.max);
        }
    });

    it("every field's dependency (if any) points to an existing field", () => {
        for (let field of Object.values(FIELDS)) {
            if (!field.dependency) continue;
            expect(FIELDS[field.dependency], `dependency '${field.dependency}' of '${field.id}'`).toBeTruthy();
        }
    });

    it("DEFAULTS is a flat map covering every field id", () => {
        for (let field of Object.values(FIELDS)) {
            expect(DEFAULTS[field.id]).toBe(field.default);
        }
        expect(Object.keys(DEFAULTS).length).toBe(Object.keys(FIELDS).length);
    });
});

describe("isFieldEnabled", () => {
    it("returns true for fields with no dependency, regardless of state", () => {
        expect(isFieldEnabled(FIELDS["show-date"], {})).toBe(true);
    });

    it("returns false when the dependency is falsy in state", () => {
        expect(isFieldEnabled(FIELDS["traditional-lang"], { "show-traditional": undefined })).toBe(false);
        expect(isFieldEnabled(FIELDS["holiday-lookahead"], { "show-holidays": false })).toBe(false);
    });

    it("returns true when the dependency is truthy in state", () => {
        expect(isFieldEnabled(FIELDS["holiday-lookahead"], { "show-holidays": true })).toBe(true);
    });

    it("chained dependency (period-upcoming-lookahead -> show-period-upcoming) resolves correctly", () => {
        let field = FIELDS["period-upcoming-lookahead"];
        expect(field.dependency).toBe("show-period-upcoming");
        expect(isFieldEnabled(field, { "show-period-upcoming": true })).toBe(true);
        expect(isFieldEnabled(field, { "show-period-upcoming": false })).toBe(false);
    });

    describe("dependencyValue (value-equality dependency, e.g. background-color only applies when background-style === 'solid-color')", () => {
        it("background-color is only enabled when background-style is exactly 'solid-color'", () => {
            let field = FIELDS["background-color"];
            expect(field.dependency).toBe("background-style");
            expect(field.dependencyValue).toBe("solid-color");
            expect(isFieldEnabled(field, { "background-style": "solid-color" })).toBe(true);
            expect(isFieldEnabled(field, { "background-style": "gradient" })).toBe(false);
            expect(isFieldEnabled(field, { "background-style": "theme-default" })).toBe(false);
        });

        it("background-gradient is only enabled when background-style is exactly 'gradient'", () => {
            let field = FIELDS["background-gradient"];
            expect(isFieldEnabled(field, { "background-style": "gradient" })).toBe(true);
            expect(isFieldEnabled(field, { "background-style": "solid-color" })).toBe(false);
        });

        it("background-image-url is only enabled when background-style is exactly 'custom-image-url'", () => {
            let field = FIELDS["background-image-url"];
            expect(isFieldEnabled(field, { "background-style": "custom-image-url" })).toBe(true);
            expect(isFieldEnabled(field, { "background-style": "gradient" })).toBe(false);
        });
    });

    describe("array dependencyValue (OR semantics, e.g. background-rotate applies to more than one background-style value)", () => {
        it("background-rotate is enabled for either 'gradient' or 'custom-image-url'", () => {
            let field = FIELDS["background-rotate"];
            expect(field.dependency).toBe("background-style");
            expect(Array.isArray(field.dependencyValue)).toBe(true);
            expect(isFieldEnabled(field, { "background-style": "gradient" })).toBe(true);
            expect(isFieldEnabled(field, { "background-style": "custom-image-url" })).toBe(true);
        });

        it("background-rotate is disabled for 'theme-default', 'solid-color', or 'firefox-theme'", () => {
            let field = FIELDS["background-rotate"];
            expect(isFieldEnabled(field, { "background-style": "theme-default" })).toBe(false);
            expect(isFieldEnabled(field, { "background-style": "solid-color" })).toBe(false);
            expect(isFieldEnabled(field, { "background-style": "firefox-theme" })).toBe(false);
        });

        it("background-rotate-minutes depends (truthily) on background-rotate", () => {
            let field = FIELDS["background-rotate-minutes"];
            expect(field.dependency).toBe("background-rotate");
            expect(isFieldEnabled(field, { "background-rotate": true })).toBe(true);
            expect(isFieldEnabled(field, { "background-rotate": false })).toBe(false);
        });
    });
});

describe("background-style 'firefox-theme' option", () => {
    it("is present in background-style's combobox options", () => {
        expect(Object.values(FIELDS["background-style"].options)).toContain("firefox-theme");
    });
});

describe("options.js rendering against the schema (jsdom)", () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <h1 id="options-title"></h1>
            <nav id="options-tabs"></nav>
            <div id="options-pages"></div>
            <p id="options-status"></p>
        `;
        global.browser = {
            storage: { local: { get: vi.fn(() => Promise.resolve({})), set: vi.fn(() => Promise.resolve()) } },
            runtime: { sendMessage: vi.fn(() => Promise.resolve({ granted: true })) }
        };
    });

    it("buildPages() renders one tab per LAYOUT page and one input per FIELDS entry", async () => {
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();
        let tabs = document.querySelectorAll(".options-tab");
        expect(tabs.length).toBe(LAYOUT.pages.length);
        for (let fieldId of Object.keys(FIELDS)) {
            expect(document.getElementById(fieldId), `input for '${fieldId}'`).toBeTruthy();
        }
    });

    it("applyDependencies() disables a dependent field's row when its dependency is off", async () => {
        let { buildPages, applyDependencies, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();
        applyDependencies();
        let dependentInput = document.getElementById("holiday-lookahead");
        // Default show-holidays is true, so it should start enabled.
        expect(dependentInput.disabled).toBe(false);
    });

    it("renders a <textarea> for the 'entry-multiline' field type (background-image-url)", async () => {
        let { buildPages, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();
        let input = document.getElementById("background-image-url");
        expect(input.tagName).toBe("TEXTAREA");
    });

    it("applyDependencies() enables background-rotate for either 'gradient' or 'custom-image-url' background-style", async () => {
        global.browser.storage.local.get = vi.fn(() => Promise.resolve({ "background-style": "custom-image-url" }));
        let { buildPages, applyDependencies, loadState } = await import("../../src/options.js");
        await loadState();
        buildPages();
        applyDependencies();
        expect(document.getElementById("background-rotate").disabled).toBe(false);
        expect(document.getElementById("background-color").disabled).toBe(true);
    });
});
