import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  InstallSelectionInteraction,
  ExtensionLifecycleFailed,
  deriveOperationOutcome,
  type InstallSelectionCandidate,
} from "@agentxm/workspace-kernel/operations";
import { contentUnder, readSettings } from "./test-helpers.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";
import {
  writeLocalRulePackage,
  writeLocalSkillPackage,
  writeLocalSubagentPackage,
} from "../../testing/local-packages.js";

export const specification = defineSpecification({
  requirement: "cli/install/selects-requested-source-extensions",
  title: "Installation selects the requested extensions from what a source offers",
  statement:
    "For an installable source, a request that names one or more of its extensions shall install exactly the discovered extensions its names or patterns match, in source order, and shall fail as not found without installing anything when no name matches, with external skills also selectable by exact source-relative path, including distinct same-name candidates; a source shall offer the extensions it authors and not the packages it holds from other publishers, which shall remain installable by name; a request that selects all shall install, without opening a selection interaction, every offered Pack and every other offered extension that no Pack among them brings, across the types the request covers; a request that both names extensions and selects all, and an unattended request that does neither, shall fail as usage guidance; a request that leaves the choice open where a selection interaction is available shall ask once across every type the source offers; and an extension chosen both directly and through a Pack shall keep both routes as one unit. One policy decides this for every installable type.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/core/workspace-features/src/lifecycle/install/selection.ts",
    "packages/core/workspace-features/src/lifecycle/install/install-extensions.ts",
    // The flag spellings that build these requests (`--skill`, repeated
    // `--skill`, `--all`) stay CLI grammar; process evidence for them is
    // apps/cli-e2e/src/cli-commands/skills/install/command.e2e.ts.
    "apps/cli-e2e/src/cli-commands/skills/install/command.e2e.ts",
  ],
  supersedes: ["cli/skills/install/selects-requested-source-skills"],
  assumptions: [
    "Discovery decides which of a source's packages it offers and which it holds from other publishers, under extension-discovery/workspace-sources-offer-their-authored-roots; selection takes that standing as given.",
  ],
  openQuestions: [
    "Must a request containing both matched and unmatched names install its matches, as it does today, or fail as a whole?",
  ],
  limitations: [
    {
      limitation:
        "The source populations are local native trees with unique and same-name skills, two uniquely named subagents, and one mixed local source holding a Pack, its member, a rule, and an acquired skill. These examples do not establish discovery or selection through remote Git/Registry providers, native ownership conflicts, invalid sibling packages, or an actual interactive terminal session, and the remaining installable types are covered by the shared policy's ordinary tests rather than by an example here.",
      retirementCondition:
        "Add distinct source-provider and interaction evidence when those selection conditions are allocated; keep unresolved selector policies explicit until decided.",
    },
  ],
});

const sourceSkills = ["draft-changelog", "inspect-patch", "trace-failure"] as const;
const sourceSubagents = ["reviewer", "planner"] as const;

const skillDocument = (name: string): string =>
  `---\nname: ${name}\ndescription: The ${name} source skill\n---\n\n# ${name}\n\nSource-specific guidance for ${name}.\n`;

/** A native `.agents/skills` tree holding three uniquely named skills. */
const writeMultiSkillSource = (workspaceRoot: string): string => {
  const sourceRoot = nodePath.join(workspaceRoot, "vendor", "native-skill-source");
  for (const name of sourceSkills) {
    const skillRoot = nodePath.join(sourceRoot, ".agents", "skills", name);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(nodePath.join(skillRoot, "SKILL.md"), skillDocument(name));
  }
  return sourceRoot;
};

/** A local source root holding two uniquely named subagent packages. */
const writeMultiSubagentSource = (workspaceRoot: string): string => {
  const sourceRoot = nodePath.join(workspaceRoot, "subagent-source");
  for (const name of sourceSubagents) writeLocalSubagentPackage(sourceRoot, { name });
  return sourceRoot;
};

/** Every file under one absolute directory, keyed by directory-relative path. */
const snapshotDirectory = (root: string): Readonly<Record<string, string>> => {
  const files: Record<string, string> = {};
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files[nodePath.relative(root, absolute)] = fs.readFileSync(absolute, "utf8");
    }
  };
  walk(root);
  return files;
};

const acceptedSkillResolutions = (world: InstallWorld): Readonly<Record<string, unknown>> => {
  const lockfile: unknown = YAML.parse(world.workspace.readFile("axm-lock.yaml"));
  if (typeof lockfile !== "object" || lockfile === null || !("skills" in lockfile))
    throw new Error("Expected a skill resolution map");
  const skills = lockfile.skills;
  if (typeof skills !== "object" || skills === null) throw new Error("Expected a resolution map");
  return { ...skills };
};

const configuredSkills = (world: InstallWorld): Readonly<Record<string, unknown>> => {
  const skills = readSettings(world.workspace)["skills"];
  if (typeof skills !== "object" || skills === null) throw new Error("Expected configured skills");
  return { ...skills };
};

/**
 * Exactly the named skills are acquired, declared, resolved and projected;
 * every other skill in the source is absent from all four.
 */
const expectSelection = (world: InstallWorld, selected: ReadonlyArray<string>): void => {
  const canonical = contentUnder(world.workspace, "agent_extensions")
    .filter(([path]) => path.endsWith("/SKILL.md"))
    .map(([path]) => world.workspace.readFile(path));
  const settings = configuredSkills(world);
  const resolutions = acceptedSkillResolutions(world);
  for (const name of sourceSkills) {
    const isSelected = selected.includes(name);
    const content = skillDocument(name);
    expect(canonical.includes(content), `${name} canonical content`).toBe(isSelected);
    expect(settings[name] !== undefined, `${name} settings entry`).toBe(isSelected);
    expect(resolutions[name] !== undefined, `${name} accepted resolution`).toBe(isSelected);
    for (const agent of [".claude", ".agents"]) {
      const projected = `${agent}/skills/${name}/SKILL.md`;
      expect(world.workspace.exists(projected), projected).toBe(isSelected);
      if (isSelected) expect(world.workspace.readFile(projected)).toBe(content);
    }
  }
};

/** One row per way a request settles which of a source's skills to take. */
const selections = [
  { label: "one named skill", names: ["inspect-patch"], all: false, selected: ["inspect-patch"] },
  {
    label: "two named skills",
    names: ["trace-failure", "draft-changelog"],
    all: false,
    selected: ["trace-failure", "draft-changelog"],
  },
  {
    label: "a pattern over the skills",
    names: ["*-patch", "trace-*"],
    all: false,
    selected: ["inspect-patch", "trace-failure"],
  },
  { label: "every discovered skill", names: [], all: true, selected: sourceSkills },
] as const;

const writePack = (
  sourceRoot: string,
  name: string,
  dependencies: Readonly<Record<string, string>>,
): void => {
  const directory = nodePath.join(sourceRoot, "packs", name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    nodePath.join(directory, "pack.json"),
    `${JSON.stringify({
      owner: "@acme",
      type: "pack",
      name,
      version: "1.0.0",
      description: `The ${name} pack.`,
      dependencies,
    })}\n`,
  );
};

/**
 * A source that authors a Pack, the skill it brings, a skill and a rule of
 * their own, and keeps one skill it installed from another publisher.
 */
const writeSource = (world: InstallWorld): string => {
  const source = nodePath.join(world.workspace.root, "upstream");
  writeLocalSkillPackage(source, { name: "review" });
  writeLocalSkillPackage(source, { name: "lint" });
  writeLocalRulePackage(source, { name: "style" });
  writePack(source, "kit", { "@acme/skills/review": "^1.0.0" });
  writeLocalSkillPackage(nodePath.join(source, "agent_extensions", "registry.example", "@other"), {
    name: "audit",
    owner: "@other",
  });
  return source;
};

const declared = (world: InstallWorld, plural: string): ReadonlyArray<string> => {
  const entries = readSettings(world.workspace)[plural];
  return typeof entries === "object" && entries !== null ? Object.keys(entries).sort() : [];
};

describe("Select extensions from a supplied source", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("installs only the exact source path when two skills have the same name", () =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const source = nodePath.join(world.workspace.root, "vendor", "same-name-skills");
      for (const team of ["one", "two"]) {
        const directory = nodePath.join(source, team, "review");
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(nodePath.join(directory, "SKILL.md"), `# Review for ${team}\n`);
      }
      const before = snapshotDirectory(source);
      yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              names: ["two/review"],
              all: false,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer));
      const configured = Object.keys(configuredSkills(world));
      expect(configured).toHaveLength(1);
      expect(Object.keys(acceptedSkillResolutions(world))).toEqual(configured);
      for (const name of configured) {
        for (const agent of [".claude", ".agents"])
          expect(world.workspace.readFile(`${agent}/skills/${name}/SKILL.md`)).toBe(
            "# Review for two\n",
          );
      }
      expect(snapshotDirectory(source)).toEqual(before);
    }),
  );

  /** A workspace holding one unrelated installed skill that must not move. */
  const worldWithUnrelatedSkill = () =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const unrelated = writeLocalSkillPackage(world.workspace.root, {
        name: "existing-guidance",
        description: "Keep this unrelated installed guidance unchanged.",
      });
      yield* world.workspace
        .provide(applyInstall(installRequest({ subject: { kind: "source", source: unrelated } })))
        .pipe(Effect.provide(NodeServices.layer));
      const unrelatedBytes = fs.readFileSync(nodePath.join(unrelated, "src", "SKILL.md"), "utf8");
      expect(unrelatedBytes).toContain("Keep this unrelated installed guidance unchanged.");
      for (const agent of [".claude", ".agents"])
        expect(world.workspace.readFile(`${agent}/skills/existing-guidance/SKILL.md`)).toBe(
          unrelatedBytes,
        );
      return {
        world,
        unrelated,
        before: {
          source: snapshotDirectory(unrelated),
          settings: configuredSkills(world)["existing-guidance"],
          resolution: acceptedSkillResolutions(world)["existing-guidance"],
          bytes: unrelatedBytes,
          canonical: contentUnder(world.workspace, "agent_extensions"),
        },
      };
    });

  const expectUnrelatedPreserved = (
    world: InstallWorld,
    unrelated: string,
    before: {
      readonly source: Readonly<Record<string, string>>;
      readonly settings: unknown;
      readonly resolution: unknown;
      readonly bytes: string;
      readonly canonical: ReadonlyArray<readonly [string, string]>;
    },
  ): void => {
    expect(snapshotDirectory(unrelated)).toEqual(before.source);
    expect(configuredSkills(world)["existing-guidance"]).toEqual(before.settings);
    expect(acceptedSkillResolutions(world)["existing-guidance"]).toEqual(before.resolution);
    for (const agent of [".claude", ".agents"])
      expect(world.workspace.readFile(`${agent}/skills/existing-guidance/SKILL.md`)).toBe(
        before.bytes,
      );
    const after = new Map(contentUnder(world.workspace, "agent_extensions"));
    for (const [file, body] of before.canonical) expect(after.get(file)).toBe(body);
  };

  it.effect.each(selections)("$label selects actual source content", (row) =>
    Effect.gen(function* () {
      const { world, unrelated, before } = yield* worldWithUnrelatedSkill();
      const source = writeMultiSkillSource(world.workspace.root);
      const sourceBefore = snapshotDirectory(source);
      expect(Object.keys(sourceBefore).filter((file) => file.endsWith("SKILL.md"))).toHaveLength(3);

      yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              names: row.names,
              all: row.all,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer));

      expectSelection(world, row.selected);
      expect(snapshotDirectory(source)).toEqual(sourceBefore);
      expectUnrelatedPreserved(world, unrelated, before);
    }),
  );

  it.effect.each([
    {
      label: "a name that matches no skill",
      names: ["missing"],
      nonInteractive: false,
      category: "not_found",
      detail:
        "No skills matched: missing. Source contains: draft-changelog, inspect-patch, trace-failure",
    },
    {
      label: "an unattended request that names nothing",
      names: [],
      nonInteractive: true,
      category: "usage",
      detail: "--skill or --all is required to select skills when no prompt can open",
    },
  ])("$label refuses without installing anything", (row) =>
    Effect.gen(function* () {
      const { world, unrelated, before } = yield* worldWithUnrelatedSkill();
      const source = writeMultiSkillSource(world.workspace.root);
      const workspaceBefore = world.workspace.snapshot();

      const failure = yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              names: row.names,
              all: false,
              nonInteractive: row.nonInteractive,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.flip);

      expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
      expect(failure).toMatchObject({ category: row.category, detail: row.detail });
      expect(world.workspace.snapshot()).toEqual(workspaceBefore);
      expectUnrelatedPreserved(world, unrelated, before);
    }),
  );

  it.effect.each([
    { label: "one named subagent", names: ["planner"], all: false, selected: ["planner"] },
    { label: "every discovered subagent", names: [], all: true, selected: sourceSubagents },
  ])("$label selects through the same policy", (row) =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const source = writeMultiSubagentSource(world.workspace.root);

      yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "subagent",
              subject: { kind: "source", source },
              names: row.names,
              all: row.all,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer));

      for (const name of sourceSubagents) {
        const isSelected = row.selected.includes(name);
        expect(world.workspace.exists(`.claude/agents/${name}.md`), name).toBe(isSelected);
      }
    }),
  );

  it.effect("a subagent name that matches nothing refuses as not found", () =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const source = writeMultiSubagentSource(world.workspace.root);
      const workspaceBefore = world.workspace.snapshot();

      const failure = yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "subagent",
              subject: { kind: "source", source },
              names: ["missing"],
              all: false,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.flip);

      expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
      expect(failure).toMatchObject({
        category: "not_found",
        detail: "No subagents matched: missing. Source contains: planner, reviewer",
      });
      expect(world.workspace.snapshot()).toEqual(workspaceBefore);
    }),
  );

  it.effect("selecting every skill opens no selection interaction even when one is available", () =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const source = writeMultiSkillSource(world.workspace.root);
      const sourceBefore = snapshotDirectory(source);
      // A port that refuses to be opened: the only way this example passes is
      // if the all-selection never asks which skills to take.
      const refusingSelection = Layer.succeed(InstallSelectionInteraction, {
        select: () => Effect.die(new Error("An all selection opened a selection prompt")),
      });

      yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              names: [],
              all: true,
              // Interaction is available: refusing to prompt is a decision,
              // not a consequence of unattended operation.
              nonInteractive: false,
            }),
          ).pipe(Effect.provide(refusingSelection)),
        )
        .pipe(Effect.provide(NodeServices.layer));

      expectSelection(world, sourceSkills);
      expect(snapshotDirectory(source)).toEqual(sourceBefore);
    }),
  );

  it.effect("asks one question covering every type, and takes only what was chosen", () => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    const source = writeSource(created);
    const questions: Array<ReadonlyArray<InstallSelectionCandidate>> = [];

    return created.workspace
      .provide(
        applyInstall(
          installRequest({
            subject: { kind: "source", source },
            selectors: {},
            all: false,
            nonInteractive: false,
          }),
        ).pipe(
          Effect.provideService(InstallSelectionInteraction, {
            select: (candidates) => {
              questions.push(candidates);
              return Effect.succeed(
                candidates.filter(({ name }) => name === "kit" || name === "style"),
              );
            },
          }),
        ),
      )
      .pipe(
        Effect.tap((resolution) =>
          Effect.sync(() => {
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(
              questions.map((asked) => asked.map(({ type, name }) => `${type}:${name}`)),
            ).toEqual([["pack:kit", "skill:lint", "skill:review", "rule:style"]]);
            expect(questions[0]?.[0]?.brings).toEqual([{ type: "skill", name: "review" }]);
            expect(declared(created, "packs")).toEqual(["kit"]);
            expect(declared(created, "rules")).toEqual(["style"]);
            // The Pack brought its member; nobody chose it directly.
            expect(declared(created, "skills")).toEqual([]);
            expect(created.workspace.readFile("axm-lock.yaml")).toContain("review");
          }),
        ),
        Effect.provide(NodeServices.layer),
      );
  });

  it.effect("--all takes every Pack and what no Pack brings, leaving acquired copies", () => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    const source = writeSource(created);

    return created.workspace
      .provide(
        applyInstall(
          installRequest({ subject: { kind: "source", source }, selectors: {}, all: true }),
        ),
      )
      .pipe(
        Effect.tap((resolution) =>
          Effect.sync(() => {
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(declared(created, "packs")).toEqual(["kit"]);
            expect(declared(created, "skills")).toEqual(["lint"]);
            expect(declared(created, "rules")).toEqual(["style"]);
            expect(created.workspace.readFile("axm-lock.yaml")).not.toContain("audit");
          }),
        ),
        Effect.provide(NodeServices.layer),
      );
  });

  it.effect("installs an acquired copy when the request names it", () => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    const source = writeSource(created);

    return created.workspace
      .provide(
        applyInstall(
          installRequest({
            subject: { kind: "source", source },
            selectors: { skill: ["audit"] },
          }),
        ),
      )
      .pipe(
        Effect.tap((resolution) =>
          Effect.sync(() => {
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(declared(created, "skills")).toEqual(["audit"]);
          }),
        ),
        Effect.provide(NodeServices.layer),
      );
  });

  it.effect("keeps both routes, as one unit, for a member also chosen directly", () => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    const source = writeSource(created);

    return created.workspace
      .provide(
        applyInstall(
          installRequest({
            subject: { kind: "source", source },
            selectors: { pack: ["kit"], skill: ["review"] },
          }),
        ),
      )
      .pipe(
        Effect.tap((resolution) =>
          Effect.sync(() => {
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(resolution.units.map((unit) => unit.id)).toEqual([
              "skills/review, @acme/packs/kit",
            ]);
            expect(declared(created, "packs")).toEqual(["kit"]);
            expect(declared(created, "skills")).toEqual(["review"]);
          }),
        ),
        Effect.provide(NodeServices.layer),
      );
  });

  it.effect("refuses --all together with a per-type selector", () => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    const source = writeSource(created);

    return created.workspace
      .provide(
        applyInstall(
          installRequest({
            subject: { kind: "source", source },
            selectors: { skill: ["review"] },
            all: true,
          }),
        ),
      )
      .pipe(
        Effect.flip,
        Effect.tap((failure) =>
          Effect.sync(() => {
            expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
            expect(failure).toMatchObject({
              category: "usage",
              detail: "--all cannot be combined with a per-type selector",
            });
            expect(declared(created, "skills")).toEqual([]);
          }),
        ),
        Effect.provide(NodeServices.layer),
      );
  });
});
