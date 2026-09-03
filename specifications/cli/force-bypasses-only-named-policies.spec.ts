import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  collectHelpFiles,
  getAppError,
  handleInstall,
  handleSkillsInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { makeSpecRegistry } from "../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/force-bypasses-only-named-policies",
  title: "Override flags bypass only the one policy they name",
  statement:
    "No command shall expose a bare --force flag; every override flag a command exposes shall name in its help text the one policy it bypasses, and a request carrying that flag shall bypass that policy while remaining subject to every other policy.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["contract", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * Every override flag the CLI exposes and the exact policy its help names.
 * Adding an override means naming its policy here — a generic "force it"
 * flag cannot enter the surface silently.
 */
const NAMED_OVERRIDE_FLAGS: Readonly<Record<string, string>> = {
  "--reinstall": "reinstall",
  "--ignore-release-age": "release",
};

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const canonicalSkillDocument = "agent_extensions/local/vendor/code-review/src/SKILL.md";
const projectedSkillDocument = ".claude/skills/code-review/SKILL.md";

/**
 * The two command forms that expose `--reinstall` for a sourced install. Both
 * name the same policy — installed content is reused rather than re-acquired —
 * so both must bypass it when the flag is given.
 */
const reinstallForms = [
  {
    form: "root install",
    install: (source: string, force: boolean) =>
      handleInstall({ source: Option.some(source), yes: true, force, preview: false }),
  },
  {
    form: "skills install",
    install: (source: string, force: boolean) =>
      handleSkillsInstall(
        { source: Option.some(source), skills: [], all: true },
        { yes: true, force, preview: false },
      ),
  },
] as const;

/** A workspace whose configured Registry skill was published moments ago. */
const heldReleaseWorkspace = (cleanups: Array<() => void>) => {
  const registry = makeSpecRegistry();
  cleanups.push(registry.cleanup);
  registry.writeSkill("fresh", [
    { version: "1.0.0", body: "Fresh guidance.", published: new Date().toISOString() },
  ]);
  const workspace = makeSpecWorkspace({
    machine: true,
    flags: { json: true },
    settings: { sources: [registry.source], skills: { fresh: "@acme/skills/fresh" } },
  });
  cleanups.push(workspace.cleanup);
  return workspace;
};

const configuredInstall = (
  workspace: SpecWorkspace,
  flags: { readonly force: boolean; readonly ignoreReleaseAge: boolean },
) =>
  handleInstall({ source: Option.none(), yes: true, preview: false, ...flags }).pipe(
    Effect.provide(workspace.layer),
  );

const expectNothingInstalled = (workspace: SpecWorkspace, name: string): void => {
  expect(workspace.rendererState.results).toEqual([]);
  expect(workspace.readLockfileText()).not.toContain(name);
  expect(workspace.snapshotTree("agent_extensions")).toEqual([]);
  expect(workspace.exists(`.claude/skills/${name}`)).toBe(false);
};

describe("Override flags", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("every override flag documents the one policy it bypasses", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const undocumented: string[] = [];
      for (const [commandPath, doc] of helpFiles) {
        for (const flag of doc.flags) {
          const rendered = `--${flag.name}`;
          if (rendered === "--force") {
            undocumented.push(`${commandPath}: bare --force flag`);
            continue;
          }
          if (rendered in NAMED_OVERRIDE_FLAGS) {
            const policyWord = NAMED_OVERRIDE_FLAGS[rendered] ?? "";
            const description = Option.getOrElse(flag.description, () => "").toLowerCase();
            if (!description.includes(policyWord)) {
              undocumented.push(`${commandPath}: ${rendered} does not name its policy`);
            }
          }
        }
      }
      expect(undocumented).toEqual([]);
    }),
  );

  it.effect.each(reinstallForms)(
    "$form --reinstall re-realizes revised source content only when the flag is given",
    ({ install }) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        const source = writeLocalSkillPackage(workspace.root, {
          name: "code-review",
          body: "First guidance.",
        });
        yield* install(source, false).pipe(Effect.provide(workspace.layer));
        expect(workspace.readFile(canonicalSkillDocument)).toContain("First guidance.");
        writeLocalSkillPackage(workspace.root, { name: "code-review", body: "Revised guidance." });

        yield* install(source, false).pipe(Effect.provide(workspace.layer));
        expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
          result: { outcome: "no-op" },
        });
        expect(workspace.readFile(canonicalSkillDocument)).toContain("First guidance.");
        expect(workspace.readFile(projectedSkillDocument)).toContain("First guidance.");

        yield* install(source, true).pipe(Effect.provide(workspace.layer));
        expect(workspace.readFile(canonicalSkillDocument)).toContain("Revised guidance.");
        expect(workspace.readFile(projectedSkillDocument)).toContain("Revised guidance.");
      }),
  );

  it.effect.each([
    { override: "no override flag", force: false },
    { override: "--reinstall, which names a different policy", force: true },
  ])("a configured install stays held by the minimum release age with $override", ({ force }) =>
    Effect.gen(function* () {
      const workspace = heldReleaseWorkspace(cleanups);

      const failure = yield* configuredInstall(workspace, { force, ignoreReleaseAge: false }).pipe(
        Effect.flip,
      );

      const error = getAppError(failure);
      expect(error.title).toBe("Release held by minimum release age");
      expect(error.detail).toContain("@acme/skills/fresh@1.0.0");
      expectNothingInstalled(workspace, "fresh");
    }),
  );

  it.effect("--ignore-release-age lifts the minimum release age hold it names", () =>
    Effect.gen(function* () {
      const workspace = heldReleaseWorkspace(cleanups);

      yield* configuredInstall(workspace, { force: false, ignoreReleaseAge: true });

      const document = workspace.rendererState.results.at(-1)?.data;
      expect(document).toMatchObject({ result: { outcome: "applied" } });
      expect(JSON.stringify(document)).toContain("ignore-flag");
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readFile(".claude/skills/fresh/SKILL.md")).toContain("Fresh guidance.");
    }),
  );

  it.effect.each([
    { override: "no override flag", ignoreReleaseAge: false },
    { override: "--ignore-release-age, which names a different policy", ignoreReleaseAge: true },
  ])(
    "a configured version constraint no release satisfies stays unsatisfied with $override",
    ({ ignoreReleaseAge }) =>
      Effect.gen(function* () {
        const registry = makeSpecRegistry();
        cleanups.push(registry.cleanup);
        registry.writeSkill("stable", [{ version: "1.0.0", body: "Stable guidance." }]);
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: {
            sources: [registry.source],
            skills: { stable: "@acme/skills/stable@^2.0.0" },
          },
        });
        cleanups.push(workspace.cleanup);

        const failure = yield* configuredInstall(workspace, {
          force: false,
          ignoreReleaseAge,
        }).pipe(Effect.flip);

        const error = getAppError(failure);
        expect(error.title).toBe("No compatible version");
        expect(error.detail).toContain("^2.0.0");
        expectNothingInstalled(workspace, "stable");
      }),
  );
});
