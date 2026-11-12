import { execFileSync } from "node:child_process";
import { deepStrictEqual } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as Schema from "effect/Schema";
import { fixtureArchive } from "@agentxm/client-e2e-utils/registry";
import {
  assertOutput,
  assertSuccessful,
  configureWorkspace,
  extensionKinds,
  packageFiles,
  prepareAuthoredPackage,
  writeJson,
  writePackage,
  type BenchmarkScenario,
  type ExtensionKind,
  type ScenarioContext,
} from "./fixtures.js";
import { startDistributionRegistry } from "./registry.js";
import { wrapPrepared } from "./verification.js";
import type { BenchmarkOperation } from "./model.js";

const fixtureId = "distribution-wire-v1";
const tokenEnvironment = { AXM_TOKEN: "e2e-test-token" };
const benchmarkName = "benchmark";
const identity = (kind: ExtensionKind): string => `@benchmark/${kind.plural}/${benchmarkName}`;
const skillKind = extensionKinds[0];
const configuredViewKinds = extensionKinds.filter((kind) => kind.type !== "pack");

const bindRegistry = async (context: ScenarioContext, url: string, visibility?: "private") => {
  const settingsPath = path.join(context.workspace, "axm.json");
  let settings: Readonly<Record<string, unknown>> = {};
  try {
    settings = Schema.decodeUnknownSync(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
    )(await fs.readFile(settingsPath, "utf8"));
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
  }
  await configureWorkspace(context, {
    ...settings,
    defaultRegistry: "benchmark",
    sources: [{ name: "benchmark", type: "registry", location: url }],
    ...(visibility === undefined ? {} : { publish: { defaultVisibility: visibility } }),
  });
  await writeJson(path.join(context.home, ".axm", "workspace", "axm.json"), {
    defaultRegistry: "benchmark",
    sources: [{ name: "benchmark", type: "registry", location: url }],
  });
};

const seedPackage = (
  registry: Awaited<ReturnType<typeof startDistributionRegistry>>,
  kind: ExtensionKind,
) => {
  const archive = fixtureArchive(packageFiles(kind, benchmarkName));
  registry.seed({
    owner: "@benchmark",
    plural: kind.plural,
    name: benchmarkName,
    version: "1.0.0",
    archive,
  });
};

const authoredFiles = async (directory: string): Promise<Readonly<Record<string, Buffer>>> => {
  const files: Record<string, Buffer> = {};
  const visit = async (relative: string): Promise<void> => {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) files[name] = await fs.readFile(path.join(directory, name));
      else throw new Error(`Unexpected authored fixture entry: ${name}`);
    }
  };
  await visit("");
  return files;
};

const verifyPublishedFiles = (
  registry: Awaited<ReturnType<typeof startDistributionRegistry>>,
  kind: ExtensionKind,
  name: string,
  expected: Readonly<Record<string, Buffer>>,
): void => {
  const actual = registry.archiveEntries("@benchmark", kind.plural, name, "1.0.0");
  deepStrictEqual(
    Object.keys(actual)
      .filter((file) => !file.endsWith("/"))
      .sort(),
    Object.keys(expected).sort(),
    `Published member inventory differs for ${kind.plural}/${name}`,
  );
  for (const [file, expectedBytes] of Object.entries(expected)) {
    const bytes = actual[file];
    if (bytes === undefined) throw new Error(`Missing published member ${file}`);
    if (file === kind.manifest) {
      const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
      deepStrictEqual(
        decode(new TextDecoder().decode(bytes)),
        decode(expectedBytes.toString("utf8")),
        `Published manifest differs for ${kind.plural}/${name}`,
      );
    } else if (!expectedBytes.equals(bytes)) {
      throw new Error(`Published payload differs for ${kind.plural}/${name}/${file}`);
    }
  }
};

const publishScenario = (
  kind: ExtensionKind,
  route: ReadonlyArray<string>,
  mode: "default" | "json" | "preview",
  workload: "selected" | "all-kinds" | "large-knowledge" = "selected",
): BenchmarkScenario => ({
  id: `${route.join("-")}-${kind.type}-${mode}${workload === "selected" ? "" : `-${workload}`}`,
  operationId: route.join(" "),
  modeId: mode,
  fixtureId,
  dimensions: {
    scope: "project",
    source: "authored",
    selection: workload === "all-kinds" ? "bulk" : "targeted",
    view: "filesystem",
    output: mode === "json" ? "json" : "human",
    state: mode === "preview" ? "query" : "changed",
    format: "registry-archive",
    kinds: (workload === "all-kinds" ? extensionKinds : [kind]).map((item) => item.type),
  },
  description: `Publish ${workload === "all-kinds" ? "all seven authored kinds" : workload === "large-knowledge" ? "a 250-document Knowledge archive" : `a valid authored ${kind.type}`} through the real preview/admission/upload protocol (${mode}).`,
  prepare: async (context) => {
    if (workload === "all-kinds") {
      for (const item of extensionKinds)
        await writePackage(
          path.join(context.workspace, item.plural, benchmarkName),
          item,
          benchmarkName,
        );
      await configureWorkspace(context, {
        agents: ["claude-code"],
        ...Object.fromEntries(
          extensionKinds.map((item) => [
            item.settingsKey,
            {
              [benchmarkName]: {
                source: "workspace",
                enabled: true,
                ...(item.type === "mcp-server"
                  ? {
                      distribution: {
                        kind: "remote",
                        transport: "streamable-http",
                        url: "https://benchmark.invalid/mcp",
                      },
                    }
                  : {}),
              },
            },
          ]),
        ),
      });
      assertSuccessful(
        await context.run(["sync", "--accept-execution-changes", "--non-interactive", "--json"]),
      );
    } else {
      await prepareAuthoredPackage(context, kind, benchmarkName);
    }
    if (workload === "large-knowledge") {
      const source = path.join(context.workspace, kind.plural, benchmarkName, "src");
      const links: string[] = [];
      for (let index = 0; index < 250; index += 1) {
        const name = `topic-${String(index).padStart(3, "0")}.md`;
        links.push(`[Topic ${index}](${name}): Benchmark reference ${index}.`);
        await fs.writeFile(
          path.join(source, name),
          `---\ntype: reference\ndescription: Benchmark reference ${index}\n---\n# Topic ${index}\n\n${`Content for topic ${index}. `.repeat(400)}\n`,
        );
      }
      await fs.appendFile(path.join(source, "index.md"), `\n${links.join("\n")}\n`);
    }
    const expectedPackages = await Promise.all(
      (workload === "all-kinds" ? extensionKinds : [kind]).map(async (item) => ({
        kind: item,
        files: await authoredFiles(path.join(context.workspace, item.plural, benchmarkName)),
      })),
    );
    const registry = await startDistributionRegistry();
    try {
      await bindRegistry(context, registry.url);
      registry.resetMetrics();
      return await wrapPrepared(
        context,
        { id: mode, flags: mode === "json" ? ["--json"] : mode === "preview" ? ["--preview"] : [] },
        {
          args: [
            ...route,
            ...(workload === "all-kinds" ? [] : [identity(kind)]),
            "--non-interactive",
            "--accept-warnings",
            ...(mode === "default" ? [] : [`--${mode}`]),
          ],
          env: tokenEnvironment,
          expectedExitCode: 0,
          verify: (result) => {
            assertOutput(result, benchmarkName);
            if (!registry.requests.some((request) => request.path === "/v1/publish-previews"))
              throw new Error("Publication did not reach controlled admission");
            if (
              registry.publishes.length !==
              (mode === "preview" ? 0 : workload === "all-kinds" ? extensionKinds.length : 1)
            )
              throw new Error("Publication did not produce the expected upload footprint");
            if (mode !== "preview") {
              for (const { kind: item, files } of expectedPackages) {
                if (
                  !registry.publishes.some(
                    (published) =>
                      published.owner === "@benchmark" &&
                      published.plural === item.plural &&
                      published.name === benchmarkName &&
                      published.version === "1.0.0" &&
                      published.byteLength > 0,
                  )
                ) {
                  throw new Error(`Missing prepared artifact upload for ${identity(item)}`);
                }
                verifyPublishedFiles(registry, item, benchmarkName, files);
              }
            }
          },
          dispose: registry.close,
          metrics: registry.metrics,
        },
        { noDurableChange: true },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

const registryOperations = [
  "yank",
  "unyank",
  "deprecate",
  "undeprecate",
  "archive",
  "unarchive",
] as const;
type RegistryOperation = (typeof registryOperations)[number];
const managementScenario = (
  operation: RegistryOperation,
  mode: "default" | "json",
  kind: ExtensionKind,
  unchanged = false,
): BenchmarkScenario => ({
  id: `${operation}-${kind.type}-${mode}${unchanged ? "-unchanged" : ""}`,
  operationId: operation,
  modeId: mode,
  fixtureId,
  dimensions: {
    scope: "none",
    source: "registry",
    selection: "targeted",
    view: "none",
    output: mode === "json" ? "json" : "human",
    state: unchanged ? "no-op" : "changed",
    format: "registry-lifecycle",
    kinds: [kind.type],
  },
  description: `Observe and ${unchanged ? "retain" : "change"} remote ${kind.type} ${operation} state over loopback HTTP.`,
  prepare: async (context) => {
    const clearing = operation.startsWith("un");
    const initial = clearing !== unchanged;
    const registry = await startDistributionRegistry({
      archived: operation.includes("archive") && initial,
      deprecated: operation.includes("deprecate") && initial,
      yanked: operation.includes("yank") && initial,
    });
    try {
      seedPackage(registry, kind);
      await bindRegistry(context, registry.url);
      const target = identity(kind);
      const args = [operation, operation.includes("yank") ? `${target}@1.0.0` : target];
      if (operation === "deprecate")
        args.push("--reason", "unmaintained", "--message", "Fixture deprecated");
      if (operation === "archive") args.push("--message", "Fixture archived");
      if (operation === "yank") args.push("--category", "broken", "--message", "Fixture state");
      registry.resetMetrics();
      return await wrapPrepared(
        context,
        { id: mode, flags: mode === "json" ? ["--json"] : [] },
        {
          args: [...args, "--non-interactive", ...(mode === "json" ? ["--json"] : [])],
          env: tokenEnvironment,
          expectedExitCode: 0,
          verify: (result) => {
            assertOutput(result, target);
            if (
              !registry.requests.some((request) =>
                ["PUT", "POST", "DELETE"].includes(request.method),
              )
            )
              throw new Error("Management command made no state request");
            const state = registry.stateFor(target);
            const active = operation.includes("archive")
              ? state.archival !== null
              : operation.includes("deprecate")
                ? state.deprecation !== null
                : state.yanked;
            if (active === clearing)
              throw new Error("Management command did not reach requested state");
            if (mode === "json") assertOutput(result, unchanged ? "already-current" : "changed");
          },
          dispose: registry.close,
          metrics: registry.metrics,
        },
        { noDurableChange: true },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

const visibilityScenario = (
  operation: "status" | "set" | "reconcile",
  mode: "default" | "json",
): BenchmarkScenario => ({
  id: `visibility-${operation}-${mode}`,
  operationId: `visibility ${operation}`,
  modeId: mode,
  fixtureId,
  dimensions: {
    scope: "project",
    source: "mixed",
    selection: "targeted",
    view: "filesystem",
    output: mode === "json" ? "json" : "human",
    state: operation === "status" ? "query" : "changed",
    format: "registry-visibility",
    kinds: [skillKind.type],
  },
  description:
    "Compare or apply repository visibility through controlled optimistic Registry transitions.",
  prepare: async (context) => {
    await prepareAuthoredPackage(context, skillKind, benchmarkName);
    const registry = await startDistributionRegistry();
    try {
      seedPackage(registry, skillKind);
      await bindRegistry(context, registry.url, "private");
      registry.resetMetrics();
      return await wrapPrepared(
        context,
        { id: mode, flags: mode === "json" ? ["--json"] : [] },
        {
          args: [
            "visibility",
            operation,
            identity(skillKind),
            ...(operation === "set" ? ["private"] : []),
            "--non-interactive",
            ...(mode === "json" ? ["--json"] : []),
          ],
          env: tokenEnvironment,
          expectedExitCode: 0,
          verify: (result) => {
            assertOutput(result, identity(skillKind));
            if (!registry.requests.some((request) => request.path.endsWith("/visibility")))
              throw new Error("Visibility was not observed");
            if (
              operation !== "status" &&
              registry.stateFor(identity(skillKind)).visibility !== "private"
            )
              throw new Error("Visibility write did not occur");
            if (
              operation === "status" &&
              registry.requests.some((request) => request.method === "PATCH")
            )
              throw new Error("Visibility status changed remote state");
          },
          dispose: registry.close,
          metrics: registry.metrics,
        },
        { noDurableChange: true },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

const viewScenario = (
  kind: ExtensionKind,
  mode: "default" | "json",
  field?: "version",
  target: "fqn" | "local-name" = "fqn",
): BenchmarkScenario => ({
  id: `view-${kind.type}-${mode}${field === undefined ? "" : `-${field}`}${target === "local-name" ? "-configured-name" : ""}`,
  operationId: "view",
  modeId: mode,
  fixtureId: target === "local-name" ? "configured-name-twelve-identities-v1" : fixtureId,
  dimensions: {
    scope: target === "local-name" ? "project" : "none",
    source: "registry",
    selection: "targeted",
    view: target === "local-name" ? "filesystem" : "none",
    output: mode === "json" ? "json" : field === undefined ? "human" : "plain",
    state: "query",
    format: target === "local-name" ? "configured-name-metadata" : (field ?? "metadata"),
    kinds: target === "local-name" ? configuredViewKinds.map((item) => item.type) : [kind.type],
  },
  description:
    target === "local-name"
      ? "Resolve a typed local alias among twelve configured Registry identities before reading its published metadata"
      : `Read published ${kind.type} metadata${field === undefined ? "" : ` ${field} field`} over loopback HTTP.`,
  prepare: async (context) => {
    const registry = await startDistributionRegistry();
    try {
      seedPackage(registry, kind);
      if (target === "local-name")
        await configureWorkspace(
          context,
          Object.fromEntries(
            configuredViewKinds.map((item) => [
              item.settingsKey,
              {
                "local-view": {
                  source:
                    item.type === kind.type ? identity(kind) : `@benchmark/${item.plural}/decoy`,
                },
                "extra-view": { source: `@benchmark/${item.plural}/extra` },
              },
            ]),
          ),
        );
      await bindRegistry(context, registry.url);
      registry.resetMetrics();
      return await wrapPrepared(
        context,
        { id: mode, flags: mode === "json" ? ["--json"] : [] },
        {
          args: [
            "view",
            target === "local-name" ? "local-view" : identity(kind),
            ...(field === undefined ? [] : [field]),
            ...(target === "local-name" ? ["--type", kind.type] : []),
            "--non-interactive",
            ...(mode === "json" ? ["--json"] : []),
          ],
          env: tokenEnvironment,
          expectedExitCode: 0,
          verify: (result) => {
            assertOutput(result, "1.0.0");
            if (kind.type === "hook" && field === undefined) {
              if (
                !registry.requests.some(
                  (request) =>
                    request.method === "GET" &&
                    request.status === 200 &&
                    decodeURIComponent(request.path) ===
                      `/v1/extensions/${identity(kind)}/1.0.0/archive`,
                )
              )
                throw new Error("Hook view did not inspect its selected published archive");
              if (mode === "json") {
                const document = Schema.decodeUnknownSync(
                  Schema.fromJsonString(
                    Schema.Struct({
                      result: Schema.Struct({
                        hook: Schema.Struct({
                          evidence: Schema.Literal("published-static-only"),
                          manifest: Schema.Unknown,
                        }),
                      }),
                    }),
                  ),
                )(result.stdout);
                const manifest = packageFiles(kind, benchmarkName)[kind.manifest];
                if (manifest === undefined)
                  throw new Error("Missing authored Hook fixture manifest");
                deepStrictEqual(
                  document.result.hook.manifest,
                  Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(manifest),
                  "Hook view did not preserve published manifest facts",
                );
              } else {
                assertOutput(result, "Published static facts");
                assertOutput(result, "native (claude-code)");
                assertOutput(result, "codex (codex)");
                assertOutput(result, "SessionStart");
              }
            }
            if (target === "local-name") {
              assertOutput(result, identity(kind));
              if (
                registry.requests.some((request) => /\/(?:decoy|extra)(?:\/|$)/u.test(request.path))
              )
                throw new Error("Typed local view read an unselected configured Registry identity");
            }
            if (
              !registry.requests.some(
                (request) =>
                  decodeURIComponent(request.path) === `/v1/extensions/${identity(kind)}`,
              )
            )
              throw new Error("View did not read the selected Registry identity");
          },
          dispose: registry.close,
          metrics: registry.metrics,
        },
        {
          noDurableChange: true,
          ...((target === "local-name" || (kind.type === "hook" && field === undefined)) &&
          mode === "json"
            ? {
                output: {
                  json: [
                    { at: ["result", "fqn"], equals: identity(kind) },
                    { at: ["result", "type"], equals: kind.type },
                  ],
                },
              }
            : {}),
        },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

const discoverScenario = (mode: "default" | "json"): BenchmarkScenario => ({
  id: `discover-${mode}`,
  operationId: "discover",
  modeId: mode,
  fixtureId,
  dimensions: {
    scope: "project",
    source: "registry",
    selection: "bulk",
    view: "filesystem",
    output: mode === "json" ? "json" : "human",
    state: "query",
    format: "npm-companions",
    kinds: [skillKind.type],
  },
  description:
    "Discover a companion from installed npm package metadata and a controlled Registry response.",
  prepare: async (context) => {
    const registry = await startDistributionRegistry();
    try {
      await bindRegistry(context, registry.url);
      await writeJson(path.join(context.workspace, "package.json"), {
        dependencies: { "benchmark-package": "1.0.0" },
      });
      await writeJson(
        path.join(context.workspace, "node_modules", "benchmark-package", "package.json"),
        {
          name: "benchmark-package",
          version: "1.0.0",
          agentExtensions: [
            { ref: identity(skillKind), source: { type: "registry", url: registry.url } },
          ],
        },
      );
      registry.resetMetrics();
      return await wrapPrepared(
        context,
        { id: mode, flags: mode === "json" ? ["--json"] : [] },
        {
          args: ["discover", "--non-interactive", ...(mode === "json" ? ["--json"] : [])],
          env: tokenEnvironment,
          expectedExitCode: 0,
          verify: (result) => {
            assertOutput(result, identity(skillKind));
            if (!registry.requests.some((request) => request.path === "/v1/discovery"))
              throw new Error("Discovery never reached the fixture Registry");
          },
          dispose: registry.close,
          metrics: registry.metrics,
        },
        { noDurableChange: true },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

const shareScenario = (mode: "default" | "json", ecosystem?: string): BenchmarkScenario => ({
  id: `share-${mode}${ecosystem === undefined ? "" : `-${ecosystem}`}`,
  operationId: "share",
  modeId: mode,
  fixtureId: "share-git-v1",
  dimensions: {
    scope: "project",
    source: "git",
    selection: "bulk",
    view: "filesystem",
    output: mode === "json" ? "json" : "human",
    state: "query",
    format: ecosystem ?? "install-command",
    kinds: [skillKind.type],
  },
  description:
    "Share an existing committed Skill repository after live local Git source verification.",
  prepare: async (context) => {
    if (ecosystem !== undefined) {
      await writePackage(
        path.join(context.workspace, "skills", benchmarkName),
        skillKind,
        benchmarkName,
      );
      await configureWorkspace(context, {
        skills: { [benchmarkName]: { source: "workspace", enabled: true } },
      });
    } else {
      const skill = path.join(context.workspace, ".agents", "skills", benchmarkName);
      await fs.mkdir(skill, { recursive: true });
      await fs.writeFile(
        path.join(skill, "SKILL.md"),
        "---\nname: benchmark\ndescription: Benchmark skill\n---\n# Review\n",
      );
    }
    for (const args of [
      ["init", "--quiet", "--initial-branch=main"],
      ["config", "user.name", "Benchmark"],
      ["config", "user.email", "benchmark@example.test"],
      ["add", "."],
      ["commit", "--quiet", "-m", "fixture"],
      ["tag", "v1.0.0"],
      ["remote", "add", "origin", pathToFileURL(context.workspace).href],
    ])
      execFileSync("git", args, { cwd: context.workspace, stdio: "ignore" });
    return wrapPrepared(
      context,
      { id: mode, flags: mode === "json" ? ["--json"] : [] },
      {
        args: [
          "share",
          "--non-interactive",
          ...(mode === "json" ? ["--json"] : []),
          ...(ecosystem === undefined ? [] : ["--ecosystem", ecosystem]),
        ],
        expectedExitCode: 0,
        verify: (result) => {
          assertOutput(result, benchmarkName);
          if (ecosystem === undefined) assertOutput(result, "axm install");
          else if (mode === "json") {
            const document = Schema.decodeUnknownSync(
              Schema.fromJsonString(
                Schema.Struct({
                  ok: Schema.Literal(true),
                  result: Schema.Struct({
                    packageMetadata: Schema.Struct({
                      ecosystem: Schema.String,
                      location: Schema.String,
                      tag: Schema.String,
                      content: Schema.String,
                    }),
                  }),
                }),
              ),
            )(result.stdout);
            const metadata = document.result.packageMetadata;
            if (
              metadata.ecosystem !== ecosystem ||
              metadata.tag !== "v1.0.0" ||
              metadata.location.length === 0 ||
              !metadata.content.includes(identity(skillKind))
            )
              throw new Error(
                "Share did not serialize the selected extension into the requested ecosystem metadata",
              );
          } else {
            assertOutput(result, identity(skillKind));
            assertOutput(result, "v1.0.0");
          }
        },
      },
      { noDurableChange: true, readonlyPaths: [".git/index"] },
    );
  },
});

const dependencyPublication = (
  typed: boolean,
  output: "human" | "json" | "preview",
): BenchmarkScenario => ({
  id: `${typed ? "packs-" : ""}publish-include-dependencies-${output}`,
  operationId: typed ? "packs publish" : "publish",
  modeId: "include-dependencies",
  fixtureId: "publication-dependency-graph-v1",
  dimensions: {
    scope: "project",
    source: "authored",
    selection: "bulk",
    view: "filesystem",
    output: output === "json" ? "json" : "human",
    state: output === "preview" ? "query" : "changed",
    format: "registry-archive",
    kinds: ["skill", "pack"],
  },
  description:
    "Publish an authored Pack together with its selected workspace Skill dependency, in dependency order.",
  prepare: async (context) => {
    const pack = extensionKinds[6];
    await writePackage(path.join(context.workspace, "skills", "member"), skillKind, "member");
    await writePackage(path.join(context.workspace, "packs", benchmarkName), pack, benchmarkName);
    const manifestPath = path.join(context.workspace, "packs", benchmarkName, "pack.json");
    const manifest = Schema.decodeUnknownSync(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
    )(await fs.readFile(manifestPath, "utf8"));
    await writeJson(manifestPath, {
      ...manifest,
      dependencies: { "@benchmark/skills/member": "^1.0.0" },
    });
    await configureWorkspace(context, {
      agents: ["claude-code"],
      skills: { member: { source: "workspace" } },
      packs: { [benchmarkName]: { source: "workspace" } },
    });
    assertSuccessful(await context.run(["sync", "--json", "--non-interactive"]));
    const expectedMember = await authoredFiles(path.join(context.workspace, "skills", "member"));
    const expectedPack = await authoredFiles(path.join(context.workspace, "packs", benchmarkName));
    const registry = await startDistributionRegistry();
    try {
      await bindRegistry(context, registry.url);
      registry.resetMetrics();
      const mode = {
        id: output === "preview" ? "preview" : "include-dependencies",
        flags: ["--include-dependencies", ...(output === "human" ? [] : [`--${output}`])],
      };
      return await wrapPrepared(
        context,
        mode,
        {
          args: [
            ...(typed ? ["packs", "publish"] : ["publish"]),
            identity(pack),
            ...mode.flags,
            "--accept-warnings",
            "--non-interactive",
          ],
          env: tokenEnvironment,
          expectedExitCode: 0,
          verify: (result) => {
            assertOutput(result, benchmarkName);
            assertOutput(result, "member");
            const actual = registry.publishes.map(
              (item) => `${item.owner}/${item.plural}/${item.name}`,
            );
            const expected =
              output === "preview" ? [] : ["@benchmark/skills/member", identity(pack)];
            if (JSON.stringify(actual) !== JSON.stringify(expected))
              throw new Error(`Unexpected dependency publication order: ${JSON.stringify(actual)}`);
            if (!registry.requests.some((request) => request.path === "/v1/publish-previews"))
              throw new Error("Pack publication did not reach admission");
            if (output !== "preview") {
              verifyPublishedFiles(registry, skillKind, "member", expectedMember);
              verifyPublishedFiles(registry, pack, benchmarkName, expectedPack);
            }
          },
          dispose: registry.close,
          metrics: registry.metrics,
        },
        { readonlyPaths: ["skills", "packs", "axm.json"] },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

const yankAllVersions = (output: "human" | "json"): BenchmarkScenario => ({
  id: `yank-all-versions-${output}`,
  operationId: "yank",
  modeId: "all-versions",
  fixtureId: "registry-three-versions-v1",
  dimensions: {
    scope: "none",
    source: "registry",
    selection: "bulk",
    view: "none",
    output,
    state: "changed",
    format: "registry-lifecycle",
    kinds: [skillKind.type],
  },
  description: "Yank all three available immutable versions through one Registry operation.",
  prepare: async (context) => {
    const registry = await startDistributionRegistry();
    try {
      for (const version of ["1.0.0", "1.1.0", "1.2.0"])
        registry.seed({
          owner: "@benchmark",
          plural: "skills",
          name: benchmarkName,
          version,
          archive: fixtureArchive(packageFiles(skillKind, benchmarkName, version)),
        });
      await bindRegistry(context, registry.url);
      registry.resetMetrics();
      return await wrapPrepared(
        context,
        { id: output, flags: output === "json" ? ["--json"] : [] },
        {
          args: [
            "yank",
            identity(skillKind),
            "--all-versions",
            "--category",
            "broken",
            "--message",
            "Fixture state",
            "--non-interactive",
            ...(output === "json" ? ["--json"] : []),
          ],
          env: tokenEnvironment,
          expectedExitCode: 0,
          verify: (result) => {
            if (output === "json") {
              assertOutput(result, "1.0.0");
              assertOutput(result, "1.1.0");
              assertOutput(result, "1.2.0");
            } else assertOutput(result, "Yanked 3 available versions");
            if (!registry.stateFor(identity(skillKind)).yanked)
              throw new Error("Available versions were not yanked");
            if (
              registry.requests.filter(
                (request) => request.method === "POST" && request.path.endsWith("/versions/yank"),
              ).length !== 1
            )
              throw new Error("Expected one bulk yank request");
          },
          dispose: registry.close,
          metrics: registry.metrics,
        },
        { noDurableChange: true },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

export const distributionScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> => [
  ...extensionKinds.flatMap((kind) =>
    (["default", "json", "preview"] as const).map((mode) =>
      publishScenario(kind, [kind.plural, "publish"], mode),
    ),
  ),
  ...(["default", "json", "preview"] as const).map((mode) =>
    publishScenario(skillKind, ["publish"], mode),
  ),
  ...(["json", "preview"] as const).map((mode) =>
    publishScenario(skillKind, ["publish"], mode, "all-kinds"),
  ),
  ...extensionKinds
    .filter((kind) => kind.type === "knowledge")
    .flatMap((kind) =>
      (["json", "preview"] as const).map((mode) =>
        publishScenario(kind, ["knowledge", "publish"], mode, "large-knowledge"),
      ),
    ),
  ...registryOperations.flatMap((operation) =>
    (["default", "json"] as const).map((mode) => managementScenario(operation, mode, skillKind)),
  ),
  ...registryOperations.map((operation) => managementScenario(operation, "json", skillKind, true)),
  ...extensionKinds
    .filter((kind) => kind.type !== "skill")
    .flatMap((kind) =>
      registryOperations.map((operation) => managementScenario(operation, "json", kind)),
    ),
  ...(["status", "set", "reconcile"] as const).flatMap((operation) =>
    (["default", "json"] as const).map((mode) => visibilityScenario(operation, mode)),
  ),
  ...extensionKinds.flatMap((kind) =>
    (["default", "json"] as const).map((mode) => viewScenario(kind, mode)),
  ),
  viewScenario(skillKind, "default", "version"),
  ...(["default", "json"] as const).map((mode) =>
    viewScenario(skillKind, mode, undefined, "local-name"),
  ),
  ...(["default", "json"] as const).flatMap((mode) => [
    discoverScenario(mode),
    shareScenario(mode),
    ...(
      operations
        .find((operation) => operation.id === "share")
        ?.flagClassifications.find((flag) => flag.name === "ecosystem")?.choices ?? []
    ).map((ecosystem) => shareScenario(mode, ecosystem)),
  ]),
  ...(["human", "json", "preview"] as const).flatMap((output) => [
    dependencyPublication(false, output),
    dependencyPublication(true, output),
  ]),
  ...(["human", "json"] as const).map(yankAllVersions),
];
