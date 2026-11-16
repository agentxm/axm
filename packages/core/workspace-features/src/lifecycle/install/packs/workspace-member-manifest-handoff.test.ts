/**
 * How often planning a Pack install reads the manifests of members the
 * workspace authors itself.
 *
 * A Pack member configured as a workspace-authored package is judged by the
 * planning's workspace authority scan, which reads and decodes its manifest.
 * The same planning call prepares the member's native projection from that
 * package, and takes the scan's decode for the same root and type instead of
 * reading the manifest again. These examples count content reads in real
 * workspaces with a `file://` Registry, during one preview of a Registry Pack
 * install, and name the counts observed when the projection read the manifest
 * itself. The concept document and the rule body are still read by the
 * projection; a manager's fallback to its own read for another root or type is
 * shown where it lives, in the authoring native-projection examples.
 *
 * The handoff ends with that planning call. Applying the install still rescans
 * workspace authority under the transition lock, refusing a member whose
 * source changed, and the managers' installs read every manifest themselves;
 * a configured update, whose Pack selection is prepared by another call, reads
 * every manifest itself as well.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  type FileSystemRecording,
} from "@agentxm/test-support";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import {
  applyPlanExecution,
  makeOperationLifecycle,
  OperationLifecycle,
  previewPlanExecution,
  type OperationLifecycleService,
} from "@agentxm/workspace-kernel/operations";

import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
  previewInstall,
  type InstallWorld,
} from "../../../testing/install-world.js";
import { writeMinimalPackage } from "../../../testing/local-packages.js";
import { configuredUpdateRequest } from "../../update/test-helpers.js";
import { UpdateExtensions } from "../../update/update-extensions.js";
import { InstallExtensions } from "../install-extensions.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

type MemberType = "knowledge" | "rule" | "hook";

/** Each member's authored directory, which is also its settings key. */
const authoredDirectory: Record<MemberType, string> = {
  knowledge: "knowledge",
  rule: "rules",
  hook: "hooks",
};
const memberName: Record<MemberType, string> = { knowledge: "notes", rule: "style", hook: "guard" };
const memberFqn = (type: MemberType) => `@acme/${authoredDirectory[type]}/${memberName[type]}`;

/** Content reads of each counted file. */
interface Counts {
  readonly knowledgeManifest: number;
  readonly conceptDocument: number;
  readonly ruleManifest: number;
  readonly ruleBody: number;
  readonly hookManifest: number;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * A workspace that authors and configures `members`, and a Registry Pack
 * declaring them; `disabled` members are configured but switched off.
 */
const world = (
  members: ReadonlyArray<MemberType>,
  disabled: ReadonlyArray<MemberType> = [],
): InstallWorld => {
  const created = makeInstallWorld({
    settings: Object.fromEntries(
      members.map((type) => [
        authoredDirectory[type],
        {
          [memberName[type]]: {
            source: "workspace",
            ...(disabled.includes(type) ? { enabled: false } : {}),
          },
        },
      ]),
    ),
  });
  cleanups.push(created.cleanup);
  for (const type of members) {
    writeMinimalPackage(
      nodePath.join(created.workspace.root, authoredDirectory[type], memberName[type]),
      type,
      { name: memberName[type] },
    );
  }
  created.registry.writePack("toolkit", [
    {
      version: "1.0.0",
      dependencies: Object.fromEntries(members.map((type) => [memberFqn(type), "^1.0.0"])),
    },
  ]);
  return created;
};

const packagePath = (created: InstallWorld, type: MemberType, ...relative: ReadonlyArray<string>) =>
  nodePath.join(created.workspace.root, authoredDirectory[type], memberName[type], ...relative);

/** Content reads of each counted file since the recording was last reset. */
const countsOf = (recording: FileSystemRecording, created: InstallWorld): Counts => {
  const reads = (type: MemberType, ...relative: ReadonlyArray<string>) =>
    recording.contentReads(packagePath(created, type, ...relative));
  return {
    knowledgeManifest: reads("knowledge", "knowledge.json"),
    conceptDocument: reads("knowledge", "src", "index.md"),
    ruleManifest: reads("rule", "rule.json"),
    ruleBody: reads("rule", "src", "RULE.md"),
    hookManifest: reads("hook", "hook.json"),
  };
};

const packInstall = installRequest({
  type: "pack",
  subject: { kind: "source", source: "@acme/packs/toolkit" },
});

/** Applying, with the Hook member's execution change accepted. */
const applyAccepting = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(["accept-execution-changes"]),
  recovery: { command: ["install"], arguments: [] },
});

describe("Pack install planning reads a workspace-authored member's manifest once less", () => {
  /** Preview the Pack install, counting reads after the workspace is set up. */
  const measure = (created: InstallWorld) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const resolution = yield* previewInstall(packInstall);
      return {
        outcome: deriveOperationOutcome(resolution),
        labels: resolution.units.map((unit) => unit.label),
        counts: countsOf(recording, created),
        allContentReads: recording
          .calls()
          .filter((call) => call.method === "readFile" || call.method === "file.read").length,
      };
    }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));

  const rows: ReadonlyArray<{
    readonly label: string;
    readonly members: ReadonlyArray<MemberType>;
    readonly disabled?: ReadonlyArray<MemberType>;
    readonly repeated: Counts;
    readonly observed: Counts;
  }> = [
    {
      label: "takes the authority scan's decode for each enabled Knowledge, Rule and Hook member",
      members: ["knowledge", "rule", "hook"],
      repeated: {
        knowledgeManifest: 4,
        conceptDocument: 3,
        ruleManifest: 4,
        ruleBody: 3,
        hookManifest: 5,
      },
      observed: {
        knowledgeManifest: 3,
        conceptDocument: 3,
        ruleManifest: 3,
        ruleBody: 3,
        hookManifest: 4,
      },
    },
    {
      // A disabled member's projection is never prepared, so nothing is
      // handed for it and none of its reads change.
      label: "reads a disabled member's manifest exactly as before",
      members: ["knowledge", "rule"],
      disabled: ["knowledge"],
      repeated: {
        knowledgeManifest: 3,
        conceptDocument: 2,
        ruleManifest: 4,
        ruleBody: 3,
        hookManifest: 0,
      },
      observed: {
        knowledgeManifest: 3,
        conceptDocument: 2,
        ruleManifest: 3,
        ruleBody: 3,
        hookManifest: 0,
      },
    },
  ];

  for (const { label, members, disabled, repeated, observed } of rows)
    it.effect(
      label,
      () =>
        Effect.gen(function* () {
          const created = world(members, disabled);
          const measured = yield* measure(created);
          expect(measured.outcome).toBe("previewed");
          expect(measured.labels).toContain("@acme/packs/toolkit");
          expect(measured.counts, `read the manifest itself: ${JSON.stringify(repeated)}`).toEqual(
            observed,
          );
        }),
      { timeout: 60_000 },
    );

  it.effect(
    "reads nothing more for a Pack whose members come from the Registry",
    () =>
      Effect.gen(function* () {
        const created = makeInstallWorld();
        cleanups.push(created.cleanup);
        created.registry.writeRule("guide", [{ version: "1.0.0", body: "Follow the guide.\n" }]);
        created.registry.writePack("toolkit", [
          { version: "1.0.0", dependencies: { "@acme/rules/guide": "^1.0.0" } },
        ]);
        const measured = yield* measure(created);
        expect(measured.outcome).toBe("previewed");
        // Measured before the projections took the scan's decodes: 12.
        expect(measured.allContentReads).toBe(12);
      }),
    { timeout: 60_000 },
  );
});

describe("Applying a Pack install reads each workspace-authored member afresh", () => {
  it.effect(
    "reads every member manifest under the transition exactly as before",
    () =>
      Effect.gen(function* () {
        const created = world(["knowledge", "rule", "hook"]);
        const measured = yield* Effect.gen(function* () {
          const recording = yield* FileSystemRecorder;
          recording.reset();
          const candidate = yield* InstallExtensions.prepare(packInstall);
          const planning = countsOf(recording, created);
          recording.reset();
          const { resolution } = yield* InstallExtensions.previewOrApply(candidate, applyAccepting);
          return {
            outcome: deriveOperationOutcome(resolution),
            planning,
            transition: countsOf(recording, created),
          };
        }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
        expect(measured.outcome).toBe("applied");
        expect({ planning: measured.planning, transition: measured.transition }).toEqual({
          // Planning takes the authority scan's decode for each member; when
          // it read the manifests itself it counted 4, 3, 4, 3 and 5.
          planning: {
            knowledgeManifest: 3,
            conceptDocument: 3,
            ruleManifest: 3,
            ruleBody: 3,
            hookManifest: 4,
          },
          // The rescan of workspace authority under the lock and the
          // managers' installs read every manifest themselves, exactly as
          // often as when planning read them itself.
          transition: {
            knowledgeManifest: 5,
            conceptDocument: 4,
            ruleManifest: 6,
            ruleBody: 4,
            hookManifest: 7,
          },
        });
      }),
    { timeout: 60_000 },
  );

  it.effect(
    "refuses the transition when a member's source changes after the candidate was validated",
    () =>
      Effect.gen(function* () {
        const created = world(["knowledge", "rule"]);
        const resolution = yield* Effect.gen(function* () {
          const candidate = yield* InstallExtensions.prepare(packInstall);
          const lifecycle = yield* makeOperationLifecycle({ name: "Install pack", mode: "apply" });
          // A foreign edit lands once the candidate's freshness was validated
          // and the transition begins applying, so only the under-lock rescan
          // of workspace authority can observe it.
          const editingWhenApplyStarts: OperationLifecycleService = {
            ...lifecycle,
            publish: (make) => {
              const event = make(0, 0);
              if (event._tag === "PhaseStarted" && event.phase === "apply") {
                fs.writeFileSync(
                  packagePath(created, "knowledge", "src", "index.md"),
                  "# Notes\n\nEdited before the transition.\n",
                );
              }
              return lifecycle.publish(make);
            },
          };
          const { resolution } = yield* InstallExtensions.previewOrApply(
            candidate,
            applyAccepting,
          ).pipe(Effect.provideService(OperationLifecycle, editingWhenApplyStarts));
          return resolution;
        }).pipe(created.workspace.provide, Effect.provide(NodeServices.layer));
        expect(deriveOperationOutcome(resolution)).toBe("failed");
        expect(resolution.units).toMatchObject([
          {
            id: "@acme/packs/toolkit",
            state: "failed",
            disposition: "restored",
            error: {
              category: "conflict",
              detail: "Workspace source authority changed before the pack transition applied",
            },
          },
        ]);
      }),
    { timeout: 60_000 },
  );
});

describe("Updating a configured Pack reads its workspace-authored members as before", () => {
  it.effect(
    "hands no scan decode through a selection prepared for the update",
    () =>
      Effect.gen(function* () {
        const created = world(["knowledge", "rule"]);
        const counts = yield* Effect.gen(function* () {
          yield* applyInstallAcceptingExecutionChanges(packInstall);
          created.registry.writePack("toolkit", [
            {
              version: "1.0.0",
              dependencies: { [memberFqn("knowledge")]: "^1.0.0", [memberFqn("rule")]: "^1.0.0" },
            },
            {
              version: "1.1.0",
              dependencies: { [memberFqn("knowledge")]: "^1.0.0", [memberFqn("rule")]: "^1.0.0" },
            },
          ]);
          const recording = yield* FileSystemRecorder;
          recording.reset();
          const candidate = yield* UpdateExtensions.prepare(
            configuredUpdateRequest({ type: "pack" }),
          );
          expect(candidate.outcome).toBe("planned");
          if (candidate.outcome === "nothing-configured") return countsOf(recording, created);
          const { resolution } = yield* UpdateExtensions.previewOrApply(
            candidate,
            previewPlanExecution,
          );
          expect(deriveOperationOutcome(resolution)).toBe("previewed");
          return countsOf(recording, created);
        }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
        // The counts observed before any planning took the scan's decodes.
        expect(counts).toEqual({
          knowledgeManifest: 4,
          conceptDocument: 3,
          ruleManifest: 4,
          ruleBody: 3,
          hookManifest: 0,
        });
      }),
    { timeout: 60_000 },
  );
});
