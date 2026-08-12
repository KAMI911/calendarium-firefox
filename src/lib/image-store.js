/*
 * lib/image-store.js — IndexedDB wrapper for folder-picked background images
 * (the "image-folder" background-style — see settings/schema.js's
 * "background-style" field and lib/render.js's applyBackground()/README).
 *
 * Why IndexedDB and not browser.storage.local/sync: actual image *bytes*
 * would blow past storage.local's practical quota almost immediately for
 * anything but a handful of small images, and storage.sync has an even
 * smaller one. IndexedDB has no such practical ceiling for this use case
 * (Firefox grants a large origin-scoped quota) and stores Blobs natively,
 * so images never need to be re-encoded as base64 strings.
 *
 * Database: "calendarium-images", object store: "backgroundImages",
 * records: { id (autoincrement), blob, relativePath }.
 *
 * Deliberately has no knowledge of settings/schema.js, options.js, or
 * render.js — it's a small, generic key-value-ish blob store, exercised
 * directly by tests/unit/image-store.test.js (via fake-indexeddb) and used
 * by options.js (writing, via addImages()/clearImages()) and newtab.js
 * (reading, via getAllImageBlobURLs()/getImageCount()).
 */

const DB_NAME = "calendarium-images";
const DB_VERSION = 1;
const STORE_NAME = "backgroundImages";

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("indexedDB is not available in this environment"));
            return;
        }
        let request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            let db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
}

function withStore(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        let tx = db.transaction(STORE_NAME, mode);
        let store = tx.objectStore(STORE_NAME);
        let result = fn(store);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    }));
}

/**
 * Filter a FileList (from a `webkitdirectory` folder-picker input) down to
 * only the files that should be stored, given the "include subfolders"
 * setting. Each File's `webkitRelativePath` looks like
 * "<chosen-folder>/sub/dir/photo.jpg" — one path separator per subfolder
 * level below the chosen root, so "directly in the chosen top folder" means
 * exactly one "/" in that path (folder name + filename).
 */
export function filterImageFiles(fileList, includeSubfolders) {
    let files = Array.from(fileList || []);
    if (includeSubfolders) return files;
    return files.filter((f) => {
        let rel = f.webkitRelativePath || "";
        return (rel.split("/").length - 1) === 1;
    });
}

/** Remove every stored image record. */
export async function clearImages() {
    await withStore("readwrite", (store) => store.clear());
}

/**
 * Store every file from `fileList` (already filtered per
 * `includeSubfolders` — see filterImageFiles()) as a new record. Files
 * *are* Blobs already, so no re-reading/re-encoding is needed. Returns the
 * number of images actually stored.
 */
export async function addImages(fileList, includeSubfolders) {
    let files = filterImageFiles(fileList, includeSubfolders);
    await withStore("readwrite", (store) => {
        for (let file of files) {
            store.add({ blob: file, relativePath: file.webkitRelativePath || file.name || "" });
        }
    });
    return files.length;
}

/** Number of images currently stored. */
export async function getImageCount() {
    return withStore("readonly", (store) => new Promise((resolve, reject) => {
        let req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

// Tracks object URLs created by the last getAllImageBlobURLs() call so they
// can be revoked before generating a new batch — otherwise a long-lived New
// Tab session would leak one blob: URL (and its underlying memory) per
// rotation cycle.
let lastObjectUrls = [];

/**
 * Return every stored image as a fresh array of `URL.createObjectURL(blob)`
 * strings, revoking whatever object URLs the previous call to this function
 * produced first (so nothing accumulates across repeated calls — e.g. every
 * "reload()" in newtab.js).
 */
export async function getAllImageBlobURLs() {
    let records = await withStore("readonly", (store) => new Promise((resolve, reject) => {
        let req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    }));

    for (let url of lastObjectUrls) {
        try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
    }

    let urls = records.map((r) => URL.createObjectURL(r.blob));
    lastObjectUrls = urls;
    return urls;
}

export default { clearImages, addImages, getAllImageBlobURLs, getImageCount, filterImageFiles };
