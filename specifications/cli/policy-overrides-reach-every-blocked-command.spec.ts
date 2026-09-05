import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { CliConfig, Command, GlobalFlag } from "effect/unstable/cli";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  TEST_VERSION,
  collectHelpFiles,
  handleInstall,
  handleSkillsInstall,
  handleSync,
  handleUpdate,
  handleWorkspaceUpdate,
  makeAxmSkillCompatibilityPolicyLayer,
  makeCliTestContext,
  rootCommand,
} from "axm.sh/specification-harness";
import {
  AuthLoginInteractionTest,
  DeviceLoginInteractionTest,
} from "@agentxm/registry-auth/testing";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { makeSpecRegistry } from "../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/policy-overrides-reach-every-blocked-command",
  title: "The one-shot release-age override reaches every command the gate can block",
  statement:
    "Every command whose outcome the minimum release age can change shall accept --ignore-release-age; that flag shall carry the same one-shot meaning on every command that accepts it; and no other flag shall grant that bypass.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["contract", "decision-table", "static"],
  derivedFrom: ["cli/force-bypasses-only-named-policies"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether enabling an already-installed extension should resolve from source at all, or should read only the accepted resolution and never reach the gate. Activation accepts the override today because the gate can block it today; deciding that question may remove activation from the gated inventory instead.",
  ],
  limitations: [
    {
      limitation:
        "The one-shot meaning is exercised through each handler the flag reaches — root install, root update, sync, the shared workspace install, and the shared workspace update — rather than once per registered command path. Commands routing into the same handler share its behavior by construction, and the registration and parser checks below do cover every path.",
      retirementCondition:
        "The specification harness exports a driver for every gate-blockable command path, letting the decision table run per path.",
    },
  ],
});

const OVERRIDE = "--ignore-release-age";
const SHARED_DESCRIPTION =
  "Take a release younger than the configured minimum release age, for this run only";

const SKILL = "reviewer";
const FQN = `@acme/skills/${SKILL}`;

/**
 * Every `withReleaseAgePosture` call site in the CLI, as `[file, argument]`.
 *
 * The posture is a declared input, so a command that consults the gate cannot
 * compile without discharging it here. Reading the argument at each site is
 * what keeps a command from discharging it with a hard-coded decision instead
 * of the flag the operator can see.
 */
const postureCallSites = (): ReadonlyArray<readonly [string, string]> => {
  const commandRoot = path.resolve(import.meta.dirname, "../../packages/cli/src");
  const sites: Array<readonly [string, string]> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.includes(".test.")) continue;
      const source = fs.readFileSync(entryPath, "utf8");
      for (const match of source.matchAll(/withReleaseAgePosture\(([^)]*)\)/gu)) {
        sites.push([path.relative(commandRoot, entryPath), (match[1] ?? "").trim()]);
      }
    }
  };
  walk(commandRoot);
  return sites;
};

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

/** The version the gate withholds, and the version it would leave in place. */
interface HeldFixture {
  readonly workspace: SpecWorkspace;
  /** The version the gate holds; taking the override selects exactly this. */
  readonly heldVersion: string;
  /** The version the workspace keeps while the hold stands, if any. */
  readonly keptVersion?: string;
}

const makeUnagedWorkspace = (
  cleanups: Array<() => void>,
  posture: "enforce" | "ignore" | undefined,
  versions: ReadonlyArray<{ readonly version: string; readonly unaged?: boolean }>,
) => {
  const registry = makeSpecRegistry();
  cleanups.push(registry.cleanup);
  registry.writeSkill(
    SKILL,
    versions.map(({ version, unaged }) => ({
      version,
      body: `Guidance ${version}.`,
      ...(unaged === true ? { published: new Date().toISOString() } : {}),
    })),
  );
  const workspace = makeSpecWorkspace({
    machine: true,
    flags: { json: true },
    ...(posture === undefined ? {} : { releaseAgePosture: posture }),
    settings: { sources: [registry.source], skills: { [SKILL]: FQN } },
  });
  cleanups.push(workspace.cleanup);
  return { registry, workspace };
};

/**
 * An accepted, aged 1.0.0 with an unaged 2.0.0 behind it: the resolution
 * forms below can reach 2.0.0, and the gate is the only thing in the way.
 */
const heldNewerRelease = (
  cleanups: Array<() => void>,
  posture?: "enforce" | "ignore",
): Effect.Effect<HeldFixture> =>
  Effect.gen(function* () {
    const { registry, workspace } = makeUnagedWorkspace(cleanups, posture, [{ version: "1.0.0" }]);
    yield* handleInstall({
      source: Option.none(),
      yes: true,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer), Effect.orDie);
    expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
    registry.writeSkill(SKILL, [
      { version: "1.0.0", body: "Guidance 1.0.0." },
      { version: "2.0.0", body: "Guidance 2.0.0.", published: new Date().toISOString() },
    ]);
    workspace.rendererState.results.splice(0);
    return { workspace, heldVersion: "2.0.0", keptVersion: "1.0.0" };
  });

/**
 * A configured skill whose only release is unaged and which nothing has
 * accepted yet — the shape materialization meets, where the gate decides
 * whether the entry can be realized at all.
 */
const heldOnlyRelease = (
  cleanups: Array<() => void>,
  posture?: "enforce" | "ignore",
): Effect.Effect<HeldFixture> =>
  Effect.sync(() => {
    const { workspace } = makeUnagedWorkspace(cleanups, posture, [
      { version: "1.0.0", unaged: true },
    ]);
    return { workspace, heldVersion: "1.0.0" };
  });

/**
 * One driver per handler the override reaches. Every registered command the
 * gate can block routes into one of these. `--yes` is always given, so a hold
 * that survives is a hold `--yes` did not lift.
 */
const blockedForms: ReadonlyArray<{
  readonly form: string;
  readonly fixture: (
    cleanups: Array<() => void>,
    posture?: "enforce" | "ignore",
  ) => Effect.Effect<HeldFixture>;
  readonly run: (workspace: SpecWorkspace) => Effect.Effect<void, unknown>;
}> = [
  {
    form: "root install",
    fixture: heldNewerRelease,
    run: (workspace) =>
      handleInstall({ source: Option.none(), yes: true, force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      ),
  },
  {
    form: "root update",
    fixture: heldNewerRelease,
    run: (workspace) =>
      handleUpdate({ source: Option.none(), yes: true, force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      ),
  },
  {
    form: "sync",
    fixture: heldOnlyRelease,
    run: (workspace) => handleSync({ preview: false }).pipe(Effect.provide(workspace.layer)),
  },
  {
    form: "the shared workspace install",
    fixture: heldNewerRelease,
    run: (workspace) =>
      handleSkillsInstall(
        { source: Option.none(), skills: [], all: false },
        { yes: true, force: false, preview: false },
      ).pipe(Effect.provide(workspace.layer)),
  },
  {
    form: "the shared workspace update",
    fixture: heldNewerRelease,
    run: (workspace) =>
      handleWorkspaceUpdate({
        command: "skills.update",
        type: Option.some("skill"),
        planName: "Update skills",
        planDescription: Option.some("Update configured skills"),
        flags: { yes: true, preview: false },
      }).pipe(Effect.provide(workspace.layer)),
  },
];

describe("The one-shot release-age override", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("carries one definition everywhere it is registered", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const registered: string[] = [];
      const divergent: string[] = [];
      for (const [commandPath, doc] of helpFiles) {
        const flag = doc.flags.find((candidate) => `--${candidate.name}` === OVERRIDE);
        if (flag === undefined) continue;
        registered.push(commandPath);
        if (Option.getOrElse(flag.description, () => "") !== SHARED_DESCRIPTION) {
          divergent.push(commandPath);
        }
      }
      expect(divergent).toEqual([]);
      // The gate reaches installs, updates, activation, materialization, and
      // demotion; a surface this size is only coherent from one definition.
      expect(registered.length).toBeGreaterThan(15);
    }),
  );

  it.effect("is the one flag that grants the bypass", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const impostors: string[] = [];
      for (const [commandPath, doc] of helpFiles) {
        for (const flag of doc.flags) {
          const rendered = `--${flag.name}`;
          if (rendered === OVERRIDE) continue;
          if (Option.getOrElse(flag.description, () => "").includes("minimum release age")) {
            impostors.push(`${commandPath}: ${rendered}`);
          }
        }
      }
      expect(impostors).toEqual([]);
    }),
  );

  it("takes its posture from a parsed flag at every command boundary", () => {
    const sites = postureCallSites();
    expect(sites.length).toBeGreaterThan(15);
    const hardCoded = sites.filter(([, argument]) => !argument.endsWith("ignoreReleaseAge"));
    expect(hardCoded).toEqual([]);
  });

  it.effect("is accepted by the parser on every command that registers it", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const directory = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-override-")),
      );
      cleanups.push(() => fs.rmSync(directory, { recursive: true, force: true }));
      const context = makeCliTestContext({ machine: true, flags: { json: true } });
      // The product registers help as its only built-in flag; the parser
      // default would add a version flag colliding with the verbose alias.
      const parserLayer = Layer.mergeAll(
        context.baseLayer,
        CliConfig.layer({ builtIns: [GlobalFlag.Help] }),
        makeAxmSkillCompatibilityPolicyLayer(TEST_VERSION),
        AuthLoginInteractionTest().layer,
        DeviceLoginInteractionTest().layer,
      );

      const unrecognized: string[] = [];
      for (const [commandPath, doc] of helpFiles) {
        if (!doc.flags.some((flag) => `--${flag.name}` === OVERRIDE)) continue;
        const args = commandPath
          .replace(/^axm ?/u, "")
          .split(" ")
          .filter(Boolean);
        // `--help` settles parsing before the command runs, so this reads the
        // parser's flag surface without performing any workspace work.
        const outcome = yield* Command.runWith(rootCommand, {
          version: TEST_VERSION,
          renderErrors: false,
        })(["--directory", directory, ...args, OVERRIDE, "--help"]).pipe(
          Effect.provide(parserLayer),
          Effect.result,
        );
        if (Result.isFailure(outcome) && JSON.stringify(outcome).includes("UnrecognizedOption")) {
          unrecognized.push(commandPath);
        }
      }
      expect(unrecognized).toEqual([]);
    }),
  );

  it.effect.each(blockedForms)("$form withholds the held release without the override", (row) =>
    Effect.gen(function* () {
      const { workspace, heldVersion, keptVersion } = yield* row.fixture(cleanups);

      const outcome = yield* row.run(workspace).pipe(Effect.result);

      const reported = Result.isFailure(outcome)
        ? JSON.stringify(outcome.failure)
        : JSON.stringify(workspace.rendererState.results);
      // The machine record names the reason `minimum-release-age`; a refusal
      // renders the same policy in prose.
      expect(reported).toMatch(/minimum[ -]release[ -]age/iu);
      expect(workspace.readLockfileText()).not.toContain(`resolvedVersion: ${heldVersion}`);
      if (keptVersion !== undefined) {
        expect(workspace.readLockfileText()).toContain(`resolvedVersion: ${keptVersion}`);
      }
    }),
  );

  it.effect.each(blockedForms)("$form takes the held release with the override", (row) =>
    Effect.gen(function* () {
      const { workspace, heldVersion } = yield* row.fixture(cleanups, "ignore");

      yield* row.run(workspace);

      expect(JSON.stringify(workspace.rendererState.results)).toContain("ignore-flag");
      expect(workspace.readLockfileText()).toContain(`resolvedVersion: ${heldVersion}`);
    }),
  );
});
