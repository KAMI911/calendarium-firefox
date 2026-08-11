#!/usr/bin/env node
/*
 * set-version.mjs — sync manifest.json's "version" field from a git tag.
 *
 * Used by the GitLab CI "sign" job (only runs on `v*` tags): strips the
 * leading "v" from $CI_COMMIT_TAG and writes it into manifest.json before
 * `web-ext sign` runs, so the signed .xpi's version always matches the
 * release tag.
 *
 * Usage: CI_COMMIT_TAG=v1.2.3 node scripts/set-version.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, "..", "src", "manifest.json");
const PACKAGE_PATH  = path.resolve(__dirname, "..", "package.json");

function main() {
    let tag = process.env.CI_COMMIT_TAG;
    if (!tag) {
        console.error("set-version: $CI_COMMIT_TAG is not set — nothing to do.");
        process.exit(1);
    }
    let match = tag.match(/^v(\d+\.\d+\.\d+)$/);
    if (!match) {
        console.error("set-version: tag '" + tag + "' does not match v<major>.<minor>.<patch> — refusing to guess a version.");
        process.exit(1);
    }
    let version = match[1];
    let manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    manifest.version = version;
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
    console.log("set-version: manifest.json version -> " + version);

    // package.json's version is the npm-package identity, not the shipped
    // extension version, but keeping the two numbers in sync avoids the
    // confusing "which version is this really" question when someone reads
    // package.json without knowing manifest.json is the source of truth.
    let pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
    pkg.version = version;
    writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + "\n");
    console.log("set-version: package.json version -> " + version);
}

main();
