import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  ExtensionNameSchema,
  HandleSchema,
  PackMemberConstraintMapSchema,
} from "@agentxm/extension-model/unstable/extensions";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type {
  LocalPackRef,
  RegistryPackRef,
  SourceInheritedPackMemberRef,
} from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

import {
  ExtensionLifecycleFailed,
  InstallSelectionCancelled,
  InstallSelectionInteraction,
  InstallSelectionUnavailable,
} from "@agentxm/workspace-kernel/operations";
import { selectAcrossSourceTypes, selectInstallRefs } from "./selection.js";

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

const pack = (
  value: string,
  dependencies: Readonly<Record<string, string>>,
  sourceMembers: ReadonlyArray<SourceInheritedPackMemberRef>,
): LocalPackRef => {
  const base = localRef(value);
  return {
    ...base,
    type: "pack",
    version: Schema.decodeUnknownSync(VersionSchema)("1.0.0"),
    pack: {
      name: base.name,
      description: `The ${value} pack`,
      dependencies: Schema.decodeUnknownSync(PackMemberConstraintMapSchema)(dependencies),
    },
    sourceMembers,
  };
};
const registrySource = {
  type: "registry" as const,
  name: "example",
  location: new URL("https://registry.example/"),
  owner: Option.none(),
};
/** A release a Registry resolved, which has no place in a source tree. */
const registryRef = (value: string) => ({
  refType: "registry" as const,
  source: registrySource,
  owner: Schema.decodeUnknownSync(HandleSchema)("@publisher"),
  name: Schema.decodeUnknownSync(ExtensionNameSchema)(value),
  version: Schema.decodeUnknownSync(VersionSchema)("1.0.0"),
  integrity: Option.none(),
  publisherBindingId: "hbnd_fixture",
  packages: [],
});
/** A package the source installed from another publisher, kept under its install root. */
const acquired = <Ref extends ExtensionRef>(ref: Ref, plural: string): Ref => ({
  ...ref,
  sourceRelativePath: `agent_extensions/registry.example/@publisher/${plural}/${ref.name}`,
  heldBySource: true,
});

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
                brings: [],
              },
              {
                type: "skill",
                name: "draft-release",
                description: Option.none(),
                group: Option.none(),
                brings: [],
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

  it.effect("neither --all nor the question takes what the source acquired, but a name does", () =>
    Effect.gen(function* () {
      const own = skill("inspect-patch", Option.none());
      const held = acquired(skill("audit-skill", Option.none()), "skills");
      const all = yield* selectInstallRefs([own, held], {
        type: "skill",
        selectors: [],
        all: true,
        nonInteractive: true,
      }).pipe(neverPrompts("--all selection must not prompt"));
      expect(all).toEqual([own]);

      const asked = yield* selectInstallRefs([own, held], {
        type: "skill",
        selectors: [],
        all: false,
        nonInteractive: false,
      }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: (candidates) => {
            expect(candidates.map(({ name }) => name)).toEqual(["inspect-patch"]);
            return Effect.succeed(candidates);
          },
        }),
      );
      expect(asked).toEqual([own]);

      const named = yield* selectInstallRefs([own, held], {
        type: "skill",
        selectors: ["audit-skill"],
        ...unattended,
      }).pipe(neverPrompts("A named extension must not prompt"));
      expect(named).toEqual([held]);
    }),
  );

  it.effect("refuses --all for a type the source only holds from other publishers", () =>
    Effect.gen(function* () {
      const failure = yield* selectInstallRefs(
        [acquired(skill("audit-skill", Option.none()), "skills")],
        { type: "skill", selectors: [], all: true, nonInteractive: true },
      ).pipe(neverPrompts("--all selection must not prompt"), Effect.flip);
      expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
      expect(failure).toMatchObject({
        category: "not_found",
        detail:
          "The source offers no skills of its own; it holds audit-skill from other publishers",
        recover: "Name one with --skill to install this source's copy",
      });
    }),
  );

  describe("across every type a source offers", () => {
    const review = skill("review", Option.some("Reviews a change"));
    const lint = skill("lint", Option.none());
    const style = rule("style");
    const held = acquired(skill("audit-skill", Option.none()), "skills");
    const kit = pack(
      "kit",
      { "@publisher/skills/review": "^1.0.0", "@publisher/skills/audit-skill": "^1.0.0" },
      [review, lint, held],
    );
    const everything: ReadonlyArray<ExtensionRef> = [review, lint, held, style, kit];

    it.effect("asks once, Packs first, naming what each Pack brings", () =>
      Effect.gen(function* () {
        let asked = 0;
        const takes = yield* selectAcrossSourceTypes(everything, { all: false }).pipe(
          Effect.provideService(InstallSelectionInteraction, {
            select: (candidates) => {
              asked += 1;
              expect(candidates.map(({ type, name }) => `${type}:${name}`)).toEqual([
                "pack:kit",
                "skill:review",
                "skill:lint",
                "rule:style",
              ]);
              expect(candidates[0]).toMatchObject({
                description: Option.some("The kit pack"),
                brings: [
                  { type: "skill", name: "review" },
                  { type: "skill", name: "audit-skill" },
                ],
              });
              return Effect.succeed(
                candidates.filter(({ name }) => name === "kit" || name === "style"),
              );
            },
          }),
        );
        expect(asked).toBe(1);
        expect(everything.filter(takes)).toEqual([style, kit]);
      }),
    );

    it.effect("--all takes every Pack and every extension no Pack brings", () =>
      Effect.gen(function* () {
        const takes = yield* selectAcrossSourceTypes(everything, { all: true }).pipe(
          neverPrompts("--all selection must not prompt"),
        );
        expect(everything.filter(takes)).toEqual([lint, style, kit]);
      }),
    );

    it.effect("takes nothing from a source that offers nothing of its own", () =>
      Effect.gen(function* () {
        const takes = yield* selectAcrossSourceTypes([held], { all: false }).pipe(
          neverPrompts("Nothing is offered, so nothing is asked"),
        );
        expect([held].filter(takes)).toEqual([]);
      }),
    );
  });

  it.effect("says what each type's manifest says it is for", () =>
    Effect.gen(function* () {
      const server: McpServerExtensionRef = {
        ...mcpServer("files"),
        server: { name: mcpServer("files").name, description: "Reads files" },
      };
      const guard: HookExtensionRef = {
        ...localRef("guard"),
        type: "hook",
        hook: { name: localRef("guard").name, description: "Guards the shell" },
      };
      const notes: KnowledgeExtensionRef = {
        ...localRef("notes"),
        type: "knowledge",
        knowledge: { name: localRef("notes").name, description: "Team notes" },
      };
      const style: RuleExtensionRef = {
        ...rule("style"),
        rule: { name: rule("style").name, description: "House style" },
      };
      yield* selectAcrossSourceTypes([server, guard, notes, style, first], { all: false }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: (candidates) => {
            expect(candidates.map(({ name, description }) => [name, description])).toEqual([
              ["files", Option.some("Reads files")],
              ["guard", Option.some("Guards the shell")],
              ["notes", Option.some("Team notes")],
              ["style", Option.some("House style")],
              ["safe-shell", Option.none()],
            ]);
            return Effect.succeed([]);
          },
        }),
      );
    }),
  );

  it.effect("reads a skill's folder from a Git source, and none from a Registry release", () =>
    Effect.gen(function* () {
      const fromGit = (sourcePath: string): SkillExtensionRef => {
        const base = localRef(sourcePath.split("/").at(-1) ?? "");
        return {
          type: "skill",
          refType: "git-hosted",
          source: {
            type: "git",
            url: new URL("https://example.com/skills.git"),
            ref: Option.none(),
            subPath: Option.none(),
          },
          owner: base.owner,
          name: base.name,
          location: base.location,
          gitCommitSha: "0".repeat(40),
          gitTreeSha: "1".repeat(40),
          sourcePath,
          skill: { name: base.name, description: Option.none(), metadata: Option.none() },
        };
      };
      const released = (value: string): SkillExtensionRef => {
        const base = registryRef(value);
        return {
          ...base,
          type: "skill",
          skill: { name: base.name, description: Option.none(), metadata: Option.none() },
        };
      };
      const groupsOf = (refs: ReadonlyArray<SkillExtensionRef>) =>
        Effect.gen(function* () {
          let groups: ReadonlyArray<Option.Option<string>> = [];
          yield* selectInstallRefs(refs, {
            type: "skill",
            selectors: [],
            all: false,
            nonInteractive: false,
          }).pipe(
            Effect.provideService(InstallSelectionInteraction, {
              select: (candidates) => {
                groups = candidates.map(({ group }) => group);
                return Effect.succeed([]);
              },
            }),
          );
          return groups;
        });
      expect(
        yield* groupsOf([fromGit("skills/engineering/tdd"), fromGit("skills/writing/handoff")]),
      ).toEqual([Option.some("engineering"), Option.some("writing")]);
      expect(yield* groupsOf([released("tdd"), released("handoff")])).toEqual([
        Option.none(),
        Option.none(),
      ]);
    }),
  );

  it.effect("refuses to ask about a type the source only holds from other publishers", () =>
    Effect.gen(function* () {
      const failure = yield* selectInstallRefs(
        [acquired(skill("audit-skill", Option.none()), "skills")],
        { type: "skill", selectors: [], all: false, nonInteractive: false },
      ).pipe(neverPrompts("Nothing is offered, so nothing is asked"), Effect.flip);
      expect(failure).toMatchObject({ category: "not_found" });
    }),
  );

  it.effect("names a Pack's members as declared where its source view does not hold them", () =>
    Effect.gen(function* () {
      const review = skill("review", Option.none());
      const [range] = Object.values(
        Schema.decodeUnknownSync(PackMemberConstraintMapSchema)({
          "@publisher/skills/review": "^1.0.0",
        }),
      );
      if (range === undefined) throw new Error("Expected one decoded constraint");
      // A map built past the schema: a key that is no identity, and a Pack.
      const local: LocalPackRef = {
        ...pack("kit", {}, [review]),
        pack: {
          name: pack("kit", {}, []).name,
          dependencies: {
            "@publisher/skills/review": range,
            "@publisher/skills/elsewhere": range,
            "not-an-identity": range,
            "@publisher/packs/other": range,
          },
        },
      };
      const base = registryRef("released-kit");
      const released: RegistryPackRef = {
        ...base,
        type: "pack",
        pack: { name: base.name, dependencies: { "@publisher/skills/review": range } },
      };
      yield* selectAcrossSourceTypes([review, local, released], { all: false }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: (candidates) => {
            expect(candidates.map(({ name, brings }) => [name, brings])).toEqual([
              [
                "kit",
                [
                  { type: "skill", name: "review" },
                  { type: "skill", name: "elsewhere" },
                ],
              ],
              ["released-kit", [{ type: "skill", name: "review" }]],
              ["review", []],
            ]);
            return Effect.succeed([]);
          },
        }),
      );
    }),
  );
});
