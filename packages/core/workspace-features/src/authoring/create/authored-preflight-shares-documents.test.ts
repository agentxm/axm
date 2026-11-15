import * as fs from "node:fs";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";
import { afterEach } from "vitest";
import { CurrentWorkObserver } from "@agentxm/host-primitives/work-observation";
import { FileSystemRecorder, type RecordedFileSystemCall } from "@agentxm/test-support";
import {
  deriveOperationOutcome,
  type OperationResolution,
} from "@agentxm/workspace-kernel/operations";

import { ForkExtension } from "../fork/fork-extension.js";
import { ImportNativeExtension } from "../import/import-native-extension.js";
import { authoringTypeFor, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { applyExecution, makeAuthoringWorkspace } from "../test-support/authoring-workspace.js";
import { createRequestFor } from "../test-support/create-requests.js";
import { nativeMcpDiscovery, writeNativeRemoteMcp } from "../test-support/native-mcp.js";
import { recordingAuthoringWorkspaceLayer } from "../test-support/recording-authoring-workspace.js";
import { CreateExtension, type CreatableExtensionType } from "./create-extension.js";

/** Span starts and completed work facts, in the order the apply produced them. */
type ApplyEvent =
  | { readonly span: string; readonly id: string; readonly parentId: string | undefined }
  | { readonly kind: string; readonly parentSpanId: string | undefined };

const SNAPSHOT_SPAN = "axm.publish.snapshot";

describe("authored-step preflight", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspaceFor = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
    // An accepted-resolution document exists, so every reader decodes both documents.
    created.write("axm.lock", "version = 1\n");
    return created;
  };

  /**
   * Run one prepared apply while one tracer and one work observer append to
   * the same ordered log. `onSnapshot` runs synchronously when the first
   * transaction snapshot starts, after the authored preflight finished.
   */
  const logApply = <E, R>(
    apply: Effect.Effect<OperationResolution<unknown>, E, R>,
    onSnapshot?: () => void,
  ) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const log: ApplyEvent[] = [];
      let snapshotStarted = false;
      let callsBeforeSnapshot = 0;
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          log.push({
            span: options.name,
            id: span.spanId,
            parentId: Option.getOrUndefined(options.parent)?.spanId,
          });
          if (options.name === SNAPSHOT_SPAN && !snapshotStarted) {
            snapshotStarted = true;
            callsBeforeSnapshot = recording.calls().length;
            onSnapshot?.();
          }
          return span;
        },
      });
      const inherited = yield* CurrentWorkObserver;
      const resolution = yield* apply.pipe(
        Effect.provideService(CurrentWorkObserver, {
          ...inherited,
          detailSelected: inherited?.detailSelected ?? (() => false),
          record: (fact, parent) => {
            log.push({ kind: fact.kind, parentSpanId: parent?.spanId });
            inherited?.record(fact, parent);
          },
        }),
        Effect.withTracer(tracer),
        Effect.withTracerEnabled(true),
      );
      expect(deriveOperationOutcome(resolution)).toBe("applied");
      const firstSnapshot = log.findIndex(
        (event) => "span" in event && event.span === SNAPSHOT_SPAN,
      );
      expect(firstSnapshot).toBeGreaterThan(0);
      const kindsBeforeSnapshot = (kind: string) =>
        log.slice(0, firstSnapshot).filter((event) => "kind" in event && event.kind === kind)
          .length;
      const calls = recording.calls();
      return {
        calls: {
          beforeSnapshot: calls.slice(0, callsBeforeSnapshot),
          fromSnapshot: calls.slice(callsBeforeSnapshot),
        },
        beforeSnapshot: {
          settings: kindsBeforeSnapshot("axm.parse.settings"),
          lockfile: kindsBeforeSnapshot("axm.parse.lockfile"),
          packageHashes: kindsBeforeSnapshot("axm.hash.package"),
          treeHashes: kindsBeforeSnapshot("axm.hash.materialized-tree"),
        },
        phases: log.filter((event) => "span" in event && event.span === "axm.observation.phase")
          .length,
      };
    });

  /** Prepare one creation, then apply it under the shared log. */
  const applyLogged = (type: CreatableExtensionType, onSnapshot?: () => void) =>
    Effect.gen(function* () {
      const prepared = yield* CreateExtension.prepare(createRequestFor(type, "review"));
      return yield* logApply(CreateExtension.previewOrApply(prepared, applyExecution), onSnapshot);
    });

  // Measured on the separate preflight reads: each of the gate, the installed
  // check, the prior graph, and (for rules) the prior output authority decoded
  // the documents again before the transaction's first snapshot. A rule's
  // native preflight reads the documents in its own document phase, so a rule
  // apply opens one phase besides the authored-step preflight's; a skill has no
  // native preflight and opens none.
  const measured = {
    rule: { settings: 5, lockfile: 6, packageHashes: 0, treeHashes: 0, phases: 1 },
    skill: { settings: 6, lockfile: 9, packageHashes: 0, treeHashes: 0, phases: 0 },
  } as const;

  for (const type of ["rule", "skill"] as const)
    it.effect(`decodes ${type} settings and lockfile once before the transaction snapshots`, () => {
      const created = workspaceFor();
      return Effect.gen(function* () {
        const apply = yield* applyLogged(type);
        const before = measured[type];
        expect(apply.beforeSnapshot).toEqual({
          settings: 1,
          lockfile: 1,
          packageHashes: before.packageHashes,
          treeHashes: before.treeHashes,
        });
        // The preflight adds exactly one document phase to the apply.
        expect(apply.phases).toBe(before.phases + 1);
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
    });

  // Routes without a materializability gate run the remaining preflight reads
  // in the same view. Measured with the separate preflight reads: a rule fork
  // decoded settings 4 and lockfile 6 times, an MCP import 3 and 5. The shared
  // view is one document phase; a rule fork also runs its rule's native
  // preflight in that preflight's own document phase, which an MCP import
  // does not have.
  it.effect("decodes a fork's settings and lockfile once before the transaction snapshots", () => {
    const created = workspaceFor();
    const source = writeAuthoringPackage(created.root, authoringTypeFor("rule"), "original");
    return Effect.gen(function* () {
      const prepared = yield* ForkExtension.prepare({
        source,
        target: "@acme/rules/custom",
        from: Option.none(),
        enable: true,
        nonInteractive: true,
      });
      const apply = yield* logApply(ForkExtension.previewOrApply(prepared, applyExecution));
      expect({
        settings: apply.beforeSnapshot.settings,
        lockfile: apply.beforeSnapshot.lockfile,
        phases: apply.phases,
      }).toEqual({ settings: 1, lockfile: 1, phases: 2 });
    }).pipe(Effect.scoped, Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });

  it.effect(
    "decodes an import's settings and lockfile once before the transaction snapshots",
    () => {
      const created = workspaceFor();
      writeNativeRemoteMcp(created);
      return Effect.gen(function* () {
        const prepared = yield* ImportNativeExtension.prepare({
          type: "mcp-server",
          target: "@acme/mcps/context",
          enable: true,
          nonInteractive: true,
          discovery: nativeMcpDiscovery(created),
        });
        const apply = yield* logApply(
          ImportNativeExtension.previewOrApply(prepared, applyExecution),
        );
        expect({
          settings: apply.beforeSnapshot.settings,
          lockfile: apply.beforeSnapshot.lockfile,
          phases: apply.phases,
        }).toEqual({ settings: 1, lockfile: 1, phases: 1 });
      }).pipe(Effect.scoped, Effect.provide(recordingAuthoringWorkspaceLayer(created)));
    },
  );

  it.effect("still hashes an existing authored package physically in the preflight", () => {
    const created = workspaceFor();
    writeAuthoringPackage(created.root, authoringTypeFor("rule"), "existing", { parent: "rules" });
    created.writeSettings({
      owner: "@acme",
      agents: ["claude-code"],
      instructionFiles: {},
      rules: { existing: "workspace" },
    });
    return Effect.gen(function* () {
      const apply = yield* applyLogged("rule");
      // Measured with the separate preflight reads: settings 6, lockfile 9,
      // one hash of the existing rule package and no materialized-tree hash
      // before the first snapshot. Sharing the documents leaves that physical
      // package hash in place.
      expect(apply.beforeSnapshot).toEqual({
        settings: 1,
        lockfile: 1,
        packageHashes: 1,
        treeHashes: 0,
      });
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });

  it.effect("still resolves skill destinations afresh inside the transaction", () => {
    const created = workspaceFor();
    const skillDirectories = [".claude/skills", ".agents/skills"].map((relative) =>
      nodePath.join(created.root, relative),
    );
    const resolutions = (calls: ReadonlyArray<RecordedFileSystemCall>) =>
      calls.filter(
        (call) =>
          (call.method === "realPath" || call.method === "readLink") &&
          skillDirectories.includes(call.path),
      ).length;
    return Effect.gen(function* () {
      const apply = yield* applyLogged("skill");
      // Measured with the separate preflight reads: 8 before the first
      // snapshot (two resolutions of both destinations) and 94 from it on.
      expect(resolutions(apply.calls.beforeSnapshot)).toBe(4);
      expect(resolutions(apply.calls.fromSnapshot)).toBe(94);
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });

  // Observed identically with the separate preflight reads: a creation the
  // prior graph does not reach yet is inserted into the native instruction
  // files its prior output authority admits.
  const ruleBlock = [
    "<!-- axm:rules -->",
    "# review",
    "",
    "Describe the behavior this rule asks agents to follow.",
    "<!-- /axm:rules -->",
    "",
  ].join("\n");
  const knowledgeIndex = [
    "<!-- axm:knowledge -->",
    "## Knowledge Bundles",
    "",
    "Use `axm knowledge concepts --help` to search, read, and explore these bundles.",
    "",
    "### @acme",
    "",
    "| Bundle | Description |",
    "| --- | --- |",
    "| [review](knowledge/review/src/index.md) | — |",
    "<!-- /axm:knowledge -->",
    "",
  ].join("\n");
  const outputs = {
    rule: {
      files: ["rules/review/rule.json", "rules/review/src/RULE.md"],
      native: ruleBlock,
    },
    knowledge: {
      files: ["knowledge/review/knowledge.json", "knowledge/review/src/index.md"],
      native: knowledgeIndex,
    },
    hook: {
      files: [
        "hooks/review/fixtures/applicable.json",
        "hooks/review/fixtures/empty.txt",
        "hooks/review/fixtures/log.txt",
        "hooks/review/fixtures/nonapplicable.json",
        "hooks/review/hook.json",
        "hooks/review/src/hook.sh",
      ],
      native: undefined,
    },
  } as const;

  for (const type of ["rule", "knowledge", "hook"] as const)
    it.effect(`renders a new ${type} from the prior graph and output authority`, () => {
      const created = workspaceFor();
      return Effect.gen(function* () {
        yield* applyLogged(type);
        const expected = outputs[type];
        const native = expected.native === undefined ? [] : ["AGENTS.md", "CLAUDE.md"];
        expect(created.tree().filter((file) => !file.startsWith(".axm/"))).toEqual(
          [...native, "axm.json", "axm.lock", ...expected.files].sort(),
        );
        for (const file of native) expect(created.read(file)).toBe(expected.native);
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
    });

  it.effect("preserves a settings edit made after the preflight through fresh writes", () => {
    const created = workspaceFor();
    const settingsPath = nodePath.join(created.root, "axm.json");
    return Effect.gen(function* () {
      yield* applyLogged("rule", () => {
        const current: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        if (typeof current !== "object" || current === null) throw new Error("Expected settings");
        const edited = { $schema: "https://example.com/settings.json", ...current };
        fs.writeFileSync(settingsPath, `${JSON.stringify(edited, null, 2)}\n`);
      });
      expect(created.settings()).toMatchObject({
        $schema: "https://example.com/settings.json",
        owner: "@acme",
        rules: { review: "workspace" },
      });
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });
});
