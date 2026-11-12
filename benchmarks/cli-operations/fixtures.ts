import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { ScenarioDimensions } from "./model.js";

/** Full process completion, including drained stdout/stderr. */
export interface ProcessResult {
  readonly durationMs: number;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly cpuUserMs: number | null;
  readonly cpuSystemMs: number | null;
  readonly peakRssBytes: number | null;
  readonly ioReadBytes: number | null;
  readonly ioWriteBytes: number | null;
}

export interface InvocationOptions {
  readonly processWrapper?: ReadonlyArray<string>;
  readonly binary?: string;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly stdin?: string;
}

export interface ScenarioContext {
  readonly subject: "baseline" | "candidate";
  readonly repoRoot: string;
  readonly binary: string;
  readonly root: string;
  readonly workspace: string;
  readonly home: string;
  readonly run: (
    args: ReadonlyArray<string>,
    options?: InvocationOptions,
  ) => Promise<ProcessResult>;
}

export interface PreparedInvocation extends InvocationOptions {
  readonly args: ReadonlyArray<string>;
  readonly expectedExitCode: number;
  readonly verify: (result: ProcessResult) => void | Promise<void>;
  readonly dispose?: () => void | Promise<void>;
  readonly metrics?: () => Readonly<Record<string, number>>;
}

/** Preparation runs for every sample, before the measured process starts. */
export interface BenchmarkScenario {
  readonly id: string;
  readonly operationId: string;
  readonly modeId: string;
  readonly fixtureId: string;
  readonly description: string;
  readonly knownBaselineLimitation?: string;
  readonly dimensions: ScenarioDimensions;
  readonly prepare: (context: ScenarioContext) => Promise<PreparedInvocation>;
}

export const writeJson = async (file: string, value: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};

export const assertSuccessful = (result: ProcessResult): void => {
  if (result.exitCode !== 0) {
    throw new Error(
      `Fixture command failed (${result.exitCode}):\n${result.stdout}\n${result.stderr}`,
    );
  }
};

export const readJsonObject = async (file: string): Promise<Readonly<Record<string, unknown>>> => {
  const value: unknown = JSON.parse(await fs.readFile(file, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Expected an object in ${file}`);
  return Object.fromEntries(Object.entries(value));
};

export const assertOutput = (result: ProcessResult, text: string): void => {
  if (!(result.stdout + result.stderr).includes(text)) {
    throw new Error(
      `Expected benchmark output to include ${JSON.stringify(text)}:\n${result.stdout}\n${result.stderr}`,
    );
  }
};

export const configureWorkspace = async (
  context: ScenarioContext,
  settings: Readonly<Record<string, unknown>> = {},
): Promise<void> => {
  const registry = path.join(context.root, "registry");
  await fs.mkdir(registry, { recursive: true });
  await writeJson(path.join(context.workspace, "axm.json"), {
    owner: "@benchmark",
    agents: ["claude-code", "codex"],
    defaultRegistry: "benchmark",
    sources: [{ name: "benchmark", type: "registry", location: pathToFileURL(registry).href }],
    ...settings,
  });
};

export const extensionKinds = [
  { plural: "skills", type: "skill", manifest: "skill.json", settingsKey: "skills" },
  { plural: "subagents", type: "subagent", manifest: "subagent.json", settingsKey: "subagents" },
  { plural: "mcps", type: "mcp-server", manifest: "mcp.json", settingsKey: "mcpServers" },
  { plural: "rules", type: "rule", manifest: "rule.json", settingsKey: "rules" },
  { plural: "hooks", type: "hook", manifest: "hook.json", settingsKey: "hooks" },
  { plural: "knowledge", type: "knowledge", manifest: "knowledge.json", settingsKey: "knowledge" },
  { plural: "packs", type: "pack", manifest: "pack.json", settingsKey: "packs" },
] as const;

export type ExtensionKind = (typeof extensionKinds)[number];

/** Small valid packages with actual content for each owner, independent of scaffolder output. */
export const packageFiles = (
  kind: ExtensionKind,
  name = "sample",
  version = "1.0.0",
): Readonly<Record<string, string>> => {
  const common = {
    owner: "@benchmark",
    type: kind.type,
    name,
    version,
    description: "Benchmark extension",
  };
  const files: Record<string, string> = {};
  let manifest: Readonly<Record<string, unknown>> = common;
  switch (kind.type) {
    case "skill":
      files["src/SKILL.md"] =
        `---\nname: ${name}\ndescription: Benchmark extension\n---\n# Benchmark skill\nReview the current change.\n`;
      break;
    case "subagent":
      manifest = { ...common, core: { instructions: "src/instructions.md" } };
      files["src/instructions.md"] = "# Benchmark reviewer\nReview the current change.\n";
      break;
    case "mcp-server":
      manifest = {
        ...common,
        server: {
          name: `io.github.benchmark/${name}`,
          description: common.description,
          version,
          remotes: [{ type: "streamable-http", url: "https://benchmark.invalid/mcp" }],
        },
      };
      break;
    case "rule":
      files["src/RULE.md"] = "# Benchmark rule\nKeep changes focused.\n";
      break;
    case "hook":
      manifest = {
        ...common,
        configuration: { label: { type: "string", default: "original" } },
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
                  args: [{ config: "label" }],
                },
              },
            ],
          },
          {
            id: "codex",
            protocol: "codex",
            bindings: [
              {
                id: "observe",
                event: "SessionStart",
                handler: {
                  type: "command",
                  runtime: "node",
                  entrypoint: "src/hook.js",
                  args: [{ config: "label" }],
                },
              },
            ],
          },
        ],
        fixtures: [
          {
            id: "empty",
            implementation: "native",
            binding: "observe",
            input: "fixtures/input.json",
            expect: { exitCode: 0, stdout: "fixtures/empty.txt", stderr: "fixtures/empty.txt" },
          },
        ],
      };
      files["src/hook.js"] = "process.stdin.resume();\n";
      files["fixtures/input.json"] = '{"hook_event_name":"SessionStart"}\n';
      files["fixtures/empty.txt"] = "";
      break;
    case "knowledge":
      manifest = { ...common, format: { name: "okf", version: "0.2" }, bundleRoot: "src" };
      files["src/index.md"] =
        '---\nokf_version: "0.2"\n---\n# Benchmark knowledge\n\n[Architecture](architecture.md): Project architecture.\n';
      files["src/architecture.md"] =
        "---\ntype: reference\ndescription: Project architecture\n---\n# Architecture\n\n[Related](related.md).\n";
      files["src/related.md"] =
        "---\ntype: reference\ndescription: Supporting reference\n---\n# Companion\n";
      break;
    case "pack":
      manifest = { ...common, dependencies: {} };
      break;
  }
  files[kind.manifest] = `${JSON.stringify(manifest, null, 2)}\n`;
  return files;
};

export const writePackage = async (
  directory: string,
  kind: ExtensionKind,
  name = "sample",
  version = "1.0.0",
): Promise<void> => {
  for (const [relative, content] of Object.entries(packageFiles(kind, name, version))) {
    await fs.mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
    await fs.writeFile(path.join(directory, relative), content);
  }
};

/** Records authorship then realizes the same fixture through the real CLI. */
export const prepareAuthoredPackage = async (
  context: ScenarioContext,
  kind: ExtensionKind,
  name = "sample",
  enabled = true,
): Promise<string> => {
  const directory = path.join(context.workspace, kind.plural, name);
  await writePackage(directory, kind, name);
  await configureWorkspace(context, {
    agents: ["claude-code"],
    instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
    [kind.settingsKey]: {
      [name]: {
        source: "workspace",
        enabled,
        ...(kind.type === "mcp-server"
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
  });
  assertSuccessful(
    await context.run(["sync", "--non-interactive", "--accept-execution-changes", "--json"]),
  );
  return directory;
};
