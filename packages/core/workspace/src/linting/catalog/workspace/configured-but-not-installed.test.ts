import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { CanonicalObservation, DesiredExtensionNode } from "../../../desired-state/index.js";
import { NoProjectionParticipants } from "../../../projection/testing.js";
import {
  applySync,
  makeFileRegistry,
  makeSyncFixture,
  type SyncFixture,
} from "../../../reconciliation/sync/test-helpers.js";
import { queryLintWorkspace } from "../../index.js";
import { OfflineHttpClient } from "../../test-helpers.js";
import { lintWorkspaceServices } from "../../testing.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { configuredButNotInstalledRule } from "./configured-but-not-installed.js";
import { contextFor, validLockfile, validSettings } from "./conformance/test-helpers.js";

const RULE_ID = "workspace/configured-but-not-installed";

const PLURALS = {
  skill: "skills",
  "mcp-server": "mcps",
  subagent: "subagents",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const satisfies Record<ExtensionType, string>;

/** A desired node declared directly or supplied by a Pack, enabled unless stated. */
const desiredNode = (args: {
  readonly type: ExtensionType;
  readonly name: string;
  readonly enabled?: boolean;
  readonly origin?: "direct" | "pack-member";
  readonly source?: string;
}): DesiredExtensionNode => {
  const enabled = args.enabled ?? true;
  const source = args.source ?? `@acme/${PLURALS[args.type]}/${args.name}`;
  return {
    type: args.type,
    name: args.name,
    identity: `@acme/${PLURALS[args.type]}/${args.name}`,
    source,
    enabled,
    constraints: [],
    origins: [
      args.origin === "pack-member"
        ? {
            type: "pack",
            pack: "@acme/packs/starter",
            manifestPath: "agent_extensions/registry/@acme/packs/starter/pack.json",
            source,
            constraint: "^1.0.0",
            enabled,
          }
        : { type: "settings", localName: args.name, authority: "sourced", source, enabled },
    ],
  };
};

const observed = (
  desired: DesiredExtensionNode,
  status: CanonicalObservation["status"] & ("missing" | "usable" | "missing-resolution"),
) => ({
  desired,
  observation: {
    type: desired.type,
    name: desired.name,
    status,
    path: `/workspace/agent_extensions/registry/@acme/${PLURALS[desired.type]}/${desired.name}`,
  } satisfies CanonicalObservation,
});

/** A project context whose one observation of each desired node is given. */
const contextObserving = (observations: ReadonlyArray<ReturnType<typeof observed>>) =>
  Effect.map(
    contextFor({ settings: validSettings(), lockfile: validLockfile }),
    (context) =>
      ({
        ...context,
        health: {
          desiredState: Effect.succeed({
            complete: true,
            nodes: observations.map(({ desired }) => desired),
            mcpSourceClosures: [],
            problems: [],
          }),
          canonicalObservations: Effect.succeed(observations),
        },
      }) satisfies WorkspaceRuleContext,
  );

const messages = (observations: ReadonlyArray<ReturnType<typeof observed>>) =>
  Effect.gen(function* () {
    const findings = yield* configuredButNotInstalledRule.check(
      yield* contextObserving(observations),
    );
    expect(findings.every((finding) => finding.ruleId === RULE_ID)).toBe(true);
    return findings.map((finding) => finding.message);
  });

describe("workspace/configured-but-not-installed", () => {
  it.effect("reports a Pack member whose accepted content is missing", () =>
    Effect.gen(function* () {
      expect(
        yield* messages([
          observed(desiredNode({ type: "hook", name: "deploy", origin: "pack-member" }), "missing"),
        ]),
      ).toEqual([
        "hook 'deploy' is desired, but its canonical content is missing from agent_extensions.",
      ]);
    }),
  );

  it.effect(
    "reports a disabled desired node like an enabled one, and nothing for usable content",
    () =>
      Effect.gen(function* () {
        expect(
          yield* messages([
            observed(desiredNode({ type: "skill", name: "disabled", enabled: false }), "missing"),
            observed(desiredNode({ type: "skill", name: "installed" }), "usable"),
            observed(desiredNode({ type: "pack", name: "starter" }), "usable"),
          ]),
        ).toEqual([
          "skill 'disabled' is desired, but its canonical content is missing from agent_extensions.",
        ]);
      }),
  );

  it.effect("leaves a node without an accepted resolution to the rule that owns that fact", () =>
    Effect.gen(function* () {
      expect(
        yield* messages([
          observed(desiredNode({ type: "skill", name: "unresolved" }), "missing-resolution"),
        ]),
      ).toEqual([]);
    }),
  );

  it.effect("names the authored root for a workspace-sourced declaration", () =>
    Effect.gen(function* () {
      expect(
        yield* messages([
          observed(
            desiredNode({ type: "rule", name: "conventions", source: "workspace" }),
            "missing",
          ),
        ]),
      ).toEqual([
        "rule 'conventions' declares a workspace source, but its authored canonical package is missing from the configured authored root.",
      ]);
    }),
  );

  it.effect("covers every family, including disabled Knowledge", () =>
    Effect.gen(function* () {
      expect(
        yield* messages([
          observed(desiredNode({ type: "rule", name: "conventions" }), "missing"),
          observed(desiredNode({ type: "hook", name: "pre-commit" }), "missing"),
          observed(desiredNode({ type: "knowledge", name: "domain", enabled: false }), "missing"),
        ]),
      ).toEqual([
        expect.stringContaining("rule 'conventions' is desired"),
        expect.stringContaining("hook 'pre-commit' is desired"),
        expect.stringContaining("knowledge bundle 'domain' is desired"),
      ]);
    }),
  );
});

describe("workspace/configured-but-not-installed in a real workspace", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** Every finding for the fixture's project, as rule and message. */
  const allFindings = (workspace: SyncFixture) =>
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
      Effect.map(({ document }) =>
        document.findings.map(({ ruleId, message }) => ({ ruleId, message })),
      ),
    );

  /** This rule's findings for the fixture's project. */
  const ruleFindings = (workspace: SyncFixture) =>
    Effect.map(allFindings(workspace), (findings) =>
      findings.filter((finding) => finding.ruleId === RULE_ID),
    );

  it.effect(
    "reports a disabled Knowledge bundle whose accepted content is missing until sync realizes it",
    () => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeKnowledge("handbook", [{ version: "1.0.0", body: "Handbook." }]);
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          sources: [registry.source],
          knowledge: {
            handbook: { source: "test:@acme/knowledge/handbook@^1.0.0", enabled: false },
          },
        },
      });
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            expect(yield* ruleFindings(workspace)).toEqual([]);
            workspace.remove("agent_extensions/registry/@acme/knowledge/handbook");

            expect((yield* ruleFindings(workspace)).map(({ message }) => message)).toEqual([
              "knowledge bundle 'handbook' is desired, but its canonical content is missing from agent_extensions.",
            ]);

            yield* applySync();
            expect(workspace.exists("agent_extensions/registry/@acme/knowledge/handbook")).toBe(
              true,
            );
            expect(yield* ruleFindings(workspace)).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("states a Skill's missing accepted content once across the whole lint run", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        skills: { review: "test:@acme/skills/review@^1.0.0" },
      },
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          const realized = yield* allFindings(workspace);
          workspace.remove("agent_extensions/registry/@acme/skills/review");

          // No artifact, content, or integrity rule restates the absent tree.
          const findings = yield* allFindings(workspace);
          expect(findings).toHaveLength(realized.length + 1);
          expect(findings).toEqual(
            expect.arrayContaining([
              ...realized,
              {
                ruleId: RULE_ID,
                message:
                  "skill 'review' is desired, but its canonical content is missing from agent_extensions.",
              },
            ]),
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("does not report a member of a disabled Pack, which is not desired", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
    registry.writePack("reviews", [
      { version: "1.0.0", dependencies: { "@acme/skills/review": "^1.0.0" } },
    ]);
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        packs: { reviews: { source: "test:@acme/packs/reviews@^1.0.0", enabled: false } },
      },
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          expect(workspace.exists("agent_extensions/registry/@acme/skills/review")).toBe(false);
          expect(yield* ruleFindings(workspace)).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
