import { execFileSync } from "node:child_process";
import { serveBareRepository } from "../../../testing/git-repositories.js";
import { UninstallExtensions } from "../../index.js";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { applySync } from "../../../testing/sync-fixture.js";
import { applyUpdate, configuredUpdateRequest } from "../../update/test-helpers.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  acceptedLockedCanonicalPath,
  SettingsReader,
  LockfileReader,
} from "@agentxm/workspace-kernel/workspace-state";
import { applyInstall, installRequest, makeInstallWorld } from "../../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/install/selected-plugin-connections-retain-package-authority",
  title: "Selected plugin MCP connections retain unchanged package authority",
  statement:
    "AXM shall install explicitly selected portable plugin MCP connections under independent local names, retain unchanged package bytes and inactive components, preserve native connection selection independently from the local alias, and record the actual upstream source without inventing a publisher or package version. Restore and reinstall shall retain accepted package content; updating one selected connection shall reproject other selected connections sharing that package. Removing one connection shall retain the shared package until its last connection is removed.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["docs/architecture/extensions/source-compatible-distribution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Selected plugin MCP connections", () => {
  it.effect.each(
    (["local", "git-root", "git-nested"] as const).flatMap((transport) =>
      (["restore", "reinstall", "source-reinstall", "update"] as const).map((journey) => ({
        transport,
        journey,
      })),
    ),
  )(
    "retains aliased $transport connections through $journey and removal",
    ({ transport, journey }) =>
      Effect.gen(function* () {
        const world = yield* Effect.acquireRelease(
          Effect.sync(() => makeInstallWorld()),
          (world) => Effect.sync(() => world.cleanup()),
        );
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const repositoryRoot = path.join(world.workspace.root, "vendor", "plugin");
        const source =
          transport === "git-nested"
            ? path.join(repositoryRoot, "plugins", "review")
            : repositoryRoot;
        yield* fs.makeDirectory(source, { recursive: true });
        const manifest =
          '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"example","future":{"unchanged":true}}\n';
        const mcp = JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
          mcpServers: {
            context: {
              type: "streamable-http",
              url: "https://example.test/sse",
              headers: { "X-Tenant": "public" },
            },
            secondary: { type: "sse", url: "https://example.test/events" },
            future: { type: "future-runtime", unchanged: true },
          },
        });
        yield* fs.writeFileString(path.join(source, "plugin.json"), manifest);
        yield* fs.writeFileString(path.join(source, "mcp.json"), mcp);
        const git = (args: ReadonlyArray<string>) =>
          execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
        const served =
          transport === "local"
            ? undefined
            : yield* Effect.gen(function* () {
                git(["init", "--quiet", "--initial-branch=main"]);
                git(["config", "user.email", "test@example.com"]);
                git(["config", "user.name", "Test"]);
                git(["add", "."]);
                git(["commit", "--quiet", "-m", "accepted plugin"]);
                return yield* Effect.acquireRelease(
                  Effect.promise(() =>
                    serveBareRepository({
                      root: world.workspace.root,
                      source: repositoryRoot,
                      name: "plugins",
                    }),
                  ),
                  (repository) => Effect.sync(() => repository.stop()),
                );
              });
        const installSource = served?.url ?? source;
        const selector = (name: string) =>
          transport === "git-nested" ? `plugins/review#${name}` : name;
        yield* world.workspace.provide(
          Effect.gen(function* () {
            const installed = yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: installSource },
                names: [selector("context")],
                all: false,
                localName: "work-context",
              }),
            );
            expect(installed.units.filter((unit) => unit.state === "failed")).toEqual([]);
            const settings = yield* (yield* SettingsReader).entries("mcp-server");
            expect(settings["work-context"]).toMatchObject({
              nativeComponent: { format: "agent-plugins", configPath: "mcp.json", name: "context" },
            });
            const canonical = yield* acceptedLockedCanonicalPath({
              type: "mcp-server",
              name: "work-context",
            });
            expect(Option.isSome(canonical)).toBe(true);
            if (Option.isNone(canonical)) return;
            expect(yield* fs.readFileString(path.join(canonical.value, "plugin.json"))).toBe(
              manifest,
            );
            expect(yield* fs.readFileString(path.join(canonical.value, "mcp.json"))).toBe(mcp);
            const native: unknown = JSON.parse(world.workspace.readFile(".mcp.json"));
            expect(native).toMatchObject({
              mcpServers: {
                "work-context": {
                  type: "http",
                  url: "https://example.test/sse",
                  headers: { "X-Tenant": "public" },
                  "x-axm": { source: transport === "local" ? "local" : "git" },
                },
              },
            });
            expect(JSON.stringify(native)).not.toContain("future-runtime");
            expect(yield* fs.readFileString(path.join(source, "mcp.json"))).toBe(mcp);
            yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: installSource },
                names: [selector("secondary")],
                all: false,
                localName: "personal-context",
              }),
            );
            expect(
              yield* acceptedLockedCanonicalPath({ type: "mcp-server", name: "personal-context" }),
            ).toEqual(canonical);
            const lockBefore = world.workspace.readFile("axm-lock.yaml");
            const accepted = yield* (yield* LockfileReader).acceptedEntry(
              "mcp-server",
              "work-context",
            );
            expect(Option.isSome(accepted)).toBe(true);
            if (Option.isSome(accepted)) {
              expect("owner" in accepted.value.identity).toBe(false);
              expect("version" in accepted.value.resolved).toBe(false);
            }
            if (served !== undefined && journey !== "update") {
              yield* fs.writeFileString(
                path.join(source, "mcp.json"),
                mcp.replaceAll("example.test", "later.test"),
              );
              git(["add", "."]);
              git(["commit", "--quiet", "-m", "advance upstream"]);
              git(["push", "--quiet", served.repository, "main"]);
            }
            if (journey === "restore") {
              yield* fs.remove(canonical.value, { recursive: true });
              const syncResult = yield* applySync({
                target: Option.none(),
                type: Option.some("mcp-server"),
              });
              expect(syncResult._tag).toBe("Resolved");
              if (syncResult._tag === "Resolved")
                expect(
                  syncResult.resolution.units.filter((unit) => unit.state === "failed"),
                ).toEqual([]);
              expect(world.workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
              expect(yield* fs.readFileString(path.join(canonical.value, "mcp.json"))).toBe(mcp);
            } else if (journey === "reinstall" || journey === "source-reinstall") {
              const reinstalled = yield* applyInstall(
                journey === "source-reinstall"
                  ? installRequest({
                      type: "mcp-server",
                      subject: { kind: "source", source: installSource },
                      names: [selector("context")],
                      all: false,
                      localName: "work-context",
                      reinstall: true,
                    })
                  : installRequest({
                      type: "mcp-server",
                      subject: { kind: "configured" },
                      reinstall: true,
                    }),
              );
              expect(reinstalled.units.filter((unit) => unit.state === "failed")).toEqual([]);
              expect(world.workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
              expect(yield* fs.readFileString(path.join(canonical.value, "mcp.json"))).toBe(mcp);
            } else {
              const updated = mcp.replaceAll("example.test", "updated.test");
              yield* fs.writeFileString(path.join(source, "mcp.json"), updated);
              if (served !== undefined) {
                git(["add", "."]);
                git(["commit", "--quiet", "-m", "updated connections"]);
                git(["push", "--quiet", served.repository, "main"]);
              }
              const updatedResult = yield* applyUpdate(
                configuredUpdateRequest({ type: "mcp-server", nameFilters: ["work-context"] }),
              );
              expect(updatedResult._tag).toBe("Resolved");
              if (updatedResult._tag === "Resolved")
                expect(
                  updatedResult.resolution.units.filter((unit) => unit.state === "failed"),
                ).toEqual([]);
              expect(yield* fs.readFileString(path.join(canonical.value, "mcp.json"))).toBe(
                updated,
              );
              expect(JSON.parse(world.workspace.readFile(".mcp.json"))).toMatchObject({
                mcpServers: {
                  "work-context": { url: "https://updated.test/sse", type: "http" },
                  "personal-context": { url: "https://updated.test/events", type: "sse" },
                },
              });
            }
            for (const name of ["work-context", "personal-context"]) {
              const candidate = yield* UninstallExtensions.prepare({
                type: Option.some("mcp-server"),
                selector: name,
              });
              const removedResult = yield* UninstallExtensions.previewOrApply(
                candidate,
                preapprovedPlanExecution,
              );
              expect(removedResult.units.filter((unit) => unit.state === "failed")).toEqual([]);
              expect(yield* fs.exists(canonical.value)).toBe(name === "work-context");
            }
            expect(yield* fs.exists(path.join(source, "mcp.json"))).toBe(true);
          }),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
