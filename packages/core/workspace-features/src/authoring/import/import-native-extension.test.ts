import * as fs from "node:fs";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { NativeWriteAuthority, NativeWriteRefused } from "@agentxm/workspace-kernel/agent-adapters";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { CreateDestinationExists } from "@agentxm/workspace-kernel/acquisition";
import { FileSystemRecorder, type RecordedFileSystemCall } from "@agentxm/test-support";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
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
      // manifest twice before the manager's own reads. The conversion now also
      // decodes the staged manifest from its hash walk instead of reading it again.
      const before = {
        prepare: { hashes: 2, rootReadDirectory: 3, manifestReads: 8, bodyReads: 6 },
        apply: { hashes: 4, rootReadDirectory: 7, manifestReads: 5, bodyReads: 4 },
      };
      // In each preflight run the Subagent manager's observation reuses its
      // destination validation's package load instead of loading it again.
      const sharedLoad = { manifestReads: 1, bodyReads: 1 };
      expect(stagedCounts(prepare, staged, body)).toEqual({
        hashes: before.prepare.hashes - 1,
        rootReadDirectory: before.prepare.rootReadDirectory - 1,
        manifestReads: before.prepare.manifestReads - 3 - sharedLoad.manifestReads,
        bodyReads: before.prepare.bodyReads - 1 - sharedLoad.bodyReads,
      });
      // Under the lock the preflight reads and hashes the staged package fresh.
      expect(stagedCounts(apply, staged, body)).toEqual({
        ...before.apply,
        manifestReads: before.apply.manifestReads - sharedLoad.manifestReads,
        bodyReads: before.apply.bodyReads - sharedLoad.bodyReads,
      });
    }),
  );

  it.effect("runs no native preflight for a disabled subagent import", () =>
    Effect.gen(function* () {
      const { prepare, apply, staged } = yield* importPhases(workspace(), { enable: false });
      const body = "native/claude-code/reviewer.md";
      expect(stagedCounts(prepare, staged, body)).toEqual({
        hashes: 1,
        rootReadDirectory: 2,
        manifestReads: 3,
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

  /** Existence probes, recorded as `access`, of `directory` in one measured phase. */
  const probes = (
    phase: { readonly calls: ReadonlyArray<RecordedFileSystemCall> },
    directory: string,
  ) => phase.calls.filter((call) => call.method === "access" && call.path === directory).length;

  const SKILL_DOCUMENT = "---\nname: native-review\ndescription: Review code\n---\n\nNative.\n";

  /** Prepare a request, then resolve it in `execution` when preparation succeeds; each phase measured. */
  const prepareThenResolve = (
    created: ReturnType<typeof workspace>,
    request: Parameters<typeof ImportNativeExtension.prepare>[0],
    execution = applyExecution,
  ) =>
    Effect.gen(function* () {
      const prepare = yield* measure(ImportNativeExtension.prepare(request).pipe(Effect.result));
      if (prepare.value._tag === "Failure") return { prepare, resolve: undefined };
      const resolve = yield* measure(
        ImportNativeExtension.previewOrApply(prepare.value.success, execution),
      );
      return { prepare, resolve };
    }).pipe(Effect.scoped, Effect.provide(recordingAuthoringWorkspaceLayer(created)));

  /** The target probes of preparing and then resolving one import into an absent target. */
  const absentTargetProbes = (
    created: ReturnType<typeof workspace>,
    directory: string,
    request: Parameters<typeof ImportNativeExtension.prepare>[0],
    execution = applyExecution,
  ) =>
    Effect.gen(function* () {
      const { prepare, resolve } = yield* prepareThenResolve(created, request, execution);
      if (resolve === undefined) throw new Error(`Expected the ${request.type} import to prepare`);
      return {
        outcome: deriveOperationOutcome(resolve.value),
        prepare: probes(prepare, directory),
        resolve: probes(resolve, directory),
      };
    });

  it.effect("decodes a converted skill manifest from the staged hash walk while preparing", () =>
    Effect.gen(function* () {
      const created = workspace();
      created.write(".claude/skills/native-review/SKILL.md", SKILL_DOCUMENT);
      const { prepare, resolve } = yield* prepareThenResolve(created, {
        type: "skill",
        source: nodePath.join(created.root, ".claude/skills/native-review"),
        target: "@acme/skills/native-review",
        enable: false,
      });
      if (resolve === undefined) throw new Error("Expected the skill import to prepare");
      const staged = stagedPackageOf(prepare.calls);
      const reads = (
        phase: { readonly calls: ReadonlyArray<RecordedFileSystemCall> },
        relative: string,
      ) =>
        phase.calls.filter(
          (call) => call.method === "readFile" && call.path === nodePath.join(staged, relative),
        ).length;
      expect(deriveOperationOutcome(resolve.value)).toBe("applied");
      // Measured before the conversion decoded the manifest the hash walk read:
      // preparing read the staged manifest three times (hash walk, manifest
      // read, candidate seal). The seal still fingerprints the staged files.
      expect({
        hashes: prepare.hashes,
        manifestReads: reads(prepare, "skill.json"),
        bodyReads: reads(prepare, "src/SKILL.md"),
      }).toEqual({ hashes: 1, manifestReads: 2, bodyReads: 2 });
      expect({
        hashes: resolve.hashes,
        manifestReads: reads(resolve, "skill.json"),
        bodyReads: reads(resolve, "src/SKILL.md"),
      }).toEqual({ hashes: 2, manifestReads: 1, bodyReads: 1 });
    }),
  );

  it.effect("probes an absent skill import target once while preparing", () =>
    Effect.gen(function* () {
      const created = workspace();
      created.write(".claude/skills/native-review/SKILL.md", SKILL_DOCUMENT);
      const observed = yield* absentTargetProbes(
        created,
        nodePath.join(created.root, "skills/native-review"),
        {
          type: "skill",
          source: nodePath.join(created.root, ".claude/skills/native-review"),
          target: "@acme/skills/native-review",
          enable: false,
        },
      );
      // Under the lock the create-only preflight and the canonical directory
      // creation still probe the target fresh.
      expect(observed).toEqual({ outcome: "applied", prepare: 1, resolve: 8 });
    }),
  );

  it.effect("probes an absent subagent import target once while preparing", () =>
    Effect.gen(function* () {
      const created = workspace();
      const observed = yield* absentTargetProbes(
        created,
        nodePath.join(created.root, "subagents/custom"),
        {
          type: "subagent",
          source: nodePath.join(created.root, "native/reviewer.md"),
          sourceAgent: "claude-code",
          target: "@acme/subagents/custom",
          enable: false,
        },
      );
      expect(observed).toEqual({ outcome: "applied", prepare: 1, resolve: 7 });
    }),
  );

  it.effect("probes an absent hook import target once while preparing", () =>
    Effect.gen(function* () {
      const created = workspace();
      created.write("native/hook.sh", "#!/bin/bash\n");
      created.write(
        "native/hooks.json",
        JSON.stringify({
          hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "bash hook.sh" }] }] },
        }),
      );
      const observed = yield* absentTargetProbes(
        created,
        nodePath.join(created.root, "hooks/audit"),
        {
          type: "hook",
          source: nodePath.join(created.root, "native"),
          protocol: "claude-code",
          target: "@acme/hooks/audit",
          enable: false,
        },
        previewExecution,
      );
      expect(observed).toEqual({ outcome: "previewed", prepare: 1, resolve: 0 });
    }),
  );

  it.effect("refuses a skill import into an occupied target while preparing", () =>
    Effect.gen(function* () {
      const created = workspace();
      created.write(".claude/skills/native-review/SKILL.md", SKILL_DOCUMENT);
      created.write("skills/native-review/notes.md", "occupied\n");
      const directory = nodePath.join(created.root, "skills/native-review");
      const before = created.snapshot();

      const { prepare } = yield* prepareThenResolve(created, {
        type: "skill",
        source: nodePath.join(created.root, ".claude/skills/native-review"),
        target: "@acme/skills/native-review",
        enable: false,
      });

      if (prepare.value._tag !== "Failure") throw new Error("Expected preparation to refuse");
      expect(prepare.value.failure).toMatchObject({
        _tag: "CreateDestinationExists",
        subject: "Import target",
        path: directory,
      });
      expect(prepare.value.failure).toBeInstanceOf(CreateDestinationExists);
      expect(probes(prepare, directory)).toBe(1);
      expect(created.snapshot()).toEqual(before);
    }),
  );

  it.effect("refuses a skill target that appears after preparation", () =>
    Effect.gen(function* () {
      const created = workspace();
      created.write(".claude/skills/native-review/SKILL.md", SKILL_DOCUMENT);
      const resolution = yield* Effect.gen(function* () {
        const candidate = yield* ImportNativeExtension.prepare({
          type: "skill",
          source: nodePath.join(created.root, ".claude/skills/native-review"),
          target: "@acme/skills/native-review",
          enable: false,
        });
        created.write("skills/native-review/notes.md", "foreign\n");
        return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));

      // The foreign directory stales the candidate before the in-lock
      // create-only preflight would refuse it; nothing is published either way.
      expect(deriveOperationOutcome(resolution)).toBe("blocked");
      expect(resolution.blocking).toMatchObject({
        class: "stale-candidate",
        detail: "The execution candidate became stale before apply.",
      });
      expect(created.read("skills/native-review/notes.md")).toBe("foreign\n");
      expect(created.exists(`skills/native-review/SKILL.md`)).toBe(false);
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
