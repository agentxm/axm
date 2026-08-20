import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { isEffectCliExit } from "@agentxm/client-core/unstable/cli-runtime";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcps";
import {
  computePackManifestContentIdentity,
  PackManagerLive,
  type PackRef,
} from "@agentxm/client-core/unstable/packs";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import { WorkspaceInvariantFactsLive } from "@agentxm/client-core/unstable/projection";
import { SkillManagerLive, type SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import {
  SourceHostProviders,
  SourceHostProvidersLive,
  type SourceHostProvidersService,
} from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import YAML from "yaml";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  expectRecord,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
  property,
} from "../../test-helpers.js";
import {
  computePackageContentHashSync,
  dependencyConstraintMap,
  exactVersion,
  extensionName,
  handle,
  writeKnowledgeExtension,
  writeWorkspaceFiles,
} from "../../test-stubs.js";
import { InstallPackCommandWorkflowActionsLive } from "../packs/install/command-actions.js";
import { handleSync } from "./handler.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const writeSettings = (baseDir: string, value: unknown) => {
  writeJson(path.join(baseDir, ".axm", "settings.json"), value);
};

const writeRegistrySkillIndex = (registryRoot: string, name: string) => {
  writeJson(path.join(registryRoot, "extensions", "@acme", "skills", name, "index.json"), {
    owner: "@acme",
    type: "skill",
    name,
    publisherBindingId: "hbnd_test",
    deprecation: null,
    versions: [
      {
        version: "2.0.0",
        published: "2099-01-01T00:00:00Z",
        integrity: "sha512-BBBB==",
      },
      {
        version: "1.0.0",
        published: "1960-01-01T00:00:00Z",
        integrity: "sha512-AAAA==",
      },
    ],
  });
};

const writeRegistrySkillPackage = (registryRoot: string, name: string, version: string): void => {
  const skillDir = path.join(registryRoot, "extensions", "@acme", "skills", name);
  const stagingDir = path.join(skillDir, "staging");
  writeSkillPackage(stagingDir, name, version);
  const archivePath = path.join(skillDir, `${version}.zip`);
  execFileSync("zip", ["-qr", archivePath, "skill.json", "src"], { cwd: stagingDir });
  fs.rmSync(stagingDir, { recursive: true, force: true });
  const archive = fs.readFileSync(archivePath);
  writeJson(path.join(skillDir, "index.json"), {
    owner: "@acme",
    type: "skill",
    name,
    publisherBindingId: "hbnd_test",
    deprecation: null,
    versions: [
      {
        version,
        published: "1960-01-01T00:00:00Z",
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      },
    ],
  });
};

const writeSubagentExtension = (baseDir: string, name: string) => {
  const subagentDir = path.join(baseDir, ".axm", "extensions", "@acme", "subagents", name);
  writeJson(path.join(subagentDir, "subagent.json"), {
    owner: "@acme",
    type: "subagent",
    name,
    version: "1.0.0",
  });
  fs.mkdirSync(path.join(subagentDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(subagentDir, "src", `${name}.md`),
    `---\nname: ${name}\ndescription: Test subagent\n---\n\n# ${name}\n`,
  );
};

const writeSkillExtension = (baseDir: string, name: string) => {
  const skillDir = path.join(baseDir, ".axm", "extensions", "@acme", "skills", name);
  writeJson(path.join(skillDir, "skill.json"), {
    owner: "@acme",
    type: "skill",
    name,
    version: "1.0.0",
  });
  fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "src", "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n# ${name}\n`,
  );
};

const writeLocalKnowledgePackage = (root: string, name: string, marker: string) => {
  writeJson(path.join(root, "knowledge.json"), {
    owner: "@acme",
    type: "knowledge",
    name,
    version: "1.0.0",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "index.md"),
    `---\nokf_version: "0.2"\n---\n# ${marker}\n`,
  );
  fs.writeFileSync(path.join(root, "src", "concept.md"), `---\ntype: concept\n---\n# ${marker}\n`);
};

const writeMcpServerExtension = (baseDir: string, name: string) => {
  const mcpServerDir = path.join(baseDir, ".axm", "extensions", "@acme", "mcps", name);
  writeJson(path.join(mcpServerDir, "mcp.json"), {
    owner: "@acme",
    type: "mcp-server",
    name,
    version: "1.0.0",
    server: {
      name: `io.github.acme/${name}`,
      description: "Test MCP server",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: `@acme/${name}-mcp`,
          version: "1.0.0",
          transport: { type: "stdio" },
        },
      ],
    },
  });
};

const writeRenderedSubagent = (
  baseDir: string,
  agentDir: string,
  name: string,
  managed: boolean,
) => {
  const filePath = path.join(baseDir, agentDir, "agents", `${name}.md`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    managed
      ? `<!-- axm:file v=1 ext=@acme/subagents/${name} src=.axm/extensions/@acme/subagents/${name} -->\n# ${name}\n`
      : `# ${name}\n`,
  );
};

const writePackPackage = (root: string, manifest: Readonly<Record<string, unknown>>): void => {
  writeJson(path.join(root, "pack.json"), manifest);
};

const writeSkillPackage = (root: string, name: string, version: string): void => {
  writeJson(path.join(root, "skill.json"), {
    owner: "@acme",
    type: "skill",
    name,
    version,
  });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n# ${name}\n`,
  );
};

const makePackRollbackFixture = (
  baseDir: string,
  options: {
    readonly canonicalPackState?: "changed" | "missing";
    /**
     * Leave the member's canonical tree in place. Omitting it forces the member
     * to be reacquired from the registry, which is how these fixtures trigger a
     * typed failure partway through a Pack closure.
     */
    readonly memberCanonical?: boolean;
    readonly withMemberDependency?: boolean;
  } = {},
) => {
  const withMemberDependency = options.withMemberDependency !== false;
  const registrySource = {
    type: "registry",
    location: new URL("file:///tmp/test-registry"),
    owner: Option.none(),
  } satisfies PackRef["source"];
  const acceptedPackManifest = {
    owner: "@acme",
    type: "pack",
    name: "toolkit",
    version: "1.0.0",
    dependencies: withMemberDependency ? { "@acme/skills/review": "^1.0.0" } : {},
  } satisfies Parameters<typeof computePackManifestContentIdentity>[0];
  const availablePackManifest = {
    ...acceptedPackManifest,
    version: "2.0.0",
    dependencies: withMemberDependency ? { "@acme/skills/review": "^2.0.0" } : {},
  } satisfies Parameters<typeof computePackManifestContentIdentity>[0];
  const divergentPackManifest = {
    ...acceptedPackManifest,
    version: "0.3.0",
  } satisfies Parameters<typeof computePackManifestContentIdentity>[0];
  const acceptedPackSource = path.join(baseDir, "registry-fixtures", "toolkit-1");
  const availablePackSource = path.join(baseDir, "registry-fixtures", "toolkit-2");
  const acceptedSkillSource = path.join(baseDir, "registry-fixtures", "review-1");
  const availableSkillSource = path.join(baseDir, "registry-fixtures", "review-2");
  writePackPackage(acceptedPackSource, acceptedPackManifest);
  writePackPackage(availablePackSource, availablePackManifest);
  writeSkillPackage(acceptedSkillSource, "review", "1.0.0");
  writeSkillPackage(availableSkillSource, "review", "2.0.0");

  const availablePack = {
    type: "pack",
    refType: "registry",
    pack: {
      name: extensionName("toolkit"),
      dependencies: dependencyConstraintMap(availablePackManifest.dependencies),
    },
    source: registrySource,
    owner: handle("@acme"),
    name: extensionName("toolkit"),
    version: exactVersion("2.0.0"),
    integrity: Option.none(),
    publisherBindingId: "hbnd_test",
    packages: [],
  } satisfies PackRef;
  const availableSkill = {
    type: "skill",
    refType: "registry",
    skill: {
      name: extensionName("review"),
      description: Option.none(),
      metadata: Option.none(),
    },
    source: registrySource,
    owner: handle("@acme"),
    name: extensionName("review"),
    version: exactVersion("2.0.0"),
    integrity: Option.none(),
    publisherBindingId: "hbnd_test",
    packages: [],
  } satisfies SkillExtensionRef;
  const lookupCalls: string[] = [];
  const fetchedRefs: string[] = [];
  const sources = {
    find: (_source, options) => {
      lookupCalls.push(options.type);
      if (options.type === "pack") return Effect.succeed([availablePack]);
      if (options.type === "skill") return Effect.succeed([availableSkill]);
      return Effect.succeed([]);
    },
    resolveNamedRegistry: () => Effect.die("unused"),
    fetch: (ref) => {
      const version = ref.refType === "registry" ? ref.version : "workspace";
      const name =
        ref.type === "pack" ? ref.pack.name : ref.type === "skill" ? ref.skill.name : "unexpected";
      fetchedRefs.push(`${ref.type}:${name}:${version}`);
      if (ref.type === "pack" && version === "1.0.0") {
        return Effect.succeed({ directory: acceptedPackSource });
      }
      if (ref.type === "pack" && version === "2.0.0") {
        return Effect.succeed({ directory: availablePackSource });
      }
      if (ref.type === "skill" && version === "1.0.0") {
        return Effect.succeed({ directory: acceptedSkillSource });
      }
      if (ref.type === "skill" && version === "2.0.0") {
        return Effect.succeed({ directory: availableSkillSource });
      }
      return Effect.fail(
        makeAppError({ code: "not_found", detail: `Unexpected fixture ref ${ref.type}` }),
      );
    },
    cloneUrl: () => Option.none(),
    origin: () => "test-registry",
  } satisfies SourceHostProvidersService;

  const axmDir = path.join(baseDir, ".axm");
  writeWorkspaceFiles(axmDir, {
    agents: ["claude-code"],
    packs: { toolkit: "@acme/packs/toolkit" },
    sources: [{ type: "registry", name: "default", location: registrySource.location.href }],
    lockfilePacks: {
      toolkit: {
        type: "registry",
        owner: "@acme",
        name: "toolkit",
        resolvedVersion: "1.0.0",
        integrity: "",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        manifestContentIdentity: computePackManifestContentIdentity(acceptedPackManifest),
      },
    },
    lockfileSkills: {
      review: {
        type: "registry",
        owner: "@acme",
        name: "review",
        resolvedVersion: "1.0.0",
        integrity: "",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
      },
    },
  });

  const canonicalSkill = path.join(axmDir, "extensions", "@acme", "skills", "review");
  const canonicalPack = path.join(axmDir, "extensions", "@acme", "packs", "toolkit");
  if (options.canonicalPackState === "changed") {
    writePackPackage(canonicalPack, divergentPackManifest);
  }
  if (options.memberCanonical !== false) {
    writeSkillPackage(canonicalSkill, "review", "1.0.0");
  }
  const ownedOutput = path.join(baseDir, ".claude", "skills", "review", "SKILL.md");
  fs.mkdirSync(path.dirname(ownedOutput), { recursive: true });
  fs.writeFileSync(ownedOutput, "# accepted managed review\n");

  return {
    sources,
    lookupCalls,
    fetchedRefs,
    manifests: {
      accepted: acceptedPackManifest,
      divergent: divergentPackManifest,
    },
    paths: {
      lockfile: path.join(axmDir, "axm-lock.yaml"),
      settings: path.join(axmDir, "settings.json"),
      canonicalPack,
      canonicalSkillManifest: path.join(canonicalSkill, "skill.json"),
      canonicalSkillContent: path.join(canonicalSkill, "src", "SKILL.md"),
      ownedOutput,
    },
  };
};

type PackRollbackPaths = ReturnType<typeof makePackRollbackFixture>["paths"];

/** `undefined` records an absent path, which rollback must restore as absent. */
const readIfPresent = (target: string): string | undefined =>
  fs.existsSync(target) ? fs.readFileSync(target, "utf8") : undefined;

const capturePackRollbackPreimages = (paths: PackRollbackPaths) => ({
  lockfile: fs.readFileSync(paths.lockfile, "utf8"),
  settings: fs.readFileSync(paths.settings, "utf8"),
  canonicalSkillManifest: readIfPresent(paths.canonicalSkillManifest),
  canonicalSkillContent: readIfPresent(paths.canonicalSkillContent),
  ownedOutput: fs.readFileSync(paths.ownedOutput, "utf8"),
});

const expectPackRollbackPreimages = (
  paths: PackRollbackPaths,
  before: ReturnType<typeof capturePackRollbackPreimages>,
): void => {
  const lockfile = fs.readFileSync(paths.lockfile, "utf8");
  expect(lockfile).toBe(before.lockfile);
  expect(YAML.parse(lockfile)).toEqual(YAML.parse(before.lockfile));
  expect(YAML.parse(lockfile)).toMatchObject({
    packs: { toolkit: { resolvedVersion: "1.0.0" } },
    skills: { review: { resolvedVersion: "1.0.0" } },
  });
  expect(fs.readFileSync(paths.settings, "utf8")).toBe(before.settings);
  expect(fs.existsSync(paths.canonicalPack)).toBe(false);
  expect(readIfPresent(paths.canonicalSkillManifest)).toBe(before.canonicalSkillManifest);
  expect(readIfPresent(paths.canonicalSkillContent)).toBe(before.canonicalSkillContent);
  expect(fs.readFileSync(paths.ownedOutput, "utf8")).toBe(before.ownedOutput);
};

const makeConstraintMismatchFixture = (
  baseDir: string,
  constraints: readonly [string, string] = [">=2.0.0 <3.0.0", "^2.1.0"],
) => {
  const registryRoot = path.join(baseDir, "registry");
  const registrySource = {
    type: "registry",
    location: new URL(`file://${registryRoot}`),
    owner: Option.none(),
  } satisfies SkillExtensionRef["source"];
  const manifests = [
    {
      owner: "@acme",
      type: "pack",
      name: "alpha",
      version: "1.0.0",
      dependencies: { "@acme/skills/review": constraints[0] },
    },
    {
      owner: "@acme",
      type: "pack",
      name: "beta",
      version: "1.0.0",
      dependencies: { "@acme/skills/review": constraints[1] },
    },
  ] as const;
  const availableSkillSource = path.join(baseDir, "registry-fixtures", "review-2");
  writeSkillPackage(availableSkillSource, "review", "2.2.0");
  writeRegistrySkillPackage(registryRoot, "review", "2.2.0");
  const availableSkill = {
    type: "skill",
    refType: "registry",
    skill: {
      name: extensionName("review"),
      description: Option.none(),
      metadata: Option.none(),
    },
    source: registrySource,
    owner: handle("@acme"),
    name: extensionName("review"),
    version: exactVersion("2.2.0"),
    integrity: Option.none(),
    publisherBindingId: "hbnd_test",
    packages: [],
  } satisfies SkillExtensionRef;
  const lookupCalls: string[] = [];
  const sources = {
    find: () => Effect.die("unexpected Registry search"),
    resolveNamedRegistry: (_source, options) => {
      lookupCalls.push(options.type);
      return options.type === "skill"
        ? Effect.succeed({
            kind: "selected" as const,
            target: `${options.owner}/skills/${options.name}`,
            ref: availableSkill,
          })
        : Effect.die("unexpected Registry type");
    },
    fetch: (ref) =>
      ref.type === "skill" && ref.refType === "registry" && ref.version === "2.2.0"
        ? Effect.succeed({ directory: availableSkillSource })
        : Effect.fail(makeAppError({ code: "not_found", detail: "Unexpected fixture ref" })),
    cloneUrl: () => Option.none(),
    origin: () => "test-registry",
  } satisfies SourceHostProvidersService;

  const axmDir = path.join(baseDir, ".axm");
  writeWorkspaceFiles(axmDir, {
    agents: [],
    packs: {
      alpha: "@acme/packs/alpha",
      beta: "@acme/packs/beta",
    },
    sources: [{ type: "registry", name: "default", location: registrySource.location.href }],
    lockfilePacks: {
      alpha: {
        type: "registry",
        owner: "@acme",
        name: "alpha",
        resolvedVersion: "1.0.0",
        integrity: "",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        manifestContentIdentity: computePackManifestContentIdentity(manifests[0]),
      },
      beta: {
        type: "registry",
        owner: "@acme",
        name: "beta",
        resolvedVersion: "1.0.0",
        integrity: "",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        manifestContentIdentity: computePackManifestContentIdentity(manifests[1]),
      },
    },
    lockfileSkills: {
      review: {
        type: "registry",
        owner: "@acme",
        name: "review",
        resolvedVersion: "1.0.0",
        integrity: "",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
      },
    },
  });
  for (const manifest of manifests) {
    writePackPackage(path.join(axmDir, "extensions", "@acme", "packs", manifest.name), manifest);
  }
  writeSkillPackage(
    path.join(axmDir, "extensions", "@acme", "skills", "review"),
    "review",
    "1.0.0",
  );

  return {
    lookupCalls,
    sources,
    paths: {
      lockfile: path.join(axmDir, "axm-lock.yaml"),
      settings: path.join(axmDir, "settings.json"),
      canonicalSkill: path.join(axmDir, "extensions", "@acme", "skills", "review", "skill.json"),
      materializedSkill: path.join(baseDir, ".agents", "skills", "review", "SKILL.md"),
    },
  };
};

describe("root sync handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-sync-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (
    opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0],
    sourceHostProviders?: SourceHostProvidersService,
  ) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
    const sourceProvidersLayer =
      sourceHostProviders === undefined
        ? Layer.provide(SourceHostProvidersLive, Layer.merge(ctx.baseLayer, ctx.wsLayer))
        : Layer.succeed(SourceHostProviders, sourceHostProviders);
    const managerDependencies = Layer.mergeAll(
      ctx.baseLayer,
      ctx.wsLayer,
      sourceProvidersLayer,
      CodingAgentRepositoryLive,
    );
    const managersLayer = Layer.provide(
      Layer.mergeAll(
        HookManagerLive,
        KnowledgeManagerLive,
        McpServerManagerLive,
        RuleManagerLive,
        SkillManagerLive,
        SubagentManagerLive,
      ),
      managerDependencies,
    );
    const packManagerLayer = Layer.provide(
      PackManagerLive,
      Layer.mergeAll(managerDependencies, managersLayer),
    );
    const packActionsLayer = Layer.provide(
      InstallPackCommandWorkflowActionsLive,
      Layer.mergeAll(managerDependencies, managersLayer, packManagerLayer),
    );
    const invariantFactsLayer = Layer.provide(
      WorkspaceInvariantFactsLive,
      Layer.mergeAll(managerDependencies, managersLayer),
    );
    return {
      provide: makeEffectProvide(
        Layer.mergeAll(
          ctx.baseLayer,
          ctx.wsLayer,
          sourceProvidersLayer,
          CodingAgentRepositoryLive,
          managersLayer,
          packManagerLayer,
          packActionsLayer,
          invariantFactsLayer,
        ),
      ),
      logs: ctx.logs,
      rendererState: ctx.rendererState,
    };
  };

  it.effect("reports no-op when workspace materialization is already up to date", () =>
    Effect.gen(function* () {
      const { provide, logs, rendererState } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });

      yield* provide(handleSync({ preview: false }));

      expect(logs.success).toEqual(["Workspace materialization is up to date"]);
      expect(rendererState.spinnerMessages).toEqual([
        "Resolving workspace sync",
        "Resolved workspace sync",
      ]);
    }),
  );

  it.effect("emits JSON no-op when workspace materialization is already up to date", () =>
    Effect.gen(function* () {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });

      yield* provide(handleSync({ preview: false }));

      expect(logs.success).toEqual([]);
      expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        message: "Workspace materialization is up to date",
      });
    }),
  );

  it.effect("reports a successful convergence assertion for an up-to-date workspace", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });

      yield* provide(handleSync({ preview: true, failOnChange: true }));

      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          outcome: "no-op",
          reconciliationRequired: false,
          totalSteps: 0,
        },
      });
    }),
  );

  it.effect("fails a read-only convergence assertion with the complete preview plan", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      const nativeConfigPath = path.join(tempDir, ".mcp.json");
      writeWorkspaceFiles(axmDir, { agents: ["claude-code"] });
      writeJson(nativeConfigPath, {
        mcpServers: {
          demo: {
            "x-axm": {
              v: 1,
              managed: true,
              ext: "@workspace/mcps/demo",
              source: "inline",
            },
            command: "node",
            args: ["server.js"],
          },
        },
      });
      const before = {
        settings: fs.readFileSync(path.join(axmDir, "settings.json"), "utf8"),
        lockfile: fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"),
        nativeConfig: fs.readFileSync(nativeConfigPath, "utf8"),
      };

      const exit = yield* provide(handleSync({ preview: true, failOnChange: true })).pipe(
        Effect.exit,
      );

      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        const defect = Cause.squash(exit.cause);
        expect(isEffectCliExit(defect)).toBe(true);
        if (isEffectCliExit(defect)) expect(defect.exitCode).toBe(1);
      }
      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          outcome: "reconciliation-required",
          reconciliationRequired: true,
          appliedCount: 0,
          steps: [
            {
              label: "mcp-server stale managed entries",
              status: "ready",
            },
          ],
        },
      });
      expect(fs.readFileSync(path.join(axmDir, "settings.json"), "utf8")).toBe(before.settings);
      expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).toBe(before.lockfile);
      expect(fs.readFileSync(nativeConfigPath, "utf8")).toBe(before.nativeConfig);
    }),
  );

  it.effect("reports unsupported marker versions in preview without writing", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });
      writeSettings(tempDir, {
        agents: [],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
      });
      const instructionsPath = path.join(tempDir, "AGENTS.md");
      const before = [
        "# User content",
        "<!-- axm:start v=2 region=rules -->",
        "generated",
        "<!-- axm:end v=2 region=rules -->",
        "",
      ].join("\n");
      fs.writeFileSync(instructionsPath, before);

      yield* provide(handleSync({ preview: true }));

      const payload = JSON.stringify(rendererState.results[0]?.data);
      expect(payload).toContain("unsupported");
      expect(payload).toContain("upgrade AXM");
      expect(payload).toContain("@agentxm/rules/instructions");
      expect(fs.readFileSync(instructionsPath, "utf8")).toBe(before);
    }),
  );

  it.effect("requires preview mode for fail-on-change", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });

      const error = yield* provide(handleSync({ preview: false, failOnChange: true })).pipe(
        Effect.flip,
      );

      expect(error.code).toBe("usage");
      expect(error.detail).toBe("--fail-on-change requires --preview");
    }),
  );

  it.effect("emits release-age holdback evidence when sync selects an older mature version", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      const registryDir = path.join(tempDir, "registry");
      writeRegistrySkillIndex(registryDir, "review");
      writeWorkspaceFiles(axmDir, { agents: [] });
      writeSettings(tempDir, {
        agents: [],
        minimumReleaseAge: "24h",
        sources: [{ type: "registry", name: "local", location: `file://${registryDir}` }],
        skills: { review: "@acme/skills/review" },
      });

      yield* provide(handleSync({ preview: true }));

      const payload = expectRecord(rendererState.results[0]?.data);
      const result = expectRecord(property(payload, "result"));
      expect(result).toMatchObject({
        holdbackCount: 1,
        holdbacks: [
          {
            target: "@acme/skills/review",
            selectedVersion: "1.0.0",
            candidateVersion: "2.0.0",
          },
        ],
      });
      expect(typeof property(result, "evaluatedAt")).toBe("string");
    }),
  );

  it.effect("does not create a second authority beside accepted resolutions", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@acme",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      yield* provide(handleSync({ preview: false }));
    }),
  );

  it.effect("keeps accepted-resolution preview read-only", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@acme",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      yield* provide(handleSync({ preview: true }));
    }),
  );

  it.effect("leaves the lockfile absent when there is no external resolution to accept", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, { agents: [] });
      fs.rmSync(path.join(axmDir, "axm-lock.yaml"), { force: true });

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml"))).toBe(false);
    }),
  );

  it.effect("blocks without replacing an unreadable authoritative lockfile", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, { agents: [] });
      fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 4\nskills: []\n");

      const error = yield* provide(handleSync({ preview: false })).pipe(Effect.flip);

      expect(error.code).toBe("validation");
      expect(rendererState.results).toEqual([]);
      expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).toBe(
        "lockfileVersion: 4\nskills: []\n",
      );
    }),
  );

  it.effect("blocks a dry run against an unreadable lockfile", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, { agents: [] });
      const corrupt = "lockfileVersion: 4\nskills: []\n";
      fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), corrupt);

      const error = yield* provide(handleSync({ preview: true, failOnChange: true })).pipe(
        Effect.flip,
      );

      expect(error.code).toBe("validation");
      expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).toBe(corrupt);
    }),
  );

  it.effect("prunes stale managed MCP entries when no servers remain declared", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
      });
      writeJson(path.join(tempDir, ".mcp.json"), {
        mcpServers: {
          demo: {
            "x-axm": {
              v: 1,
              managed: true,
              ext: "@workspace/mcps/demo",
              source: "inline",
            },
            command: "node",
            args: ["server.js"],
          },
        },
      });

      yield* provide(handleSync({ preview: false }));

      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
      });
      const steps = planResultSteps(result);
      expect(steps).toMatchObject([
        {
          label: "mcp-server stale managed entries",
          status: "applied",
          message: "Pruned stale managed MCP server entries",
        },
      ]);
      const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
      expect(config.mcpServers).toEqual({});
    }),
  );

  it.effect("does not prune managed artifacts when configured pack recovery cannot resolve", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        packs: {
          missing: "@acme/packs/missing",
        },
      });
      const configPath = path.join(tempDir, ".mcp.json");
      writeJson(configPath, {
        mcpServers: {
          retained: {
            "x-axm": {
              v: 1,
              managed: true,
              ext: "@acme/mcps/retained",
              source: "registry",
              ref: "@acme/mcps/retained",
            },
            type: "stdio",
            command: "node",
          },
        },
      });

      const error = yield* provide(handleSync({ preview: false })).pipe(Effect.flip);

      expect(error.detail).toContain("Invalid pack source for missing");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(config.mcpServers.retained.command).toBe("node");
    }),
  );

  it.effect(
    "restores a divergent Pack and its reachable members from accepted immutable resolution",
    () =>
      Effect.gen(function* () {
        const fixture = makePackRollbackFixture(tempDir, {
          canonicalPackState: "changed",
        });
        const before = {
          lockfile: fs.readFileSync(fixture.paths.lockfile, "utf8"),
          settings: fs.readFileSync(fixture.paths.settings, "utf8"),
          canonicalPack: fs.readFileSync(
            path.join(fixture.paths.canonicalPack, "pack.json"),
            "utf8",
          ),
          canonicalSkillManifest: fs.readFileSync(fixture.paths.canonicalSkillManifest, "utf8"),
          canonicalSkillContent: fs.readFileSync(fixture.paths.canonicalSkillContent, "utf8"),
          ownedOutput: fs.readFileSync(fixture.paths.ownedOutput, "utf8"),
        };
        const acceptedContentIdentity = computePackManifestContentIdentity(
          fixture.manifests.accepted,
        );
        const observedContentIdentity = computePackManifestContentIdentity(
          fixture.manifests.divergent,
        );

        const human = makeLayers(undefined, fixture.sources);
        yield* human.provide(handleSync({ preview: true }));
        const humanPreview = expectPreviewedPlanResult(human.rendererState.results[0]?.data, {
          planName: "Sync workspace",
          totalSteps: 1,
        });
        const humanLabel = property(planResultSteps(humanPreview)[0], "label");
        expect(humanLabel).toContain("Recover @acme/packs/toolkit");
        expect(humanLabel).toContain("accepted version=1.0.0");
        expect(humanLabel).toContain(`content=${acceptedContentIdentity}`);
        expect(humanLabel).toContain("observed status=changed version=0.3.0");
        expect(humanLabel).toContain(`content=${observedContentIdentity}`);

        const machine = makeLayers({ machine: true }, fixture.sources);
        yield* machine.provide(handleSync({ preview: true }));
        const machinePreview = expectPreviewedPlanResult(machine.rendererState.results[0]?.data, {
          planName: "Sync workspace",
          totalSteps: 1,
        });
        const previewLabel = property(planResultSteps(machinePreview)[0], "label");
        expect(previewLabel).toBe(humanLabel);
        expect(fs.readFileSync(fixture.paths.lockfile, "utf8")).toBe(before.lockfile);
        expect(fs.readFileSync(fixture.paths.settings, "utf8")).toBe(before.settings);
        expect(fs.readFileSync(path.join(fixture.paths.canonicalPack, "pack.json"), "utf8")).toBe(
          before.canonicalPack,
        );
        expect(fs.readFileSync(fixture.paths.canonicalSkillManifest, "utf8")).toBe(
          before.canonicalSkillManifest,
        );
        expect(fs.readFileSync(fixture.paths.canonicalSkillContent, "utf8")).toBe(
          before.canonicalSkillContent,
        );
        expect(fs.readFileSync(fixture.paths.ownedOutput, "utf8")).toBe(before.ownedOutput);

        machine.rendererState.results.length = 0;
        yield* machine.provide(handleSync({ preview: false }));
        const applied = expectAppliedPlanResult(machine.rendererState.results[0]?.data, {
          planName: "Sync workspace",
        });
        expect(property(planResultSteps(applied)[0], "label")).toBe(previewLabel);
        expect(YAML.parse(fs.readFileSync(fixture.paths.lockfile, "utf8"))).toMatchObject({
          packs: { toolkit: { resolvedVersion: "1.0.0" } },
          skills: { review: { resolvedVersion: "1.0.0" } },
        });
        expect(JSON.parse(fs.readFileSync(fixture.paths.settings, "utf8"))).toEqual(
          JSON.parse(before.settings),
        );
        expect(
          JSON.parse(fs.readFileSync(path.join(fixture.paths.canonicalPack, "pack.json"), "utf8")),
        ).toMatchObject({ owner: "@acme", name: "toolkit", version: "1.0.0" });
        expect(
          JSON.parse(fs.readFileSync(fixture.paths.canonicalSkillManifest, "utf8")),
        ).toMatchObject({ owner: "@acme", name: "review", version: "1.0.0" });
        expect(fixture.lookupCalls).toEqual([]);
        expect(fixture.fetchedRefs).toContain("pack:toolkit:1.0.0");
        expect(fixture.fetchedRefs).not.toContain("skill:review:1.0.0");
        expect(fixture.fetchedRefs).not.toContain("pack:toolkit:2.0.0");
        expect(fixture.fetchedRefs).not.toContain("skill:review:2.0.0");

        machine.rendererState.results.length = 0;
        yield* machine.provide(handleSync({ preview: true }));
        expectNoOpPlanResult(machine.rendererState.results[0]?.data, {
          planName: "Sync workspace",
        });
      }),
  );

  it.effect("rolls back accepted Pack recovery when a later typed failure occurs", () =>
    Effect.gen(function* () {
      const fixture = makePackRollbackFixture(tempDir, { memberCanonical: false });
      const before = capturePackRollbackPreimages(fixture.paths);
      const { provide, rendererState } = makeLayers({ machine: true }, fixture.sources);

      yield* provide(handleSync({ preview: false }));

      const payload = expectRecord(rendererState.results[0]?.data);
      expect(expectRecord(property(payload, "result"))).toMatchObject({
        outcome: "failed",
        reason: "execution-failed",
        errorCode: "internal",
        steps: [
          {
            label: expect.stringContaining("Recover @acme/packs/toolkit"),
            status: "failed",
            message: expect.stringContaining("Failed to read index"),
          },
        ],
      });
      expectPackRollbackPreimages(fixture.paths, before);
      expect(fixture.lookupCalls).toEqual([]);
      expect(fixture.fetchedRefs).toContain("pack:toolkit:1.0.0");
      expect(fixture.fetchedRefs).not.toContain("pack:toolkit:2.0.0");
      expect(fixture.fetchedRefs).not.toContain("skill:review:2.0.0");
    }),
  );

  it.effect("rolls back accepted Pack recovery when the command is interrupted", () =>
    Effect.gen(function* () {
      const fixture = makePackRollbackFixture(tempDir, { withMemberDependency: false });
      const before = capturePackRollbackPreimages(fixture.paths);
      const { provide } = makeLayers(undefined, fixture.sources);

      const exit = yield* Effect.exit(
        provide(handleSync({ preview: false }, { afterMaterialization: () => Effect.interrupt })),
      );

      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      }
      expectPackRollbackPreimages(fixture.paths, before);
    }),
  );

  it.effect("preserves an independent committed closure when later Pack recovery fails", () =>
    Effect.gen(function* () {
      const fixture = makePackRollbackFixture(tempDir, { memberCanonical: false });
      const settings = expectRecord(YAML.parse(fs.readFileSync(fixture.paths.settings, "utf8")));
      writeJson(fixture.paths.settings, {
        ...settings,
        skills: { independent: "workspace:@acme/skills/independent" },
      });
      const independentCanonical = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@acme",
        "skills",
        "independent",
      );
      writeSkillPackage(independentCanonical, "independent", "1.0.0");
      const independentOutput = path.join(tempDir, ".claude", "skills", "independent", "SKILL.md");
      expect(fs.existsSync(independentOutput)).toBe(false);

      const { provide } = makeLayers(undefined, fixture.sources);
      yield* provide(
        handleSync({
          preview: false,
          target: Option.some("@acme/skills/independent"),
        }),
      );
      const committedIndependentOutput = fs.readFileSync(independentOutput, "utf8");
      const beforeFailure = capturePackRollbackPreimages(fixture.paths);

      yield* provide(handleSync({ preview: false }));

      expect(fs.readFileSync(independentOutput, "utf8")).toBe(committedIndependentOutput);
      expectPackRollbackPreimages(fixture.paths, beforeFailure);
    }),
  );

  it.effect(
    "plans and converges one deterministic transition for every depending Pack constraint",
    () =>
      Effect.gen(function* () {
        const fixture = makeConstraintMismatchFixture(tempDir);
        const lockBefore = fs.readFileSync(fixture.paths.lockfile, "utf8");
        const settingsBefore = fs.readFileSync(fixture.paths.settings, "utf8");
        const canonicalBefore = fs.readFileSync(fixture.paths.canonicalSkill, "utf8");
        const human = makeLayers(undefined, fixture.sources);
        const machine = makeLayers({ machine: true }, fixture.sources);

        yield* human.provide(handleSync({ preview: true }));
        yield* machine.provide(handleSync({ preview: true }));

        const humanPreview = expectPreviewedPlanResult(human.rendererState.results[0]?.data, {
          planName: "Sync workspace",
          totalSteps: 1,
        });
        const machinePreview = expectPreviewedPlanResult(machine.rendererState.results[0]?.data, {
          planName: "Sync workspace",
          totalSteps: 1,
        });
        const humanLabel = property(planResultSteps(humanPreview)[0], "label");
        const machineLabel = property(planResultSteps(machinePreview)[0], "label");
        expect(machineLabel).toBe(humanLabel);
        expect(machineLabel).toContain("@acme/packs/alpha range=>=2.0.0 <3.0.0");
        expect(machineLabel).toContain("@acme/packs/beta range=^2.1.0");
        expect(machineLabel).toContain("accepted version=1.0.0");
        expect(machineLabel).toContain("observed version=1.0.0");
        expect(machineLabel).toContain("decision=reconcilable; proposed version=2.2.0");
        expect(fs.readFileSync(fixture.paths.lockfile, "utf8")).toBe(lockBefore);
        expect(fs.readFileSync(fixture.paths.settings, "utf8")).toBe(settingsBefore);
        expect(fs.readFileSync(fixture.paths.canonicalSkill, "utf8")).toBe(canonicalBefore);

        machine.rendererState.results.length = 0;
        yield* machine.provide(handleSync({ preview: false }));
        const applied = expectAppliedPlanResult(machine.rendererState.results[0]?.data, {
          planName: "Sync workspace",
          totalSteps: 1,
        });
        expect(property(planResultSteps(applied)[0], "label")).toBe(machineLabel);
        expect(YAML.parse(fs.readFileSync(fixture.paths.lockfile, "utf8"))).toMatchObject({
          skills: { review: { resolvedVersion: "2.2.0" } },
        });
        expect(JSON.parse(fs.readFileSync(fixture.paths.settings, "utf8"))).toEqual(
          JSON.parse(settingsBefore),
        );
        expect(JSON.parse(fs.readFileSync(fixture.paths.canonicalSkill, "utf8"))).toMatchObject({
          version: "2.2.0",
        });
        expect(fixture.lookupCalls).toEqual(["skill", "skill", "skill"]);

        machine.rendererState.results.length = 0;
        yield* machine.provide(handleSync({ preview: true }));
        expectNoOpPlanResult(machine.rendererState.results[0]?.data, {
          planName: "Sync workspace",
        });
      }),
  );

  it.effect(
    "reports every unsatisfiable Pack constraint as one stable blocker without writes",
    () =>
      Effect.gen(function* () {
        const fixture = makeConstraintMismatchFixture(tempDir, ["^2.0.0", "^3.0.0"]);
        const lockBefore = fs.readFileSync(fixture.paths.lockfile, "utf8");
        const settingsBefore = fs.readFileSync(fixture.paths.settings, "utf8");
        const canonicalBefore = fs.readFileSync(fixture.paths.canonicalSkill, "utf8");
        const { provide } = makeLayers({ machine: true }, fixture.sources);

        const error = yield* provide(handleSync({ preview: true })).pipe(Effect.flip);

        expect(error.code).toBe("conflict");
        expect(error.detail).toContain("@acme/packs/alpha range=^2.0.0");
        expect(error.detail).toContain("@acme/packs/beta range=^3.0.0");
        expect(error.detail).toContain("decision=blocked; reason=no-satisfying-version");
        expect(fs.readFileSync(fixture.paths.lockfile, "utf8")).toBe(lockBefore);
        expect(fs.readFileSync(fixture.paths.settings, "utf8")).toBe(settingsBefore);
        expect(fs.readFileSync(fixture.paths.canonicalSkill, "utf8")).toBe(canonicalBefore);
        expect(fs.existsSync(fixture.paths.materializedSkill)).toBe(false);
      }),
  );

  it.effect("rolls back a constraint repair when its apply closure fails", () =>
    Effect.gen(function* () {
      const fixture = makeConstraintMismatchFixture(tempDir);
      const lockBefore = fs.readFileSync(fixture.paths.lockfile, "utf8");
      const settingsBefore = fs.readFileSync(fixture.paths.settings, "utf8");
      const canonicalBefore = fs.readFileSync(fixture.paths.canonicalSkill, "utf8");
      const { provide, rendererState } = makeLayers({ machine: true }, fixture.sources);

      yield* provide(
        handleSync(
          { preview: false },
          {
            afterMaterialization: () =>
              Effect.fail(makeAppError({ code: "internal", detail: "Injected repair failure" })),
          },
        ),
      );

      expect(
        expectRecord(property(expectRecord(rendererState.results[0]?.data), "result")),
      ).toMatchObject({
        outcome: "failed",
        reason: "execution-failed",
      });
      expect(fs.readFileSync(fixture.paths.lockfile, "utf8")).toBe(lockBefore);
      expect(fs.readFileSync(fixture.paths.settings, "utf8")).toBe(settingsBefore);
      expect(fs.readFileSync(fixture.paths.canonicalSkill, "utf8")).toBe(canonicalBefore);
      expect(fs.existsSync(fixture.paths.materializedSkill)).toBe(false);
    }),
  );

  it.effect("prunes disabled managed MCP server configs without re-materializing them", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code", "cursor", "codex"],
        mcps: {
          browser: "workspace:@acme/mcps/browser",
        },
      });
      writeMcpServerExtension(tempDir, "browser");

      yield* provide(handleSync({ preview: false }));

      expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toContain('"browser"');
      expect(fs.readFileSync(path.join(tempDir, ".cursor", "mcp.json"), "utf8")).toContain(
        '"browser"',
      );
      expect(fs.readFileSync(path.join(tempDir, ".codex", "config.toml"), "utf8")).toContain(
        "browser",
      );

      rendererState.results.length = 0;
      yield* provide(handleSync({ preview: false }));
      expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        message: "Workspace materialization is up to date",
      });

      rendererState.results.length = 0;
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code", "cursor", "codex"],
        mcps: {
          browser: {
            source: "workspace:@acme/mcps/browser",
            enabled: false,
          },
        },
      });

      yield* provide(handleSync({ preview: true }));

      const preview = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 1,
      });
      const previewSteps = planResultSteps(preview);
      expect(previewSteps).toMatchObject([
        {
          label: "mcp-server stale managed entries",
          status: "ready",
        },
      ]);
      expect(JSON.stringify(previewSteps)).not.toContain("browser");

      rendererState.results.length = 0;
      yield* provide(handleSync({ preview: false }));

      const applied = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 1,
      });
      expect(planResultSteps(applied)).toMatchObject([
        {
          label: "mcp-server stale managed entries",
          status: "applied",
        },
      ]);

      const claudeConfig = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
      const cursorConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, ".cursor", "mcp.json"), "utf8"),
      );
      const codexConfig = fs.readFileSync(path.join(tempDir, ".codex", "config.toml"), "utf8");
      expect(claudeConfig.mcpServers).toEqual({});
      expect(cursorConfig.mcpServers).toEqual({});
      expect(codexConfig).not.toContain("browser");
    }),
  );

  it.effect("restores drifted AXM-owned inline MCP agent configs", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"));
      writeSettings(tempDir, {
        agents: ["claude-code"],
        mcpServers: {
          demo: {
            enabled: true,
            command: "node",
            args: ["server.js"],
            env: {},
          },
        },
      });
      writeJson(path.join(tempDir, ".mcp.json"), {
        mcpServers: {
          demo: {
            "x-axm": {
              v: 1,
              managed: true,
              ext: "@workspace/mcps/demo",
              source: "inline",
            },
            type: "stdio",
            command: "python",
          },
        },
      });

      yield* provide(handleSync({ preview: false }));

      const applied = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 1,
        warningCount: 1,
      });
      expect(planResultSteps(applied)).toMatchObject([
        { label: "mcp-server demo", status: "applied" },
      ]);
      expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toContain('"node"');
    }),
  );

  it.effect("refuses to overwrite an unowned inline MCP agent config collision", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"));
      writeSettings(tempDir, {
        agents: ["claude-code"],
        mcpServers: {
          demo: {
            enabled: true,
            command: "node",
            args: ["server.js"],
            env: {},
          },
        },
      });
      writeJson(path.join(tempDir, ".mcp.json"), {
        mcpServers: {
          demo: {
            type: "stdio",
            command: "python",
          },
        },
      });

      yield* provide(handleSync({ preview: true, failOnChange: true }));

      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          outcome: "failed",
          reason: "hard-blocked",
          steps: [
            expect.objectContaining({
              message: expect.stringContaining("collides with unowned native config"),
            }),
          ],
        },
      });
      expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toContain('"python"');
    }),
  );

  it.effect("blocks every phase when instruction preflight finds an unowned target", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: { release: "workspace:@acme/skills/release" },
      });
      writeSkillExtension(tempDir, "release");
      writeSettings(tempDir, {
        agents: ["claude-code"],
        skills: { release: "workspace:@acme/skills/release" },
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
      });
      fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Desired\n");
      fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Human-owned\n");

      yield* provide(handleSync({ preview: false }));

      const payload = expectRecord(rendererState.results[0]?.data);
      const result = expectRecord(property(payload, "result"));
      expect(result).toMatchObject({ outcome: "failed", reason: "hard-blocked" });
      expect(planResultSteps(result)).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("Instruction reconciliation would overwrite"),
        }),
      );
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "release"))).toBe(false);
      expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf8")).toBe("# Human-owned\n");
    }),
  );

  it.effect("blocks cleanup and instructions after an earlier runtime failure", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: { release: "workspace:@acme/skills/release" },
      });
      writeSkillExtension(tempDir, "release");
      writeSettings(tempDir, {
        agents: ["claude-code"],
        skills: { release: "workspace:@acme/skills/release" },
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
      });
      fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Desired\n");
      writeRenderedSubagent(tempDir, ".claude", "stale", true);

      yield* provide(
        handleSync(
          { preview: false },
          {
            beforeMaterialization: () =>
              Effect.fail(
                makeAppError({ code: "internal", detail: "Injected materialization failure" }),
              ),
          },
        ),
      );

      const payload = expectRecord(rendererState.results[0]?.data);
      const result = expectRecord(property(payload, "result"));
      expect(property(result, "outcome")).toBe("failed");
      expect(property(result, "failedCount")).toBe(1);
      expect(property(result, "blockedCount")).toBe(0);
      expect(property(result, "unappliedCount")).toBe(2);
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "release"))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "stale.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
    }),
  );

  it.effect("resolves the same cleanup and instruction targets for preview and apply", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"] });
      writeSettings(tempDir, {
        agents: ["claude-code"],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
      });
      fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Desired\n");
      writeRenderedSubagent(tempDir, ".claude", "stale", true);

      yield* provide(handleSync({ preview: true }));
      yield* provide(handleSync({ preview: false }));

      const preview = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 2,
      });
      const applied = expectAppliedPlanResult(rendererState.results[1]?.data, {
        planName: "Sync workspace",
        totalSteps: 2,
      });
      const projection = (step: unknown) => {
        const record = expectRecord(step);
        return {
          label: property(record, "label"),
          artifact: property(record, "artifact"),
        };
      };
      expect(planResultSteps(preview).map(projection)).toEqual(
        planResultSteps(applied).map(projection),
      );
      const instructionArtifact = expectRecord(
        property(
          expectRecord(
            planResultSteps(preview).find(
              (step) => property(expectRecord(step), "label") === "instruction files",
            ),
          ),
          "artifact",
        ),
      );
      expect(property(instructionArtifact, "managedRegions")).toEqual([
        {
          unitId: "rule:instructions-region",
          path: "AGENTS.md#rules",
          owner: "@agentxm/rules/instructions",
        },
      ]);

      yield* provide(handleSync({ preview: false }));
      expectNoOpPlanResult(rendererState.results[2]?.data, {
        planName: "Sync workspace",
        message: "Workspace materialization is up to date",
      });
    }),
  );

  it.effect("removes a stale external lock row when settings declare workspace authority", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "review");

      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: {
          review: "workspace:@acme/skills/review",
        },
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@legacy",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "local",
            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });
      writeJson(path.join(skillDir, "skill.json"), {
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.0.0",
      });
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "src", "SKILL.md"),
        "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
      );

      yield* provide(handleSync({ preview: false }));

      expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
      });
      const lockfile = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
      expect(lockfile.skills.review).toBeUndefined();
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review", "SKILL.md"))).toBe(
        true,
      );
    }),
  );

  it.effect("reuses a trusted registry canonical when only agent projections are stale", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "review");
      writeSkillExtension(tempDir, "review");
      const sourceHash = computePackageContentHashSync(skillDir);
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: {
          review: "@acme/skills/review@1.0.0",
        },
        sources: [
          {
            name: "default",
            type: "registry",
            location: "file:///tmp/registry-version-does-not-exist",
          },
        ],
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@acme",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            sourceHash,
          },
        },
        writeTrustFromLockfile: true,
      });

      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review"))).toBe(false);

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "review"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review"))).toBe(true);
      expect(fs.existsSync(path.join(skillDir, "src", "SKILL.md"))).toBe(true);
    }),
  );

  it.effect("names the extension when materialization preflight cannot resolve its source", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: {
          review: "./missing-review-skill",
        },
      });

      const error = yield* provide(handleSync({ preview: false })).pipe(Effect.flip);

      expect(error.detail).toContain("skill review");
      expect(error.detail).toContain("canonical status");
      expect(rendererState.results).toEqual([]);
    }),
  );

  it.effect("renders skills to the universal target with no configured agents", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "solo");

      writeWorkspaceFiles(axmDir, {
        agents: [],
        skills: {
          solo: "workspace:@acme/skills/solo",
        },
      });
      writeJson(path.join(skillDir, "skill.json"), {
        owner: "@acme",
        type: "skill",
        name: "solo",
        version: "1.0.0",
      });
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(skillDir, "src", "SKILL.md"), "# Solo\n");

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "solo", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "solo"))).toBe(false);
    }),
  );

  it.effect("syncs only the requested extension FQN", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: {
          review: "workspace:@acme/skills/review",
          release: "workspace:@acme/skills/release",
        },
      });
      writeSkillExtension(tempDir, "review");
      writeSkillExtension(tempDir, "release");

      yield* provide(
        handleSync({
          target: Option.some("@acme/skills/release"),
          preview: false,
        }),
      );

      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync @acme/skills/release",
        totalSteps: 1,
      });
      const steps = planResultSteps(result);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        status: "applied",
      });
      expect(property(expectRecord(steps[0]), "label")).toContain(
        "previous source=none; proposed source=workspace:@acme/skills/release",
      );
      expect(property(expectRecord(steps[0]), "label")).toContain(
        "previous version=none; proposed version=1.0.0",
      );
      expect(property(expectRecord(steps[0]), "label")).toContain("downgrade=no");
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "release", "SKILL.md"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review"))).toBe(false);
    }),
  );

  it.effect("syncs only extensions of the requested type", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: {
          review: "workspace:@acme/skills/review",
        },
        subagents: {
          release: "workspace:@acme/subagents/release",
        },
      });
      writeSkillExtension(tempDir, "review");
      writeSubagentExtension(tempDir, "release");

      yield* provide(
        handleSync({
          type: Option.some("skill"),
          preview: false,
        }),
      );

      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review", "SKILL.md"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "release.md"))).toBe(false);
    }),
  );

  it.effect("treats canonical per-agent extensions as current when no agents are configured", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
        subagents: {
          release: "workspace:@acme/subagents/release",
        },
      });
      writeSubagentExtension(tempDir, "release");

      yield* provide(handleSync({ preview: false }));

      expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        message: "Workspace materialization is up to date",
      });
    }),
  );

  it.effect("materializes settings-owned knowledge bundles", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeKnowledgeExtension(axmDir, "handbook");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        knowledge: {
          handbook: "workspace:@acme/knowledge/handbook",
        },
      });
      writeSettings(tempDir, {
        agents: [],
        knowledge: {
          handbook: "workspace:@acme/knowledge/handbook",
        },
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
      });

      yield* provide(handleSync({ preview: false }));

      const index = path.join(tempDir, "AGENTS.md");
      expect(fs.existsSync(index)).toBe(true);
      const instructions = fs.readFileSync(index, "utf-8");
      expect(instructions).toContain("### @acme");
      expect(instructions).toContain(
        "[handbook](.axm/extensions/@acme/knowledge/handbook/src/index.md)",
      );
      expect(
        fs.existsSync(
          path.join(axmDir, "extensions", "@acme", "knowledge", "handbook", "src", "index.md"),
        ),
      ).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".agents", "knowledge"))).toBe(false);
    }),
  );

  it.effect("restores external Knowledge from its accepted resolution", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeLocalKnowledgePackage(path.join(tempDir, "locked-source"), "handbook", "Locked");
      writeLocalKnowledgePackage(path.join(tempDir, "newer-source"), "handbook", "Newer");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        knowledge: {
          handbook: { source: "./newer-source", enabled: true },
        },
        lockfileKnowledge: {
          handbook: {
            type: "local",
            path: "locked-source",
            contentIdentity: computePackageContentHashSync(path.join(tempDir, "locked-source")),
            installedAt: "2026-08-04T00:00:00.000Z",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
        },
      });
      const settingsBefore = fs.readFileSync(path.join(axmDir, "settings.json"), "utf8");
      const lockfileBefore = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8");

      yield* provide(handleSync({ preview: false }));

      expect(
        fs.readFileSync(
          path.join(
            tempDir,
            ".axm",
            "extensions",
            "external",
            "knowledge",
            "handbook",
            "src",
            "concept.md",
          ),
          "utf8",
        ),
      ).toContain("# Locked");
      expect(
        fs.readFileSync(
          path.join(
            tempDir,
            ".axm",
            "extensions",
            "external",
            "knowledge",
            "handbook",
            "src",
            "concept.md",
          ),
          "utf8",
        ),
      ).not.toContain("# Newer");
      expect(fs.readFileSync(path.join(axmDir, "settings.json"), "utf8")).toBe(settingsBefore);
      expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).toBe(lockfileBefore);
    }),
  );

  it.effect("includes instruction reconciliation in non-git previews without gitignore work", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeSettings(tempDir, {
        agents: ["claude-code"],
        instructionFiles: {
          fileName: "AGENTS.md",
          gitignoreAliases: true,
        },
      });
      fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

      yield* provide(handleSync({ preview: true }));

      const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 1,
      });
      expect(planResultSteps(result)).toMatchObject([
        { label: "instruction files", status: "ready" },
      ]);
      const rendered = rendererState.logs.map((entry) => entry.message).join("\n");
      expect(rendered).not.toContain("instruction gitignore entries");
      expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
    }),
  );

  it.effect("removes managed subagent files for agents removed from settings", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        subagents: {
          review: "workspace:@acme/subagents/review",
        },
      });
      writeSubagentExtension(tempDir, "review");
      writeRenderedSubagent(tempDir, ".cursor", "review", true);

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".cursor", "agents", "review.md"))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "review.md"))).toBe(true);
    }),
  );

  it.effect("removes managed subagent files when the settings entry is disabled", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        subagents: {
          review: {
            source: "workspace:@acme/subagents/review",
            enabled: false,
          },
        },
      });
      writeSubagentExtension(tempDir, "review");
      writeRenderedSubagent(tempDir, ".claude", "review", true);

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "review.md"))).toBe(false);
    }),
  );

  it.effect("removes managed subagent files for on-disk extensions absent from settings", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
      });
      writeSubagentExtension(tempDir, "orphan");
      writeRenderedSubagent(tempDir, ".claude", "orphan", true);

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "orphan.md"))).toBe(false);
    }),
  );

  it.effect("leaves unmanaged subagent files untouched during cleanup", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
      });
      writeRenderedSubagent(tempDir, ".claude", "manual", false);

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "manual.md"))).toBe(true);
    }),
  );
});
