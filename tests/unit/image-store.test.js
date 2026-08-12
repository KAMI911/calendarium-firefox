// image-store.js is a thin IndexedDB wrapper for folder-picked background
// images (see settings/schema.js's "image-folder" background-style and
// lib/render.js's applyBackground()). jsdom itself has no IndexedDB
// implementation, so this file pulls in fake-indexeddb/auto to install
// `indexedDB`/`IDBKeyRange` as globals before importing the module under
// test — the standard approach for testing IndexedDB code under
// Vitest/jsdom.
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    clearImages, addImages, getAllImageBlobURLs, getImageCount, filterImageFiles
} from "../../src/lib/image-store.js";

/** A minimal File-like Blob stand-in carrying webkitRelativePath, like a real File from a folder picker. */
function makeFile(relativePath, content = "x") {
    let blob = new Blob([content], { type: "image/png" });
    blob.webkitRelativePath = relativePath;
    blob.name = relativePath.split("/").pop();
    return blob;
}

describe("image-store.js", () => {
    let createObjectURLSpy;
    let revokeObjectURLSpy;
    let urlCounter;

    beforeEach(async () => {
        urlCounter = 0;
        // jsdom's URL has no createObjectURL/revokeObjectURL implementation
        // at all, so they need to exist as plain functions before vi.spyOn
        // can wrap them.
        if (!URL.createObjectURL) URL.createObjectURL = () => "blob:unset";
        if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
        createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:mock-" + (++urlCounter));
        revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        await clearImages();
    });

    afterEach(async () => {
        await clearImages();
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
    });

    describe("filterImageFiles", () => {
        it("keeps only top-level files when includeSubfolders is false", () => {
            let files = [
                makeFile("MyFolder/a.jpg"),
                makeFile("MyFolder/b.png"),
                makeFile("MyFolder/sub/c.jpg"),
                makeFile("MyFolder/sub/deeper/d.jpg")
            ];
            let out = filterImageFiles(files, false);
            expect(out.map((f) => f.webkitRelativePath)).toEqual(["MyFolder/a.jpg", "MyFolder/b.png"]);
        });

        it("keeps every file (including nested subfolders) when includeSubfolders is true", () => {
            let files = [
                makeFile("MyFolder/a.jpg"),
                makeFile("MyFolder/sub/c.jpg"),
                makeFile("MyFolder/sub/deeper/d.jpg")
            ];
            let out = filterImageFiles(files, true);
            expect(out).toHaveLength(3);
        });

        it("handles an empty/undefined FileList without throwing", () => {
            expect(filterImageFiles(undefined, false)).toEqual([]);
            expect(filterImageFiles([], true)).toEqual([]);
        });
    });

    describe("addImages / getImageCount / clearImages", () => {
        it("stores only top-level files by default and reports the correct count", async () => {
            let files = [
                makeFile("Pics/a.jpg"),
                makeFile("Pics/sub/b.jpg")
            ];
            let stored = await addImages(files, false);
            expect(stored).toBe(1);
            expect(await getImageCount()).toBe(1);
        });

        it("stores every file, including subfolders, when includeSubfolders is true", async () => {
            let files = [
                makeFile("Pics/a.jpg"),
                makeFile("Pics/sub/b.jpg"),
                makeFile("Pics/sub/deeper/c.jpg")
            ];
            let stored = await addImages(files, true);
            expect(stored).toBe(3);
            expect(await getImageCount()).toBe(3);
        });

        it("clearImages() empties the store", async () => {
            await addImages([makeFile("Pics/a.jpg")], false);
            expect(await getImageCount()).toBe(1);
            await clearImages();
            expect(await getImageCount()).toBe(0);
        });

        it("getImageCount() is 0 on a freshly cleared store", async () => {
            expect(await getImageCount()).toBe(0);
        });
    });

    describe("getAllImageBlobURLs", () => {
        it("returns one object URL per stored image", async () => {
            await addImages([makeFile("Pics/a.jpg"), makeFile("Pics/b.jpg")], false);
            let urls = await getAllImageBlobURLs();
            expect(urls).toHaveLength(2);
            expect(urls.every((u) => u.startsWith("blob:mock-"))).toBe(true);
            expect(createObjectURLSpy).toHaveBeenCalledTimes(2);
        });

        it("returns an empty array when the store is empty", async () => {
            expect(await getAllImageBlobURLs()).toEqual([]);
        });

        it("revokes the previous batch of object URLs before creating a new one", async () => {
            await addImages([makeFile("Pics/a.jpg")], false);
            let firstBatch = await getAllImageBlobURLs();
            expect(revokeObjectURLSpy).not.toHaveBeenCalled();

            await addImages([makeFile("Pics/b.jpg")], false);
            let secondBatch = await getAllImageBlobURLs();

            expect(revokeObjectURLSpy).toHaveBeenCalledTimes(firstBatch.length);
            for (let u of firstBatch) expect(revokeObjectURLSpy).toHaveBeenCalledWith(u);
            expect(secondBatch).toHaveLength(2);
        });
    });
});
