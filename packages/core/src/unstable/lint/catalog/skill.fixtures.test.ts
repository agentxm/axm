/**
 * Fixture-based integration tests for the `skill/*` catalog.
 *
 * Each fixture directory under `__fixtures__/skills/<case>/` contains:
 *
 * - The input tree (`SKILL.md`, optional `skill.json`, and any other files
 *   the case needs).
 * - `case.json` — { description, isNative, expectedFindings[] }.
 *
 * The runner builds a VFT-backed `SkillRuleContext` from the tree, evaluates
 * `skillRules`, and asserts that each expected finding's `(ruleId, severity,
 * file)` triple is present and that any `messageIncludes` substring matches
 * the actual message. Exact findings count must match.
 *
 * Fixture trees are simple flat directories — the v1 skill catalog only
 * reads `SKILL.md` and `skill.json`. Deeper nested trees land when a rule
 * earns them.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { platformCanonicalLintConfig } from "../config.js";
import type { SkillRuleContext } from "../context.js";
import { evaluateContexts } from "../evaluate.js";
import { makeVftSkillFileAccessor, type VFTNode } from "./skill-accessor/vft.js";
import { skillRules } from "./skill.js";

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
  readonly isNative: boolean;
  readonly expectedFindings: ReadonlyArray<ExpectedFinding>;
}

const FIXTURES_ROOT = nodePath.resolve(__dirname, "..", "__fixtures__", "skills");

const listCases = (): ReadonlyArray<string> =>
  nodeFs
    .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

const loadCase = (name: string): { readonly case: FixtureCase; readonly tree: VFTNode } => {
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
  const tree: VFTNode = {
    hasFile: (p) => files.has(p),
    getFile: (p) => files.get(p),
  };
  return { case: parsed, tree };
};

const decodeSkillJson = (tree: VFTNode): unknown => {
  const bytes = tree.getFile("skill.json");
  if (bytes === undefined) {
    return undefined;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

// -----------------------------------------------------------------------------
// Fixture runner
// -----------------------------------------------------------------------------

describe("skill catalog — fixtures", () => {
  for (const caseName of listCases()) {
    const { case: fixture, tree } = loadCase(caseName);
    it.effect(`${caseName}: ${fixture.description}`, () =>
      Effect.gen(function* () {
        const accessor = makeVftSkillFileAccessor(tree);
        // Fixture layouts store `SKILL.md` and `skill.json` at the same tree
        // root, so both accessors share it. Publish-path tests exercise the
        // native split where `skill.json` is at the package root while
        // `SKILL.md` lives under `src/`.
        const context: SkillRuleContext = {
          subject: {
            isNative: fixture.isNative,
            skillJson: decodeSkillJson(tree),
          },
          files: accessor,
          packageFiles: accessor,
          displayRoot: "",
        };

        const evaluated = yield* evaluateContexts(
          skillRules,
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
