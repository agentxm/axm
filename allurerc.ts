import { defineConfig } from "allure";

export default defineConfig({
  name: "AXM Test Report",
  output: "test-results/allure-report",
  plugins: {
    awesome: {
      options: {
        reportLanguage: "en",
        singleFile: true,
      },
    },
  },
});
