// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { applyThemeMode, applyBackground } from "../../src/lib/render.js";
import { DEFAULTS, BACKGROUND_GRADIENT_OPTIONS } from "../../src/settings/schema.js";

function baseState(overrides = {}) {
    return Object.assign({}, DEFAULTS, overrides);
}

describe("applyThemeMode", () => {
    let root;
    beforeEach(() => {
        document.documentElement.removeAttribute("data-theme");
        root = document.documentElement;
    });

    it("removes data-theme entirely for 'auto' (the default) — prefers-color-scheme decides", () => {
        root.setAttribute("data-theme", "dark"); // simulate a stale attribute from a previous state
        applyThemeMode(root, baseState({ "theme-mode": "auto" }));
        expect(root.hasAttribute("data-theme")).toBe(false);
    });

    it("removes data-theme when theme-mode is unset/undefined, same as 'auto'", () => {
        applyThemeMode(root, baseState({ "theme-mode": undefined }));
        expect(root.hasAttribute("data-theme")).toBe(false);
    });

    it("sets data-theme='light' for an explicit light choice", () => {
        applyThemeMode(root, baseState({ "theme-mode": "light" }));
        expect(root.getAttribute("data-theme")).toBe("light");
    });

    it("sets data-theme='dark' for an explicit dark choice", () => {
        applyThemeMode(root, baseState({ "theme-mode": "dark" }));
        expect(root.getAttribute("data-theme")).toBe("dark");
    });

    it("switching from an explicit choice back to auto clears the attribute (explicit choice does not stick around)", () => {
        applyThemeMode(root, baseState({ "theme-mode": "dark" }));
        expect(root.getAttribute("data-theme")).toBe("dark");
        applyThemeMode(root, baseState({ "theme-mode": "auto" }));
        expect(root.hasAttribute("data-theme")).toBe(false);
    });

    it("no-ops silently when root is null/undefined", () => {
        expect(() => applyThemeMode(null, baseState())).not.toThrow();
    });
});

describe("applyBackground", () => {
    let el;
    beforeEach(() => {
        el = document.createElement("body");
    });

    it("defaults to the 'theme-default' class with no inline color/image when unset", () => {
        applyBackground(el, baseState());
        expect(el.classList.contains("calendarium-bg-theme-default")).toBe(true);
        expect(el.style.backgroundColor).toBe("");
        expect(el.style.backgroundImage).toBe("");
    });

    it("applies an inline background-color for 'solid-color' plus the matching class", () => {
        applyBackground(el, baseState({ "background-style": "solid-color", "background-color": "#336699" }));
        expect(el.classList.contains("calendarium-bg-solid-color")).toBe(true);
        expect(el.style.backgroundColor).not.toBe("");
    });

    it("ignores a malformed background-color value rather than injecting it", () => {
        applyBackground(el, baseState({
            "background-style": "solid-color",
            "background-color": "red; background-image: url(javascript:alert(1))"
        }));
        expect(el.style.backgroundColor).toBe("");
    });

    it("applies the named gradient class for 'gradient' and validates against the known gradient list", () => {
        applyBackground(el, baseState({ "background-style": "gradient", "background-gradient": "ocean" }));
        expect(el.classList.contains("calendarium-bg-gradient")).toBe(true);
        expect(el.classList.contains("calendarium-bg-gradient-ocean")).toBe(true);
        expect(Object.values(BACKGROUND_GRADIENT_OPTIONS)).toContain("ocean");
    });

    it("falls back to the default gradient ('sunset') for an unrecognized gradient name", () => {
        applyBackground(el, baseState({ "background-style": "gradient", "background-gradient": "not-a-real-gradient" }));
        expect(el.classList.contains("calendarium-bg-gradient-sunset")).toBe(true);
        expect(el.classList.contains("calendarium-bg-gradient-not-a-real-gradient")).toBe(false);
    });

    it("sets an inline background-image only for a safe https:// custom-image-url", () => {
        applyBackground(el, baseState({
            "background-style": "custom-image-url",
            "background-image-url": "https://example.com/bg.jpg"
        }));
        expect(el.classList.contains("calendarium-bg-custom-image-url")).toBe(true);
        expect(el.style.backgroundImage).toContain("example.com/bg.jpg");
    });

    it("accepts a data:image/... custom-image-url", () => {
        applyBackground(el, baseState({
            "background-style": "custom-image-url",
            "background-image-url": "data:image/png;base64,aGVsbG8="
        }));
        expect(el.style.backgroundImage).toContain("data:image/png;base64,aGVsbG8=");
    });

    it("never sets a background-image for a javascript: URL (unsafe scheme rejected)", () => {
        applyBackground(el, baseState({
            "background-style": "custom-image-url",
            "background-image-url": "javascript:alert(1)"
        }));
        expect(el.style.backgroundImage).toBe("");
    });

    it("never sets a background-image for a bare/relative string (no allowed scheme)", () => {
        applyBackground(el, baseState({
            "background-style": "custom-image-url",
            "background-image-url": "not-a-url"
        }));
        expect(el.style.backgroundImage).toBe("");
    });

    it("clears a previously-applied inline color/image and class when switching styles", () => {
        applyBackground(el, baseState({ "background-style": "solid-color", "background-color": "#112233" }));
        expect(el.style.backgroundColor).not.toBe("");
        applyBackground(el, baseState({ "background-style": "theme-default" }));
        expect(el.classList.contains("calendarium-bg-solid-color")).toBe(false);
        expect(el.classList.contains("calendarium-bg-theme-default")).toBe(true);
        expect(el.style.backgroundColor).toBe("");
    });

    it("clears a previously-applied gradient class when switching away from 'gradient'", () => {
        applyBackground(el, baseState({ "background-style": "gradient", "background-gradient": "candy" }));
        expect(el.classList.contains("calendarium-bg-gradient-candy")).toBe(true);
        applyBackground(el, baseState({ "background-style": "custom-image-url", "background-image-url": "https://example.com/a.png" }));
        expect(el.classList.contains("calendarium-bg-gradient-candy")).toBe(false);
        expect(el.classList.contains("calendarium-bg-gradient")).toBe(false);
    });

    it("no-ops silently when el is null/undefined", () => {
        expect(() => applyBackground(null, baseState())).not.toThrow();
    });

    it("falls back to 'theme-default' for an unrecognized background-style value", () => {
        applyBackground(el, baseState({ "background-style": "not-a-real-style" }));
        expect(el.classList.contains("calendarium-bg-theme-default")).toBe(true);
    });
});
