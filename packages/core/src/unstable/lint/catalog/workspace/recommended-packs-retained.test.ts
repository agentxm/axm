/**
 * Unit tests for `workspace/recommended-packs-retained`.
 *
 * The rule reads two cells: installed pack lock entries and the installed
 * extension manifests exposed by `context.installedExtensions`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { InstalledExtensionManifest, WorkspaceRuleContext } from "../../context.js";
import { recommendedPacksRetainedRule } from "./recommended-packs-retained.js";

const skillManifest = (args: {
  readonly name: string;
  readonly standalone?: boolean;
  readonly recommendedPacks?: ReadonlyArray<string>;
}): InstalledExtensionManifest => ({
  extensionType: "skill",
  name: args.name,
  manifestPath: `.axm/extensions/@acme/skills/${args.name}/skill.json`,
  manifestJson: {
    owner: "@acme",
    type: "skill",
    name: args.name,
    version: "1.0.0",
    ...(args.standalone === undefined ? {} : { standalone: args.standalone }),
    ...(args.recommendedPacks === undefined ? {} : { recommendedPacks: args.recommendedPacks }),
  },
});

const makeContext = (args: {
  readonly manifests?: ReadonlyArray<InstalledExtensionManifest>;
  readonly installedPacks?: ReadonlyArray<{
    readonly owner: string;
    readonly name: string;
    readonly source?: "registry" | "workspace";
  }>;
  readonly omitAccessor?: boolean;
}): WorkspaceRuleContext => {
  const packs = Object.fromEntries(
    (args.installedPacks ?? []).map((pack) => [
      pack.name,
      {
        type: pack.source ?? "registry",
        owner: pack.owner,
        name: pack.name,
        resolvedSkills: {},
        resolvedSubagents: {},
        resolvedMcpServers: {},
      },
    ]),
  );
  const context: Omit<WorkspaceRuleContext, "workspace"> = {
    subject: { root: "/tmp/project", scope: "project" },
    axmDirExists: Effect.succeed(true),
    displayRoot: "",
    ...(args.omitAccessor === true
      ? {}
      : { installedExtensions: { manifests: Effect.succeed(args.manifests ?? []) } }),
  };
  return {
    ...context,
    // The rule reads only `state.lockfile` off the read model.
    workspace: {
      state: { lockfile: Effect.succeed(Option.some({ skills: {}, packs })) },
    },
  } as unknown as WorkspaceRuleContext;
};

describe("workspace/recommended-packs-retained", () => {
  it("ships as an advisory warning", () => {
    expect(recommendedPacksRetainedRule.id).toBe("workspace/recommended-packs-retained");
    expect(recommendedPacksRetainedRule.kind).toBe("advisory");
    expect(recommendedPacksRetainedRule.severity).toBe("warning");
    expect(recommendedPacksRetainedRule.description.length).toBeLessThanOrEqual(100);
  });

  it.effect("warns when the only recommended pack is not installed", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRetainedRule.check(
        makeContext({
          manifests: [
            skillManifest({
              name: "brick-building",
              standalone: false,
              recommendedPacks: ["@acme/packs/bricks"],
            }),
          ],
        }),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/recommended-packs-retained");
      expect(findings[0]?.severity).toBe("warning");
      expect(findings[0]?.location?.file).toBe(
        ".axm/extensions/@acme/skills/brick-building/skill.json",
      );
      expect(findings[0]?.message).not.toContain("axm packs install");
      expect(findings[0]?.suggestions).toEqual([
        {
          description: "Install recommended pack @acme/packs/bricks",
          cmd: "axm packs install @acme/packs/bricks",
        },
      ]);
    }),
  );

  it.effect("stays silent when a recommended pack is installed", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRetainedRule.check(
        makeContext({
          manifests: [
            skillManifest({
              name: "brick-building",
              standalone: false,
              recommendedPacks: ["@acme/packs/bricks"],
            }),
          ],
          installedPacks: [{ owner: "@acme", name: "bricks" }],
        }),
      );

      expect(findings).toEqual([]);
    }),
  );

  it.effect("stays silent when a recommended workspace pack is installed", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRetainedRule.check(
        makeContext({
          manifests: [
            skillManifest({
              name: "brick-building",
              standalone: false,
              recommendedPacks: ["@acme/packs/bricks"],
            }),
          ],
          installedPacks: [{ owner: "@acme", name: "bricks", source: "workspace" }],
        }),
      );

      expect(findings).toEqual([]);
    }),
  );

  it.effect("treats any one installed pack as satisfying the recommendation", () =>
    Effect.gen(function* () {
      const manifests = [
        skillManifest({
          name: "brick-building",
          standalone: false,
          recommendedPacks: ["@acme/packs/bricks", "@acme/packs/mortar"],
        }),
      ];

      expect(
        yield* recommendedPacksRetainedRule.check(
          makeContext({ manifests, installedPacks: [{ owner: "@acme", name: "mortar" }] }),
        ),
      ).toEqual([]);

      const findings = yield* recommendedPacksRetainedRule.check(makeContext({ manifests }));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.suggestions).toEqual([
        {
          description: "Install recommended pack @acme/packs/bricks",
          cmd: "axm packs install @acme/packs/bricks",
        },
        {
          description: "Install recommended pack @acme/packs/mortar",
          cmd: "axm packs install @acme/packs/mortar",
        },
      ]);
    }),
  );

  it.effect("ignores a version range on the recommendation when matching", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRetainedRule.check(
        makeContext({
          manifests: [
            skillManifest({
              name: "brick-building",
              standalone: false,
              recommendedPacks: ["@acme/packs/bricks@^1.0.0"],
            }),
          ],
          installedPacks: [{ owner: "@acme", name: "bricks" }],
        }),
      );

      expect(findings).toEqual([]);
    }),
  );

  it.effect("stays silent when standalone is absent or true", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRetainedRule.check(
        makeContext({
          manifests: [
            skillManifest({ name: "absent", recommendedPacks: ["@acme/packs/bricks"] }),
            skillManifest({
              name: "explicit",
              standalone: true,
              recommendedPacks: ["@acme/packs/bricks"],
            }),
          ],
        }),
      );

      expect(findings).toEqual([]);
    }),
  );

  it.effect("leaves an empty recommendedPacks list to the publish-time rule", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRetainedRule.check(
        makeContext({
          manifests: [skillManifest({ name: "brick-building", standalone: false })],
        }),
      );

      expect(findings).toEqual([]);
    }),
  );

  it.effect("stays silent when the context carries no manifest accessor", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRetainedRule.check(
        makeContext({ omitAccessor: true }),
      );

      expect(findings).toEqual([]);
    }),
  );
});
