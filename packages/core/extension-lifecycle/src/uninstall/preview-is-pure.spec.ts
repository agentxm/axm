import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import { ExtensionLifecycleFailed } from "../errors.js";
import { applyInstall, installRequest } from "../install/test-helpers.js";
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
import { previewUninstall, uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/preview-is-pure",
  title: "Uninstall preview describes the removal without changing any state",
  statement:
    "When an uninstall of any extension type runs in preview mode, it shall not change settings, the lockfile, canonical content, or agent projections; when the request names a desired extension and passes the applicable checks, it shall report the removal it would apply with a previewed outcome; and when it names a target the workspace does not desire, it shall withdraw nothing and still change nothing, settling as a no-op with no unit for a skill, subagent, rule, hooks package, Knowledge bundle, or Pack and as a previewed unit that declares no removal for an MCP server.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [
    "cli/uninstall/is-idempotent",
    "cli/hooks/uninstall/preview-is-pure",
    "cli/knowledge/uninstall/preview-is-pure",
    "cli/mcps/uninstall/preview-is-pure",
    "cli/packs/uninstall/preview-is-pure",
    "cli/rules/uninstall/preview-is-pure",
    "cli/skills/uninstall/preview-is-pure",
    "cli/subagents/uninstall/preview-is-pure",
  ],
  supersedes: [
    "cli/hooks/uninstall/preview-is-pure",
    "cli/knowledge/uninstall/preview-is-pure",
    "cli/mcps/uninstall/preview-is-pure",
    "cli/packs/uninstall/preview-is-pure",
    "cli/rules/uninstall/preview-is-pure",
    "cli/skills/uninstall/preview-is-pure",
    "cli/subagents/uninstall/preview-is-pure",
  ],
  assumptions: [],
  limitations: [
    {
      limitation:
        "The MCP-server row witnesses only that previewing the removal of a server the workspace does not desire writes nothing and declares no removal. It cannot witness that the preview reports the target as absent: the settled candidate carries no absent-versus-desired distinction into the resolution, and the per-agent outcomes that would carry it are attached by the surface that renders the plan, not by this package.",
      retirementCondition:
        "The settled uninstall candidate carries the absent-versus-desired distinction into the resolution for every type, so the row can assert the report as well as the purity.",
    },
  ],
  openQuestions: [
    "Whether previewing the removal of a target the workspace does not desire should settle as a no-op for every type, rather than as a previewed unit for an MCP server, is undecided; the example table records the split as it stands.",
  ],
});

/**
 * One row per extension type a removal can withdraw. Each row installs the
 * extension for real first, because a preview of a removal is only meaningful
 * against something the workspace actually holds.
 */
interface UninstallRow {
  readonly label: string;
  readonly type: InstallableExtensionType;
  /** Publishes the package and returns the source an install would name. */
  readonly source: (args: {
    readonly workspace: LifecycleFixture;
    readonly registry: LifecycleRegistry;
  }) => string;
  /** The selector the removal names. */
  readonly selector: string;
  /** A workspace-relative path the install realized and the preview must leave. */
  readonly retained: ReadonlyArray<string>;
  /**
   * A selector of this type the workspace does not desire, and what previewing
   * its removal reports. The report differs by type today — six settle as a
   * no-op with no unit at all, while an MCP server settles a ready unit that
   * withdraws nothing — so each row carries its own expectation rather than
   * one shared sentence hiding the difference.
   */
  readonly absent: {
    readonly selector: string;
    readonly reports: "nothing-at-all" | "a-unit-that-withdraws-nothing";
  };
}

const NAME = "demo";

const rows: ReadonlyArray<UninstallRow> = [
  {
    label: "skill",
    type: "skill",
    source: ({ workspace }) => writeLocalSkillPackage(workspace.root, { name: NAME }),
    selector: NAME,
    retained: [`.claude/skills/${NAME}`],
    absent: { selector: "release-*", reports: "nothing-at-all" },
  },
  {
    label: "subagent",
    type: "subagent",
    source: ({ workspace }) => writeLocalSubagentPackage(workspace.root, { name: NAME }),
    selector: NAME,
    retained: [`.claude/agents/${NAME}.md`],
    absent: { selector: "planner-*", reports: "nothing-at-all" },
  },
  {
    label: "rule",
    type: "rule",
    source: ({ workspace }) => writeLocalRulePackage(workspace.root, { name: NAME }),
    selector: NAME,
    retained: ["AGENTS.md"],
    absent: { selector: "absent-rule", reports: "nothing-at-all" },
  },
  {
    label: "hook",
    type: "hook",
    source: ({ workspace }) => writeLocalHookPackage(workspace.root, { name: NAME }),
    selector: NAME,
    retained: [".claude/settings.json"],
    absent: { selector: "absent-hooks", reports: "nothing-at-all" },
  },
  {
    label: "knowledge bundle",
    type: "knowledge",
    source: ({ workspace }) => writeLocalKnowledgePackage(workspace.root, { name: NAME }),
    selector: NAME,
    retained: ["axm-lock.yaml"],
    absent: { selector: "absent-bundle", reports: "nothing-at-all" },
  },
  {
    label: "MCP server",
    type: "mcp-server",
    source: ({ registry }) => {
      registry.writeMcp(NAME, [{ version: "1.0.0" }]);
      return `@acme/mcps/${NAME}`;
    },
    selector: NAME,
    retained: [".mcp.json"],
    absent: { selector: "missing", reports: "a-unit-that-withdraws-nothing" },
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
    selector: NAME,
    retained: [".claude/skills/member"],
    absent: { selector: "absent-pack", reports: "nothing-at-all" },
  },
];

describe("Uninstall preview purity", () => {
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
    "a previewed $label uninstall reports the removal and writes nothing",
    ({ type, source, selector, retained }) => {
      const { workspace, registry } = world();
      const named = source({ workspace, registry });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({ type, subject: { kind: "source", source: named } }),
            );
            for (const realized of retained) {
              expect(workspace.exists(realized)).toBe(true);
            }
            const before = workspace.snapshot();
            const homeBefore = workspace.homeSnapshot();

            const resolution = yield* previewUninstall(uninstallRequest({ type, selector }));

            expect(resolution.mode).toBe("preview");
            expect(deriveOperationOutcome(resolution)).toBe("previewed");
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.homeSnapshot()).toEqual(homeBefore);
            for (const realized of retained) {
              expect(workspace.exists(realized)).toBe(true);
            }
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(rows)(
    "a previewed $label uninstall matching nothing desired withdraws nothing and writes nothing",
    ({ type, source, retained, absent }) => {
      const { workspace, registry } = world();
      const named = source({ workspace, registry });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({ type, subject: { kind: "source", source: named } }),
            );
            const before = workspace.snapshot();
            const homeBefore = workspace.homeSnapshot();

            const resolution = yield* previewUninstall(
              uninstallRequest({ type, selector: absent.selector }),
            );

            expect(resolution.mode).toBe("preview");
            if (absent.reports === "nothing-at-all") {
              expect(deriveOperationOutcome(resolution)).toBe("no-op");
              expect(resolution.units).toEqual([]);
            } else {
              expect(deriveOperationOutcome(resolution)).toBe("previewed");
              expect(resolution.units).toMatchObject([{ label: absent.selector, state: "ready" }]);
              // A unit with no artifact declares no target to withdraw.
              expect(resolution.units.map((unit) => unit.artifact)).toEqual([undefined]);
            }
            // What the workspace does desire is untouched, and so is
            // everything else under the project root and the user home.
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.homeSnapshot()).toEqual(homeBefore);
            for (const realized of retained) {
              expect(workspace.exists(realized)).toBe(true);
            }
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("a previewed removal of an invalid target refuses and writes nothing", () => {
    const { workspace } = world();
    const named = writeLocalSkillPackage(workspace.root, { name: NAME });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source: named } }),
          );
          const before = workspace.snapshot();

          // The root form accepts only a registry FQN, and `@acme/skills` is
          // an owner and a type with no extension name.
          const failure = yield* previewUninstall(
            uninstallRequest({ selector: "@acme/skills" }),
          ).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
          if (failure instanceof ExtensionLifecycleFailed) {
            expect(failure.category).toBe("validation");
          }
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
