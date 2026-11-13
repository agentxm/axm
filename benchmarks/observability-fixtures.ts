/** Real CLI fixtures. Source bytes, preparation and external services are shared by matched pairs. */
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import { resolveAxmCacheRootPure } from "@agentxm/host-primitives";
import type { OperationPhase } from "@agentxm/workspace-kernel/operations";
import { controlNetwork } from "../scripts/registry-network/control.js";
import {
  startLifecycleRegistry,
  type LifecycleRegistry,
  type RequestRecord,
} from "./lifecycle-registry.js";
import { startLifecycleGitSource, writeSkillPackage } from "./lifecycle-sources.js";
import { prepareTypedObservabilityFixtures } from "./observability-typed-fixtures.js";
import { prepareAuthObservabilityFixtures } from "./observability-auth-fixtures.js";
import { prepareMaintenanceObservabilityFixtures } from "./observability-maintenance-fixtures.js";
import { observabilityRiskScenarios } from "./observability-coverage.js";
import { fixtureFailure } from "./observability-contract.js";
import {
  digest,
  projectComparisonField,
  snapshotDigest,
  snapshotTree,
} from "./observability-process.js";

export interface WorkspaceTemplate {
  readonly workspace: string;
  readonly home: string;
}

/** Supplied by a fixture's independent server/process/state record, never by telemetry. */
export interface IndependentWorkExpectation {
  readonly kind: string;
  readonly ownerName?: string;
  readonly ownerAttributes?: Readonly<Record<string, string | boolean>>;
  readonly dimensions?: Readonly<Record<string, string | boolean>>;
  readonly count?: number;
  readonly requested?: number;
  readonly executed?: number;
  readonly reused?: number;
  readonly bytes?: number;
  readonly ioBytes?: number;
  readonly archiveBytes?: number;
  readonly workCount?: number;
  readonly batchItems?: number;
  readonly registryBatchItems?: number;
  readonly archiveEntries?: number;
  readonly deniedItems?: number;
}

export interface ObservabilityScenario {
  readonly id: string;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly template: WorkspaceTemplate;
  readonly condition: {
    readonly source: "registry" | "git" | "path" | "authored" | "local";
    readonly extensions: number;
    readonly cache: "cold" | "warm" | "not-applicable";
    readonly network: "baseline" | "typical" | "slow" | "not-applicable";
    readonly archiveBodyDelayMillis: number;
  };
  readonly json?: boolean;
  /** Explicit detail scope for this execution family; aggregates always cover all work. */
  readonly detailPhase?: OperationPhase;
  /** Preview preflight protects workspace and non-cache home state. */
  readonly preserveState?: boolean;
  readonly activate?: Effect.Effect<void, unknown>;
  /** Nonzero outcomes require an explicit semantic/state verifier. */
  readonly expectedExitCode?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly registry?: LifecycleRegistry;
  readonly requests?: () => ReadonlyArray<RequestRecord>;
  readonly workExpectations?: () => ReadonlyArray<IndependentWorkExpectation>;
  readonly prepare?: (
    fixture: WorkspaceTemplate,
    invoke: PrepareInvocation,
  ) => Effect.Effect<void, unknown>;
  readonly external?: {
    readonly reset: Effect.Effect<void, unknown>;
    readonly snapshot: () => unknown;
    readonly protectedState?: () => unknown;
    readonly comparison?: () => unknown;
    readonly comparisonDescription?: string;
  };
  readonly verify?: (observed: {
    readonly fixture: WorkspaceTemplate;
    readonly stdout: string;
    readonly stderr: string;
    readonly startedAtMillis: number;
    readonly endedAtMillis: number;
  }) => Effect.Effect<
    {
      readonly assertions: ReadonlyArray<string>;
      readonly stdoutComparison?: string;
      readonly retainedArtifacts?: ReadonlyArray<{
        readonly name: string;
        readonly source: string;
      }>;
      readonly fileComparisons?: ReadonlyArray<{
        readonly container: "workspace" | "home";
        readonly path: string;
        readonly sha256: string;
        readonly reason: string;
      }>;
    },
    unknown
  >;
}

export type PrepareInvocation = (
  fixture: WorkspaceTemplate,
  args: ReadonlyArray<string>,
  options?: {
    readonly json?: boolean;
    readonly environment?: Readonly<Record<string, string>>;
    readonly expectedExitCode?: number | "nonzero";
  },
) => Effect.Effect<
  { readonly stdout: string; readonly stderr: string; readonly exitCode: number },
  unknown
>;

export const copyTemplate = (source: WorkspaceTemplate, destination: string): WorkspaceTemplate => {
  const workspace = path.join(destination, "workspace");
  const home = path.join(destination, "home");
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source.workspace, workspace, {
    recursive: true,
    verbatimSymlinks: true,
    preserveTimestamps: true,
  });
  fs.cpSync(source.home, home, {
    recursive: true,
    verbatimSymlinks: true,
    preserveTimestamps: true,
  });
  return { workspace, home };
};

const clearArchiveCache = (home: string) => {
  const cache = resolveAxmCacheRootPure(path.join, process.platform, home, { axmUserHome: home });
  fs.rmSync(cache, { recursive: true, force: true });
};

const emptyTemplate = (root: string): WorkspaceTemplate => {
  const result = { workspace: path.join(root, "workspace"), home: path.join(root, "home") };
  fs.mkdirSync(result.workspace, { recursive: true });
  fs.mkdirSync(result.home, { recursive: true });
  return result;
};

const settings = (fixture: WorkspaceTemplate, value: unknown): void =>
  fs.writeFileSync(path.join(fixture.workspace, "axm.json"), JSON.stringify(value) + "\n");

const localCondition = {
  source: "local",
  extensions: 0,
  cache: "not-applicable",
  network: "not-applicable",
  archiveBodyDelayMillis: 0,
} as const;

export const prepareObservabilityFixtures = Effect.fnUntraced(function* (
  root: string,
  invoke: PrepareInvocation,
  options: { readonly proxyApi: string; readonly proxyPort: number },
) {
  const scenarios: ObservabilityScenario[] = [];
  const proxyOwner = path.join(root, "proxy-owner");
  const registryOrigin = "http://127.0.0.1:" + options.proxyPort;
  const selectProfile = (upstream: string, profile: "baseline" | "typical" | "slow") =>
    controlNetwork({ action: "stop", worktree: proxyOwner, api: options.proxyApi }).pipe(
      Effect.andThen(
        controlNetwork({
          action: "start",
          worktree: proxyOwner,
          api: options.proxyApi,
          upstream,
          port: options.proxyPort,
          profile,
        }),
      ),
    );
  yield* Effect.addFinalizer(() =>
    controlNetwork({ action: "stop", worktree: proxyOwner, api: options.proxyApi }).pipe(
      Effect.ignore,
    ),
  );

  const registryCases = new Set<string>([
    "registry/1/list/warm/baseline",
    "registry/1/view/cold/baseline",
    "registry/1/install/cold/baseline",
    "registry/1/update/warm/baseline",
    "registry/1/sync-restore/cold/baseline",
    ...observabilityRiskScenarios,
  ]);
  for (const count of [1, 10, 50]) {
    const fixture = yield* Effect.acquireRelease(
      Effect.sync(() => makeFileRegistry()),
      (registry) => Effect.sync(() => registry.cleanup()),
    );
    const registry = yield* Effect.acquireRelease(
      Effect.promise(() => startLifecycleRegistry(fixture.root, 100)),
      (server) => Effect.promise(() => server.close()),
    );
    yield* selectProfile(registry.url, "baseline");
    const names = Array.from(
      { length: count },
      (_, index) => "bench-" + String(index + 1).padStart(3, "0"),
    );
    for (const name of names)
      fixture.writeSkill(name, [{ version: "1.0.0", body: "Baseline " + name + "." }]);
    const configured = emptyTemplate(path.join(root, "registry-" + count, "configured"));
    yield* invoke(configured, ["setup", "--yes", "--scope", "project", "--agent", "claude-code"]);
    settings(configured, {
      owner: "@acme",
      agents: ["claude-code"],
      defaultRegistry: "test",
      minimumReleaseAge: "0s",
      sources: [{ name: "test", type: "registry", location: registryOrigin }],
      skills: Object.fromEntries(names.map((name) => [name, "@acme/skills/" + name])),
    });
    const installed = copyTemplate(configured, path.join(root, "registry-" + count, "installed"));
    yield* invoke(installed, ["sync"]);
    const restore = copyTemplate(installed, path.join(root, "registry-" + count, "restore"));
    fs.rmSync(path.join(restore.workspace, "agent_extensions"), { recursive: true, force: true });
    for (const name of names)
      fixture.writeSkill(name, [
        { version: "1.0.0", body: "Baseline " + name + "." },
        { version: "2.0.0", body: "Updated " + name + "." },
      ]);
    const updated = copyTemplate(installed, path.join(root, "registry-" + count, "updated"));
    yield* invoke(updated, ["update"]);
    const install = copyTemplate(configured, path.join(root, "registry-" + count, "install"));
    fs.rmSync(install.home, { recursive: true });
    fs.cpSync(updated.home, install.home, { recursive: true, preserveTimestamps: true });
    const update = copyTemplate(installed, path.join(root, "registry-" + count, "update"));
    fs.rmSync(update.home, { recursive: true });
    fs.cpSync(updated.home, update.home, { recursive: true, preserveTimestamps: true });

    const cases = [
      { name: "list", command: "list", args: ["list"], template: installed },
      {
        name: "view",
        command: "view",
        args: ["view", "@acme/skills/bench-001"],
        template: installed,
      },
      {
        name: "install",
        command: "install",
        args: ["install", "@acme/skills/bench-001"],
        template: install,
      },
      { name: "sync-restore", command: "sync", args: ["sync"], template: restore },
      { name: "sync-noop", command: "sync", args: ["sync"], template: installed },
      { name: "update", command: "update", args: ["update"], template: update },
    ];
    for (const item of cases)
      for (const cache of ["cold", "warm"] as const)
        for (const network of ["baseline", "typical", "slow"] as const) {
          if (
            !registryCases.has("registry/" + count + "/" + item.name + "/" + cache + "/" + network)
          )
            continue;
          const template = copyTemplate(
            item.template,
            path.join(root, "registry-" + count, item.name + "-" + cache + "-" + network),
          );
          if (cache === "cold") clearArchiveCache(template.home);
          scenarios.push({
            id: "registry/" + count + "/" + item.name + "/" + cache + "/" + network,
            command: item.command,
            args: item.args,
            template,
            registry,
            ...(item.name === "sync-restore" ? { detailPhase: "acquisition" as const } : {}),
            condition: {
              source: "registry",
              extensions: count,
              cache,
              network,
              archiveBodyDelayMillis: 100,
            },
          });
        }

    // Additional routes use the same real accepted package, with independent copied state.
    if (count === 1) {
      for (const item of [
        { command: "skills list", args: ["skills", "list"] },
        { command: "skills show", args: ["skills", "show", "bench-001"] },
        { command: "skills install", args: ["skills", "install", "@acme/skills/bench-001"] },
        { command: "skills update", args: ["skills", "update", "bench-001"] },
        { command: "skills uninstall", args: ["skills", "uninstall", "bench-001"] },
        { command: "uninstall", args: ["uninstall", "@acme/skills/bench-001"] },
        { command: "disable", args: ["disable", "@acme/skills/bench-001"] },
        { command: "skills disable", args: ["skills", "disable", "bench-001"] },
        { command: "lock export", args: ["lock", "export", "--format", "cyclonedx"] },
        { command: "cache status", args: ["cache", "status"] },
        { command: "cache verify", args: ["cache", "verify"] },
        { command: "cache prune", args: ["cache", "prune"] },
      ])
        scenarios.push({
          id: "installed/" + item.command.replaceAll(" ", "-"),
          ...item,
          template: installed,
          registry,
          condition: {
            source: "registry",
            extensions: count,
            cache: "warm",
            network: "baseline",
            archiveBodyDelayMillis: 100,
          },
        });
      for (const enabled of [false, true]) {
        let acquiredRelative = "";
        let acquiredDigest = "";
        let settingsDigest = "";
        let lockDigest = "";
        scenarios.push({
          id: "installed/adopt-" + (enabled ? "enabled-native-refusal" : "disabled"),
          command: "adopt",
          args: ["adopt", "@acme/skills/bench-001"],
          template: configured,
          registry,
          ...(enabled ? { expectedExitCode: 10 } : {}),
          condition: {
            source: "registry",
            extensions: 1,
            cache: "warm",
            network: "baseline",
            archiveBodyDelayMillis: 100,
          },
          prepare: (fixture, prepare) =>
            Effect.gen(function* () {
              yield* prepare(fixture, ["sync"]);
              if (!enabled) yield* prepare(fixture, ["disable", "@acme/skills/bench-001"]);
              const manifests = fs
                .readdirSync(path.join(fixture.workspace, "agent_extensions"), { recursive: true })
                .filter(
                  (entry) => typeof entry === "string" && entry.endsWith("/bench-001/skill.json"),
                );
              const manifest = manifests[0];
              if (manifests.length !== 1 || typeof manifest !== "string")
                return yield* fixtureFailure(
                  "Adoption fixture requires one independently acquired package.",
                );
              acquiredRelative = path.join("agent_extensions", path.dirname(manifest));
              acquiredDigest = snapshotDigest(
                snapshotTree(path.join(fixture.workspace, acquiredRelative), []),
              );
              settingsDigest = digest(fs.readFileSync(path.join(fixture.workspace, "axm.json")));
              lockDigest = digest(fs.readFileSync(path.join(fixture.workspace, "axm.lock")));
            }),
          verify: ({ fixture, stdout }) =>
            Effect.gen(function* () {
              const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
                stdout,
              );
              const document = yield* Schema.decodeUnknownEffect(
                Schema.Struct({
                  ok: Schema.Boolean,
                  result: Schema.Struct({
                    contract: Schema.Literal("plan-result-v4"),
                    outcome: Schema.String,
                    failure: Schema.optional(
                      Schema.Struct({ code: Schema.String, message: Schema.String }),
                    ),
                    recovery: Schema.optional(
                      Schema.Struct({
                        snapshotDir: Schema.String,
                        entries: Schema.Array(
                          Schema.Struct({
                            originalPath: Schema.String,
                            recoveryPath: Schema.String,
                            kind: Schema.Literal("snapshot"),
                          }),
                        ),
                      }),
                    ),
                  }),
                }),
              )(raw);
              const original = path.join(fixture.workspace, acquiredRelative);
              const authored = path.join(fixture.workspace, "skills", "bench-001");
              const require = (condition: boolean, message: string) =>
                condition ? Effect.void : Effect.fail(fixtureFailure(message));
              yield* require(snapshotDigest(snapshotTree(authored, [])) ===
                acquiredDigest, "Adoption did not preserve the independently recorded package bytes.");
              if (enabled) {
                yield* require(!document.ok &&
                  document.result.outcome === "failed" &&
                  document.result.failure?.code === "internal" &&
                  document.result.failure.message.startsWith(
                    "Preserved unowned skill artifact at ",
                  ), "Enabled native adoption no longer matches the recorded baseline refusal; investigate before comparing.");
                yield* require(!fs.existsSync(
                  original,
                ), "Recorded failed adoption must retain the moved bytes at the authored location.");
                yield* require(digest(fs.readFileSync(path.join(fixture.workspace, "axm.json"))) ===
                  settingsDigest &&
                  digest(fs.readFileSync(path.join(fixture.workspace, "axm.lock"))) ===
                    lockDigest, "Refused adoption did not restore settings and lockfile.");
                const recovery = document.result.recovery;
                if (
                  recovery === undefined ||
                  path.dirname(recovery.snapshotDir) !== fs.realpathSync(os.tmpdir()) ||
                  !/^axm-rollback-[a-zA-Z0-9]{6}$/.test(path.basename(recovery.snapshotDir)) ||
                  !fs.lstatSync(recovery.snapshotDir).isDirectory() ||
                  recovery.entries.length !== 3
                )
                  return yield* fixtureFailure(
                    "Failed adoption must identify its exact retained recovery directory and three snapshot entries.",
                  );
                yield* require(JSON.stringify(fs.readdirSync(recovery.snapshotDir).sort()) ===
                  JSON.stringify([
                    "0.snap",
                    "1.snap",
                    "2.snap",
                  ]), "Recovery directory contains extra or missing snapshot artifacts.");
                const expectedOriginals = [
                  path.join(fixture.workspace, "axm.json"),
                  path.join(fixture.workspace, "axm.lock"),
                  original,
                ];
                let projected = projectComparisonField(
                  raw,
                  ["result", "recovery", "snapshotDir"],
                  recovery.snapshotDir,
                  "<verified-adoption-recovery>",
                );
                for (const [index, entry] of recovery.entries.entries()) {
                  yield* require(entry.originalPath === expectedOriginals[index] &&
                    entry.recoveryPath ===
                      path.join(
                        recovery.snapshotDir,
                        index + ".snap",
                      ), "Recovery entry does not match the original protected fixture resource.");
                  yield* require(index === 2
                    ? fs.lstatSync(entry.recoveryPath).isDirectory()
                    : fs
                        .lstatSync(entry.recoveryPath)
                        .isFile(), "Recovery snapshot type differs from its protected resource.");
                  yield* require(index === 2
                    ? snapshotDigest(snapshotTree(entry.recoveryPath, [])) === acquiredDigest
                    : digest(fs.readFileSync(entry.recoveryPath)) ===
                        (index === 0
                          ? settingsDigest
                          : lockDigest), "Retained recovery snapshot differs from independently recorded pre-operation bytes.");
                  projected = projectComparisonField(
                    projected,
                    ["result", "recovery", "entries", String(index), "recoveryPath"],
                    entry.recoveryPath,
                    "<verified-adoption-recovery>/" + index + ".snap",
                  );
                }
                return {
                  assertions: [
                    "Known enabled-native baseline failure retains moved authored bytes, restores settings/lock, and keeps independently verified original recovery snapshots.",
                    "The original acquired path remains absent; this records existing partial restoration and does not establish successful or atomic adoption.",
                  ],
                  stdoutComparison: JSON.stringify(projected),
                  retainedArtifacts: [{ name: "adoption-recovery", source: recovery.snapshotDir }],
                };
              }
              const settings = yield* Schema.decodeUnknownEffect(
                Schema.fromJsonString(
                  Schema.Struct({
                    skills: Schema.Struct({
                      "bench-001": Schema.Struct({
                        source: Schema.Literal("workspace"),
                        enabled: Schema.Literal(false),
                      }),
                    }),
                  }),
                ),
              )(fs.readFileSync(path.join(fixture.workspace, "axm.json"), "utf8"));
              yield* require(settings.skills["bench-001"].enabled === false &&
                document.ok &&
                document.result.outcome === "applied" &&
                !fs.existsSync(
                  original,
                ), "Disabled acquired adoption did not move the package and preserve its declared activation.");
              return {
                assertions: [
                  "Disabled acquired package moved into workspace authorship with identical independently recorded bytes and retained disabled activation.",
                ],
              };
            }),
        });
      }
      const disabled = copyTemplate(installed, path.join(root, "disabled"));
      yield* invoke(disabled, ["skills", "disable", "bench-001"]);
      for (const item of [
        { command: "enable", args: ["enable", "@acme/skills/bench-001"] },
        { command: "skills enable", args: ["skills", "enable", "bench-001"] },
      ])
        scenarios.push({
          id: "installed/" + item.command.replaceAll(" ", "-"),
          ...item,
          template: disabled,
          registry,
          condition: {
            source: "registry",
            extensions: count,
            cache: "warm",
            network: "baseline",
            archiveBodyDelayMillis: 100,
          },
        });
    }
  }

  const bare = emptyTemplate(path.join(root, "bare"));
  scenarios.push({
    id: "local/setup",
    command: "setup",
    args: ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
    template: bare,
    condition: localCondition,
  });
  const local = emptyTemplate(path.join(root, "local"));
  yield* invoke(local, ["setup", "--yes", "--scope", "project", "--agent", "claude-code"]);
  settings(local, {
    owner: "@acme",
    agents: ["claude-code"],
    sources: [{ name: "test", type: "registry", location: registryOrigin }],
    defaultRegistry: "test",
  });
  for (const command of [
    "",
    "skills",
    "mcps",
    "subagents",
    "rules",
    "hooks",
    "knowledge",
    "knowledge concepts",
    "packs",
    "visibility",
    "lock",
    "agents",
    "instructions",
    "diagnostics",
    "cache",
    "token",
  ])
    scenarios.push({
      id: "group/" + (command || "root").replaceAll(" ", "-"),
      command,
      args: command === "" ? ["--help"] : command.split(" "),
      template: local,
      condition: localCondition,
    });
  scenarios.push({
    id: "group/version-output",
    command: "",
    args: ["--version"],
    template: local,
    condition: localCondition,
  });
  for (const item of [
    { command: "help", args: ["help"] },
    { command: "discover", args: ["discover"] },
    { command: "lint", args: ["lint"] },
    { command: "agents list", args: ["agents", "list"] },
    { command: "agents capabilities", args: ["agents", "capabilities", "claude-code"] },
    { command: "agents add", args: ["agents", "add", "cursor"] },
    { command: "agents remove", args: ["agents", "remove", "claude-code"] },
    { command: "instructions status", args: ["instructions", "status"] },
    { command: "instructions enable", args: ["instructions", "enable"] },
    { command: "instructions disable", args: ["instructions", "disable"] },
    { command: "logout", args: ["logout"] },
  ])
    scenarios.push({
      id: "local/" + item.command.replaceAll(" ", "-"),
      ...item,
      template: local,
      condition: localCondition,
    });
  scenarios.push({
    id: "local/token-show",
    command: "token show",
    args: ["token", "show", "--plain"],
    json: false,
    environment: { AXM_TOKEN: "synthetic-benchmark-token" },
    template: local,
    condition: localCondition,
  });

  // Produce a real retained failure once, then benchmark successful review/export.
  const diagnostic = copyTemplate(local, path.join(root, "diagnostic"));
  fs.writeFileSync(path.join(diagnostic.workspace, "axm.json"), "{\n");
  const failed = yield* invoke(diagnostic, ["list", "--scope", "project"], {
    expectedExitCode: "nonzero",
  });
  const failure = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({
        ok: Schema.Literal(false),
        diagnosticId: Schema.String,
      }),
    ),
  )(failed.stdout);
  const reviewed = yield* invoke(diagnostic, ["diagnostics", "show", failure.diagnosticId]);
  const review = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({
        ok: Schema.Literal(true),
        result: Schema.Struct({ sha256: Schema.String }),
      }),
    ),
  )(reviewed.stdout);
  scenarios.push(
    {
      id: "local/diagnostics-show",
      command: "diagnostics show",
      args: ["diagnostics", "show", failure.diagnosticId],
      template: diagnostic,
      condition: localCondition,
    },
    {
      id: "local/diagnostics-export",
      command: "diagnostics export",
      args: [
        "diagnostics",
        "export",
        failure.diagnosticId,
        "reviewed-diagnostic.json",
        "--review-sha256",
        review.result.sha256,
      ],
      template: diagnostic,
      condition: localCondition,
    },
  );

  for (const plural of ["skills"]) {
    scenarios.push({
      id: "authoring/" + plural + "-new",
      command: plural + " new",
      args: [plural, "new", "bench-authored", "--description", "Synthetic benchmark extension."],
      template: local,
      condition: { ...localCondition, source: "authored" },
    });
    const authored = copyTemplate(local, path.join(root, "authored-" + plural));
    yield* invoke(authored, [
      plural,
      "new",
      "bench-authored",
      "--description",
      "Synthetic benchmark extension.",
    ]);
    if (plural === "skills") {
      scenarios.push(
        {
          id: "authoring/version",
          command: "version",
          args: ["version", "@acme/skills/bench-authored", "patch"],
          template: authored,
          condition: { ...localCondition, source: "authored", extensions: 1 },
        },
        {
          id: "authoring/fork",
          command: "fork",
          args: ["fork", "workspace:@acme/skills/bench-authored", "@acme/skills/bench-fork"],
          template: authored,
          condition: { ...localCondition, source: "authored", extensions: 1 },
        },
      );
    }
  }

  const pathFixture = copyTemplate(local, path.join(root, "path"));
  writeSkillPackage(pathFixture.workspace, "bench-path", "Accepted path guidance.");
  settings(pathFixture, {
    owner: "@acme",
    agents: ["claude-code"],
    skills: { "bench-path": "./vendor/bench-path" },
  });
  const pathInstalled = copyTemplate(pathFixture, path.join(root, "path-installed"));
  yield* invoke(pathInstalled, ["sync"]);
  for (const [name, template] of [
    ["cold-sync", pathFixture],
    ["noop-sync", pathInstalled],
  ] as const)
    scenarios.push({
      id: "path/" + name,
      command: "sync",
      args: ["sync"],
      template,
      condition: { ...localCondition, source: "path", extensions: 1 },
    });

  const gitRoot = path.join(root, "git");
  fs.mkdirSync(gitRoot);
  const git = yield* Effect.acquireRelease(
    Effect.promise(() => startLifecycleGitSource(gitRoot)),
    (source) => Effect.promise(() => source.close()),
  );
  const gitConfigured = copyTemplate(local, path.join(root, "git-configured"));
  settings(gitConfigured, {
    owner: "@acme",
    agents: ["claude-code"],
    skills: { "bench-git": git.url },
  });
  const gitInstalled = copyTemplate(gitConfigured, path.join(root, "git-installed"));
  yield* invoke(gitInstalled, ["sync"]);
  const gitRestore = copyTemplate(gitInstalled, path.join(root, "git-restore"));
  fs.rmSync(path.join(gitRestore.workspace, "agent_extensions"), { recursive: true, force: true });
  git.advance();
  for (const [name, template, command] of [
    ["cold-sync", gitConfigured, "sync"],
    ["exact-restore", gitRestore, "sync"],
    ["noop-sync", gitInstalled, "sync"],
    ["update", gitInstalled, "update"],
  ] as const)
    scenarios.push({
      id: "git/" + name,
      command,
      args: [command],
      template,
      condition: {
        ...localCondition,
        source: "git",
        extensions: 1,
        cache: name === "cold-sync" ? "cold" : "warm",
        network: "baseline",
      },
    });

  // The source is a package collection, so unrelated workspace declarations must
  // not hide its distributable packages from repository discovery.
  const shared = emptyTemplate(path.join(root, "git-share"));
  for (const args of [
    ["init", "--quiet", "--initial-branch=main"],
    ["remote", "add", "origin", git.url],
    ["fetch", "--quiet", "origin", "main"],
    ["checkout", "--quiet", "-B", "main", "origin/main"],
  ])
    yield* Effect.try(() =>
      execFileSync("git", args, {
        cwd: shared.workspace,
        timeout: 30_000,
        env: { PATH: process.env["PATH"], HOME: shared.home, GIT_CONFIG_NOSYSTEM: "1" },
        stdio: "pipe",
      }),
    );
  scenarios.push({
    id: "git/share",
    command: "share",
    args: ["share"],
    template: shared,
    condition: { ...localCondition, source: "git", extensions: 1, network: "baseline" },
  });

  for (const prepare of [
    prepareTypedObservabilityFixtures,
    prepareAuthObservabilityFixtures,
    prepareMaintenanceObservabilityFixtures,
  ])
    scenarios.push(
      ...(yield* prepare({
        root: path.join(
          root,
          prepare === prepareTypedObservabilityFixtures
            ? "typed"
            : prepare === prepareAuthObservabilityFixtures
              ? "auth"
              : "maintenance",
        ),
        base: local,
        invoke,
        copy: copyTemplate,
      })),
    );

  return {
    scenarios,
    activate: (scenario: ObservabilityScenario) =>
      scenario.registry === undefined
        ? Effect.void
        : selectProfile(
            scenario.registry.url,
            scenario.condition.network === "not-applicable"
              ? "baseline"
              : scenario.condition.network,
          ).pipe(Effect.asVoid),
  };
});
