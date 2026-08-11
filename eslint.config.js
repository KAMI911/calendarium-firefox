import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        ignores: ["dist/**", "web-ext-artifacts/**", "node_modules/**", "src/_locales/**"]
    },
    {
        files: ["src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                browser: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_"
            }]
        }
    },
    {
        files: ["scripts/**/*.mjs", "eslint.config.js", "vitest.config.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: { ...globals.node }
        }
    },
    {
        files: ["tests/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: { ...globals.node, ...globals.browser, browser: "writable" }
        }
    }
];
