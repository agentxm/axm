import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  deriveOperationOutcome,
  previewPlanExecution,
  ExtensionLifecycleFailed,
} from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { captureCopiedDirectory } from "@agentxm/workspace-kernel/locations";
import { observeConfiguredSkillLocations } from "@agentxm/workspace-kernel/projection";
import { EnableExtension } from "./set-activation.js";
import { defineSpecification } from "@agentxm/specification-metadata";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";

import type { LifecycleFixture } from "../testing.js";
import {
  previewActivation,
  applyActivation,
  workspaceWithAuthoredExtension,
  workspaceWithoutExtensions,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/enable/preview-is-pure",
  title: "Enable preview describes the activation without changing any state",
  statement:
    "When enable runs in preview mode against an extension of any managed type — skill, subagent, MCP server, rule, hook extension, Knowledge bundle, or Pack — it shall not change settings, the lockfile, canonical content, agent projections, or any other workspace state; it shall report the activation it would apply with a previewed outcome when the extension is disabled, report the request as unchanged when the extension is already enabled, and, when the workspace holds no such extension, refuse the request for a skill, subagent, Knowledge bundle, or Pack and report it as unchanged for an MCP server, rule, or hook extension.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/activation-follows-desired-state"],
  supersedes: [
    "cli/hooks/enable/preview-is-pure",
    "cli/knowledge/enable/preview-is-pure",
    "cli/mcps/enable/preview-is-pure",
    "cli/packs/enable/preview-is-pure",
    "cli/rules/enable/preview-is-pure",
    "cli/skills/enable/preview-is-pure",
    "cli/subagents/enable/preview-is-pure",
  ],
  assumptions: [],
  openQuestions: [
    "Whether an unconfigured target should refuse for every type, or settle as unchanged for every type, is undecided; the policy is split today and the example table records the split as it stands.",
  ],
});

/**
 * One row per managed extension type. Activation means the same thing for
 * every one of them, so the rule is stated once and demonstrated across the
 * whole set rather than restated seven times.
 */
/**
 * What a request naming a subject the workspace does not hold settles as.
 * Today's policy is deliberately split across types, so each row carries its
 * own expectation rather than one shared sentence hiding the difference.
 */
type UnconfiguredSettlement =
  | { readonly kind: "refused"; readonly detail: string }
  | { readonly kind: "unchanged"; readonly message: string };

const TYPES: ReadonlyArray<{
  readonly type: ExtensionType;
  readonly name: string;
  readonly unconfigured: UnconfiguredSettlement;
}> = [
  {
    type: "skill",
    name: "code-review",
    unconfigured: { kind: "refused", detail: "Skill 'code-review' is not installed" },
  },
  {
    type: "subagent",
    name: "researcher",
    unconfigured: { kind: "refused", detail: "Subagent 'researcher' is not installed" },
  },
  {
    type: "mcp-server",
    name: "context",
    unconfigured: { kind: "unchanged", message: 'MCP server "context" is not configured' },
  },
  {
    type: "rule",
    name: "commit-style",
    unconfigured: { kind: "unchanged", message: 'rule "commit-style" is not configured' },
  },
  {
    type: "hook",
    name: "workspace-baseline",
    unconfigured: {
      kind: "unchanged",
      message: 'hook extension "workspace-baseline" is not configured',
    },
  },
  {
    type: "knowledge",
    name: "platform",
    unconfigured: { kind: "refused", detail: 'Knowledge bundle "platform" is not configured' },
  },
  {
    type: "pack",
    name: "frontend-tools",
    unconfigured: { kind: "refused", detail: 'Pack "frontend-tools" is not configured' },
  },
];

describe("Enable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const disabledWorkspace = (type: ExtensionType, name: string): LifecycleFixture => {
    const fixture = workspaceWithAuthoredExtension({ type, name, enabled: false });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("projects absent Skill output, then verifies the same native units after apply", () => {
    const fixture = disabledWorkspace("skill", "review");
    return fixture
      .provide(
        Effect.gen(function* () {
          const before = fixture.snapshot();
          const previewed = yield* previewActivation({
            type: "skill",
            name: "review",
            enabled: true,
          });
          expect(previewed._tag).toBe("Resolved");
          if (previewed._tag !== "Resolved") return;
          expect(previewed.outcome).toBe("previewed");
          const planned = previewed.resolution.units.flatMap((unit) => unit.agentOutcomes ?? []);
          expect(planned).toMatchObject([{ outcome: "projected", reasonCode: "supported" }]);
          expect(planned[0]?.nativeUnits?.length).toBeGreaterThan(0);
          expect(fixture.snapshot()).toEqual(before);
          const applied = yield* applyActivation({ type: "skill", name: "review", enabled: true });
          expect(applied._tag).toBe("Resolved");
          if (applied._tag !== "Resolved") return;
          expect(applied.outcome).toBe("applied");
          const observed = applied.resolution.units.flatMap((unit) => unit.agentOutcomes ?? []);
          expect(observed).toMatchObject([
            { outcome: "current", reasonCode: "verified-native-unit" },
          ]);
          expect(observed[0]?.nativeUnits).toEqual(planned[0]?.nativeUnits);
          expect(previewed.resolution.units[0]?.artifact?.nativeLocations?.length).toBeGreaterThan(
            0,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("blocks a Skill enable preview when a foreign native entry occupies its target", () => {
    const fixture = disabledWorkspace("skill", "review");
    fixture.writeFile(".claude/skills/review/SKILL.md", "Foreign Skill content\n");
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const previewed = yield* previewActivation({
            type: "skill",
            name: "review",
            enabled: true,
          });
          expect(previewed._tag).toBe("Resolved");
          if (previewed._tag !== "Resolved") return;
          expect(previewed.outcome).toBe("blocked");
          const outcomes = previewed.resolution.units.flatMap((unit) => unit.agentOutcomes ?? []);
          expect(outcomes).toMatchObject([
            { outcome: "blocked", reasonCode: "native-content-conflict" },
          ]);
          expect(outcomes[0]?.nativeUnits?.length).toBeGreaterThan(0);
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "retains unexplained additional Skill content while projecting and verifying required entries",
    () => {
      const fixture = disabledWorkspace("skill", "review");
      fixture.writeFile(
        "axm.json",
        JSON.stringify({
          owner: "@acme",
          agents: ["cursor"],
          skills: { review: { source: "workspace", enabled: false } },
        }),
      );
      const foreign = "Foreign additional Skill content\n";
      fixture.writeFile(".claude/skills/review/SKILL.md", foreign);
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();
            const previewed = yield* previewActivation({
              type: "skill",
              name: "review",
              enabled: true,
            });
            expect(previewed._tag).toBe("Resolved");
            if (previewed._tag !== "Resolved") return;
            expect(previewed.outcome).toBe("previewed");
            const planned = previewed.resolution.units.flatMap((unit) => unit.agentOutcomes ?? []);
            expect(planned).toMatchObject([{ agentId: "cursor", outcome: "projected" }]);
            expect(planned[0]?.nativeUnits?.length).toBeGreaterThan(0);
            expect(fixture.snapshot()).toEqual(before);

            const applied = yield* applyActivation({
              type: "skill",
              name: "review",
              enabled: true,
            });
            expect(applied._tag).toBe("Resolved");
            if (applied._tag !== "Resolved") return;
            expect(applied.outcome).toBe("applied");
            const observed = applied.resolution.units.flatMap((unit) => unit.agentOutcomes ?? []);
            expect(observed).toMatchObject([{ agentId: "cursor", outcome: "current" }]);
            expect(observed[0]?.nativeUnits).toEqual(
              expect.arrayContaining([...(planned[0]?.nativeUnits ?? [])]),
            );
            expect(fixture.readFile(".claude/skills/review/SKILL.md")).toBe(foreign);
            const facts = yield* observeConfiguredSkillLocations({
              type: "skill",
              scope: "project",
              state: "current",
              agentIds: ["cursor"],
              rows: [{ name: "review", targetState: "enabled", installed: true }],
            });
            expect(facts.get("review")?.nativeLocations).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  address: expect.objectContaining({
                    path: `${fixture.root}/.claude/skills/review`,
                  }),
                  ownership: "unowned",
                  state: "blocked",
                  configuredConsumers: ["cursor"],
                }),
              ]),
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("does not call a Skill current when an owned additional copy is stale", () => {
    const fixture = disabledWorkspace("skill", "review");
    fixture.writeFile(
      "axm.json",
      JSON.stringify({
        owner: "@acme",
        agents: ["cursor"],
        skills: { review: { source: "workspace", enabled: false } },
      }),
    );
    return fixture
      .provide(
        Effect.gen(function* () {
          const applied = yield* applyActivation({ type: "skill", name: "review", enabled: true });
          expect(applied._tag === "Resolved" ? applied.outcome : applied._tag).toBe("applied");
          fixture.writeFile(
            ".claude/skills/review/SKILL.md",
            fixture.readFile("skills/review/src/SKILL.md"),
          );
          const receipt = yield* captureCopiedDirectory(
            `${fixture.root}/.claude/skills/review`,
            `${fixture.root}/skills/review/src`,
          );
          expect(receipt._tag).toBe("Some");
          fixture.writeFile(".claude/skills/review/SKILL.md", "Changed owned copy\n");
          const facts = yield* observeConfiguredSkillLocations({
            type: "skill",
            scope: "project",
            state: "current",
            agentIds: ["cursor"],
            rows: [{ name: "review", targetState: "enabled", installed: true }],
          });
          expect(facts.get("review")?.agentOutcomes).toMatchObject([
            { agentId: "cursor", outcome: "blocked", reasonCode: "native-content-conflict" },
          ]);
          expect(facts.get("review")?.nativeLocations).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                address: expect.objectContaining({ path: `${fixture.root}/.claude/skills/review` }),
                ownership: "owned",
                state: "blocked",
                configuredConsumers: ["cursor"],
              }),
            ]),
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("rejects an activation candidate whose desired state changed after preview", () => {
    const fixture = disabledWorkspace("skill", "review");
    return fixture
      .provide(
        Effect.gen(function* () {
          const candidate = yield* EnableExtension.prepare({
            type: "skill",
            name: "review",
          });
          if (candidate._tag === "Unchanged") throw new Error("Expected activation work");
          yield* EnableExtension.previewOrApply(candidate, previewPlanExecution);
          fixture.writeFile("axm.json", `${fixture.readFile("axm.json")}\n`);
          const before = fixture.snapshot();
          const resolution = yield* EnableExtension.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );
          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each(TYPES)(
    "a previewed enable of a disabled $type changes no workspace state",
    ({ type, name }) => {
      const fixture = disabledWorkspace(type, name);
      const before = fixture.snapshot();
      const homeBefore = fixture.homeSnapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const settled = yield* previewActivation({ type, name, enabled: true });

            expect(settled._tag).toBe("Resolved");
            if (settled._tag === "Resolved") {
              expect(settled.outcome).toBe("previewed");
              expect(settled.resolution.units).toMatchObject([{ label: name, state: "ready" }]);
              const outcomes = settled.resolution.units.flatMap((unit) => unit.agentOutcomes ?? []);
              expect(outcomes).toMatchObject([
                { outcome: type === "pack" ? "not-applicable" : "projected" },
              ]);
            }
            // Nothing under the project root or the user home moved, and the
            // preview never asked anyone to approve anything.
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.homeSnapshot()).toEqual(homeBefore);
            expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(TYPES)(
    "a previewed enable of an already-enabled $type reports it unchanged and writes nothing",
    ({ type, name }) => {
      const fixture = workspaceWithAuthoredExtension({ type, name, enabled: true });
      cleanups.push(fixture.cleanup);
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const settled = yield* previewActivation({ type, name, enabled: true });

            expect(settled._tag).toBe(type === "mcp-server" ? "Resolved" : "Unchanged");
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(TYPES)(
    "a previewed enable of an unconfigured $type reports its settlement and writes nothing",
    ({ type, name, unconfigured }) => {
      const fixture = workspaceWithoutExtensions();
      cleanups.push(fixture.cleanup);
      const before = fixture.snapshot();
      const homeBefore = fixture.homeSnapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            // The split is the product's, not this example's: a skill,
            // subagent, Knowledge bundle, or Pack the workspace does not hold
            // is refused, while an MCP server, rule, or hook extension settles
            // as unchanged. Both leave the workspace exactly as it was.
            if (unconfigured.kind === "refused") {
              const failure = yield* previewActivation({
                type,
                name,
                enabled: true,
              }).pipe(Effect.flip);

              expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
              if (failure instanceof ExtensionLifecycleFailed) {
                expect(failure.category).toBe("not_found");
                expect(failure.detail).toBe(unconfigured.detail);
              }
            } else {
              const settled = yield* previewActivation({
                type,
                name,
                enabled: true,
              });

              expect(settled._tag).toBe("Unchanged");
              if (settled._tag === "Unchanged") {
                expect(settled.message).toBe(unconfigured.message);
              }
            }
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.homeSnapshot()).toEqual(homeBefore);
            expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
