import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import { fixtureArchive, startHttpRegistry } from "@agentxm/client-e2e-utils/registry";
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
} from "./fixtures.js";

export const transitionScenarios = (): ReadonlyArray<BenchmarkScenario> => {
  const scenarios: BenchmarkScenario[] = [];
  for (const modeId of ["default", "json", "preview"]) {
    const flags = modeId === "default" ? [] : [`--${modeId}`];
    for (const reason of ["superseded", "obsolete"]) {
      scenarios.push({
        id: `transition:migrate:${modeId}:${reason}`,
        operationId: "migrate",
        modeId,
        dimensions: {
          scope: "project",
          source: "registry",
          selection: "targeted",
          view: "filesystem",
          output: modeId === "json" ? "json" : "human",
          state: "changed",
          format: modeId === "json" ? "operation-json" : "terminal-text",
          kinds: ["skill"],
        },
        fixtureId: "deprecated-file-registry-v1",
        description: `Migrate an accepted Registry Skill deprecated as ${reason}`,
        prepare: async (context) => {
          const registry = makeFileRegistry({ root: path.join(context.root, "registry") });
          registry.writeSkill("old-review", [
            { version: "1.0.0", body: "Previous review guidance." },
          ]);
          registry.writeSkill("new-review", [
            { version: "1.0.0", body: "Replacement review guidance." },
          ]);
          await configureWorkspace(context, {
            defaultRegistry: "fixture",
            sources: [{ name: "fixture", type: "registry", location: registry.url }],
            minimumReleaseAge: "0s",
          });
          assertSuccessful(
            await context.run([
              "install",
              "@acme/skills/old-review",
              "--json",
              "--non-interactive",
            ]),
          );
          const indexPath = path.join(
            registry.root,
            "extensions",
            "@acme",
            "skills",
            "old-review",
            "index.json",
          );
          await writeJson(indexPath, {
            ...(await readJsonObject(indexPath)),
            deprecation: {
              deprecatedAt: "2026-01-01T00:00:00.000Z",
              reason,
              ...(reason === "superseded"
                ? { replacement: { status: "available", fqn: "@acme/skills/new-review" } }
                : { message: "Fixture capability is obsolete" }),
            },
          });
          const settingsPath = path.join(context.workspace, "axm.json");
          const before = await fs.readFile(settingsPath, "utf8");
          return {
            args: ["migrate", "@acme/skills/old-review", ...flags, "--non-interactive"],
            expectedExitCode: 0,
            verify: async (result) => {
              assertOutput(result, "old-review");
              const after = await fs.readFile(settingsPath, "utf8");
              if (modeId === "preview") {
                if (after !== before) throw new Error("Migration preview changed settings");
              } else {
                if (after.includes("old-review"))
                  throw new Error("Migration retained the deprecated declaration");
                if (reason === "superseded" && !after.includes("new-review"))
                  throw new Error("Migration omitted replacement declaration");
              }
            },
          };
        },
      });
    }
    for (const kind of extensionKinds) {
      scenarios.push({
        id: `transition:demote:${kind.type}:${modeId}`,
        operationId: "demote",
        modeId,
        dimensions: {
          scope: "project",
          source: kind.type === "mcp-server" || kind.type === "pack" ? "registry" : "path",
          selection: "targeted",
          view: "filesystem",
          output: modeId === "json" ? "json" : "human",
          state: "changed",
          format: modeId === "json" ? "operation-json" : "terminal-text",
          kinds: [kind.type],
        },
        fixtureId: "workspace-authority-transition-v1",
        description: `Replace authored ${kind.type} authority with an external source`,
        prepare: async (context) => {
          await prepareAuthoredPackage(context, kind);
          const registry = await startHttpRegistry();
          try {
            let source: string;
            if (kind.type === "mcp-server" || kind.type === "pack") {
              registry.seed({
                owner: "@benchmark",
                plural: kind.plural,
                name: "sample",
                version: "1.0.0",
                archive: fixtureArchive(packageFiles(kind)),
              });
              const settingsPath = path.join(context.workspace, "axm.json");
              await writeJson(settingsPath, {
                ...(await readJsonObject(settingsPath)),
                defaultRegistry: "fixture",
                sources: [{ name: "fixture", type: "registry", location: registry.url }],
                minimumReleaseAge: "0s",
              });
              source = `@benchmark/${kind.plural}/sample`;
            } else {
              source = "./vendor/sample";
              await writePackage(path.join(context.workspace, source), kind);
            }
            const settingsPath = path.join(context.workspace, "axm.json");
            const before = await fs.readFile(settingsPath, "utf8");
            return {
              args: [
                "demote",
                `@benchmark/${kind.plural}/sample`,
                source,
                "--yes",
                "--accept-execution-changes",
                ...flags,
                "--non-interactive",
              ],
              expectedExitCode: 0,
              dispose: registry.close,
              metrics: () => ({ requests: registry.requests.length }),
              verify: async (result) => {
                assertOutput(result, "sample");
                const after = await fs.readFile(settingsPath, "utf8");
                if (modeId === "preview") {
                  if (after !== before) throw new Error("Demote preview changed source authority");
                } else if (after === before || after.includes('"workspace"'))
                  throw new Error("Demote did not replace workspace source authority");
              },
            };
          } catch (error) {
            await registry.close();
            throw error;
          }
        },
      });
    }
  }
  return scenarios;
};
