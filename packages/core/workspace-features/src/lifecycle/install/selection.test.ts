import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

import {
  ExtensionLifecycleFailed,
  InstallSelectionCancelled,
  InstallSelectionInteraction,
  InstallSelectionUnavailable,
} from "@agentxm/workspace-kernel/operations";
import { selectInstallRefs } from "./selection.js";

const localRef = (value: string) => {
  const name = Schema.decodeUnknownSync(ExtensionNameSchema)(value);
  return {
    refType: "local" as const,
    source: { type: "local" as const, path: "/fixture/source" },
    owner: Schema.decodeUnknownSync(HandleSchema)("@publisher"),
    name,
    location: `file:///fixture/source/${name}`,
  };
};
const rule = (value: string): RuleExtensionRef => {
  const base = localRef(value);
  return { ...base, type: "rule", rule: { name: base.name } };
};
const skill = (value: string, description: Option.Option<string>): SkillExtensionRef => {
  const base = localRef(value);
  return {
    ...base,
    type: "skill",
    skill: { name: base.name, description, metadata: Option.none() },
  };
};
const subagent = (value: string, description: Option.Option<string>): SubagentExtensionRef => {
  const base = localRef(value);
  return { ...base, type: "subagent", subagent: { name: base.name, description } };
};
const mcpServer = (value: string): McpServerExtensionRef => {
  const base = localRef(value);
  return { ...base, type: "mcp-server", server: { name: base.name } };
};

const first = rule("safe-shell");
const second = rule("commit-style");
const third = rule("safe-network");

const neverPrompts = (reason: string) =>
  Effect.provideService(InstallSelectionInteraction, { select: () => Effect.die(reason) });

const unattended = { all: false, nonInteractive: true } as const;

describe("install source selection", () => {
  it.effect("selects native MCP declarations by their upstream name or exact package path", () =>
    Effect.gen(function* () {
      const local = {
        ...localRef("managed-package"),
        type: "mcp-server",
        server: { name: Schema.decodeUnknownSync(ExtensionNameSchema)("managed-connection") },
        nativeComponent: {
          format: "agent-plugins",
          configPath: "mcp.json",
          name: "upstream-context",
        },
      } as const satisfies McpServerExtensionRef;
      const described = {
        ...local,
        distribution: {
          format: "agent-plugins",
          packageRoot: "plugins/one",
          componentPath: ".",
          manifestPath: "plugin.json",
        },
      } as const satisfies McpServerExtensionRef;
      const git = {
        ...local,
        refType: "git-hosted",
        source: {
          type: "git",
          url: new URL("https://example.com/plugins.git"),
          ref: Option.none(),
          subPath: Option.none(),
        },
        gitCommitSha: "0".repeat(40),
        gitTreeSha: "1".repeat(40),
        sourcePath: "plugins/two",
      } as const satisfies McpServerExtensionRef;
      const refs: ReadonlyArray<McpServerExtensionRef> = [described, git, local];
      for (const [selector, expected] of [
        ["upstream-context", refs],
        ["plugins/one#upstream-context", [described]],
        ["plugins/two#upstream-context", [git]],
        [".#upstream-context", [local]],
      ] as const) {
        const selected = yield* selectInstallRefs(refs, {
          type: "mcp-server",
          selectors: [selector],
          ...unattended,
        }).pipe(neverPrompts("An exact plugin component must not prompt"));
        expect(selected).toEqual(expected);
      }
    }),
  );
  it.effect("has nothing to decide for a source that offers nothing of the type", () =>
    Effect.gen(function* () {
      const selected = yield* selectInstallRefs([], {
        type: "rule",
        selectors: [],
        ...unattended,
      }).pipe(neverPrompts("An empty source must not prompt"));
      expect(selected).toEqual([]);
    }),
  );

  it.effect("takes the union of selector matches in source order, once each", () =>
    Effect.gen(function* () {
      const selected = yield* selectInstallRefs([first, second, third], {
        type: "rule",
        selectors: ["safe-network", "safe-*", "safe-shell"],
        ...unattended,
      }).pipe(neverPrompts("An explicit selection must not prompt"));
      expect(selected).toEqual([first, third]);
    }),
  );

  it.effect("selects exact Git and local paths independently of duplicate display names", () =>
    Effect.gen(function* () {
      const base = skill("review", Option.none());
      const git = {
        ...base,
        refType: "git-hosted",
        source: {
          type: "git",
          url: new URL("https://example.com/skills.git"),
          ref: Option.none(),
          subPath: Option.none(),
        },
        location: "file:///fixture/source/review",
        gitCommitSha: "0".repeat(40),
        gitTreeSha: "1".repeat(40),
        sourcePath: "git/review",
      } satisfies SkillExtensionRef;
      const local = {
        ...localRef("review"),
        type: "skill",
        skill: base.skill,
        sourceRelativePath: "local/review",
      } satisfies SkillExtensionRef;
      const other = { ...local, sourceRelativePath: "other/review" };
      const selected = yield* selectInstallRefs([git, other, local], {
        type: "skill",
        selectors: ["git/review", "local/review"],
        ...unattended,
      }).pipe(neverPrompts("Exact paths must not prompt"));
      expect(selected).toEqual([git, local]);
    }),
  );

  it.effect("keeps the matches when only some selectors match", () =>
    Effect.gen(function* () {
      const selected = yield* selectInstallRefs([first, second], {
        type: "rule",
        selectors: ["missing", "commit-style"],
        all: true,
        nonInteractive: false,
      }).pipe(neverPrompts("An explicit selection must not prompt"));
      expect(selected).toEqual([second]);
    }),
  );

  it.effect.each<{
    readonly type: "skill" | "subagent" | "mcp-server";
    readonly refs: ReadonlyArray<ExtensionRef>;
    readonly detail: string;
    readonly recover: string;
  }>([
    {
      type: "skill",
      refs: [skill("inspect-patch", Option.none()), skill("draft-release", Option.none())],
      detail: "No skills matched: missing, other-*. Source contains: inspect-patch, draft-release",
      recover: "Check the skill names or patterns and try again",
    },
    {
      type: "subagent",
      refs: [subagent("review", Option.none())],
      detail: "No subagents matched: missing, other-*. Source contains: review",
      recover: "Check the subagent names or patterns and try again",
    },
    {
      type: "mcp-server",
      refs: [mcpServer("filesystem")],
      detail: "No MCP servers matched: missing, other-*. Source contains: filesystem",
      recover: "Check the MCP server names or patterns and try again",
    },
  ])("refuses a wholly unmatched $type selection as not found", ({ type, refs, detail, recover }) =>
    Effect.gen(function* () {
      const failure = yield* selectInstallRefs(refs, {
        type,
        selectors: ["missing", "other-*"],
        all: true,
        nonInteractive: false,
      }).pipe(neverPrompts("An unmatched selection must not prompt"), Effect.flip);
      expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
      expect(failure).toMatchObject({ category: "not_found", detail, recover });
    }),
  );

  it.effect.each<{
    readonly type: "skill" | "subagent" | "mcp-server";
    readonly refs: ReadonlyArray<ExtensionRef>;
    readonly detail: string;
    readonly recover: string;
  }>([
    {
      type: "skill",
      refs: [skill("inspect-patch", Option.none())],
      detail: "--skill or --all is required to select skills when no prompt can open",
      recover:
        "Repeat --skill for each name to install, pass --all to take every skill, or rerun from an interactive terminal",
    },
    {
      type: "subagent",
      refs: [subagent("review", Option.none())],
      detail: "--subagent or --all is required to select subagents when no prompt can open",
      recover:
        "Repeat --subagent for each name to install, pass --all to take every subagent, or rerun from an interactive terminal",
    },
    {
      type: "mcp-server",
      refs: [mcpServer("filesystem")],
      detail: "--mcp-server or --all is required to select MCP servers when no prompt can open",
      recover:
        "Repeat --mcp-server for each name to install, pass --all to take every MCP server, or rerun from an interactive terminal",
    },
  ])(
    "requires a $type selector or --all when no prompt can open",
    ({ type, refs, detail, recover }) =>
      Effect.gen(function* () {
        const failure = yield* selectInstallRefs(refs, {
          type,
          selectors: [],
          ...unattended,
        }).pipe(neverPrompts("Non-interactive selection must not prompt"), Effect.flip);
        expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
        expect(failure).toMatchObject({ category: "usage", detail, recover });
      }),
  );

  it.effect("accepts every candidate when --all supplies the decision", () =>
    Effect.gen(function* () {
      const selected = yield* selectInstallRefs([first, second], {
        type: "rule",
        selectors: [],
        all: true,
        nonInteractive: true,
      }).pipe(neverPrompts("--all selection must not prompt"));
      expect(selected).toEqual([first, second]);
    }),
  );

  it.effect("lists candidates with what they describe and honors an interactive selection", () =>
    Effect.gen(function* () {
      const offered = [
        skill("inspect-patch", Option.some("Reads a patch")),
        skill("draft-release", Option.none()),
      ];
      const selected = yield* selectInstallRefs(offered, {
        type: "skill",
        selectors: [],
        all: false,
        nonInteractive: false,
      }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: (candidates) => {
            expect(candidates).toEqual([
              {
                type: "skill",
                name: "inspect-patch",
                description: Option.some("Reads a patch"),
                group: Option.none(),
              },
              {
                type: "skill",
                name: "draft-release",
                description: Option.none(),
                group: Option.none(),
              },
            ]);
            return Effect.succeed([candidates[1]].filter((value) => value !== undefined));
          },
        }),
      );
      expect(selected).toEqual([offered[1]]);
    }),
  );

  it.effect.each([
    {
      label: "groups skills by the folders a source sorts them into",
      paths: ["skills/engineering/tdd", "skills/productivity/handoff"],
      groups: [Option.some("engineering"), Option.some("productivity")],
    },
    {
      label: "leaves skills that share one folder ungrouped",
      paths: ["skills/tdd", "skills/handoff"],
      groups: [Option.none(), Option.none()],
    },
    {
      label: "leaves skills ungrouped when one sits at the source's root",
      paths: ["tdd", "skills/productivity/handoff"],
      groups: [Option.none(), Option.none()],
    },
  ])("$label", ({ paths, groups }) =>
    Effect.gen(function* () {
      const offered = paths.map((sourceRelativePath) => ({
        ...skill(sourceRelativePath.split("/").at(-1) ?? "", Option.none()),
        sourceRelativePath,
      }));
      yield* selectInstallRefs(offered, {
        type: "skill",
        selectors: [],
        all: false,
        nonInteractive: false,
      }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: (candidates) => {
            expect(candidates.map((candidate) => candidate.group)).toEqual(groups);
            return Effect.succeed([]);
          },
        }),
      );
    }),
  );

  it.effect.each<{
    readonly label: string;
    readonly type: "subagent" | "rule";
    readonly refs: ReadonlyArray<ExtensionRef>;
    readonly description: Option.Option<string>;
  }>([
    {
      label: "a subagent's description",
      type: "subagent",
      refs: [subagent("review", Option.some("Reviews a change"))],
      description: Option.some("Reviews a change"),
    },
    { label: "no description for a rule", type: "rule", refs: [first], description: Option.none() },
  ])("offers $label", ({ type, refs, description }) =>
    Effect.gen(function* () {
      const selected = yield* selectInstallRefs(refs, {
        type,
        selectors: [],
        all: false,
        nonInteractive: false,
      }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: (candidates) => {
            expect(candidates.map((candidate) => candidate.description)).toEqual([description]);
            return Effect.succeed([]);
          },
        }),
      );
      expect(selected).toEqual([]);
    }),
  );

  it.effect.each([
    new InstallSelectionCancelled({ message: "Choice declined" }),
    new InstallSelectionUnavailable({ cause: new Error("Interface unavailable") }),
  ])("passes $_tag through from the interaction", (interactionFailure) =>
    Effect.gen(function* () {
      const failure = yield* selectInstallRefs([first, second], {
        type: "rule",
        selectors: [],
        all: false,
        nonInteractive: false,
      }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: () => Effect.fail(interactionFailure),
        }),
        Effect.flip,
      );
      expect(failure).toBe(interactionFailure);
    }),
  );
});
