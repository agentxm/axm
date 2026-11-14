import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { readExtensionManifest } from "@agentxm/extension-content";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { parseFqn } from "@agentxm/extension-model/unstable/extensions";
import { FileSystemRecorder } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  computeSourceHash,
  withLiveWorkspaceObservations,
} from "@agentxm/workspace-kernel/workspace-state";
import { CreateExtension } from "./create/create-extension.js";
import { preflightAuthoredNativeProjection, preparedManifestFacts } from "./native-projection.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "./test-support/authoring-workspace.js";
import { recordingAuthoringWorkspaceLayer } from "./test-support/recording-authoring-workspace.js";
import { writeMinimalPackage } from "../testing/local-packages.js";

describe("authored native projection outcomes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const type of ["rule", "hook", "knowledge"] as const) {
    it.effect(`reports final native locations after creating a ${type}`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
        cleanups.push(created.cleanup);
        created.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
        const resolution = yield* Effect.gen(function* () {
          const candidate =
            type === "rule"
              ? yield* CreateExtension.prepare({
                  type,
                  name: "review",
                  owner: Option.none(),
                  title: Option.none(),
                })
              : type === "knowledge"
                ? yield* CreateExtension.prepare({
                    type,
                    name: "review",
                    owner: Option.none(),
                    description: Option.none(),
                  })
                : yield* CreateExtension.prepare({
                    type,
                    name: "review",
                    owner: Option.none(),
                    runtime: "bash",
                    protocol: "claude-code",
                    event: "SessionStart",
                    matcher: Option.none(),
                  });
          return yield* CreateExtension.previewOrApply(candidate, applyExecution);
        }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
        const nativeLocations = resolution.units.flatMap(
          (unit) => unit.artifact?.nativeLocations ?? [],
        );
        if (type === "hook") {
          expect(nativeLocations).toEqual([]);
          expect(created.exists(".claude/settings.json")).toBe(false);
          return;
        }
        expect(nativeLocations.length).toBeGreaterThan(0);
        expect(
          nativeLocations.every((location) => location.address.path.startsWith(`${created.root}/`)),
        ).toBe(true);
        expect(nativeLocations.some((location) => location.state === "created")).toBe(true);
        expect(
          nativeLocations
            .flatMap((location) => location.availability)
            .every((fact) => fact.state !== "verified"),
        ).toBe(true);
      }),
    );
  }
});

describe("authored native preflight inputs", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const plural = { rule: "rules", knowledge: "knowledge", hook: "hooks", subagent: "subagents" };
  const payload = {
    rule: "src/RULE.md",
    knowledge: "src/index.md",
    hook: "src/hook.sh",
    subagent: "src/review.md",
  };
  // Content reads of the staged manifest during one preflight: the preflight's
  // own manifest read and package hash, plus the manager's own reads.
  const manifestReadsWithoutInputs = { rule: 3, knowledge: 3, hook: 5, subagent: 4 };
  // Content reads of the staged payload during one preflight without inputs.
  const payloadReadsWithoutInputs = { rule: 2, knowledge: 2, hook: 3, subagent: 3 };
  // `axm.hash.package` executions during one preflight without inputs: the
  // preflight's hash, plus the HookManager's own content hash for a hook.
  const hashesWithoutInputs = { rule: 1, knowledge: 1, hook: 2, subagent: 1 };

  const stage = (type: keyof typeof plural) => {
    const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(workspace.cleanup);
    workspace.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
    const stagingRoot = fs.realpathSync(
      fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-preflight-test-")),
    );
    cleanups.push(() => fs.rmSync(stagingRoot, { recursive: true, force: true }));
    const packageRoot = writeMinimalPackage(nodePath.join(stagingRoot, "review"), type, {
      name: "review",
      owner: "@acme",
    });
    return { workspace, packageRoot };
  };

  /** Run one preflight, counting only the work that call performs. */
  const measured = <A, E, R>(packageRoot: string, preflight: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const result = yield* work.provide(withLiveWorkspaceObservations(preflight));
      const calls = recording
        .calls()
        .filter((call) => call.path === packageRoot || call.path.startsWith(`${packageRoot}/`));
      return {
        result,
        calls,
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
        readFile: (relative: string) =>
          calls.filter(
            (call) =>
              call.method === "readFile" &&
              call.outcome === "success" &&
              call.path === nodePath.join(packageRoot, relative),
          ).length,
      };
    });

  for (const type of ["rule", "knowledge", "hook", "subagent"] as const)
    it.effect(`skips only the work a supplied ${type} hash and manifest stand for`, () => {
      const { workspace, packageRoot } = stage(type);
      const manifestFile = manifestFilenameForType(type);
      return Effect.gen(function* () {
        const identity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/review`));
        const facts = preparedManifestFacts(yield* readExtensionManifest(packageRoot, type));
        const first = yield* computeSourceHash("first supplied hash");
        const second = yield* computeSourceHash("second supplied hash");
        const run = (inputs: {
          readonly sourceHash?: typeof first;
          readonly manifest?: typeof facts;
        }) =>
          measured(
            packageRoot,
            preflightAuthoredNativeProjection({
              identity,
              packageRoot,
              enabled: true,
              ...(inputs.sourceHash === undefined
                ? {}
                : { sourceHash: Effect.succeed(inputs.sourceHash) }),
              ...(inputs.manifest === undefined
                ? {}
                : { manifest: Effect.succeed(inputs.manifest) }),
            }),
          );

        const neither = yield* run({});
        const hashOnly = yield* run({ sourceHash: first });
        const manifestOnly = yield* run({ manifest: facts });
        const both = yield* run({ sourceHash: first, manifest: facts });
        const otherHash = yield* run({ sourceHash: second, manifest: facts });

        expect(neither.hashes).toBe(hashesWithoutInputs[type]);
        expect(hashOnly.hashes).toBe(hashesWithoutInputs[type] - 1);
        expect(manifestOnly.hashes).toBe(hashesWithoutInputs[type]);
        expect(both.hashes).toBe(hashesWithoutInputs[type] - 1);

        const total = manifestReadsWithoutInputs[type];
        expect(neither.readFile(manifestFile)).toBe(total);
        expect(hashOnly.readFile(manifestFile)).toBe(total - 1);
        expect(manifestOnly.readFile(manifestFile)).toBe(total - 1);
        expect(both.readFile(manifestFile)).toBe(total - 2);
        const payloadReads = payloadReadsWithoutInputs[type];
        expect(neither.readFile(payload[type])).toBe(payloadReads);
        expect(hashOnly.readFile(payload[type])).toBe(payloadReads - 1);
        expect(manifestOnly.readFile(payload[type])).toBe(payloadReads);
        expect(both.readFile(payload[type])).toBe(payloadReads - 1);

        // The supplied hash is never consumed: a different one changes nothing.
        expect(otherHash.result).toEqual(both.result);
        expect(otherHash.calls).toEqual(both.calls);
        expect(both.result).toEqual(neither.result);

        const renamedIdentity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/renamed`));
        const renamed = yield* preflightAuthoredNativeProjection({
          identity,
          packageRoot,
          enabled: true,
          manifest: Effect.succeed({ ...facts, name: renamedIdentity.name }),
        }).pipe(withLiveWorkspaceObservations, Effect.flip);
        expect(renamed).toMatchObject({
          detail:
            type === "subagent"
              ? "Prepared subagent identity does not match the requested identity"
              : "Prepared authored package identity does not match the requested identity",
        });
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    });

  for (const type of ["hook", "subagent"] as const)
    it.effect(`reads nothing for a disabled ${type}`, () => {
      const { workspace, packageRoot } = stage(type);
      return Effect.gen(function* () {
        const identity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/review`));
        const disabled = yield* measured(
          packageRoot,
          preflightAuthoredNativeProjection({ identity, packageRoot, enabled: false }),
        );
        expect(disabled.result).toEqual({});
        expect(disabled.calls).toEqual([]);
        expect(disabled.hashes).toBe(0);
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    });
});
