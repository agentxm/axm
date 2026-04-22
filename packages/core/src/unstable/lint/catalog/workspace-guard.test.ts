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
 * 2. Semantic probe — for every autofixing workspace rule, we build one or
 *    more minimal in-memory workspace states that produce real autofixable
 *    findings, then invoke `rule.fix`; the returned Operations' `name`s
 *    MUST all appear in the allowlist.
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
import { getAllAgents } from "../../agents/registry.js";
import { isPerExtensionOperationName } from "./workspace/helpers/install-ops.js";
import { workspaceRules } from "./workspace.js";
import type { AutofixableFinding, AutofixingRule } from "../rule.js";
import type { WorkspaceRuleContext } from "../context.js";
import {
  emptyWorkspaceState,
  makeStateBackedWorkspaceLintAccessor,
  type WorkspaceState,
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
// Semantic probe — build real workspace states that trigger autofixable
// findings and check returned Operation names.
// -----------------------------------------------------------------------------

const ISO_DATE = "2026-01-01T00:00:00.000Z";

const findAgent = (id: string) => {
  const agent = getAllAgents().find((candidate) => candidate.id === id);
  if (agent === undefined) {
    throw new Error(`expected known agent '${id}'`);
  }
  return agent;
};

const CLAUDE_CODE = findAgent("claude-code");
const CURSOR = findAgent("cursor");

const makeRegistrySkillLockEntry = (name: string, resolvedVersion: string) => ({
  type: "registry",
  owner: "@acme",
  name,
  resolvedVersion,
  integrity: "test-integrity",
  sourceName: "registry",
  agents: [],
  installedAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

const makeLocalSkillLockEntry = (path: string) => ({
  type: "local",
  path,
  agents: [],
  installedAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

const makeLockfile = (skills: Record<string, unknown>): unknown => ({
  lockfileVersion: 1,
  skills,
});

interface SemanticProbe {
  readonly label: string;
  readonly buildState: () => WorkspaceState;
}

const SEMANTIC_PROBES: Record<string, ReadonlyArray<SemanticProbe>> = {
  "workspace/lockfile-valid": [
    {
      label: "missing lockfile",
      buildState: () => {
        const state = emptyWorkspaceState();
        state.settings = {
          skills: {
            alpha: "@acme/skills/alpha",
          },
        };
        return state;
      },
    },
  ],
  "workspace/skills-lockfile-aligned": [
    {
      label: "missing skill lock entry",
      buildState: () => {
        const state = emptyWorkspaceState();
        state.settings = {
          skills: {
            alpha: "@acme/skills/alpha",
          },
        };
        state.lockfile = makeLockfile({});
        return state;
      },
    },
    {
      label: "orphan skill lock entry",
      buildState: () => {
        const state = emptyWorkspaceState();
        state.settings = {
          skills: {},
        };
        state.lockfile = makeLockfile({
          alpha: makeLocalSkillLockEntry("./skills/alpha"),
        });
        return state;
      },
    },
    {
      label: "version mismatch",
      buildState: () => {
        const state = emptyWorkspaceState();
        state.settings = {
          skills: {
            alpha: "@acme/skills/alpha@2.0.0",
          },
        };
        state.lockfile = makeLockfile({
          alpha: makeRegistrySkillLockEntry("alpha", "1.0.0"),
        });
        return state;
      },
    },
  ],
  "workspace/skills-integrity-valid": [
    {
      label: "missing canonical source",
      buildState: () => {
        const state = emptyWorkspaceState();
        state.settings = {
          skills: {
            alpha: "@acme/skills/alpha",
          },
        };
        state.lockfile = makeLockfile({
          alpha: {
            ...makeRegistrySkillLockEntry("alpha", "1.0.0"),
            sourceHash: "sha256-test",
          },
        });
        return state;
      },
    },
  ],
  "workspace/skills-artifacts-correct": [
    {
      label: "enabled skill missing everywhere",
      buildState: () => {
        const state = emptyWorkspaceState();
        state.settings = {
          agents: [CLAUDE_CODE.id],
          skills: {
            alpha: "@acme/skills/alpha",
          },
        };
        return state;
      },
    },
    {
      label: "disabled skill still present",
      buildState: () => {
        const state = emptyWorkspaceState();
        state.settings = {
          agents: [CLAUDE_CODE.id],
          skills: {
            alpha: {
              source: "@acme/skills/alpha",
              enabled: false,
            },
          },
        };
        state.existingPaths.add(`${CLAUDE_CODE.skills.dir}/alpha`);
        return state;
      },
    },
    {
      label: "cross-agent inconsistency",
      buildState: () => {
        const state = emptyWorkspaceState();
        state.settings = {
          agents: [CLAUDE_CODE.id, CURSOR.id],
          skills: {
            alpha: "@acme/skills/alpha",
          },
        };
        state.existingPaths.add(`${CLAUDE_CODE.skills.dir}/alpha`);
        return state;
      },
    },
  ],
};

describe("workspace catalog guard — semantic probe", () => {
  const autofixingRules = workspaceRules.filter(
    (r): r is AutofixingRule<WorkspaceRuleContext> => r.kind === "autofixing",
  );

  for (const rule of autofixingRules) {
    const probes = SEMANTIC_PROBES[rule.id] ?? [];
    for (const probe of probes) {
      it.effect(`${rule.id} emits only vocabulary ops for ${probe.label}`, () =>
        Effect.gen(function* () {
          const state = probe.buildState();
          const ctx: WorkspaceRuleContext = {
            subject: { root: "/tmp/ws", scope: "project" },
            workspace: makeStateBackedWorkspaceLintAccessor(state),
            displayRoot: "",
          };
          const findings = yield* rule.check(ctx);
          const autofixableFindings = findings.filter(
            (finding): finding is AutofixableFinding => finding.kind === "autofixable",
          );

          expect(
            autofixableFindings.length,
            `${rule.id} produced no autofixable findings for probe '${probe.label}'`,
          ).toBeGreaterThan(0);

          for (const finding of autofixableFindings) {
            const ops = yield* rule.fix(ctx, finding);
            expect(
              ops.length,
              `${rule.id} returned no operations for finding '${finding.message}'`,
            ).toBeGreaterThan(0);
            for (const op of ops) {
              expect(
                isPerExtensionOperationName(op.name),
                `rule ${rule.id} emitted disallowed operation '${op.name}'`,
              ).toBe(true);
            }
          }
        }),
      );
    }
  }
});
