import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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

export const specification = defineSpecification({
  requirement: "workspace/observation/one-fact-per-desired-node",
  title: "A desired extension's missing accepted resolution is one reported fact",
  statement:
    "When an enabled desired extension has no accepted resolution, lint shall report that fact as exactly one finding and a sync that cannot restore it shall report it as exactly one blocker, both stating the same fact, and when that extension is disabled the state shall be judged not applicable and lint shall report no finding for it before or after sync.",
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
   * A workspace that realizes one Pack of two members; `loseMember` then
   * removes one member's resolution and, optionally, disables the member or
   * stops the Registry publishing it so sync cannot restore it.
   */
  const workspaceMissingMember = (
    options: {
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
      packs: { [PACK]: `test:@acme/packs/${PACK}@^1.0.0` },
    };
    const workspace = makeSyncFixture({ settings });
    cleanups.push(workspace.cleanup);
    const loseMember = Effect.gen(function* () {
      yield* applySync();
      forgetMember(workspace);
      if (options.member !== undefined) {
        workspace.writeSettings({ ...settings, skills: { [MEMBER]: options.member } });
      }
      if (options.unpublished === true) registry.writeSkill(MEMBER, []);
    });
    return { workspace, loseMember };
  };

  it.effect("reports a missing Pack member once in lint and once as a sync blocker", () => {
    const { workspace, loseMember } = workspaceMissingMember({ unpublished: true });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* loseMember;
          const findings = yield* memberFindings(workspace);
          expect(findings).toHaveLength(1);
          expect(findings[0]?.message).toContain(FACT);

          const blocked = expectResolved(yield* applySync()).units.filter(
            ({ state }) => state === "blocked",
          );
          expect(blocked).toHaveLength(1);
          expect(blocked[0]?.message).toContain(FACT);
          expect(workspace.exists(`agent_extensions/registry/@acme/skills/${MEMBER}`)).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

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

  it.effect("observes a disabled member without an accepted resolution as not applicable", () => {
    const { workspace, loseMember } = workspaceMissingMember({ member: { enabled: false } });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* loseMember;
          const graph = yield* (yield* DesiredStateReader).graph();
          const desired = graph.nodes.find((node) => node.type === "skill" && node.name === MEMBER);
          if (desired === undefined) throw new Error("Expected the member to stay desired");
          expect(desired.enabled).toBe(false);
          expect((yield* observeDesiredCanonical(desired)).observation.status).toBe(
            "not-applicable",
          );
          expect(yield* memberFindings(workspace)).toEqual([]);

          yield* applySync();

          expect(yield* memberFindings(workspace)).toEqual([]);
          expect(workspace.exists(`.claude/skills/${MEMBER}`)).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
