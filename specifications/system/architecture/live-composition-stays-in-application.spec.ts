import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import {
  defineBoundEvidence,
  defineSpecification,
} from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/architecture/live-composition-stays-in-application",
  title: "Environment-backed service composition happens only in the application composition root",
  statement:
    "Environment-backed and in-memory service implementations shall be composed only at the application composition root, and production source in any other package shall not import them directly.",
  class: "constraint",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed lint configuration shows that the import restriction on environment-backed and in-memory implementation entries is armed for production source.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The lint gate declared as bound evidence runs on every change through the required aggregate check.",
    "Which non-test modules are exempt from the restriction is realization detail pinned by repository tooling tests, not by this specification.",
  ],
  openQuestions: [],
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
      "Rejects imports of environment-backed implementations and in-memory ports from production source outside the application composition root, while tests and specifications keep their sanctioned exceptions.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Application-only composition of concrete implementations", () => {
  // Production packages expose environment-backed implementations behind
  // explicit `./live` exports and deterministic in-memory ports behind
  // `./testing`. This coverage check asserts the restriction on both entries
  // stays armed; the exact exception list is realization detail verified
  // outside the specification corpus.
  it.effect(
    "the import restriction stays armed for environment-backed and in-memory implementation entries",
    () =>
      Effect.sync(() => {
        const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.mjs"), "utf8");
        expect(eslintConfig).toContain('group: ["@agentxm/*/live"]');
        expect(eslintConfig).toContain('group: ["@agentxm/*/testing"]');
      }),
  );
});
