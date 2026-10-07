import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { LockfileReader, LockfileSchema } from "@agentxm/workspace-kernel/workspace-state";
import { localLifecycleRows } from "./test-helpers.js";
import {
  applyInstall,
  gitPackagePath,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";
import { serveBareRepository } from "../../testing/git-repositories.js";
import { applyUninstall, uninstallRequest } from "../uninstall/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/retains-all-native-kinds-from-git",
  title: "Every native extension kind retains its Git package at the source address",
  statement:
    "Installing any of the seven native extension kinds from Git shall retain its complete package at the source host, repository, and package path. Distinct native kinds co-located at one package root shall share one accepted snapshot and retained directory in project and user scopes, preserve existing selections when adding another kind, and remove the package only after its final selected consumer is removed.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  boundary: "platform",
  boundaryRationale:
    "Real local Git transport, package files, desired state, accepted lock state, and native outputs exercise every extension kind through the lifecycle boundary.",
  derivedFrom: ["extension-discovery/all-manifest-kinds-from-git-and-path"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Native Git package retention", () => {
  it.effect.each([
    { layout: "separate", scope: "project" },
    { layout: "shared", scope: "project" },
    { layout: "shared", scope: "user" },
  ] as const)(
    "retains seven kinds with $layout roots in $scope scope",
    ({ layout, scope }) =>
      Effect.gen(function* () {
        const world = yield* Effect.acquireRelease(
          Effect.sync(() => makeInstallWorld({ scope })),
          (world) => Effect.sync(world.cleanup),
        );
        const source = path.join(world.workspace.root, "upstream");
        const nameFor = (type: string) => (layout === "shared" ? "shared" : `native-${type}`);
        for (const row of localLifecycleRows) row.writePackage(source, { name: nameFor(row.type) });
        if (layout === "shared") {
          const root = path.join(source, "vendor/shared/src");
          // The shared Markdown also belongs to the native Knowledge corpus.
          for (const file of ["RULE.md", "shared.md", "SKILL.md"]) {
            const target = path.join(root, file);
            const body = fs.readFileSync(target, "utf8");
            fs.writeFileSync(
              target,
              body.startsWith("---\n")
                ? body.replace("---\n", "---\ntype: Reference\n")
                : `---\ntype: Reference\n---\n${body}`,
            );
          }
        }
        for (const type of ["mcp-server", "pack"] as const) {
          const name = nameFor(type);
          const root = path.join(source, "vendor", name);
          fs.mkdirSync(root, { recursive: true });
          const manifest = {
            owner: "@acme",
            type,
            name,
            version: "1.0.0",
            ...(type === "pack"
              ? { dependencies: {} }
              : {
                  server: {
                    name: "io.acme/shared",
                    description: "Fixture",
                    version: "1.0.0",
                    remotes: [{ type: "streamable-http", url: "https://example.test/mcp" }],
                  },
                }),
          };
          fs.writeFileSync(
            path.join(root, type === "pack" ? "pack.json" : "mcp.json"),
            JSON.stringify(manifest),
          );
        }
        for (const name of new Set(installableExtensionTypes.map(nameFor))) {
          fs.writeFileSync(
            path.join(source, "vendor", name, "companion.txt"),
            "Complete native package.\n",
          );
        }
        for (const args of [
          ["init", "--initial-branch=main"],
          ["add", "."],
          [
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "commit",
            "-m",
            "Native fixture",
          ],
        ])
          execFileSync("git", args, { cwd: source, stdio: "ignore" });
        const remote = yield* Effect.acquireRelease(
          Effect.promise(() =>
            serveBareRepository({ root: world.workspace.root, source, name: "native" }),
          ),
          (remote) => Effect.sync(remote.stop),
        );
        yield* world.workspace.provide(
          Effect.gen(function* () {
            const retained = (type: string) =>
              path.join(
                world.workspace.workspaceRoot,
                gitPackagePath(remote.url, `vendor/${nameFor(type)}`),
              );
            let sharedInode: number | undefined;
            for (const [index, type] of installableExtensionTypes.entries()) {
              const installed = yield* applyInstall(
                installRequest({
                  type,
                  subject: { kind: "source", source: remote.url },
                  names: [nameFor(type)],
                  all: false,
                }),
              );
              expect(deriveOperationOutcome(installed), JSON.stringify(installed)).toBe("applied");
              expect(fs.readFileSync(path.join(retained(type), "companion.txt"), "utf8")).toBe(
                "Complete native package.\n",
              );
              const stored = Schema.encodeSync(LockfileSchema)(
                yield* (yield* LockfileReader).lockfile,
              );
              expect(Object.keys(stored.packages)).toHaveLength(
                layout === "shared" ? 1 : index + 1,
              );
              if (layout === "shared") {
                const inode = fs.statSync(retained(type)).ino;
                if (sharedInode === undefined) sharedInode = inode;
                expect(inode).toBe(sharedInode);
                expect(fs.readdirSync(retained(type))).toEqual(
                  expect.arrayContaining([
                    "skill.json",
                    "subagent.json",
                    "rule.json",
                    "hook.json",
                    "knowledge.json",
                    "mcp.json",
                    "pack.json",
                  ]),
                );
              }
            }
            for (const [index, type] of installableExtensionTypes.entries()) {
              const removed = yield* applyUninstall(
                uninstallRequest({ type, selector: nameFor(type) }),
              );
              expect(deriveOperationOutcome(removed), JSON.stringify(removed)).toBe("applied");
              expect(fs.existsSync(retained(type))).toBe(
                layout === "shared" && index < installableExtensionTypes.length - 1,
              );
            }
          }),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    60_000,
  );
});
