// Settings import/export (see README's "Import / export settings" note and
// options.js's Import/Export section) — this file exercises the pure
// validation/filtering logic (validateImportedSettings), extracted
// specifically so it's testable without any DOM/browser.* mocking. The
// full click-to-download / file-picker mechanics are much harder to test
// meaningfully and are covered only by manual smoke testing (see README).
import { describe, it, expect } from "vitest";
import { validateImportedSettings } from "../../src/options.js";
import { FIELDS, DEFAULTS } from "../../src/settings/schema.js";

describe("validateImportedSettings", () => {
    it("keeps every key that exists in FIELDS and is backed by browser.storage.local", () => {
        let parsed = { "show-date": false, "time-format": "12h" };
        let result = validateImportedSettings(parsed, FIELDS);
        expect(result.accepted).toEqual({ "show-date": false, "time-format": "12h" });
        expect(result.importedCount).toBe(2);
        expect(result.skippedCount).toBe(0);
        expect(result.skippedKeys).toEqual([]);
    });

    it("silently drops keys that don't exist in FIELDS (garbage / unrecognized keys)", () => {
        let parsed = { "show-date": true, "totally-made-up-key": 42, "another-bogus-one": "x" };
        let result = validateImportedSettings(parsed, FIELDS);
        expect(result.accepted).toEqual({ "show-date": true });
        expect(result.importedCount).toBe(1);
        expect(result.skippedCount).toBe(2);
        expect(result.skippedKeys.sort()).toEqual(["another-bogus-one", "totally-made-up-key"]);
    });

    it("drops the two synthetic field ids that have no single storage.local value ('folder-picker'/'import-export' types)", () => {
        let parsed = {
            "show-date": true,
            "background-folder-picker": ["should", "be", "dropped"],
            "settings-import-export": "should also be dropped"
        };
        let result = validateImportedSettings(parsed, FIELDS);
        expect(result.accepted).toEqual({ "show-date": true });
        expect(result.skippedKeys.sort()).toEqual(["background-folder-picker", "settings-import-export"]);
    });

    it("handles a completely empty object (0 imported, 0 skipped)", () => {
        let result = validateImportedSettings({}, FIELDS);
        expect(result).toEqual({ accepted: {}, importedCount: 0, skippedCount: 0, skippedKeys: [] });
    });

    it("handles null/non-object/array input gracefully instead of throwing", () => {
        for (let bad of [null, undefined, "a string", 42, ["array", "input"]]) {
            let result = validateImportedSettings(bad, FIELDS);
            expect(result.accepted).toEqual({});
            expect(result.importedCount).toBe(0);
        }
    });

    it("a full export (every DEFAULTS key) round-trips as fully accepted", () => {
        // Simulates exporting straight from DEFAULTS (as if freshly installed)
        // and re-importing the same JSON.
        let exported = JSON.parse(JSON.stringify(DEFAULTS));
        let result = validateImportedSettings(exported, FIELDS);
        let expectedKeys = Object.values(FIELDS)
            .filter((f) => f.type !== "folder-picker" && f.type !== "import-export")
            .map((f) => f.id);
        expect(Object.keys(result.accepted).sort()).toEqual(expectedKeys.sort());
        expect(result.skippedCount).toBe(0);
    });

    it("an export from a hypothetical newer version (extra unknown keys) imports known keys and skips the rest", () => {
        let futureExport = Object.assign({}, DEFAULTS, {
            "some-future-feature-flag": true,
            "another-new-setting": "value"
        });
        let result = validateImportedSettings(futureExport, FIELDS);
        expect(result.skippedKeys).toEqual(
            expect.arrayContaining(["another-new-setting", "some-future-feature-flag"])
        );
        expect(result.accepted["some-future-feature-flag"]).toBeUndefined();
        expect(result.accepted["another-new-setting"]).toBeUndefined();
    });
});
