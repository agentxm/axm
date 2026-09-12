import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, it } from "vitest";
import { createVitest } from "vitest/node";
import AllureReporter from "./allure-reporter.js";

it("replaces only its suite's results when execution initializes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-allure-reporter-"));
  const resultsDir = path.join(root, "selected", "allure-results");
  const otherResultsDir = path.join(root, "other", "allure-results");
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(otherResultsDir, { recursive: true });
  const previous = path.join(resultsDir, "previous-result.json");
  const other = path.join(otherResultsDir, "other-result.json");
  fs.writeFileSync(previous, "old selected suite");
  fs.writeFileSync(other, "other suite");
  const reporter = new AllureReporter({ resultsDir, environmentInfo: { runtime: "fixture" } });
  const vitest = await createVitest("test", { root, config: false, watch: false, reporters: [] });
  try {
    expect(fs.readFileSync(previous, "utf8")).toBe("old selected suite");
    reporter.onInit(vitest);
    expect(fs.existsSync(previous)).toBe(false);
    expect(fs.readFileSync(other, "utf8")).toBe("other suite");
    expect(fs.readFileSync(path.join(resultsDir, "environment.properties"), "utf8")).toContain(
      "runtime=fixture",
    );
  } finally {
    await vitest.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
