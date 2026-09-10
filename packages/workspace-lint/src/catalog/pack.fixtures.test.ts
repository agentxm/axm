/**
 * Fixture-based integration tests for the `pack/*` catalog.
 *
 * Each fixture directory under `__fixtures__/packs/<case>/` contains:
 *
 * - The input tree (optional `pack.json` and any other files the
 *   case needs).
 * - `case.json` — { description, expectedFindings[] }.
 *
 * The runner builds a VFT-backed `PackRuleContext` from the tree, evaluates
 * `packRules`, and asserts that each expected finding's `(ruleId, severity,
 * file)` triple is present and that any `messageIncludes` substring matches
 * the actual message. Exact findings count must match.
 *
 * Fixture trees are simple flat directories — the v1 pack catalog only
 * reads `pack.json`.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { platformCanonicalLintConfig } from "@agentxm/registry-protocol/unstable/lint/config";
import type { PackRuleContext } from "@agentxm/registry-protocol/unstable/lint/context";
import { evaluateContexts } from "@agentxm/registry-protocol/unstable/lint/evaluate";
import {
  makeVftPackFileAccessor,
  type PackVFTNode,
} from "@agentxm/registry-protocol/unstable/lint/catalog/pack-accessor/vft";
import { packRules } from "@agentxm/registry-protocol/unstable/lint/catalog/pack";

// -----------------------------------------------------------------------------
// Fixture loader
// -----------------------------------------------------------------------------

interface ExpectedFinding {
  readonly ruleId: string;
  readonly severity: "error" | "warning" | "info";
  readonly file: string;
  readonly messageIncludes?: string;
}

interface FixtureCase {
  readonly description: string;
  readonly expectedFindings: ReadonlyArray<ExpectedFinding>;
}

const FIXTURES_ROOT = nodePath.resolve(__dirname, "..", "__fixtures__", "packs");

const listCases = (): ReadonlyArray<string> =>
  nodeFs
    .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

const loadCase = (name: string): { readonly case: FixtureCase; readonly tree: PackVFTNode } => {
  const dir = nodePath.join(FIXTURES_ROOT, name);
  const caseRaw = nodeFs.readFileSync(nodePath.join(dir, "case.json"), "utf8");
  const parsed = JSON.parse(caseRaw) as FixtureCase;

  const entries = nodeFs.readdirSync(dir, { withFileTypes: true });
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name === "case.json") {
      continue;
    }
    files.set(entry.name, nodeFs.readFileSync(nodePath.join(dir, entry.name)));
  }
  const tree: PackVFTNode = {
    hasFile: (p) => files.has(p),
    getFile: (p) => files.get(p),
  };
  return { case: parsed, tree };
};

const decodePackJson = (tree: PackVFTNode): unknown => {
  const bytes = tree.getFile("pack.json");
  if (bytes === undefined) {
    return undefined;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

// -----------------------------------------------------------------------------
// Fixture runner
// -----------------------------------------------------------------------------

describe("pack catalog — fixtures", () => {
  for (const caseName of listCases()) {
    const { case: fixture, tree } = loadCase(caseName);
    it.effect(`${caseName}: ${fixture.description}`, () =>
      Effect.gen(function* () {
        const context: PackRuleContext = {
          subject: {
            packJson: decodePackJson(tree),
          },
          files: makeVftPackFileAccessor(tree),
          displayRoot: "",
        };

        const evaluated = yield* evaluateContexts(
          packRules,
          [context],
          platformCanonicalLintConfig,
        );

        const findings = evaluated.flatMap((e) => e.findings);
        expect(findings).toHaveLength(fixture.expectedFindings.length);
        for (const expected of fixture.expectedFindings) {
          const match = findings.find(
            (f) =>
              f.ruleId === expected.ruleId &&
              f.severity === expected.severity &&
              f.location?.file === expected.file &&
              (expected.messageIncludes === undefined
                ? true
                : f.message.includes(expected.messageIncludes)),
          );
          if (match === undefined) {
            throw new Error(
              `Expected finding not found for case ${caseName}: ${JSON.stringify(expected)}; actual findings: ${JSON.stringify(findings, null, 2)}`,
            );
          }
        }
      }),
    );
  }
});
