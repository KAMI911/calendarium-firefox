import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node", // default; individual files opt into jsdom via
                              // a `// @vitest-environment jsdom` docblock
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/**/*.js"],
            exclude: ["src/_locales/**"]
        }
    }
});
