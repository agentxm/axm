import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";

import { ExtensionLifecycleFailed } from "../errors.js";
import type { LifecycleFixture } from "../testing.js";
import {
  previewActivation,
  workspaceWithAuthoredExtension,
  workspaceWithoutExtensions,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/disable/preview-is-pure",
  title: "Disable preview describes the deactivation without changing any state",
  statement:
    "When disable runs in preview mode against an extension of any managed type — skill, subagent, MCP server, rule, hooks package, Knowledge bundle, or Pack — it shall not change settings, the lockfile, canonical content, agent projections, or any other workspace state; it shall report the deactivation it would apply with a previewed outcome when the extension is enabled, report the request as unchanged when the extension is already disabled, and, when the workspace holds no such extension, refuse the request for a skill, subagent, Knowledge bundle, or Pack and report it as unchanged for an MCP server, rule, or hooks package.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/activation-follows-desired-state"],
  supersedes: [
    "cli/hooks/disable/preview-is-pure",
    "cli/knowledge/disable/preview-is-pure",
    "cli/mcps/disable/preview-is-pure",
    "cli/packs/disable/preview-is-pure",
    "cli/rules/disable/preview-is-pure",
    "cli/skills/disable/preview-is-pure",
    "cli/subagents/disable/preview-is-pure",
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
      message: 'hooks package "workspace-baseline" is not configured',
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

describe("Disable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const enabledWorkspace = (type: ExtensionType, name: string): LifecycleFixture => {
    const fixture = workspaceWithAuthoredExtension({ type, name, enabled: true });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect.each(TYPES)(
    "a previewed disable of an enabled $type changes no workspace state",
    ({ type, name }) => {
      const fixture = enabledWorkspace(type, name);
      const before = fixture.snapshot();
      const homeBefore = fixture.homeSnapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const settled = yield* previewActivation({ type, name, enabled: false });

            expect(settled._tag).toBe("Resolved");
            if (settled._tag === "Resolved") {
              expect(settled.outcome).toBe("previewed");
              expect(settled.resolution.units).toMatchObject([{ label: name, state: "ready" }]);
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
    "a previewed disable of an already-disabled $type reports it unchanged and writes nothing",
    ({ type, name }) => {
      const fixture = workspaceWithAuthoredExtension({ type, name, enabled: false });
      cleanups.push(fixture.cleanup);
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const settled = yield* previewActivation({ type, name, enabled: false });

            expect(settled._tag).toBe("Unchanged");
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(TYPES)(
    "a previewed disable of an unconfigured $type reports its settlement and writes nothing",
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
            // is refused, while an MCP server, rule, or hooks package settles
            // as unchanged. Both leave the workspace exactly as it was.
            if (unconfigured.kind === "refused") {
              const failure = yield* previewActivation({
                type,
                name,
                enabled: false,
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
                enabled: false,
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
