import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";
import * as Schema from "effect/Schema";
import { fixtureArchive, startHttpRegistry } from "@agentxm/client-e2e-utils/registry";
import { LockfileSchema, parseLockfileToml } from "@agentxm/workspace-kernel/workspace-state";
import type { BenchmarkMode, BenchmarkOperation, ScenarioDimensions } from "./model.js";
import { wrapPrepared, type PreparedExpectation } from "./verification.js";
import {
  assertOutput,
  assertSuccessful,
  configureWorkspace,
  extensionKinds,
  packageFiles,
  prepareAuthoredPackage,
  readJsonObject,
  writeJson,
  writePackage,
  type BenchmarkScenario,
  type ExtensionKind,
  type PreparedInvocation,
  type ScenarioContext,
} from "./fixtures.js";

const fixtureVersion = "workspace-operations-v1";
const skill = extensionKinds[0];
const knowledge = extensionKinds[5];

const exists = async (file: string): Promise<boolean> =>
  fs.access(file).then(
    () => true,
    () => false,
  );

const invocation = (args: ReadonlyArray<string>, mode: BenchmarkMode): PreparedInvocation => ({
  args: [...args, ...mode.arguments, ...mode.flags, "--non-interactive"],
  expectedExitCode: 0,
  verify: (result) => {
    if ((result.stdout + result.stderr).length === 0)
      throw new Error("Operation emitted no result");
    if (result.stdout.includes('"type": "help"'))
      throw new Error("Operation unexpectedly returned help");
  },
});

const initializeGit = async (context: ScenarioContext): Promise<void> => {
  for (const args of [
    ["init", "--quiet"],
    ["add", "."],
  ]) {
    const child = Bun.spawn(["git", ...args], {
      cwd: context.workspace,
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: process.env["PATH"], HOME: context.home, GIT_CONFIG_NOSYSTEM: "1" },
    });
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    if (code !== 0) throw new Error(`Git fixture failed: ${stderr}`);
  }
};

/** The retained reference workload has 20 Skills and ten 50-concept Knowledge bundles. */
export const prepareInventory = async (context: ScenarioContext, count = 30): Promise<void> => {
  const entries: Record<string, Record<string, { source: string }>> = { skills: {}, knowledge: {} };
  for (let index = 0; index < count; index++) {
    const kind = index % 3 === 2 ? knowledge : skill;
    const name = `extension-${index}`;
    const source = `./vendor/${name}`;
    await writePackage(path.join(context.workspace, source), kind, name);
    const selected = entries[kind.settingsKey];
    if (selected === undefined) throw new Error("Unexpected inventory kind");
    selected[name] = { source };
    if (kind.type === "knowledge") {
      for (let concept = 0; concept < 48; concept++) {
        await fs.writeFile(
          path.join(context.workspace, source, "src", `concept-${concept}.md`),
          `---\ntype: reference\ndescription: Benchmark concept\n---\n# Concept ${concept}\n`,
        );
      }
    }
  }
  await configureWorkspace(context, entries);
  assertSuccessful(await context.run(["sync", "--json", "--non-interactive"]));
};

const installInvocation = async (
  context: ScenarioContext,
  kind: ExtensionKind,
  route: ReadonlyArray<string>,
  mode: BenchmarkMode,
  change: "install" | "update" | "no-op-update" = "install",
  settings: Readonly<Record<string, unknown>> = {},
): Promise<PreparedInvocation> => {
  const registry = await startHttpRegistry();
  try {
    const archive = fixtureArchive(packageFiles(kind));
    registry.seed({
      owner: "@benchmark",
      plural: kind.plural,
      name: "sample",
      version: "1.0.0",
      archive,
    });
    await configureWorkspace(context, {
      agents: ["claude-code"],
      defaultRegistry: "benchmark",
      sources: [{ name: "benchmark", type: "registry", location: registry.url }],
      minimumReleaseAge: "0s",
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
      ...settings,
    });
    if (change !== "install") {
      assertSuccessful(
        await context.run([
          "install",
          `@benchmark/${kind.plural}/sample`,
          "--accept-execution-changes",
          "--non-interactive",
          "--json",
        ]),
      );
      if (change === "update")
        registry.seed({
          owner: "@benchmark",
          plural: kind.plural,
          name: "sample",
          version: "1.1.0",
          archive: fixtureArchive(
            Object.fromEntries(
              Object.entries(packageFiles(kind, "sample", "1.1.0")).map(([file, body]) => [
                file,
                file.endsWith(".md")
                  ? `${body}\nUpdated package content.\n`
                  : file.endsWith(".js")
                    ? `${body}\n// Updated package content.\n`
                    : body,
              ]),
            ),
          ),
        });
    }
    const requestsBefore = registry.requests.length;
    const batchesBefore = registry.metadataRequests.length;
    return {
      ...invocation(
        [
          ...route,
          change !== "install" && route.length > 1 ? "sample" : `@benchmark/${kind.plural}/sample`,
          "--accept-execution-changes",
        ],
        mode,
      ),
      verify: async (result) => {
        assertOutput(result, "sample");
        if (mode.id !== "preview" && !(await exists(path.join(context.workspace, "axm.lock"))))
          throw new Error("Install did not create accepted state");
        if (mode.id !== "preview") {
          const lock = await fs.readFile(path.join(context.workspace, "axm.lock"), "utf8");
          const expectedVersion = change === "update" ? "1.1.0" : "1.0.0";
          if (!lock.includes(`version = "${expectedVersion}"`))
            throw new Error(`Accepted state did not retain ${expectedVersion}`);
        }
      },
      metrics: () => ({
        requests: registry.requests.length - requestsBefore,
        metadataBatches: registry.metadataRequests.length - batchesBefore,
      }),
      dispose: () => registry.close(),
    };
  } catch (error) {
    await registry.close();
    throw error;
  }
};

const prepareNativeImport = async (
  context: ScenarioContext,
  plural: string,
): Promise<ReadonlyArray<string>> => {
  await configureWorkspace(context, { agents: ["claude-code"] });
  if (plural === "mcps") {
    await writeJson(path.join(context.workspace, ".mcp.json"), {
      mcpServers: { native: { type: "http", url: "https://benchmark.invalid/mcp" } },
    });
    return ["native", "@benchmark/mcps/imported"];
  }
  const nativeRoot = path.join(context.workspace, "native");
  await fs.mkdir(nativeRoot);
  if (plural === "skills") {
    await fs.writeFile(
      path.join(nativeRoot, "SKILL.md"),
      "---\nname: imported\ndescription: Imported benchmark\n---\n# Imported skill\n",
    );
    return [nativeRoot, "@benchmark/skills/imported"];
  }
  if (plural === "subagents") {
    const nativeFile = path.join(nativeRoot, "reviewer.md");
    await fs.writeFile(
      nativeFile,
      "---\nname: reviewer\ndescription: Imported reviewer\n---\nReview the change.\n",
    );
    return [nativeFile, "@benchmark/subagents/imported", "--source-agent", "claude-code"];
  }
  if (plural === "hooks") {
    await fs.mkdir(path.join(nativeRoot, "src"));
    await fs.writeFile(path.join(nativeRoot, "src", "hook.js"), "process.stdin.resume();\n");
    await writeJson(path.join(nativeRoot, "hooks.json"), {
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node src/hook.js" }] }] },
    });
    return [
      nativeRoot,
      "@benchmark/hooks/imported",
      "--protocol",
      "claude-code",
      "--resource",
      "src/hook.js",
    ];
  }
  throw new Error(`Unimplemented native import fixture: ${plural}`);
};

const prepareHandoff = async (context: ScenarioContext): Promise<void> => {
  const source = path.join(context.root, "upstream", "review");
  const native = path.join(context.workspace, ".agents", "skills", "review");
  const projected = path.join(context.workspace, ".claude", "skills", "review");
  const body = "---\nname: review\ndescription: Review benchmark\n---\n# Review\n";
  await Promise.all([
    fs.mkdir(source, { recursive: true }),
    fs.mkdir(native, { recursive: true }),
    fs.mkdir(path.dirname(projected), { recursive: true }),
  ]);
  await fs.writeFile(path.join(source, "SKILL.md"), body);
  await fs.writeFile(path.join(native, "SKILL.md"), body);
  await fs.symlink(path.relative(path.dirname(projected), native), projected);
  await writeJson(path.join(context.workspace, "skills-lock.json"), {
    version: 1,
    skills: {
      review: {
        source,
        sourceUrl: source,
        sourceType: "local",
        computedHash: createHash("sha256").update("SKILL.md").update(body).digest("hex"),
      },
    },
  });
};

type ScenarioPreparer = (
  context: ScenarioContext,
  mode: BenchmarkMode,
) => Promise<PreparedInvocation>;

const typedPreparer = (
  operation: BenchmarkOperation,
  kind: ExtensionKind,
): ScenarioPreparer | undefined => {
  const action = operation.route[1];
  if (action === "install")
    return async (context, mode) => {
      if (mode.id === "bundled") {
        await configureWorkspace(context, { agents: ["claude-code"] });
        return invocation([...operation.route, "@agentxm/skills/axm"], mode);
      }
      return installInvocation(context, kind, operation.route, mode);
    };
  if (action === "update")
    return (context, mode) => installInvocation(context, kind, operation.route, mode, "update");
  if (action === "new")
    return async (context, mode) => {
      await configureWorkspace(context, { agents: ["claude-code"] });
      return {
        ...invocation(
          [...operation.route, "created", "--description", "Created benchmark extension"],
          mode,
        ),
        verify: async (result) => {
          assertOutput(result, "created");
          if (
            (await exists(path.join(context.workspace, kind.plural, "created", kind.manifest))) !==
            (mode.id !== "preview")
          )
            throw new Error("Creation did not respect preview/apply");
        },
      };
    };
  if (action === "import")
    return async (context, mode) =>
      invocation([...operation.route, ...(await prepareNativeImport(context, kind.plural))], mode);
  if (["list", "show", "update", "enable", "disable", "uninstall"].includes(action ?? ""))
    return async (context, mode) => {
      await prepareAuthoredPackage(context, kind, "sample", action !== "enable");
      return invocation(
        [
          ...operation.route,
          ...(action === "list" ? [] : ["sample"]),
          ...(["enable", "update"].includes(action ?? "") ? ["--accept-execution-changes"] : []),
        ],
        mode.id === "render" ? { ...mode, flags: ["--render", "claude-code"] } : mode,
      );
    };
  if (operation.id === "skills handoff")
    return async (context, mode) => {
      await prepareHandoff(context);
      return invocation([...operation.route, "--skill", "review", "--agent", "claude-code"], mode);
    };
  if (operation.id === "knowledge lint" || operation.route[1] === "concepts")
    return async (context, mode) => {
      const directory = await prepareAuthoredPackage(context, knowledge);
      const action = operation.route[2];
      const parameters =
        operation.id === "knowledge lint"
          ? ["--path", directory]
          : action === "query"
            ? ["Architecture"]
            : ["get", "resolve", "related"].includes(action ?? "")
              ? [mode.id === "fuzzy" ? "Companion" : "@benchmark/knowledge/sample#architecture"]
              : [];
      return invocation([...operation.route, ...parameters], mode);
    };
  if (operation.id === "mcps add")
    return async (context, mode) => {
      await configureWorkspace(context, { agents: ["claude-code"] });
      return invocation(
        [
          ...operation.route,
          "inline",
          "--url",
          "https://benchmark.invalid/mcp",
          "--accept-execution-changes",
        ],
        mode,
      );
    };
  if (operation.id === "mcps adopt")
    return async (context, mode) => {
      await prepareNativeImport(context, "mcps");
      return invocation([...operation.route, "--name", "native"], mode);
    };
  if (["hooks configure", "hooks test", "hooks export"].includes(operation.id))
    return async (context, mode) => {
      const directory = await prepareAuthoredPackage(context, kind);
      if (operation.id === "hooks export") {
        await writeJson(path.join(directory, "hook.json"), {
          owner: "@benchmark",
          type: "hook",
          name: "sample",
          version: "1.0.0",
          implementations: [
            {
              id: "native",
              protocol: "claude-code",
              bindings: [
                {
                  id: "observe",
                  event: "SessionStart",
                  handler: {
                    type: "command",
                    runtime: "node",
                    entrypoint: "src/hook.js",
                    args: ["original"],
                  },
                },
              ],
            },
          ],
        });
        assertSuccessful(
          await context.run(["sync", "--json", "--non-interactive", "--accept-execution-changes"]),
        );
      }
      const args =
        operation.id === "hooks configure"
          ? ["sample", "--configuration", '{"label":"replacement"}', "--accept-execution-changes"]
          : operation.id === "hooks test"
            ? [directory]
            : [
                directory,
                path.join(context.workspace, "exported-hook"),
                "--implementation",
                "native",
              ];
      return invocation([...operation.route, ...args], mode);
    };
  if (["packs add", "packs remove", "packs unpack"].includes(operation.id))
    return async (context, mode) => {
      await writePackage(path.join(context.workspace, "skills", "member"), skill, "member");
      await prepareAuthoredPackage(context, kind);
      const settingsFile = path.join(context.workspace, "axm.json");
      const settings = await readJsonObject(settingsFile);
      await writeJson(settingsFile, { ...settings, skills: { member: { source: "workspace" } } });
      assertSuccessful(await context.run(["sync", "--json", "--non-interactive"]));
      if (operation.id !== "packs add")
        assertSuccessful(
          await context.run(["packs", "add", "sample", "member", "--json", "--non-interactive"]),
        );
      return invocation(
        [
          ...operation.route,
          "sample",
          ...(operation.id === "packs unpack" ? [] : ["@benchmark/skills/member"]),
        ],
        mode,
      );
    };
  return undefined;
};

const rootPreparer = (operation: BenchmarkOperation): ScenarioPreparer | undefined => {
  if (operation.id === "install")
    return (context, mode) => installInvocation(context, skill, operation.route, mode);
  if (operation.id === "update")
    return (context, mode) => installInvocation(context, skill, operation.route, mode, "update");
  if (operation.id === "setup")
    return async (_context, mode) =>
      invocation(["setup", "--scope", "project", "--agent", "claude-code", "--yes"], mode);
  if (operation.id === "list")
    return async (context, mode) => {
      await prepareInventory(context);
      return invocation(operation.route, mode);
    };
  if (
    ["update", "uninstall", "enable", "disable", "sync", "lint", "lock export"].includes(
      operation.id,
    )
  )
    return async (context, mode) => {
      if (operation.id === "lock export") {
        await writePackage(path.join(context.workspace, "vendor", "sample"), skill);
        await configureWorkspace(context, { skills: { sample: { source: "./vendor/sample" } } });
        assertSuccessful(await context.run(["sync", "--json", "--non-interactive"]));
      } else {
        if (operation.id === "lint" && ["fix", "preview"].includes(mode.id))
          await fs.writeFile(
            path.join(context.workspace, "AGENTS.md"),
            "# Benchmark instructions\nPreserve this authored content.\n",
          );
        await prepareAuthoredPackage(context, skill, "sample", operation.id !== "enable");
      }
      if (mode.id === "staged") {
        await initializeGit(context);
        const settingsPath = path.join(context.workspace, "axm.json");
        await writeJson(settingsPath, {
          ...(await readJsonObject(settingsPath)),
          agents: "claude-code",
        });
        const workingTreeLint = await context.run(["lint", "--json", "--non-interactive"]);
        if (workingTreeLint.exitCode === 0)
          throw new Error(
            "Staged fixture's invalid working tree unexpectedly passed ordinary lint",
          );
        assertOutput(workingTreeLint, "agents");
        assertOutput(workingTreeLint, "axm.json");
      }
      if (operation.id === "lint" && ["fix", "preview"].includes(mode.id))
        await fs.rm(path.join(context.workspace, "CLAUDE.md"), { force: true });
      const args =
        operation.id === "lock export"
          ? ["--format", "cyclonedx"]
          : ["update", "uninstall", "enable", "disable"].includes(operation.id)
            ? ["@benchmark/skills/sample"]
            : [];
      return invocation(
        [
          ...operation.route,
          ...args,
          ...(operation.id === "lint" && mode.id === "preview" ? ["--fix"] : []),
        ],
        mode,
      );
    };
  if (operation.id === "fork")
    return async (context, mode) => {
      await prepareAuthoredPackage(context, skill);
      return invocation(
        [...operation.route, "workspace:@benchmark/skills/sample", "@benchmark/skills/forked"],
        mode,
      );
    };
  if (operation.id === "version")
    return async (context, mode) => {
      await prepareAuthoredPackage(context, skill);
      return invocation([...operation.route, "@benchmark/skills/sample", "minor"], mode);
    };
  if (operation.id === "adopt")
    return async (context, mode) => {
      const source = path.join(context.workspace, "vendor", "sample");
      await writePackage(source, skill);
      await configureWorkspace(context, {
        skills: { sample: { source: "./vendor/sample", enabled: false } },
      });
      assertSuccessful(await context.run(["sync", "--json", "--non-interactive"]));
      return invocation([...operation.route, "@benchmark/skills/sample"], mode);
    };
  if (operation.route[0] === "instructions")
    return async (context, mode) => {
      await configureWorkspace(context, { agents: ["claude-code"] });
      await fs.writeFile(
        path.join(context.workspace, "AGENTS.md"),
        "# Project instructions\nPreserve this text.\n",
      );
      if (operation.id === "instructions enable") await initializeGit(context);
      if (operation.id === "instructions disable" || operation.id === "instructions status")
        assertSuccessful(
          await context.run(["instructions", "enable", "--json", "--non-interactive"]),
        );
      if (operation.id === "instructions adopt") {
        await prepareAuthoredPackage(context, extensionKinds[3]);
        const body = await fs.readFile(path.join(context.workspace, "AGENTS.md"), "utf8");
        await fs.writeFile(
          path.join(context.workspace, "AGENTS.md"),
          body.replace("Keep changes focused.", "Keep changes carefully focused."),
        );
      }
      return invocation(
        [...operation.route, ...(operation.id === "instructions adopt" ? ["rules"] : [])],
        mode,
      );
    };
  if (operation.id === "agents add" || operation.id === "agents remove")
    return async (context, mode) => {
      await prepareAuthoredPackage(context, skill);
      if (mode.id === "detected") await fs.mkdir(path.join(context.workspace, ".codex"));
      return invocation(
        [
          ...operation.route,
          ...(mode.id === "detected"
            ? []
            : [operation.id === "agents add" ? "codex" : "claude-code"]),
        ],
        mode,
      );
    };
  return undefined;
};

export const localScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> =>
  operations.flatMap((operation) => {
    if (operation.groupOnly) return [];
    const kind = extensionKinds.find((candidate) => candidate.plural === operation.route[0]);
    const prepare = kind === undefined ? rootPreparer(operation) : typedPreparer(operation, kind);
    if (prepare === undefined) return [];
    return operation.modes
      .filter((mode) => mode.kind === "operation" && !["outdated", "deprecated"].includes(mode.id))
      .map((mode) => ({
        id: `${operation.id}/${mode.id}/primary`,
        operationId: operation.id,
        modeId: mode.id,
        fixtureId: fixtureVersion,
        description: `Real ${operation.id} ${mode.id} with isolated, reset owner state`,
        dimensions: primaryDimensions(operation, mode),
        prepare: async (context: ScenarioContext) =>
          verifyLocalPreparation(context, operation, mode, await prepare(context, mode)),
      }));
  });

export const prepareMixedInventory = async (
  context: ScenarioContext,
  count: number,
): Promise<void> => {
  const entries: Record<string, Record<string, unknown>> = {};
  for (let index = 0; index < count; index++) {
    const kind = extensionKinds[index % extensionKinds.length];
    if (kind === undefined) throw new Error("Missing fixture kind");
    const name = `${kind.plural}-${Math.floor(index / extensionKinds.length)}`;
    const selectedExternal = kind.type === "subagent" && name === "subagents-0";
    const directory = path.join(context.workspace, selectedExternal ? "vendor" : kind.plural, name);
    await writePackage(directory, kind, name);
    const selected = entries[kind.settingsKey] ?? {};
    selected[name] = {
      source: selectedExternal ? `./vendor/${name}` : "workspace",
      ...(kind.type === "mcp-server"
        ? {
            distribution: {
              kind: "remote",
              transport: "streamable-http",
              url: "https://benchmark.invalid/mcp",
            },
          }
        : {}),
    };
    entries[kind.settingsKey] = selected;
    if (kind.type === "pack") {
      const manifest = await readJsonObject(path.join(directory, kind.manifest));
      await writeJson(path.join(directory, kind.manifest), {
        ...manifest,
        dependencies: { "@benchmark/skills/skills-0": ">=1.0.0" },
      });
    }
  }
  await configureWorkspace(context, {
    ...entries,
    agents: ["claude-code", "codex"],
    instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
  });
  assertSuccessful(
    await context.run(["sync", "--json", "--accept-execution-changes", "--non-interactive"]),
  );
};

/** Explicit growth/state comparisons supplement, never replace, per-route coverage. */
export const scalingScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> => {
  const selected = new Set([
    "list",
    "sync",
    "update",
    "lint",
    ...extensionKinds.map((kind) => `${kind.plural} show`),
  ]);
  return operations
    .filter((operation) => selected.has(operation.id))
    .flatMap((operation) =>
      [14, 70].flatMap((count) =>
        ["unchanged", "changed"].flatMap((state) => {
          if (state === "changed" && !["sync", "update"].includes(operation.id)) return [];
          const mode = operation.modes.find((candidate) => candidate.id === "json");
          if (mode === undefined) throw new Error("Missing JSON mode");
          return [
            {
              id: `${operation.id}/json/mixed-${count}-${state}`,
              operationId: operation.id,
              modeId: "json",
              fixtureId: `mixed-seven-kinds-v1-${count}-${state}`,
              description: `${count} authored extensions, shared native documents, Pack dependencies, ${state}`,
              dimensions: {
                scope: "project",
                source: "mixed",
                selection:
                  operation.id === "sync" || kindFor(operation) !== undefined ? "targeted" : "bulk",
                view: "filesystem",
                output: "json",
                state: ["sync", "update"].includes(operation.id)
                  ? state === "changed"
                    ? "changed"
                    : "no-op"
                  : "query",
                format: "mixed-native-json-toml-markdown",
                kinds: extensionKinds.map((kind) => kind.type),
              },
              prepare: async (context: ScenarioContext) => {
                await prepareMixedInventory(context, count);
                if (state === "changed") {
                  if (operation.id === "sync")
                    await fs.rm(
                      path.join(context.workspace, ".claude", "agents", "subagents-0.md"),
                    );
                  else
                    await fs.appendFile(
                      path.join(
                        context.workspace,
                        "vendor",
                        "subagents-0",
                        "src",
                        "instructions.md",
                      ),
                      "\nCheck the new behavior.\n",
                    );
                }
                const kind = extensionKinds.find(
                  (candidate) => candidate.plural === operation.route[0],
                );
                const target =
                  kind === undefined
                    ? operation.id === "sync"
                      ? ["@benchmark/subagents/subagents-0"]
                      : []
                    : [`${kind.plural}-0`];
                const prepared = invocation(
                  [...operation.route, ...target, "--accept-execution-changes"],
                  mode,
                );
                const expectation: PreparedExpectation =
                  operation.id === "list"
                    ? {
                        noDurableChange: true,
                        output: { json: [{ at: ["result", "count"], equals: count }] },
                      }
                    : kind !== undefined || operation.id === "lint"
                      ? { noDurableChange: true }
                      : state === "changed"
                        ? {
                            artifacts: [
                              {
                                kind: "text",
                                path: ".claude/agents/subagents-0.md",
                                includes: [
                                  operation.id === "sync"
                                    ? "Review the current change."
                                    : "Check the new behavior.",
                                ],
                              },
                            ],
                          }
                        : {
                            readonlyPaths: [
                              "axm.json",
                              "axm.lock",
                              ".claude",
                              ".codex",
                              "AGENTS.md",
                              "CLAUDE.md",
                            ],
                          };
                return wrapPrepared(context, mode, prepared, expectation);
              },
            },
          ];
        }),
      ),
    );
};

export const repetitionScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> =>
  operations.flatMap((operation) => {
    const kind = extensionKinds.find((candidate) => candidate.plural === operation.route[0]);
    const action = operation.route.length === 1 ? operation.id : operation.route[1];
    const mode = operation.modes.find((candidate) => candidate.id === "json");
    if (mode === undefined || !["update", "enable", "disable", "uninstall"].includes(action ?? ""))
      return [];
    const selectedKind = kind ?? skill;
    const prepare = kind === undefined ? rootPreparer(operation) : typedPreparer(operation, kind);
    if (prepare === undefined) return [];
    return [
      {
        id: `${operation.id}/json/no-op`,
        operationId: operation.id,
        modeId: "json",
        fixtureId: `${fixtureVersion}-no-op`,
        description: "Repeat an already satisfied operation against independently reset state",
        dimensions: { ...primaryDimensions(operation, mode), state: "no-op" },
        prepare: async (context: ScenarioContext) => {
          const prepared =
            action === "update"
              ? await installInvocation(
                  context,
                  selectedKind,
                  operation.route,
                  mode,
                  "no-op-update",
                )
              : await prepare(context, mode);
          if (action !== "update") assertSuccessful(await context.run(prepared.args, prepared));
          return wrapPrepared(context, mode, prepared, {
            readonlyPaths: [
              "axm.json",
              "axm.lock",
              ".claude",
              ".mcp.json",
              "AGENTS.md",
              "CLAUDE.md",
            ],
          });
        },
      },
    ];
  });

/** User scope uses the same operation against its real selected workspace and home outputs. */
export const userScopeScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> =>
  operations
    .filter(
      (operation) =>
        operation.ownFlags.includes("scope") &&
        (operation.id === "list" ||
          operation.id === "sync" ||
          operation.route[1] === "list" ||
          operation.route[1] === "show"),
    )
    .flatMap((operation) => {
      const kind = extensionKinds.find((candidate) => candidate.plural === operation.route[0]);
      const prepare = kind === undefined ? rootPreparer(operation) : typedPreparer(operation, kind);
      const mode = operation.modes.find((candidate) => candidate.id === "json");
      if (prepare === undefined || mode === undefined) return [];
      return [
        {
          id: `${operation.id}/json/user-scope`,
          operationId: operation.id,
          modeId: "json",
          fixtureId: `${fixtureVersion}-user`,
          description: "Read and reconcile the user workspace while invoked outside it",
          dimensions: {
            ...primaryDimensions(operation, mode),
            scope: "user",
            source: "registry",
            kinds: [(kind ?? skill).type],
          },
          prepare: async (context: ScenarioContext) => {
            const workspace = path.join(context.home, ".axm", "workspace");
            await fs.mkdir(workspace, { recursive: true });
            const userContext: ScenarioContext = {
              ...context,
              workspace,
              run: (args, options) => context.run([...args, "--scope", "user"], options),
            };
            const installed = await installInvocation(
              userContext,
              kind ?? skill,
              ["install"],
              mode,
              "install",
              kind?.type === "knowledge" ? { agents: ["cursor"] } : {},
            );
            try {
              assertSuccessful(await userContext.run(installed.args));
              const initialMetrics = installed.metrics?.() ?? {};
              const prepared = invocation(
                [
                  ...operation.route,
                  ...(operation.route[1] === "show" ? ["sample"] : []),
                  "--scope",
                  "user",
                ],
                mode,
              );
              return await wrapPrepared(
                userContext,
                mode,
                {
                  ...prepared,
                  ...(installed.dispose === undefined ? {} : { dispose: installed.dispose }),
                  ...(installed.metrics === undefined
                    ? {}
                    : {
                        metrics: () =>
                          Object.fromEntries(
                            Object.entries(installed.metrics?.() ?? {}).map(([key, value]) => [
                              key,
                              value - (initialMetrics[key] ?? 0),
                            ]),
                          ),
                      }),
                },
                {
                  ...(operation.id === "sync"
                    ? { readonlyPaths: ["axm.json", "axm.lock"] }
                    : { noDurableChange: true }),
                  ...(operation.id === "list" || operation.route[1] === "list"
                    ? { output: { json: [{ at: ["result", "count"], equals: 1 }] } }
                    : {}),
                },
              );
            } catch (error) {
              await installed.dispose?.();
              throw error;
            }
          },
        },
      ];
    });

/** Changed user operations run beside an independently populated project. */
export const userMutationScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> =>
  [
    "skills install",
    "skills update",
    "skills uninstall",
    "skills enable",
    "skills disable",
    "agents add",
    "agents remove",
    "instructions enable",
    "instructions disable",
  ].map((operationId): BenchmarkScenario => {
    const operation = operations.find((candidate) => candidate.id === operationId);
    const mode = operation?.modes.find((candidate) => candidate.id === "json");
    if (operation === undefined || mode === undefined)
      throw new Error(`Missing registered user mutation: ${operationId}`);
    const instructions = operation.route[0] === "instructions";
    return {
      id: `${operationId}/json/user-change`,
      operationId,
      modeId: "json",
      fixtureId: `${fixtureVersion}-user-change`,
      description:
        "Change user state while preserving the populated project and its native outputs",
      dimensions: {
        scope: "user",
        source: instructions ? "none" : "registry",
        selection: instructions || operation.route[0] === "agents" ? "bulk" : "targeted",
        view: "filesystem",
        output: "json",
        state: "changed",
        format: instructions ? "instructions-markdown" : "manifest-and-markdown",
        kinds: instructions ? [] : ["skill"],
      },
      prepare: async (context) => {
        await prepareAuthoredPackage(context, skill, "project-only");
        // Registry selection intentionally merges project and user settings. Let this
        // project use its authored package without shadowing the user's Registry.
        const projectSettings = await readJsonObject(path.join(context.workspace, "axm.json"));
        await writeJson(
          path.join(context.workspace, "axm.json"),
          Object.fromEntries(
            Object.entries(projectSettings).filter(
              ([key]) => key !== "sources" && key !== "defaultRegistry",
            ),
          ),
        );
        const workspace = path.join(context.home, ".axm", "workspace");
        await fs.mkdir(workspace, { recursive: true });
        const userContext: ScenarioContext = {
          ...context,
          workspace,
          run: (args, options) => context.run([...args, "--scope", "user"], options),
        };
        const nativeSkill = path.join(context.home, ".claude", "skills", "sample", "SKILL.md");
        const codexSkill = path.join(context.home, ".agents", "skills", "sample", "SKILL.md");
        const nativeInstructions = path.join(context.home, ".claude", "CLAUDE.md");
        let prepared: PreparedInvocation;
        let artifacts: NonNullable<PreparedExpectation["artifacts"]>;
        if (instructions) {
          await configureWorkspace(userContext, { agents: ["claude-code"] });
          await fs.writeFile(
            path.join(context.home, "AGENTS.md"),
            "# User instructions\nPreserve the user guidance.\n",
          );
          if (operationId === "instructions disable")
            assertSuccessful(
              await userContext.run([
                "instructions",
                "enable",
                "--no-gitignore",
                "--json",
                "--non-interactive",
              ]),
            );
          prepared = invocation(
            [
              ...operation.route,
              "--scope",
              "user",
              ...(operationId === "instructions enable" ? ["--no-gitignore"] : []),
            ],
            mode,
          );
          artifacts = [
            {
              kind: "text",
              path: path.join(context.home, "AGENTS.md"),
              includes: ["Preserve the user guidance."],
            },
            operationId === "instructions enable"
              ? { kind: "symlink", path: nativeInstructions, target: "../AGENTS.md" }
              : { kind: "absent", path: nativeInstructions },
            {
              kind: "json",
              path: "axm.json",
              assertions: [
                {
                  at: ["instructionFiles"],
                  equals:
                    operationId === "instructions disable"
                      ? false
                      : { fileName: "AGENTS.md", gitignoreAliases: false },
                },
              ],
            },
          ];
        } else {
          const installed = await installInvocation(
            userContext,
            skill,
            operationId === "skills install" || operationId === "skills update"
              ? operation.route
              : ["skills", "install"],
            mode,
            operationId === "skills update" ? "update" : "install",
          );
          try {
            if (operationId === "skills install" || operationId === "skills update") {
              prepared = { ...installed, args: [...installed.args, "--scope", "user"] };
              artifacts = [
                {
                  kind: "text",
                  path: nativeSkill,
                  includes: [
                    operationId === "skills update"
                      ? "Updated package content."
                      : "Review the current change.",
                  ],
                },
              ];
            } else {
              assertSuccessful(await userContext.run(installed.args));
              if (operationId === "skills enable")
                assertSuccessful(
                  await userContext.run([
                    "skills",
                    "disable",
                    "sample",
                    "--json",
                    "--non-interactive",
                  ]),
                );
              const selectedAgent = operationId === "agents remove" ? "claude-code" : "codex";
              const initialMetrics = installed.metrics?.() ?? {};
              prepared = {
                ...invocation(
                  [
                    ...operation.route,
                    operation.route[0] === "agents" ? selectedAgent : "sample",
                    "--scope",
                    "user",
                  ],
                  mode,
                ),
                verify: async (result) => {
                  assertOutput(result, operation.route[0] === "agents" ? selectedAgent : "sample");
                  if (operationId === "skills enable" || operationId === "skills disable")
                    await verifyDeclaration(
                      userContext,
                      skill,
                      "sample",
                      operationId === "skills enable",
                      null,
                    );
                  if (
                    operationId === "skills uninstall" &&
                    (await exists(path.join(workspace, "axm.lock"))) &&
                    (await fs.readFile(path.join(workspace, "axm.lock"), "utf8")).includes(
                      "@benchmark/skills/sample",
                    )
                  )
                    throw new Error("User uninstall retained the accepted Skill resolution");
                },
                ...(installed.dispose === undefined ? {} : { dispose: installed.dispose }),
                ...(installed.metrics === undefined
                  ? {}
                  : {
                      metrics: () =>
                        Object.fromEntries(
                          Object.entries(installed.metrics?.() ?? {}).map(([key, value]) => [
                            key,
                            value - (initialMetrics[key] ?? 0),
                          ]),
                        ),
                    }),
              };
              artifacts =
                operation.route[0] === "agents"
                  ? [
                      {
                        kind: "json",
                        path: "axm.json",
                        assertions: [
                          {
                            at: ["agents"],
                            equals: operationId === "agents add" ? ["claude-code", "codex"] : [],
                          },
                        ],
                      },
                      ...(operationId === "agents add"
                        ? [
                            {
                              kind: "text",
                              path: codexSkill,
                              includes: ["Review the current change."],
                            } satisfies NonNullable<PreparedExpectation["artifacts"]>[number],
                          ]
                        : []),
                      operationId === "agents add"
                        ? {
                            kind: "text",
                            path: nativeSkill,
                            includes: ["Review the current change."],
                          }
                        : { kind: "absent", path: nativeSkill },
                    ]
                  : [
                      operationId === "skills enable"
                        ? {
                            kind: "text",
                            path: nativeSkill,
                            includes: ["Review the current change."],
                          }
                        : { kind: "absent", path: nativeSkill },
                      ...(operationId === "skills uninstall"
                        ? [
                            {
                              kind: "json",
                              path: "axm.json",
                              assertions: [{ at: ["skills", "sample"], absent: true }],
                            } satisfies NonNullable<PreparedExpectation["artifacts"]>[number],
                          ]
                        : []),
                    ];
            }
          } catch (error) {
            await installed.dispose?.();
            throw error;
          }
        }
        try {
          return await wrapPrepared(userContext, mode, prepared, {
            readonlyPaths: [context.workspace],
            artifacts,
          });
        } catch (error) {
          await prepared.dispose?.();
          throw error;
        }
      },
    };
  });

const primaryExpectation = (
  operation: BenchmarkOperation,
  mode: BenchmarkMode,
): PreparedExpectation => {
  const kind = extensionKinds.find((candidate) => candidate.plural === operation.route[0]);
  const action = operation.route.length === 1 ? operation.id : operation.route[1];
  const selectedKind = kind ?? skill;
  const setting = (at: ReadonlyArray<string>, equals: unknown): PreparedExpectation => ({
    artifacts: [{ kind: "json", path: "axm.json", assertions: [{ at, equals }] }],
  });
  if (mode.id === "bundled")
    return {
      artifacts: [{ kind: "text", path: ".claude/skills/axm/SKILL.md", includes: ["name: axm"] }],
      output: { includes: ["axm"] },
    };
  if (operation.id === "lock export")
    return {
      noDurableChange: true,
      output:
        mode.id === "json"
          ? { envelope: "raw", json: [{ at: ["bomFormat"], equals: "CycloneDX" }] }
          : { includes: ["CycloneDX"] },
    };
  if (
    operation.id === "list" &&
    ["outdated", "deprecated", "archived", "deprecated-archived"].includes(mode.id)
  )
    return {
      noDurableChange: true,
      output: {
        includes: [
          `No ${mode.id === "deprecated-archived" ? "deprecated or archived" : mode.id} extensions found`,
        ],
      },
    };
  if (action === "list")
    return {
      noDurableChange: true,
      output:
        mode.id === "json"
          ? { json: [{ at: ["result", "count"], equals: kind === undefined ? 30 : 1 }] }
          : { includes: [kind === undefined ? "extension-0" : "sample"] },
    };
  if (action === "show") return { noDurableChange: true, output: { includes: ["sample"] } };
  if (action === "install" || action === "update")
    return {
      artifacts: [
        {
          kind: "text",
          path: "axm.lock",
          includes: [`version = "${action === "install" ? "1.0.0" : "1.1.0"}"`],
        },
      ],
      output: { includes: ["sample"] },
    };
  if ((action === "enable" && kind !== undefined) || operation.id === "enable") return {};
  if ((action === "disable" && kind !== undefined) || operation.id === "disable")
    return setting([selectedKind.settingsKey, "sample", "enabled"], false);
  if (action === "uninstall")
    return {
      artifacts: [
        {
          kind: "json",
          path: "axm.json",
          assertions: [{ at: [selectedKind.settingsKey, "sample"], absent: true }],
        },
      ],
    };
  if (action === "new" && kind !== undefined)
    return {
      artifacts: [
        {
          kind: "json",
          path: `${kind.plural}/created/${kind.manifest}`,
          assertions: [
            { at: ["name"], equals: "created" },
            { at: ["owner"], equals: "@benchmark" },
            { at: ["type"], equals: kind.type },
          ],
        },
      ],
    };
  if (action === "import" && kind !== undefined)
    return {
      artifacts: [
        {
          kind: "json",
          path: `${kind.plural}/imported/${kind.manifest}`,
          assertions: [
            { at: ["name"], equals: "imported" },
            { at: ["type"], equals: kind.type },
          ],
        },
      ],
    };
  switch (operation.id) {
    case "setup":
      return {
        artifacts: [
          {
            kind: "json",
            path: "axm.json",
            assertions: [
              { at: ["agents"], equals: ["claude-code"] },
              { at: ["skills", "axm", "source"], equals: "workspace" },
              { at: ["skills", "axm", "origin"], equals: "bundled" },
            ],
          },
          { kind: "text", path: "axm.lock", includes: ["version = 1"] },
          {
            kind: "text",
            path: ".claude/skills/axm/SKILL.md",
            includes: ["name: axm"],
          },
        ],
      };
    case "sync":
      return {
        readonlyPaths: ["axm.json", "axm.lock", "skills", ".claude", "AGENTS.md", "CLAUDE.md"],
        outcome: "no-op",
      };
    case "lint":
      return mode.id === "fix" || mode.id === "preview"
        ? {
            readonlyPaths: ["axm.json", "AGENTS.md", "skills", ".claude/skills"],
            artifacts: [{ kind: "symlink", path: "CLAUDE.md", target: "AGENTS.md" }],
          }
        : {
            noDurableChange: true,
            ...(mode.id === "staged" ? { readonlyPaths: [".git/index"] } : {}),
          };
    case "fork":
      return {
        artifacts: [
          {
            kind: "json",
            path: "skills/forked/skill.json",
            assertions: [
              { at: ["name"], equals: "forked" },
              { at: ["owner"], equals: "@benchmark" },
            ],
          },
          {
            kind: "text",
            path: "skills/forked/src/SKILL.md",
            includes: ["Review the current change."],
          },
        ],
      };
    case "version":
      return {
        artifacts: [
          {
            kind: "json",
            path: "skills/sample/skill.json",
            assertions: [{ at: ["version"], equals: "1.1.0" }],
          },
        ],
      };
    case "adopt":
      return {
        artifacts: [
          {
            kind: "json",
            path: "skills/sample/skill.json",
            assertions: [{ at: ["name"], equals: "sample" }],
          },
          {
            kind: "json",
            path: "axm.json",
            assertions: [{ at: ["skills", "sample", "source"], equals: "workspace" }],
          },
        ],
      };
    case "mcps add":
      return {
        artifacts: [
          {
            kind: "json",
            path: ".mcp.json",
            assertions: [
              { at: ["mcpServers", "inline", "url"], equals: "https://benchmark.invalid/mcp" },
            ],
          },
        ],
      };
    case "mcps adopt":
      return {
        artifacts: [
          {
            kind: "json",
            path: "axm.json",
            assertions: [
              {
                at: ["mcpServers", "native", "connection", "transport"],
                equals: "streamable-http",
              },
              {
                at: ["mcpServers", "native", "connection", "url"],
                equals: "https://benchmark.invalid/mcp",
              },
              { at: ["mcpServers", "native", "agents"], absent: true },
            ],
          },
          {
            kind: "json",
            path: ".mcp.json",
            assertions: [
              { at: ["mcpServers", "native", "url"], equals: "https://benchmark.invalid/mcp" },
            ],
          },
        ],
        output: { includes: ["native"] },
      };
    case "hooks configure":
      return {
        artifacts: [
          {
            kind: "json",
            path: "axm.json",
            assertions: [
              { at: ["hooks", "sample", "configuration", "label"], equals: "replacement" },
            ],
          },
          { kind: "text", path: ".claude/settings.json", includes: ["replacement"] },
        ],
      };
    case "hooks test":
      return {
        output:
          mode.id === "json"
            ? { json: [{ at: ["result", "passed"], equals: true }] }
            : { includes: ["empty"] },
      };
    case "hooks export":
      return {
        artifacts: [
          {
            kind: "text",
            path: "exported-hook/hooks.json",
            includes: ["node", "hook.js", "original"],
          },
          { kind: "text", path: "exported-hook/src/hook.js", includes: ["process.stdin.resume"] },
        ],
      };
    case "packs add":
      return {
        artifacts: [
          {
            kind: "json",
            path: "packs/sample/pack.json",
            assertions: [{ at: ["dependencies", "@benchmark/skills/member"], equals: ">=1.0.0" }],
          },
        ],
      };
    case "packs remove":
      return {
        artifacts: [
          {
            kind: "json",
            path: "packs/sample/pack.json",
            assertions: [{ at: ["dependencies", "@benchmark/skills/member"], absent: true }],
          },
        ],
      };
    case "packs unpack":
      return {
        artifacts: [
          {
            kind: "json",
            path: "axm.json",
            assertions: [{ at: ["packs", "sample"], absent: true }],
          },
        ],
      };
    case "agents add":
      return {
        artifacts: [
          {
            kind: "json",
            path: "axm.json",
            assertions: [{ at: ["agents"], equals: ["claude-code", "codex"] }],
          },
          {
            kind: "text",
            path: ".agents/skills/sample/SKILL.md",
            includes: ["Review the current change."],
          },
        ],
      };
    case "agents remove":
      return {
        artifacts: [
          { kind: "json", path: "axm.json", assertions: [{ at: ["agents"], equals: [] }] },
          { kind: "absent", path: ".claude/skills/sample" },
        ],
      };
    case "instructions enable":
      return {
        artifacts: [
          {
            kind: "json",
            path: "axm.json",
            assertions: [
              { at: ["instructionFiles", "fileName"], equals: "AGENTS.md" },
              ...(mode.id === "no-gitignore"
                ? [{ at: ["instructionFiles", "gitignoreAliases"], equals: false }]
                : []),
            ],
          },
          { kind: "symlink", path: "CLAUDE.md", target: "AGENTS.md" },
          ...(mode.id === "no-gitignore"
            ? [
                {
                  kind: "absent",
                  path: ".gitignore",
                } satisfies import("./verification.js").ArtifactExpectation,
              ]
            : []),
        ],
      };
    case "instructions disable":
      return {
        artifacts: [
          {
            kind: "json",
            path: "axm.json",
            assertions: [{ at: ["instructionFiles"], equals: false }],
          },
          { kind: "absent", path: "CLAUDE.md" },
        ],
      };
    case "instructions status":
      return { noDurableChange: true, output: { includes: ["AGENTS.md"] } };
    case "instructions adopt":
      return {
        readonlyPaths: ["axm.json", "AGENTS.md", "rules"],
        artifacts: [
          { kind: "text", path: "AGENTS.md", includes: ["Keep changes carefully focused."] },
        ],
        output:
          mode.id === "json"
            ? { json: [{ at: ["result", "counts", "committed"], equals: 1 }] }
            : { includes: ["rules"] },
      };
    case "skills handoff":
      return {
        artifacts: [
          {
            kind: "json",
            path: "skills-lock.json",
            assertions: [{ at: ["skills", "review"], absent: true }],
          },
          { kind: "text", path: ".agents/skills/review/SKILL.md", includes: ["# Review"] },
          {
            kind: "json",
            path: "axm.json",
            assertions: [{ at: ["agents"], equals: ["claude-code"] }],
          },
        ],
      };
    case "knowledge lint":
      return {
        noDurableChange: true,
        output: mode.id === "json" ? { json: [{ at: ["result", "valid"], equals: true }] } : {},
      };
    default:
      return { noDurableChange: true };
  }
};

const kindFor = (operation: BenchmarkOperation): ExtensionKind | undefined =>
  extensionKinds.find((kind) => kind.plural === operation.route[0]);
const primaryDimensions = (
  operation: BenchmarkOperation,
  mode: BenchmarkMode,
): ScenarioDimensions => {
  const kind = kindFor(operation);
  const action = operation.route.at(-1);
  const lifecycle = ["install", "update", "enable", "disable", "uninstall"].includes(action ?? "");
  const noOp = operation.id === "sync";
  const source: ScenarioDimensions["source"] =
    mode.id === "bundled" || operation.id === "setup"
      ? "bundled"
      : action === "install" || action === "update"
        ? "registry"
        : action === "import" || operation.id === "mcps adopt" || operation.id === "skills handoff"
          ? "native"
          : ["list", "adopt", "lock export"].includes(operation.id)
            ? "path"
            : "authored";
  const kinds =
    kind === undefined
      ? operation.id === "list"
        ? [skill.type, knowledge.type]
        : [skill.type]
      : [kind.type];
  return {
    scope: "project",
    source,
    selection:
      action === "list" || ["sync", "lint"].includes(operation.id)
        ? "bulk"
        : lifecycle || kind !== undefined || ["adopt", "fork", "version"].includes(operation.id)
          ? "targeted"
          : "none",
    view: mode.id === "staged" ? "git-index" : "filesystem",
    output:
      operation.id === "lock export" || mode.id === "raw"
        ? "raw"
        : mode.id === "render"
          ? "native"
          : mode.flags.includes("--json")
            ? "json"
            : "human",
    state: noOp
      ? "no-op"
      : operation.effect === "none" && !["fix", "preview"].includes(mode.id)
        ? "query"
        : "changed",
    format:
      kind?.type === "mcp-server" || kind?.type === "hook"
        ? "native-json"
        : "manifest-and-markdown",
    kinds,
  };
};

const verifyDeclaration = async (
  context: ScenarioContext,
  kind: ExtensionKind,
  name: string,
  expectedEnabled: boolean,
  expectedSource: string | null = "workspace",
): Promise<void> => {
  const settings = await readJsonObject(path.join(context.workspace, "axm.json"));
  const entries = settings[kind.settingsKey];
  if (typeof entries !== "object" || entries === null || Array.isArray(entries))
    throw new Error(`Missing ${kind.settingsKey} declarations`);
  const entry: unknown = Object.getOwnPropertyDescriptor(entries, name)?.value;
  const record =
    typeof entry === "object" && entry !== null && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry))
      : undefined;
  const source = typeof entry === "string" ? entry : record?.["source"];
  const enabled = typeof entry === "string" ? true : record?.["enabled"] !== false;
  if (
    entry === undefined ||
    (expectedSource !== null && source !== expectedSource) ||
    enabled !== expectedEnabled
  )
    throw new Error(`Unexpected semantic declaration for ${kind.plural}/${name}`);
};

const verifyNativeActivation = async (
  context: ScenarioContext,
  kind: ExtensionKind,
  enabled: boolean,
): Promise<void> => {
  const nativePath =
    kind.type === "skill"
      ? ".claude/skills/sample"
      : kind.type === "subagent"
        ? ".claude/agents/sample.md"
        : undefined;
  if (
    nativePath !== undefined &&
    (enabled
      ? !(await exists(path.join(context.workspace, nativePath)))
      : await fs.lstat(path.join(context.workspace, nativePath)).then(
          () => true,
          (cause: unknown) => {
            if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
            throw cause;
          },
        ))
  )
    throw new Error(`Native activation mismatch at ${nativePath}`);
  if (kind.type === "mcp-server") {
    const file = path.join(context.workspace, ".mcp.json");
    const content = (await exists(file)) ? await fs.readFile(file, "utf8") : "";
    if (content.includes("https://benchmark.invalid/mcp") !== enabled)
      throw new Error("Native MCP activation differs from requested state");
  }
  if (kind.type === "rule") {
    const content = await fs.readFile(path.join(context.workspace, "AGENTS.md"), "utf8");
    if (content.includes("Keep changes focused.") !== enabled)
      throw new Error("Native rule activation differs from requested state");
  }
  if (kind.type === "knowledge") {
    const content = await fs.readFile(path.join(context.workspace, "AGENTS.md"), "utf8");
    if (content.includes("sample") !== enabled)
      throw new Error("Native Knowledge discovery differs from requested state");
  }
  if (kind.type === "hook") {
    const file = path.join(context.workspace, ".claude/settings.json");
    const content = (await exists(file)) ? await fs.readFile(file, "utf8") : "";
    if (content.includes("hook.js") !== enabled)
      throw new Error("Native Hook registration differs from requested state");
  }
};

const verifyLocalPreparation = async (
  context: ScenarioContext,
  operation: BenchmarkOperation,
  mode: BenchmarkMode,
  prepared: PreparedInvocation,
): Promise<PreparedInvocation> => {
  const readLock = async () =>
    Schema.decodeUnknownSync(LockfileSchema)(
      parseLockfileToml(await fs.readFile(path.join(context.workspace, "axm.lock"), "utf8"))
        .document,
    );
  let adoptedLock: unknown;
  if (operation.id === "instructions adopt" && mode.id !== "preview") {
    const before = await readLock();
    const rules = before.projections?.rules;
    const row = Object.entries(rules?.units ?? {}).find(([unit]) => unit === "AGENTS.md")?.[1];
    const raw = await fs.readFile(path.join(context.workspace, "AGENTS.md"), "utf8");
    const body = raw.split("<!-- axm:rules -->\n")[1]?.split("<!-- /axm:rules -->")[0];
    if (rules === undefined || row?.gen === undefined || body === undefined)
      throw new Error(
        "Instruction adoption fixture lacks its existing projection and edited region",
      );
    const output = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    if (row.output === output)
      throw new Error("Instruction adoption fixture already records the edited body");
    adoptedLock = {
      ...before,
      projections: {
        ...before.projections,
        rules: { ...rules, units: { ...rules.units, "AGENTS.md": { ...row, output } } },
      },
    };
  }
  const wrapped = await wrapPrepared(context, mode, prepared, primaryExpectation(operation, mode));
  return {
    ...wrapped,
    verify: async (result) => {
      await wrapped.verify(result);
      if (mode.id === "preview") return;
      if (adoptedLock !== undefined && !isDeepStrictEqual(await readLock(), adoptedLock))
        throw new Error("Instruction adoption did not update only the selected projection digest");
      if (
        operation.id === "list" &&
        ["outdated", "deprecated", "archived", "deprecated-archived"].includes(mode.id)
      ) {
        const output = result.stdout + result.stderr;
        if (/extension-\d+/u.test(output) || output.includes("could not be assessed"))
          throw new Error("Local inventory produced lifecycle matches or an incomplete assessment");
      }
      const action = operation.route.at(-1);
      const kind = kindFor(operation) ?? skill;
      if (action === "enable" || action === "disable") {
        if (operation.route[0] === "instructions") return;
        await verifyDeclaration(context, kind, "sample", action === "enable");
        await verifyNativeActivation(context, kind, action === "enable");
      }
      if (["install", "update", "uninstall"].includes(action ?? "") && mode.id !== "bundled") {
        await verifyNativeActivation(context, kind, action !== "uninstall");
        if (action === "update") {
          const output =
            kind.type === "skill"
              ? ".claude/skills/sample/SKILL.md"
              : kind.type === "subagent"
                ? ".claude/agents/sample.md"
                : kind.type === "rule"
                  ? "AGENTS.md"
                  : undefined;
          if (
            output !== undefined &&
            !(await fs.readFile(path.join(context.workspace, output), "utf8")).includes(
              "Updated package content.",
            )
          )
            throw new Error("Updated native output does not contain the changed package content");
        }
      }
      if (operation.id === "packs unpack") await verifyDeclaration(context, skill, "member", true);
    },
  };
};
