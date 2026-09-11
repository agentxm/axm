import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import { ExtensionLifecycleFailed } from "../errors.js";
import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSkillPackage,
  writeLocalSubagentPackage,
  type LifecycleFixture,
  type LifecycleRegistry,
} from "../testing.js";
import { applyInstall, installRequest, previewInstall } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/preview-is-pure",
  title: "Install preview describes the plan without changing any state",
  statement:
    "When an install of any extension type runs in preview mode, it shall not change settings, the lockfile, canonical content, or agent projections; when the request passes the applicable checks and requires workspace changes, it shall report the planned closure with a previewed outcome, including any publisher change the acceptance would make; and when the requested source cannot be resolved, it shall report the problem and still change nothing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [
    "cli/hooks/install/preview-is-pure",
    "cli/knowledge/install/preview-is-pure",
    "cli/mcps/install/preview-is-pure",
    "cli/packs/install/preview-is-pure",
    "cli/rules/install/preview-is-pure",
    "cli/skills/install/preview-is-pure",
    "cli/subagents/install/preview-is-pure",
  ],
  supersedes: [
    "cli/hooks/install/preview-is-pure",
    "cli/knowledge/install/preview-is-pure",
    "cli/mcps/install/preview-is-pure",
    "cli/packs/install/preview-is-pure",
    "cli/rules/install/preview-is-pure",
    "cli/skills/install/preview-is-pure",
    "cli/subagents/install/preview-is-pure",
  ],
  assumptions: [],
  openQuestions: [],
});

/**
 * One row per extension type an install can acquire. A local package covers
 * every type whose source can be a directory; the two Registry-only types are
 * published into a `file://` Registry the workspace declares.
 */
interface PreviewRow {
  readonly label: string;
  readonly type: InstallableExtensionType;
  /** Publishes the package and returns the source the request names. */
  readonly source: (args: {
    readonly workspace: LifecycleFixture;
    readonly registry: LifecycleRegistry;
  }) => string;
  /** A workspace-relative projection path a realized install would create. */
  readonly unrealized: ReadonlyArray<string>;
  /**
   * A source of this type the workspace cannot resolve: a directory that is
   * not there for the types acquired from a local package, and a name the
   * Registry does not publish for the two Registry-only types.
   */
  readonly unresolvable: (args: {
    readonly workspace: LifecycleFixture;
    readonly registry: LifecycleRegistry;
  }) => string;
}

const NAME = "demo";

const rows: ReadonlyArray<PreviewRow> = [
  {
    label: "skill",
    type: "skill",
    source: ({ workspace }) => writeLocalSkillPackage(workspace.root, { name: NAME }),
    unrealized: [`.claude/skills/${NAME}`, `.agents/skills/${NAME}`],
    unresolvable: ({ workspace }) => path.join(workspace.root, "vendor", "absent"),
  },
  {
    label: "subagent",
    type: "subagent",
    source: ({ workspace }) => writeLocalSubagentPackage(workspace.root, { name: NAME }),
    unrealized: [`.claude/agents/${NAME}.md`],
    unresolvable: ({ workspace }) => path.join(workspace.root, "vendor", "absent"),
  },
  {
    label: "rule",
    type: "rule",
    source: ({ workspace }) => writeLocalRulePackage(workspace.root, { name: NAME }),
    unrealized: [],
    unresolvable: ({ workspace }) => path.join(workspace.root, "vendor", "absent"),
  },
  {
    label: "hook",
    type: "hook",
    source: ({ workspace }) => writeLocalHookPackage(workspace.root, { name: NAME }),
    unrealized: [],
    unresolvable: ({ workspace }) => path.join(workspace.root, "vendor", "absent"),
  },
  {
    label: "knowledge bundle",
    type: "knowledge",
    source: ({ workspace }) => writeLocalKnowledgePackage(workspace.root, { name: NAME }),
    unrealized: [],
    unresolvable: ({ workspace }) => path.join(workspace.root, "vendor", "absent"),
  },
  {
    label: "MCP server",
    type: "mcp-server",
    source: ({ registry }) => {
      registry.writeMcp(NAME, [{ version: "1.0.0" }]);
      return `@acme/mcps/${NAME}`;
    },
    unrealized: [".mcp.json"],
    unresolvable: () => "@acme/mcps/absent",
  },
  {
    label: "pack",
    type: "pack",
    source: ({ registry }) => {
      registry.writeSkill("member", [{ version: "1.0.0", body: "Member guidance." }]);
      registry.writePack(NAME, [
        { version: "1.0.0", dependencies: { "@acme/skills/member": "^1.0.0" } },
      ]);
      return `@acme/packs/${NAME}`;
    },
    unrealized: [".claude/skills/member"],
    unresolvable: () => "@acme/packs/absent",
  },
];

describe("Install preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const world = (): { workspace: LifecycleFixture; registry: LifecycleRegistry } => {
    const registry = makeLifecycleRegistry();
    cleanups.push(registry.cleanup);
    const workspace = makeLifecycleFixture({
      sources: "live",
      settings: { agents: ["claude-code"], sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    return { workspace, registry };
  };

  it.effect.each(rows)(
    "a previewed $label install reports the plan and writes nothing",
    ({ type, source, unrealized }) => {
      const { workspace, registry } = world();
      const named = source({ workspace, registry });
      const before = workspace.snapshot();
      const homeBefore = workspace.homeSnapshot();
      return workspace
        .provide(
          Effect.gen(function* () {
            const resolution = yield* previewInstall(
              installRequest({ type, subject: { kind: "source", source: named } }),
            );

            expect(resolution.mode).toBe("preview");
            expect(deriveOperationOutcome(resolution)).toBe("previewed");
            expect(resolution.units.length).toBeGreaterThan(0);
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.homeSnapshot()).toEqual(homeBefore);
            for (const projection of unrealized) {
              expect(workspace.exists(projection)).toBe(false);
            }
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(rows)(
    "a previewed $label install of an unresolvable source reports the problem and writes nothing",
    ({ type, unresolvable }) => {
      const { workspace, registry } = world();
      const absent = unresolvable({ workspace, registry });
      const before = workspace.snapshot();
      const homeBefore = workspace.homeSnapshot();
      return workspace
        .provide(
          Effect.gen(function* () {
            const failure = yield* previewInstall(
              installRequest({ type, subject: { kind: "source", source: absent } }),
            ).pipe(Effect.flip);

            expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
            if (failure instanceof ExtensionLifecycleFailed) {
              expect(failure.category).toBe("not_found");
            }
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.homeSnapshot()).toEqual(homeBefore);
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "a previewed reinstall that would change publisher reports the change and writes nothing",
    () => {
      const { workspace, registry } = world();
      registry.writeSkill("code-review", [{ version: "1.0.0", body: "First guidance." }]);
      const request = installRequest({
        type: "skill",
        subject: { kind: "source", source: "@acme/skills/code-review" },
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(request);

            // The Registry now binds the same extension to a different
            // publisher than the one this workspace accepted.
            const lock = workspace.readFile("axm-lock.yaml");
            expect(lock).toContain("publisherBindingId: hbnd_test");
            workspace.writeFile(
              "axm-lock.yaml",
              lock.replace("publisherBindingId: hbnd_test", "publisherBindingId: hbnd_previous"),
            );
            const before = workspace.snapshot();

            const resolution = yield* previewInstall({ ...request, reinstall: true });

            expect(deriveOperationOutcome(resolution)).toBe("previewed");
            expect(resolution.riskConditions).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: "publisher-ownership-change",
                  level: "confirmable",
                  consent: "interactive-only",
                }),
              ]),
            );
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
