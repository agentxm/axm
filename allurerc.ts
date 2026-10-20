import { defineConfig } from "allure";

/** @public Allure loads this configuration. */
export default defineConfig({
  name: "AXM Test Report",
  output: "test-results/allure-report",
  resultsDir: ["test-results/*/allure-results"],
  plugins: {
    awesome: {
      options: {
        reportLanguage: "en",
        singleFile: false,
      },
    },
  },
});
