/**
 * Guard test (task 3c.29 acceptance).
 *
 * Enforces the Phase 3c design invariant: no `AutofixingRule.fix` in the
 * `workspace/*` catalog invokes `syncWorkspace()` or references any
 * Operation outside the 14 per-extension vocabulary
 * (`PER_EXTENSION_OPERATION_NAMES`).
 *
 * Strategy:
 *
 * 1. Static grep — every rule source file under `catalog/workspace/` is
 *    read as text; we reject any match for `syncWorkspace(`,
 *    `sync-workspace`, or a `name: "<any other string>"` pattern that
 *    doesn't appear in the allowlist.
 * 2. Semantic probe — for every autofixing workspace rule, we instantiate
 *    an AutofixableFinding for each known-suggestion prefix and invoke
 *    `rule.fix` against a minimal fixture context; the returned
 *    Operations' `name`s MUST all appear in the allowlist.
 *
 * This test is the production acceptance for "Autofixing rules compose
 * only from pre-sync per-extension Operations" and blocks any future rule
 * author from silently introducing a new Operation kind or a
 * `syncWorkspace()` call.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { isPerExtensionOperationName } from "./workspace/helpers/install-ops.js";
import { workspaceRules } from "./workspace.js";
import type { AutofixableFinding, AutofixingRule } from "../rule.js";
import type { WorkspaceRuleContext } from "../context.js";
import {
  emptyWorkspaceState,
  makeStateBackedWorkspaceLintAccessor,
} from "./workspace-accessor/test-state.js";

// -----------------------------------------------------------------------------
// Static grep over rule source files
// -----------------------------------------------------------------------------

const WORKSPACE_RULES_DIR = nodePath.resolve(__dirname, "workspace");

const listRuleFiles = (): ReadonlyArray<string> =>
  nodeFs
    .readdirSync(WORKSPACE_RULES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => !f.endsWith(".test.ts"))
    .map((f) => nodePath.join(WORKSPACE_RULES_DIR, f));

const readFileUtf8 = (path: string): string => nodeFs.readFileSync(path, "utf-8");

describe("workspace catalog guard — static grep", () => {
  it("no rule source references syncWorkspace", () => {
    const files = listRuleFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileUtf8(file);
      // We only flag function call sites. The string "syncWorkspace" may
      // appear in a comment discussing the replacement; require the
      // following char to be `(` to mean a call.
      expect(
        content.match(/syncWorkspace\s*\(/),
        `${nodePath.basename(file)} references syncWorkspace()`,
      ).toBeNull();
    }
  });

  it("no rule source references an operation name outside the 14-op vocabulary", () => {
    const files = listRuleFiles();
    const allowedNames = new Set([
      "install-skill",
      "uninstall-skill",
      "enable-skill",
      "disable-skill",
      "install-pack",
      "uninstall-pack",
      "install-command",
      "uninstall-command",
      "enable-command",
      "disable-command",
      "install-mcp-server",
      "uninstall-mcp-server",
      "enable-subagent",
      "disable-subagent",
    ]);
    // Match `name: "<value>"` or `name: '<value>'` inside the source;
    // every match whose value looks op-like (hyphenated lowercase)
    // must be in the allowlist.
    const NAME_LITERAL_RE = /name\s*:\s*["']([a-z][a-z0-9-]+)["']/g;
    for (const file of files) {
      const content = readFileUtf8(file);
      let match: RegExpExecArray | null;
      while ((match = NAME_LITERAL_RE.exec(content)) !== null) {
        const value = match[1];
        if (value === undefined) {
          continue;
        }
        // Guard: only hyphen-containing strings look like op names; a
        // plain word like "source" won't, and isn't an op name either.
        if (!value.includes("-")) {
          continue;
        }
        expect(
          allowedNames.has(value),
          `${nodePath.basename(file)} references operation name '${value}' outside the 14-op vocabulary`,
        ).toBe(true);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// Semantic probe — invoke every autofixing rule's fix() with its known
// suggestion prefixes and check returned Operation names.
// -----------------------------------------------------------------------------

const SUGGESTION_SEEDS: Record<
  string,
  ReadonlyArray<{
    readonly message: string;
    readonly suggestion: string;
  }>
> = {
  "workspace/lockfile-valid": [
    {
      message: "stub",
      suggestion: "Reinstall every declared extension to rewrite the lockfile.",
    },
  ],
  "workspace/skills-lockfile-aligned": [
    { message: "stub", suggestion: "Install skill 'x' from x." },
    { message: "stub", suggestion: "Uninstall orphan skill 'x' to remove it from the workspace." },
    { message: "stub", suggestion: "Reinstall skill 'x' at the declared version." },
  ],
  "workspace/skills-integrity-valid": [
    { message: "stub", suggestion: "Reinstall skill 'x' to re-hash from source." },
  ],
  "workspace/skills-artifacts-correct": [
    { message: "stub", suggestion: "Re-enable skill 'x' to recreate agent artifacts." },
    { message: "stub", suggestion: "Disable skill 'x' to clean up stale artifacts." },
  ],
  "workspace/skills-artifacts-clean": [
    { message: "stub", suggestion: "Reinstall skill 'x' to re-materialize canonical source." },
  ],
};

const makeStubContext = (): WorkspaceRuleContext => ({
  subject: { root: "/tmp/ws", scope: "project" },
  workspace: makeStateBackedWorkspaceLintAccessor(emptyWorkspaceState()),
  displayRoot: "",
});

const makeStubFinding = (
  ruleId: string,
  message: string,
  suggestion: string,
): AutofixableFinding => ({
  kind: "autofixable",
  ruleId,
  severity: "error",
  message,
  suggestions: [suggestion],
});

describe("workspace catalog guard — semantic probe", () => {
  const autofixingRules = workspaceRules.filter(
    (r): r is AutofixingRule<WorkspaceRuleContext> => r.kind === "autofixing",
  );

  for (const rule of autofixingRules) {
    const seeds = SUGGESTION_SEEDS[rule.id] ?? [];
    for (const seed of seeds) {
      it.effect(`${rule.id} emits only vocabulary ops for suggestion "${seed.suggestion}"`, () =>
        Effect.gen(function* () {
          const ctx = makeStubContext();
          const finding = makeStubFinding(rule.id, seed.message, seed.suggestion);
          const ops = yield* rule.fix(ctx, finding);
          for (const op of ops) {
            expect(
              isPerExtensionOperationName(op.name),
              `rule ${rule.id} emitted disallowed operation '${op.name}'`,
            ).toBe(true);
          }
        }),
      );
    }
  }
});
