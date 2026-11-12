import * as fs from "node:fs";
import * as path from "node:path";
import type { BenchmarkOperation } from "./model.js";
import {
  assertSuccessful,
  configureWorkspace,
  extensionKinds,
  packageFiles,
  type BenchmarkScenario,
  type ExtensionKind,
  type ScenarioContext,
} from "./fixtures.js";
import { wrapPrepared } from "./verification.js";

const marker = (version: string): string => `Fixture source revision ${version}.`;
const write = (root: string, kind: ExtensionKind, version: string): void => {
  for (const [name, body] of Object.entries(packageFiles(kind, "sample", version))) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      name.endsWith(".md")
        ? `${body}\n${marker(version)}\n`
        : name.endsWith(".js")
          ? `${body}\n// ${marker(version)}\n`
          : kind.type === "mcp-server"
            ? body.replaceAll("Benchmark extension", marker(version))
            : body,
    );
  }
};

const containsPublished = (root: string, expected: string, manifestVersion?: string): boolean => {
  if (!fs.existsSync(root)) return false;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory() && containsPublished(file, expected, manifestVersion)) return true;
    if (entry.isFile()) {
      const body = fs.readFileSync(file, "utf8");
      if (manifestVersion === undefined && body.includes(expected)) return true;
      if (manifestVersion !== undefined && entry.name === "pack.json") {
        const value: unknown = JSON.parse(body);
        if (
          typeof value === "object" &&
          value !== null &&
          Object.getOwnPropertyDescriptor(value, "version")?.value === manifestVersion
        )
          return true;
      }
    }
  }
  return false;
};

/** Local acquisition updates real source bytes; setup is excluded from each measured invocation. */
export const pathSourceScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> =>
  operations
    .filter(
      (operation) =>
        operation.id === "install" ||
        operation.id === "update" ||
        operation.route[1] === "install" ||
        operation.route[1] === "update",
    )
    .map((operation): BenchmarkScenario => {
      const kind =
        extensionKinds.find((candidate) => candidate.plural === operation.route[0]) ??
        extensionKinds[0];
      const update = operation.route.at(-1) === "update";
      const mode = operation.modes.find((candidate) => candidate.id === "json");
      if (mode === undefined) throw new Error("Source scenario needs the registered JSON mode");
      return {
        id: `${operation.id}/json/path-source`,
        operationId: operation.id,
        modeId: "json",
        fixtureId: `package-source-v1-path-${kind.type}-${update ? "update" : "install"}`,
        description: `Local path ${update ? "changed update" : "initial installation"} with real content`,
        ...(kind.type === "pack" && update
          ? {
              knownBaselineLimitation:
                "The frozen baseline reports a committed path Pack update and records accepted manifest-version 1.1.0 while retaining canonical pack.json 1.0.0. This violates the selected declaration/canonical agreement required by packs/acquired-manifest-matches-selected-declaration and install/pack-and-mcp-use-shared-source-resolution. The baseline must reproduce that exact discrepancy; the candidate must retain 1.1.0.",
            }
          : {}),
        dimensions: {
          scope: "project",
          source: "path",
          selection: update && operation.route.length === 1 ? "bulk" : "targeted",
          view: "filesystem",
          output: "json",
          state: "changed",
          format:
            kind.type === "mcp-server" || kind.type === "hook"
              ? "native-json"
              : "manifest-and-markdown",
          kinds: [kind.type],
        },
        prepare: async (context: ScenarioContext) => {
          await configureWorkspace(context, {
            agents: ["claude-code"],
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          });
          const directory = path.join(context.workspace, "vendor", "sample");
          write(directory, kind, "1.0.0");
          if (update) {
            assertSuccessful(
              await context.run([
                kind.plural,
                "install",
                directory,
                `--${kind.type}`,
                "sample",
                "--json",
                "--non-interactive",
                "--accept-execution-changes",
              ]),
            );
            write(directory, kind, "1.1.0");
          }
          const args = [
            ...operation.route,
            ...(update
              ? operation.route.length === 1
                ? []
                : ["sample"]
              : [directory, `--${kind.type}`, "sample"]),
            "--json",
            "--non-interactive",
            "--accept-execution-changes",
          ];
          const version = update ? "1.1.0" : "1.0.0";
          const expected =
            kind.type === "mcp-server"
              ? marker(version)
              : kind.type === "pack"
                ? `"version": "${version}"`
                : marker(version);
          const publishedRoot = path.join(context.workspace, "agent_extensions");
          const expectedCanonicalVersion =
            kind.type === "pack" && update && context.subject === "baseline" ? "1.0.0" : version;
          return wrapPrepared(
            context,
            mode,
            {
              args,
              expectedExitCode: 0,
              ...(kind.type === "pack" && update
                ? {
                    metrics: () => ({
                      canonicalManifestMatchesAccepted: containsPublished(
                        publishedRoot,
                        expected,
                        version,
                      )
                        ? 1
                        : 0,
                    }),
                  }
                : {}),
              verify: (result) => {
                if (!result.stdout.includes("sample"))
                  throw new Error("Source operation did not report the selected package");
                if (
                  kind.type === "pack" &&
                  !fs
                    .readFileSync(path.join(context.workspace, "axm.lock"), "utf8")
                    .includes(`manifest-version = "${version}"`)
                )
                  throw new Error(`Accepted Pack declaration does not contain ${version}`);
                if (
                  !containsPublished(
                    publishedRoot,
                    expected,
                    kind.type === "pack" ? expectedCanonicalVersion : undefined,
                  )
                )
                  throw new Error(
                    `Published package does not contain ${kind.type === "pack" ? expectedCanonicalVersion : expected}\n${result.stdout}`,
                  );
              },
            },
            { artifacts: [{ kind: "present", path: "axm.lock", type: "file" }] },
          );
        },
      };
    });
