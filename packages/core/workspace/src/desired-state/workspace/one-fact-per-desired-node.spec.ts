import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { defineSpecification } from "@agentxm/specification-metadata";

import { NoProjectionParticipants } from "../../projection/testing.js";
import { queryLintWorkspace } from "../../linting/index.js";
import { OfflineHttpClient } from "../../linting/test-helpers.js";
import { lintWorkspaceServices } from "../../linting/testing.js";
import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
  type SyncFixture,
} from "../../reconciliation/sync/test-helpers.js";
import { DesiredStateReader, observeDesiredCanonical } from "../index.js";
import {
  DISABLED_MCP,
  SHARED_MEMBER_PIN,
  publishSharedMemberScenario,
  sharedMemberSettings,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "workspace/observation/one-fact-per-desired-node",
  title: "A desired extension's missing accepted resolution is one reported fact",
  statement:
    "When a desired extension, enabled or disabled, has no accepted resolution, AXM shall judge that fact once for the extension, lint shall report it as exactly one finding, a sync that cannot restore it shall report it as exactly one blocker stating the same fact, and once sync realizes the extension lint shall report nothing for it.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "The fact is judged from a real settings file, lockfile, installed Pack, and file Registry on disk, and lint and sync read that one workspace through the production layers.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PACK = "reviews";
const MEMBER = "review";
const FACT = `skill '@acme/skills/${MEMBER}' has no accepted resolution`;

/** Lint the sync fixture's project, reporting only its facts. */
const lint = (workspace: SyncFixture) =>
  queryLintWorkspace(
    {
      workspaceRoot: workspace.root,
      userHome: workspace.home,
      scope: "project",
      input: { view: "workspace" },
      fix: false,
    },
    { strict: false },
  ).pipe(
    Effect.scoped,
    Effect.provide(
      lintWorkspaceServices({ workspaceRoot: workspace.root }).pipe(
        Layer.provideMerge(
          Layer.mergeAll(NodeServices.layer, OfflineHttpClient, NoProjectionParticipants),
        ),
      ),
    ),
  );

/** Remove one member's accepted resolution, canonical content, and projections. */
const forgetMember = (workspace: SyncFixture): void => {
  const lockPath = nodePath.join(workspace.root, "axm-lock.yaml");
  const lock: unknown = YAML.parse(fs.readFileSync(lockPath, "utf8"));
  if (typeof lock !== "object" || lock === null || !("skills" in lock)) {
    throw new Error("Expected a lockfile with a skills map");
  }
  const skills = lock.skills;
  if (typeof skills !== "object" || skills === null) {
    throw new Error("Expected a skills map");
  }
  fs.writeFileSync(
    lockPath,
    YAML.stringify({
      ...lock,
      skills: Object.fromEntries(Object.entries(skills).filter(([name]) => name !== MEMBER)),
    }),
  );
  workspace.remove(`agent_extensions/registry/@acme/skills/${MEMBER}`);
  workspace.remove(`.claude/skills/${MEMBER}`);
  workspace.remove(`.agents/skills/${MEMBER}`);
};

/** Every lint finding, as rule and message, whatever it names. */
const allFindings = (workspace: SyncFixture) =>
  Effect.map(lint(workspace), ({ document }) =>
    document.findings.map(({ ruleId, message }) => ({ ruleId, message })),
  );

/** Lint findings that name the member, by its local name or its identity. */
const memberFindings = (workspace: SyncFixture) =>
  Effect.map(lint(workspace), ({ document }) =>
    document.findings.filter(
      ({ message }) =>
        message.includes(`'${MEMBER}'`) || message.includes(`@acme/skills/${MEMBER}`),
    ),
  );

describe("One fact per desired node", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * A workspace that realizes the member, as one of a Pack's two members or
   * declared directly; `loseMember` then removes the member's resolution and,
   * optionally, disables the member or stops the Registry publishing it so
   * sync cannot restore it. It yields every lint finding the realized
   * workspace reported before the member was lost.
   */
  const workspaceMissingMember = (
    options: {
      readonly declaredBy?: "pack" | "direct";
      readonly member?: Readonly<Record<string, unknown>>;
      readonly unpublished?: boolean;
    } = {},
  ) => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill(MEMBER, [{ version: "1.0.0", body: "Review." }]);
    registry.writeRule("guide", [{ version: "1.0.0", body: "Guide." }]);
    registry.writePack(PACK, [
      {
        version: "1.0.0",
        dependencies: { [`@acme/skills/${MEMBER}`]: "^1.0.0", "@acme/rules/guide": "^1.0.0" },
      },
    ]);
    const settings = {
      owner: "@acme",
      agents: ["claude-code"],
      sources: [registry.source],
      ...(options.declaredBy === "direct"
        ? { skills: { [MEMBER]: `test:@acme/skills/${MEMBER}@^1.0.0` } }
        : { packs: { [PACK]: `test:@acme/packs/${PACK}@^1.0.0` } }),
    };
    const workspace = makeSyncFixture({ settings });
    cleanups.push(workspace.cleanup);
    const loseMember = Effect.gen(function* () {
      yield* applySync();
      const realized = yield* allFindings(workspace);
      forgetMember(workspace);
      if (options.member !== undefined) {
        workspace.writeSettings({ ...settings, skills: { [MEMBER]: options.member } });
      }
      if (options.unpublished === true) registry.writeSkill(MEMBER, []);
      return realized;
    });
    return { workspace, loseMember };
  };

  /** The one report a sync that cannot restore the member makes, as an operator reads it. */
  const syncReports = Effect.gen(function* () {
    const settled = yield* Effect.result(applySync());
    if (Result.isFailure(settled)) {
      const failure = settled.failure;
      return ["detail" in failure && typeof failure.detail === "string" ? failure.detail : ""];
    }
    return expectResolved(settled.success)
      .units.filter(({ state }) => state === "blocked")
      .map(({ message }) => message ?? "");
  });

  it.effect.each([
    { label: "a Pack member", declaredBy: "pack", ruleId: "workspace/packs-dependencies-resolved" },
    { label: "a direct Skill", declaredBy: "direct", ruleId: "workspace/skills-lockfile-aligned" },
  ] as const)(
    "reports $label without an accepted resolution once in lint and once from sync",
    ({ declaredBy, ruleId }) => {
      const { workspace, loseMember } = workspaceMissingMember({ declaredBy, unpublished: true });
      return workspace
        .provide(
          Effect.gen(function* () {
            const realized = yield* loseMember;
            // The whole lint run adds exactly one finding: no artifact or
            // content rule restates the member's absent canonical tree.
            const findings = yield* allFindings(workspace);
            expect(findings).toHaveLength(realized.length + 1);
            expect(findings).toEqual(
              expect.arrayContaining([
                ...realized,
                { ruleId, message: expect.stringContaining(FACT) },
              ]),
            );

            // A Pack member blocks its one unit; a direct declaration refuses
            // the sync. Either way the fact is stated once.
            const reports = yield* syncReports;
            expect(reports).toHaveLength(1);
            expect(reports[0]?.split(FACT)).toHaveLength(2);
            expect(workspace.exists(`agent_extensions/registry/@acme/skills/${MEMBER}`)).toBe(
              false,
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("clears the one finding once sync restores the member", () => {
    const { workspace, loseMember } = workspaceMissingMember();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* loseMember;
          expect(yield* memberFindings(workspace)).toHaveLength(1);
          yield* applySync();
          expect(yield* memberFindings(workspace)).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("judges a disabled declaration by the same rule until sync realizes it", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    publishSharedMemberScenario(registry);
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        ...sharedMemberSettings(SHARED_MEMBER_PIN.inside),
      },
    });
    cleanups.push(workspace.cleanup);
    const connectionFindings = Effect.map(lint(workspace), ({ document }) =>
      document.findings.filter(({ message }) => message.includes(DISABLED_MCP.fqn)),
    );
    return workspace
      .provide(
        Effect.gen(function* () {
          const graph = yield* (yield* DesiredStateReader).graph();
          const connection = graph.nodes.find(
            (node) => node.type === "mcp-server" && node.name === DISABLED_MCP.name,
          );
          if (connection === undefined) throw new Error("Expected the disabled connection");
          expect(connection.enabled).toBe(false);
          expect((yield* observeDesiredCanonical(connection)).observation.status).toBe(
            "missing-resolution",
          );
          const findings = yield* connectionFindings;
          expect(findings).toHaveLength(1);
          expect(findings[0]?.message).toContain("has no accepted resolution");

          yield* applySync();

          expect((yield* observeDesiredCanonical(connection)).observation.status).toBe("usable");
          expect(yield* connectionFindings).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
