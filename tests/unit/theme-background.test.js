// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
    applyThemeMode, applyBackground, applyIconSize, applyPanelOpacity,
    isEffectiveDarkTheme, applyFirefoxThemeBackground, parseImageUrlList,
    applyImageFolderBackground
} from "../../src/lib/render.js";
import { DEFAULTS, BACKGROUND_GRADIENT_OPTIONS } from "../../src/settings/schema.js";
import { clearImages, addImages } from "../../src/lib/image-store.js";

function makeFile(relativePath) {
    let blob = new Blob(["x"], { type: "image/png" });
    blob.webkitRelativePath = relativePath;
    blob.name = relativePath.split("/").pop();
    return blob;
}

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

    it("adds only the 'calendarium-bg-firefox-theme' class, with no inline color/image, for 'firefox-theme' (color/image are applied separately, async, by applyFirefoxThemeBackground)", () => {
        applyBackground(el, baseState({ "background-style": "firefox-theme" }));
        expect(el.classList.contains("calendarium-bg-firefox-theme")).toBe(true);
        expect(el.style.backgroundColor).toBe("");
        expect(el.style.backgroundImage).toBe("");
    });

    it("adds only the 'calendarium-bg-image-folder' class, with no inline image, for 'image-folder' (the actual image is applied separately, async, by applyImageFolderBackground)", () => {
        applyBackground(el, baseState({ "background-style": "image-folder" }));
        expect(el.classList.contains("calendarium-bg-image-folder")).toBe(true);
        expect(el.style.backgroundImage).toBe("");
    });

    describe("background-rotate for 'gradient'", () => {
        it("without rotation, always uses the configured 'background-gradient' regardless of rotateStep", () => {
            applyBackground(el, baseState({ "background-style": "gradient", "background-gradient": "candy" }), 5);
            expect(el.classList.contains("calendarium-bg-gradient-candy")).toBe(true);
        });

        it("with rotation on, cycles through the full BACKGROUND_GRADIENT_OPTIONS order as rotateStep advances", () => {
            let names = Object.values(BACKGROUND_GRADIENT_OPTIONS);
            for (let step = 0; step < names.length; step++) {
                applyBackground(el, baseState({ "background-style": "gradient", "background-rotate": true }), step);
                expect(el.classList.contains("calendarium-bg-gradient-" + names[step])).toBe(true);
            }
        });

        it("wraps around after the last gradient", () => {
            let names = Object.values(BACKGROUND_GRADIENT_OPTIONS);
            applyBackground(el, baseState({ "background-style": "gradient", "background-rotate": true }), names.length);
            expect(el.classList.contains("calendarium-bg-gradient-" + names[0])).toBe(true);
        });
    });

    describe("parseImageUrlList", () => {
        it("splits on newlines, trims, and drops blank/invalid lines", () => {
            let out = parseImageUrlList("https://example.com/a.jpg\n\n  https://example.com/b.jpg  \nnot-a-url\njavascript:alert(1)");
            expect(out).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"]);
        });

        it("returns an empty array for falsy/non-string input", () => {
            expect(parseImageUrlList("")).toEqual([]);
            expect(parseImageUrlList(null)).toEqual([]);
            expect(parseImageUrlList(undefined)).toEqual([]);
        });
    });

    describe("background-rotate for 'custom-image-url'", () => {
        const URLS = "https://example.com/a.jpg\nhttps://example.com/b.jpg\nhttps://example.com/c.jpg";

        it("without rotation, always uses the first valid URL", () => {
            applyBackground(el, baseState({ "background-style": "custom-image-url", "background-image-url": URLS }), 2);
            expect(el.style.backgroundImage).toContain("a.jpg");
        });

        it("with rotation on and multiple URLs, cycles through them by rotateStep", () => {
            applyBackground(el, baseState({
                "background-style": "custom-image-url", "background-image-url": URLS, "background-rotate": true
            }), 0);
            expect(el.style.backgroundImage).toContain("a.jpg");

            applyBackground(el, baseState({
                "background-style": "custom-image-url", "background-image-url": URLS, "background-rotate": true
            }), 1);
            expect(el.style.backgroundImage).toContain("b.jpg");

            applyBackground(el, baseState({
                "background-style": "custom-image-url", "background-image-url": URLS, "background-rotate": true
            }), 3);
            expect(el.style.backgroundImage).toContain("a.jpg"); // wraps: 3 % 3 === 0
        });

        it("with rotation on but only a single URL, stays on that one URL regardless of rotateStep", () => {
            applyBackground(el, baseState({
                "background-style": "custom-image-url", "background-image-url": "https://example.com/only.jpg",
                "background-rotate": true
            }), 4);
            expect(el.style.backgroundImage).toContain("only.jpg");
        });

        it("sets no background-image when the list is empty/all-invalid", () => {
            applyBackground(el, baseState({ "background-style": "custom-image-url", "background-image-url": "not-a-url" }));
            expect(el.style.backgroundImage).toBe("");
        });
    });
});

describe("applyImageFolderBackground ('image-folder' background-style — IndexedDB-backed, via lib/image-store.js)", () => {
    let el;
    let createObjectURLSpy;

    beforeEach(async () => {
        el = document.createElement("div");
        if (!URL.createObjectURL) URL.createObjectURL = () => "blob:unset";
        if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
        // Keyed off the underlying File's own name (stable across the
        // multiple internal getAllImageBlobURLs() calls each
        // applyImageFolderBackground() invocation makes — see that
        // function's doc comment on revoking+regenerating every call)
        // rather than an incrementing counter, so assertions below can
        // check "which image" independent of how many blob: URLs have
        // been minted so far.
        createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => "blob:" + (blob && blob.name));
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        await clearImages();
    });

    afterEach(async () => {
        await clearImages();
        vi.restoreAllMocks();
    });

    it("no-ops (leaves backgroundImage unset) when background-style isn't 'image-folder'", async () => {
        await addImages([makeFile("Pics/a.jpg")], false);
        await applyImageFolderBackground(el, baseState({ "background-style": "custom-image-url" }));
        expect(el.style.backgroundImage).toBe("");
        expect(createObjectURLSpy).not.toHaveBeenCalled();
    });

    it("no-ops silently when el is null/undefined", async () => {
        await expect(applyImageFolderBackground(null, baseState({ "background-style": "image-folder" }))).resolves.toBeUndefined();
    });

    it("leaves no background-image when no images have been picked yet", async () => {
        await applyImageFolderBackground(el, baseState({ "background-style": "image-folder" }));
        expect(el.style.backgroundImage).toBe("");
    });

    it("without rotation, always uses the first stored image", async () => {
        await addImages([makeFile("Pics/a.jpg"), makeFile("Pics/b.jpg")], false);
        await applyImageFolderBackground(el, baseState({ "background-style": "image-folder" }), 3);
        expect(el.style.backgroundImage).toContain("a.jpg");
    });

    it("with rotation on and multiple images, cycles through them by rotateStep", async () => {
        await addImages([makeFile("Pics/a.jpg"), makeFile("Pics/b.jpg"), makeFile("Pics/c.jpg")], false);

        await applyImageFolderBackground(el, baseState({ "background-style": "image-folder", "background-rotate": true }), 0);
        expect(el.style.backgroundImage).toContain("a.jpg");

        await applyImageFolderBackground(el, baseState({ "background-style": "image-folder", "background-rotate": true }), 1);
        expect(el.style.backgroundImage).toContain("b.jpg");

        await applyImageFolderBackground(el, baseState({ "background-style": "image-folder", "background-rotate": true }), 3);
        expect(el.style.backgroundImage).toContain("a.jpg"); // wraps: 3 % 3 === 0
    });

    it("with rotation on but only a single image, stays on that one image regardless of rotateStep", async () => {
        await addImages([makeFile("Pics/only.jpg")], false);
        await applyImageFolderBackground(el, baseState({ "background-style": "image-folder", "background-rotate": true }), 4);
        expect(el.style.backgroundImage).toContain("only.jpg");
    });
});

describe("applyIconSize", () => {
    let el;
    beforeEach(() => { el = document.createElement("div"); });

    it("sets --cal-icon-size to the medium default when unset", () => {
        applyIconSize(el, baseState());
        expect(el.style.getPropertyValue("--cal-icon-size")).toBe("20px");
    });

    it("maps small/medium/large to their pixel values", () => {
        applyIconSize(el, baseState({ "icon-size": "small" }));
        expect(el.style.getPropertyValue("--cal-icon-size")).toBe("14px");
        applyIconSize(el, baseState({ "icon-size": "large" }));
        expect(el.style.getPropertyValue("--cal-icon-size")).toBe("30px");
    });

    it("falls back to medium for an unrecognized value", () => {
        applyIconSize(el, baseState({ "icon-size": "huge" }));
        expect(el.style.getPropertyValue("--cal-icon-size")).toBe("20px");
    });

    it("no-ops silently when el is null/undefined", () => {
        expect(() => applyIconSize(null, baseState())).not.toThrow();
    });
});

describe("isEffectiveDarkTheme", () => {
    it("returns true for explicit 'dark' theme-mode", () => {
        expect(isEffectiveDarkTheme(baseState({ "theme-mode": "dark" }))).toBe(true);
    });

    it("returns false for explicit 'light' theme-mode", () => {
        expect(isEffectiveDarkTheme(baseState({ "theme-mode": "light" }))).toBe(false);
    });

    it("falls back to prefers-color-scheme for 'auto' (jsdom without matchMedia support defaults to false/light)", () => {
        expect(isEffectiveDarkTheme(baseState({ "theme-mode": "auto" }))).toBe(false);
    });
});

describe("applyPanelOpacity — 'bg-opacity', panel-only application (NOT document.body)", () => {
    let container, body;
    beforeEach(() => {
        container = document.createElement("div");
        body = document.body;
        body.style.backgroundColor = "";
    });

    it("leaves backgroundColor empty (fully transparent) for the default 0 opacity", () => {
        applyPanelOpacity(container, baseState());
        expect(container.style.backgroundColor).toBe("");
    });

    it("sets a black-ish rgba panel color for a dark effective theme", () => {
        applyPanelOpacity(container, baseState({ "bg-opacity": 0.5, "theme-mode": "dark" }));
        expect(container.style.backgroundColor).toBe("rgba(0, 0, 0, 0.5)");
    });

    it("sets a white-ish rgba panel color for a light effective theme", () => {
        applyPanelOpacity(container, baseState({ "bg-opacity": 0.5, "theme-mode": "light" }));
        expect(container.style.backgroundColor).toBe("rgba(255, 255, 255, 0.5)");
    });

    it("clamps out-of-range opacity into [0, 1]", () => {
        applyPanelOpacity(container, baseState({ "bg-opacity": 5, "theme-mode": "dark" }));
        // jsdom's CSSOM normalizes a fully-opaque rgba(...,1) down to rgb(...).
        expect(container.style.backgroundColor).toBe("rgb(0, 0, 0)");
    });

    it("is applied ONLY to the given element, never to document.body", () => {
        applyPanelOpacity(container, baseState({ "bg-opacity": 1, "theme-mode": "dark" }));
        expect(container.style.backgroundColor).not.toBe("");
        expect(body.style.backgroundColor).toBe("");
    });

    it("no-ops silently when el is null/undefined", () => {
        expect(() => applyPanelOpacity(null, baseState({ "bg-opacity": 1 }))).not.toThrow();
    });
});

describe("applyFirefoxThemeBackground ('firefox-theme' background-style)", () => {
    let el;
    beforeEach(() => { el = document.createElement("div"); });
    afterEach(() => { delete global.browser; });

    it("no-ops (leaves no inline color/image) when browser.theme is entirely unavailable — degrades to the CSS class's theme-default-equivalent fallback", async () => {
        global.browser = {};
        await applyFirefoxThemeBackground(el);
        expect(el.style.backgroundColor).toBe("");
        expect(el.style.backgroundImage).toBe("");
    });

    it("no-ops when the global browser object itself is undefined", async () => {
        delete global.browser;
        await expect(applyFirefoxThemeBackground(el)).resolves.toBeUndefined();
        expect(el.style.backgroundColor).toBe("");
    });

    it("applies a theme color (string) from theme.colors.frame when ntp_background is absent", async () => {
        global.browser = { theme: { getCurrent: vi.fn(() => Promise.resolve({ colors: { frame: "#336699" } })) } };
        await applyFirefoxThemeBackground(el);
        expect(el.style.backgroundColor).toContain("rgb");
    });

    it("prefers ntp_background over frame/toolbar when present", async () => {
        global.browser = {
            theme: {
                getCurrent: vi.fn(() => Promise.resolve({
                    colors: { ntp_background: "rgb(10, 20, 30)", frame: "#000000", toolbar: "#111111" }
                }))
            }
        };
        await applyFirefoxThemeBackground(el);
        expect(el.style.backgroundColor).toBe("rgb(10, 20, 30)");
    });

    it("accepts an [r,g,b] array theme color", async () => {
        global.browser = { theme: { getCurrent: vi.fn(() => Promise.resolve({ colors: { frame: [10, 20, 30] } })) } };
        await applyFirefoxThemeBackground(el);
        expect(el.style.backgroundColor).toBe("rgb(10, 20, 30)");
    });

    it("applies theme.images.theme_frame as a background-image", async () => {
        global.browser = {
            theme: { getCurrent: vi.fn(() => Promise.resolve({ images: { theme_frame: "https://example.com/theme.png" } })) }
        };
        await applyFirefoxThemeBackground(el);
        expect(el.style.backgroundImage).toContain("theme.png");
    });

    it("falls back gracefully (no inline color/image) when the active theme has no useful colors/images, e.g. the default theme", async () => {
        global.browser = { theme: { getCurrent: vi.fn(() => Promise.resolve({})) } };
        await applyFirefoxThemeBackground(el);
        expect(el.style.backgroundColor).toBe("");
        expect(el.style.backgroundImage).toBe("");
    });

    it("falls back gracefully when browser.theme.getCurrent() rejects", async () => {
        global.browser = { theme: { getCurrent: vi.fn(() => Promise.reject(new Error("boom"))) } };
        await expect(applyFirefoxThemeBackground(el)).resolves.toBeUndefined();
        expect(el.style.backgroundColor).toBe("");
    });

    it("falls back gracefully when browser.theme.getCurrent() throws synchronously", async () => {
        global.browser = { theme: { getCurrent: vi.fn(() => { throw new Error("boom"); }) } };
        await expect(applyFirefoxThemeBackground(el)).resolves.toBeUndefined();
        expect(el.style.backgroundColor).toBe("");
    });

    it("no-ops silently when el is null/undefined", async () => {
        global.browser = { theme: { getCurrent: vi.fn(() => Promise.resolve({ colors: { frame: "#fff" } })) } };
        await expect(applyFirefoxThemeBackground(null)).resolves.toBeUndefined();
    });
});
