import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { startGitFixture } from "../lifecycle-sources.js";
import {
  assertOutput,
  assertSuccessful,
  configureWorkspace,
  extensionKinds,
  packageFiles,
  type BenchmarkScenario,
  type ExtensionKind,
} from "./fixtures.js";
import { wrapPrepared } from "./verification.js";

const writeSource = (root: string, kind: ExtensionKind, version: string): void => {
  for (const [relative, content] of Object.entries(packageFiles(kind, "git-sample", version))) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
};

const installedManifest = (root: string, kind: ExtensionKind) => {
  const candidates = fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === kind.manifest)
    .map((entry) =>
      Schema.decodeUnknownSync(
        Schema.fromJsonString(
          Schema.Struct({ owner: Schema.String, name: Schema.String, version: Schema.String }),
        ),
      )(fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8")),
    )
    .filter((manifest) => manifest.owner === "@benchmark" && manifest.name === "git-sample");
  const manifest = candidates[0];
  if (candidates.length !== 1 || manifest === undefined)
    throw new Error("Git operation did not publish exactly one selected canonical manifest");
  return manifest;
};

/** Root sweeps and typed selections traverse actual Git acquisition for every kind. */
export const sourceScenarios = (): ReadonlyArray<BenchmarkScenario> =>
  extensionKinds.flatMap((kind) =>
    ["install", "update"].flatMap((action) =>
      [false, true].flatMap((typed) =>
        ["json", "preview"].map((modeId) => {
          const route = typed ? [kind.plural, action] : [action];
          return {
            id: `source:git:${route.join(" ")}:${kind.type}:${modeId}`,
            operationId: route.join(" "),
            modeId,
            fixtureId: "loopback-git-package-v1",
            ...(kind.type === "pack" && action === "update" && modeId === "json"
              ? {
                  knownBaselineLimitation:
                    "The frozen baseline advances accepted Git Pack resolution to manifest-version 1.1.0 but retains canonical pack.json 1.0.0. The baseline must reproduce that exact inconsistency; the candidate must publish the selected manifest version. canonicalManifestMatchesAccepted records the discrepancy independently of timing.",
                }
              : {}),
            dimensions: {
              scope: "project",
              source: "git",
              selection: action === "update" && !typed ? "bulk" : "targeted",
              view: "filesystem",
              output: modeId === "json" ? "json" : "human",
              state: "changed",
              format: modeId === "json" ? "operation-json" : "terminal-text",
              kinds: [kind.type],
            },
            description: `${action === "install" ? "Acquire" : "Advance"} ${kind.type} from a real loopback Git repository`,
            prepare: async (context) => {
              const git = await startGitFixture(
                context.root,
                (root) => writeSource(root, kind, "1.0.0"),
                (root) => writeSource(root, kind, "1.1.0"),
              );
              try {
                await configureWorkspace(context, {
                  agents: ["claude-code"],
                  instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
                });
                if (action === "update") {
                  assertSuccessful(
                    await context.run([
                      kind.plural,
                      "install",
                      git.url,
                      `--${kind.type}`,
                      "git-sample",
                      "--json",
                      "--non-interactive",
                      "--accept-execution-changes",
                    ]),
                  );
                  git.advance();
                }
                const settings = path.join(context.workspace, "axm.json");
                const lock = path.join(context.workspace, "axm.lock");
                const beforeSettings = fs.readFileSync(settings, "utf8");
                const beforeLock = fs.existsSync(lock) ? fs.readFileSync(lock, "utf8") : undefined;
                const subject = action === "install" ? [git.url] : typed ? ["git-sample"] : [];
                return await wrapPrepared(
                  context,
                  { id: modeId, flags: [`--${modeId}`] },
                  {
                    args: [
                      ...route,
                      ...subject,
                      ...(action === "install" ? [`--${kind.type}`, "git-sample"] : []),
                      `--${modeId}`,
                      "--non-interactive",
                      "--accept-execution-changes",
                    ],
                    expectedExitCode: 0,
                    dispose: git.close,
                    ...(modeId === "json"
                      ? {
                          metrics: () => ({
                            canonicalManifestMatchesAccepted: Number(
                              installedManifest(
                                path.join(context.workspace, "agent_extensions"),
                                kind,
                              ).version === (action === "install" ? "1.0.0" : "1.1.0"),
                            ),
                          }),
                        }
                      : {}),
                    verify: (result) => {
                      assertOutput(result, "git-sample");
                      if (modeId === "preview") {
                        if (fs.readFileSync(settings, "utf8") !== beforeSettings)
                          throw new Error("Git preview changed declarations");
                        if (
                          (fs.existsSync(lock) ? fs.readFileSync(lock, "utf8") : undefined) !==
                          beforeLock
                        )
                          throw new Error("Git preview changed accepted state");
                      } else {
                        const accepted = fs.readFileSync(lock, "utf8");
                        if (accepted === beforeLock)
                          throw new Error("Git operation did not advance accepted state");
                        assertOutput(result, "applied");
                        const manifest = installedManifest(
                          path.join(context.workspace, "agent_extensions"),
                          kind,
                        );
                        const expectedVersion =
                          action === "install" ||
                          (context.subject === "baseline" && kind.type === "pack")
                            ? "1.0.0"
                            : "1.1.0";
                        if (
                          kind.type === "pack" &&
                          !accepted.includes(
                            `manifest-version = "${action === "install" ? "1.0.0" : "1.1.0"}"`,
                          )
                        )
                          throw new Error(
                            "Git Pack operation did not advance accepted manifest identity",
                          );
                        if (manifest.version !== expectedVersion)
                          throw new Error(
                            "Git operation did not materialize the expected source revision; known baseline Pack discrepancy is recorded separately",
                          );
                      }
                    },
                  },
                  {},
                );
              } catch (error) {
                await git.close();
                throw error;
              }
            },
          } satisfies BenchmarkScenario;
        }),
      ),
    ),
  );
