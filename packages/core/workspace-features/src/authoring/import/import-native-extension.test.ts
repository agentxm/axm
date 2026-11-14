import * as fs from "node:fs";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { NativeWriteAuthority, NativeWriteRefused } from "@agentxm/workspace-kernel/agent-adapters";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { FileSystemRecorder, type RecordedFileSystemCall } from "@agentxm/test-support";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { recordingAuthoringWorkspaceLayer } from "../test-support/recording-authoring-workspace.js";
import { ImportNativeExtension } from "./import-native-extension.js";
import { nativeMcpDiscovery, writeNativeRemoteMcp } from "../test-support/native-mcp.js";

describe("ImportNativeExtension rollback", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "restores an authored MCP package and its new parent after a late native write failure",
    () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({
          owner: "@acme",
          agents: ["claude-code", "cursor"],
        });
        cleanups.push(created.cleanup);
        writeNativeRemoteMcp(created);
        const discovery = nativeMcpDiscovery(created);
        const before = created.snapshot();
        const injected = yield* Ref.make(false);
        const resolution = yield* Effect.gen(function* () {
          const candidate = yield* ImportNativeExtension.prepare({
            type: "mcp-server",
            target: "@acme/mcps/context",
            enable: true,
            nonInteractive: true,
            discovery,
          });
          const authority = yield* NativeWriteAuthority;
          return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution).pipe(
            Effect.provideService(NativeWriteAuthority, {
              ...authority,
              protect: (target) =>
                target === nodePath.join(created.root, ".cursor/mcp.json")
                  ? Effect.gen(function* () {
                      expect(created.exists("mcps/context/mcp.json")).toBe(true);
                      yield* Ref.set(injected, true);
                      return yield* new NativeWriteRefused({
                        path: target,
                        cause: "injected-native-write-failure",
                      });
                    })
                  : authority.protect(target),
            }),
          );
        }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
        expect(yield* Ref.get(injected)).toBe(true);
        expect(deriveOperationOutcome(resolution)).toBe("failed");
        expect(
          resolution.footprint?.some(
            (entry) => entry.path === "mcps/context" && entry.change === "created",
          ),
        ).toBe(true);
        expect(resolution.atomicity.applied).toBe("closure-atomic");
        expect(resolution.recovery).toBeUndefined();
        expect(created.snapshot()).toEqual(before);
      }),
  );
});

describe("ImportNativeExtension prepared work", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const NATIVE =
    "---\nname: native-reviewer\ndescription: Review evidence\nmodel: sonnet\n---\n\nNative instructions only.\n";

  const workspace = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.write("native/reviewer.md", NATIVE);
    return created;
  };

  /** The recorded calls and `axm.hash.package` executions of one measured effect. */
  const measure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const value = yield* work.provide(effect);
      return {
        value,
        calls: recording.calls(),
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
      };
    });

  /** The staged package an import preparation wrote into its private staging root. */
  const stagedPackageOf = (calls: ReadonlyArray<RecordedFileSystemCall>) => {
    const root = calls.find(
      (call) =>
        call.method === "makeTempDirectoryScoped" &&
        call.outcome === "success" &&
        nodePath.basename(call.path).startsWith("axm-import-"),
    );
    if (root === undefined) throw new Error("The import staged no package");
    return nodePath.join(root.path, "package");
  };

  /** Prepare an import, run `between` on its staged package, then apply it; each phase measured. */
  const importPhases = (
    created: ReturnType<typeof workspace>,
    options: { readonly enable: boolean; readonly between?: (staged: string) => void },
  ) =>
    Effect.gen(function* () {
      const prepare = yield* measure(
        ImportNativeExtension.prepare({
          type: "subagent",
          source: nodePath.join(created.root, "native/reviewer.md"),
          sourceAgent: "claude-code",
          target: "@acme/subagents/custom",
          enable: options.enable,
        }),
      );
      const staged = stagedPackageOf(prepare.calls);
      options.between?.(staged);
      const apply = yield* measure(
        ImportNativeExtension.previewOrApply(prepare.value, applyExecution),
      );
      return { prepare, apply, staged };
    }).pipe(Effect.scoped, Effect.provide(recordingAuthoringWorkspaceLayer(created)));

  const stagedCounts = (
    phase: { readonly calls: ReadonlyArray<RecordedFileSystemCall>; readonly hashes: number },
    staged: string,
    body: string,
  ) => {
    const reads = (relative: string) =>
      phase.calls.filter(
        (call) => call.method === "readFile" && call.path === nodePath.join(staged, relative),
      ).length;
    return {
      hashes: phase.hashes,
      rootReadDirectory: phase.calls.filter(
        (call) => call.method === "readDirectory" && call.path === staged,
      ).length,
      manifestReads: reads("subagent.json"),
      bodyReads: reads(body),
    };
  };

  it.effect("reuses the converted hash and manifest in the prepare-time preflight", () =>
    Effect.gen(function* () {
      const { prepare, apply, staged } = yield* importPhases(workspace(), { enable: true });
      expect(deriveOperationOutcome(apply.value)).toBe("applied");
      const body = "native/claude-code/reviewer.md";
      // Measured before the preflight reused the conversion's values: preparing
      // hashed the staged package twice (conversion and preflight) and read its
      // manifest twice before the manager's own reads.
      const before = {
        prepare: { hashes: 2, rootReadDirectory: 3, manifestReads: 8, bodyReads: 6 },
        apply: { hashes: 4, rootReadDirectory: 7, manifestReads: 5, bodyReads: 4 },
      };
      expect(stagedCounts(prepare, staged, body)).toEqual({
        hashes: before.prepare.hashes - 1,
        rootReadDirectory: before.prepare.rootReadDirectory - 1,
        manifestReads: before.prepare.manifestReads - 2,
        bodyReads: before.prepare.bodyReads - 1,
      });
      // Under the lock the preflight reads and hashes the staged package fresh.
      expect(stagedCounts(apply, staged, body)).toEqual(before.apply);
    }),
  );

  it.effect("runs no native preflight for a disabled subagent import", () =>
    Effect.gen(function* () {
      const { prepare, apply, staged } = yield* importPhases(workspace(), { enable: false });
      const body = "native/claude-code/reviewer.md";
      expect(stagedCounts(prepare, staged, body)).toEqual({
        hashes: 1,
        rootReadDirectory: 2,
        manifestReads: 4,
        bodyReads: 3,
      });
      expect(stagedCounts(apply, staged, body)).toEqual({
        hashes: 2,
        rootReadDirectory: 6,
        manifestReads: 1,
        bodyReads: 1,
      });
      expect(apply.value.units.map((unit) => unit.artifact)).toEqual([
        {
          path: "subagents/custom",
          scope: "project",
          version: "0.1.0",
          change: "created",
          targets: [
            { path: "subagents/custom", change: "created" },
            { path: "axm.json", change: "created" },
          ],
        },
      ]);
    }),
  );

  it.effect("publishes nothing when the staged identity is rewritten after preparation", () =>
    Effect.gen(function* () {
      const created = workspace();
      const before = created.snapshot();
      const { apply } = yield* importPhases(created, {
        enable: true,
        between: (staged) => {
          const manifest = nodePath.join(staged, "subagent.json");
          fs.writeFileSync(
            manifest,
            fs.readFileSync(manifest, "utf8").replace('"custom"', '"renamed"'),
          );
        },
      });
      // The staged package is candidate material, so the rewrite stales the
      // candidate before the in-lock preflight could read it.
      expect(deriveOperationOutcome(apply.value)).toBe("blocked");
      expect(apply.value.blocking).toMatchObject({
        class: "stale-candidate",
        detail: "The execution candidate became stale before apply.",
      });
      expect(created.snapshot()).toEqual(before);
    }),
  );
});
