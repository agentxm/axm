import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineBoundEvidence, defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/architecture/live-composition-stays-in-application",
  title: "Environment-backed service composition happens only in the application composition root",
  class: "architecture",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  methods: ["contract"],
});

/**
 * The focused import restrictions are the decisive static verification for
 * this requirement. Their results are evidence bound to this identity; the
 * specification remains the sole requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "lint: no-restricted-imports (@agentxm/*/live, @agentxm/*/testing)",
    verifies:
      "Rejects concrete environment-backed Layer imports and in-memory port imports from production source outside the application composition root, while tests and specifications keep their sanctioned exceptions.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Application-only composition of concrete implementations", () => {
  // Production packages expose environment-backed implementations behind
  // explicit `./live` exports and deterministic in-memory ports behind
  // `./testing`. Only application composition imports `*/live` in production
  // source; a package's own tests may import its own `./live`, integration
  // tests may compose a lower package's live Layer, and tests and
  // specifications may import `*/testing`. This projection asserts the
  // restriction stays armed with exactly those exceptions.
  it.effect("production source may not import another package's live composition", () =>
    Effect.sync(() => {
      const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.mjs"), "utf8");
      expect(eslintConfig).toContain('"@agentxm/*/live"');
      expect(eslintConfig).toContain('"@agentxm/*/testing"');
    }),
  );

  it.effect("the composition root and test exceptions stay bounded", () =>
    Effect.sync(() => {
      const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.mjs"), "utf8");
      expect(eslintConfig).toContain(
        `ignores: [
      "packages/cli/src/runtime.ts",
      "packages/cli/src/test-helpers.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],`,
      );
    }),
  );
});
