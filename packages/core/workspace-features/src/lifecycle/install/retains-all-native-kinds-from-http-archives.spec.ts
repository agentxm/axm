import * as fs from "node:fs";
import * as path from "node:path";
import { zipSync } from "fflate";
import * as Result from "effect/Result";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  LockfileReader,
  LockfileSchema,
  acquiredPackageRelativePath,
  AcceptedResolutionWriter,
} from "@agentxm/workspace-kernel/workspace-state";
import { localLifecycleRows } from "./test-helpers.js";
import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
} from "../../testing/install-world.js";
import { makeLifecycleFixture } from "../testing.js";
import { applySyncAcceptingExecutionChanges } from "../../testing/sync-fixture.js";
import {
  applyUpdateAcceptingExecutionChanges,
  configuredUpdateRequest,
} from "../update/test-helpers.js";
import { httpArtifactDigest } from "@agentxm/workspace-kernel/sources";
import { applyUninstall, uninstallRequest } from "../uninstall/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/retains-all-native-kinds-from-http-archives",
  title: "Every native extension kind retains its HTTPS archive package at the source address",
  statement:
    "HTTPS ZIP and tar installs shall retain complete packages for all seven native kinds, share a package root across co-located selections in project and user scopes until its final consumer is removed, replay only the accepted artifact bytes, and advance those bytes only on explicit update.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  boundary: "platform",
  boundaryRationale:
    "Production HTTPS acquisition, package files, desired state, accepted lock state, and native outputs exercise every extension kind through the lifecycle boundary.",
  derivedFrom: ["extension-installability/source-family-policy-is-total"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Native HTTPS archive package retention", () => {
  it.effect.each([
    { layout: "separate", scope: "project" },
    { layout: "shared", scope: "project" },
    { layout: "shared", scope: "user" },
  ] as const)(
    "retains seven kinds with $layout roots in $scope scope",
    ({ layout, scope }) =>
      Effect.gen(function* () {
        const url = "https://packages.example.test/native.zip";
        let bytes: Uint8Array = new Uint8Array();
        let requests = 0;
        const client = HttpClient.make((request) =>
          Effect.sync(() => {
            requests++;
            return HttpClientResponse.fromWeb(request, new Response(bytes));
          }),
        );
        const workspace = yield* Effect.acquireRelease(
          Effect.sync(() =>
            makeLifecycleFixture({
              scope,
              sources: "live",
              settings: { agents: ["claude-code"] },
              httpClient: Layer.succeed(HttpClient.HttpClient, client),
            }),
          ),
          (workspace) => Effect.sync(workspace.cleanup),
        );
        const source = path.join(workspace.root, "upstream");
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
        const archive = () =>
          zipSync(
            Object.fromEntries(
              fs
                .readdirSync(source, { recursive: true, withFileTypes: true })
                .filter((entry) => entry.isFile())
                .map((entry) => {
                  const full = path.join(entry.parentPath, entry.name);
                  return [
                    path.relative(source, full).split(path.sep).join("/"),
                    fs.readFileSync(full),
                  ];
                }),
            ),
          );
        bytes = archive();
        const original = bytes;
        yield* Effect.gen(function* () {
          const retained = (type: string) =>
            path.join(
              workspace.workspaceRoot,
              `agent_extensions/${Result.getOrThrow(acquiredPackageRelativePath({ refType: "http", portable: false, sourcePath: `vendor/${nameFor(type)}`, source: { type: "http", kind: "archive", url: new URL(url) } }, "skills", "fixture"))}`,
            );
          let sharedInode: number | undefined;
          for (const [index, type] of installableExtensionTypes.entries()) {
            const beforeRequests = requests;
            const installed = yield* workspace.provide(
              applyInstallAcceptingExecutionChanges(
                installRequest({
                  type,
                  subject: { kind: "source", source: url },
                  names: [nameFor(type)],
                  all: false,
                }),
              ),
            );
            expect(deriveOperationOutcome(installed), JSON.stringify(installed)).toBe("applied");
            if (layout === "shared" && index > 0) expect(requests).toBe(beforeRequests);
            expect(fs.readFileSync(path.join(retained(type), "companion.txt"), "utf8")).toBe(
              "Complete native package.\n",
            );
            const stored = Schema.encodeSync(LockfileSchema)(
              yield* workspace.provide(Effect.flatMap(LockfileReader, (reader) => reader.lockfile)),
            );
            expect(stored.package ?? []).toHaveLength(layout === "shared" ? 1 : index + 1);
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
          const lockBytes = fs.readFileSync(path.join(workspace.workspaceRoot, "axm.lock"), "utf8");
          const removePayloads = () => {
            for (const root of new Set(installableExtensionTypes.map(retained)))
              fs.rmSync(root, { recursive: true, force: true });
          };
          const expectPayloads = (text: string) => {
            for (const type of installableExtensionTypes)
              expect(
                fs.readFileSync(path.join(retained(type), "companion.txt"), "utf8"),
                type,
              ).toBe(text);
          };
          removePayloads();
          const restored = yield* workspace.provide(applySyncAcceptingExecutionChanges());
          expect(restored._tag).toBe("Resolved");
          if (restored._tag === "Resolved")
            expect(deriveOperationOutcome(restored.resolution), JSON.stringify(restored)).toBe(
              "applied",
            );
          expectPayloads("Complete native package.\n");
          expect(fs.readFileSync(path.join(workspace.workspaceRoot, "axm.lock"), "utf8")).toBe(
            lockBytes,
          );
          const reinstalled = yield* workspace.provide(
            applyUpdateAcceptingExecutionChanges(configuredUpdateRequest({ reinstall: true })),
          );
          expect(reinstalled._tag).toBe("Resolved");
          expectPayloads("Complete native package.\n");
          expect(fs.readFileSync(path.join(workspace.workspaceRoot, "axm.lock"), "utf8")).toBe(
            lockBytes,
          );
          for (const name of new Set(installableExtensionTypes.map(nameFor)))
            fs.writeFileSync(
              path.join(source, "vendor", name, "companion.txt"),
              "Updated native package.\n",
            );
          bytes = archive();
          removePayloads();
          const refused = yield* workspace
            .provide(applySyncAcceptingExecutionChanges())
            .pipe(Effect.result);
          expect(refused._tag).toBe("Failure");
          expect(fs.readFileSync(path.join(workspace.workspaceRoot, "axm.lock"), "utf8")).toBe(
            lockBytes,
          );
          // Restore the accepted tree before the explicit update observes a fresh source view.
          const updated = bytes;
          bytes = original;
          yield* workspace.provide(applySyncAcceptingExecutionChanges());
          bytes = updated;
          const advanced = yield* workspace.provide(
            applyUpdateAcceptingExecutionChanges(configuredUpdateRequest({})),
          );
          expect(advanced._tag).toBe("Resolved");
          if (advanced._tag === "Resolved")
            expect(deriveOperationOutcome(advanced.resolution), JSON.stringify(advanced)).toBe(
              "applied",
            );
          expectPayloads("Updated native package.\n");
          const accepted = Schema.encodeSync(LockfileSchema)(
            yield* workspace.provide(Effect.flatMap(LockfileReader, (reader) => reader.lockfile)),
          );
          for (const item of accepted.package ?? [])
            expect(item).toMatchObject({ artifact: { digest: httpArtifactDigest(updated) } });
          for (const [index, type] of installableExtensionTypes.entries()) {
            const removed = yield* workspace.provide(
              applyUninstall(uninstallRequest({ type, selector: nameFor(type) })),
            );
            expect(deriveOperationOutcome(removed), JSON.stringify(removed)).toBe("applied");
            expect(fs.existsSync(retained(type))).toBe(
              layout === "shared" && index < installableExtensionTypes.length - 1,
            );
          }
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    120_000,
  );
});

it.effect(
  "replays a Pack's missing Knowledge member from the accepted archive view",
  () =>
    Effect.gen(function* () {
      const url = "https://packages.example.test/collection.zip";
      const archive = (text: string) =>
        zipSync({
          "packs/research/skill.json": new TextEncoder().encode(
            JSON.stringify({ type: "skill", owner: "@acme", name: "research", version: "1.0.0" }),
          ),
          "packs/research/src/SKILL.md": new TextEncoder().encode(
            "---\nname: research\n---\n# Research\n",
          ),
          "packs/research/pack.json": new TextEncoder().encode(
            JSON.stringify({
              type: "pack",
              owner: "@acme",
              name: "research",
              version: "1.0.0",
              dependencies: { "@acme/knowledge/handbook": "*" },
            }),
          ),
          "knowledge/handbook/knowledge.json": new TextEncoder().encode(
            JSON.stringify({
              type: "knowledge",
              owner: "@acme",
              name: "handbook",
              version: "1.0.0",
              format: { name: "okf", version: "0.2" },
              bundleRoot: "src",
            }),
          ),
          "knowledge/handbook/src/index.md": new TextEncoder().encode(
            "---\nokf_version: '0.2'\n---\n# Handbook\n",
          ),
          "knowledge/handbook/companion.txt": new TextEncoder().encode(text),
        });
      const original = archive("Accepted");
      let bytes = original;
      const client = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response(bytes))),
      );
      const workspace = yield* Effect.acquireRelease(
        Effect.sync(() =>
          makeLifecycleFixture({
            sources: "live",
            settings: { agents: ["claude-code"] },
            httpClient: Layer.succeed(HttpClient.HttpClient, client),
          }),
        ),
        (workspace) => Effect.sync(workspace.cleanup),
      );
      yield* workspace.provide(
        applyInstallAcceptingExecutionChanges(
          installRequest({
            type: "skill",
            subject: { kind: "source", source: url },
            names: ["research"],
          }),
        ),
      );
      const retainedLock = workspace.readFile("axm.lock");
      bytes = archive("Changed sibling");
      const addingPack = yield* workspace
        .provide(
          applyInstallAcceptingExecutionChanges(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: url },
              names: ["research"],
            }),
          ),
        )
        .pipe(Effect.result);
      expect(addingPack._tag).toBe("Failure");
      expect(workspace.readFile("axm.lock")).toBe(retainedLock);
      bytes = original;
      const installed = yield* workspace.provide(
        applyInstallAcceptingExecutionChanges(
          installRequest({
            type: "pack",
            subject: { kind: "source", source: url },
            names: ["research"],
          }),
        ),
      );
      expect(deriveOperationOutcome(installed), JSON.stringify(installed)).toBe("applied");
      const retained = (sourcePath: string) =>
        path.join(
          workspace.workspaceRoot,
          "agent_extensions",
          Result.getOrThrow(
            acquiredPackageRelativePath(
              {
                refType: "http",
                portable: false,
                sourcePath,
                source: { type: "http", kind: "archive", url: new URL(url) },
              },
              "knowledge",
              "handbook",
            ),
          ),
        );
      const member = retained("knowledge/handbook");
      expect(fs.readFileSync(path.join(member, "companion.txt"), "utf8")).toBe("Accepted");
      // The accepted Pack declarations must still recover a member whose binding was lost.
      yield* workspace.provide(
        Effect.flatMap(AcceptedResolutionWriter, (writer) =>
          writer.removeAccepted("knowledge", "handbook"),
        ),
      );
      fs.rmSync(member, { recursive: true });
      fs.rmSync(retained("packs/research"), { recursive: true });
      const lock = workspace.readFile("axm.lock");
      bytes = archive("Changed without update");
      const refused = yield* workspace
        .provide(applySyncAcceptingExecutionChanges())
        .pipe(Effect.result);
      expect(refused._tag).toBe("Failure");
      expect(workspace.readFile("axm.lock")).toBe(lock);
      expect(fs.existsSync(member)).toBe(false);
      bytes = original;
      const restored = yield* workspace.provide(applySyncAcceptingExecutionChanges());
      expect(restored._tag).toBe("Resolved");
      if (restored._tag === "Resolved")
        expect(deriveOperationOutcome(restored.resolution), JSON.stringify(restored)).toBe(
          "applied",
        );
      expect(fs.readFileSync(path.join(member, "companion.txt"), "utf8")).toBe("Accepted");
      bytes = archive("Updated");
      const updated = yield* workspace.provide(
        applyUpdateAcceptingExecutionChanges(configuredUpdateRequest({ type: "pack" })),
      );
      expect(updated._tag).toBe("Resolved");
      if (updated._tag === "Resolved")
        expect(deriveOperationOutcome(updated.resolution), JSON.stringify(updated)).toBe("applied");
      expect(fs.readFileSync(path.join(member, "companion.txt"), "utf8")).toBe("Updated");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  60_000,
);
