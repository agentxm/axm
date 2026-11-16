/**
 * How often planning a Pack install reads the manifests of members the
 * workspace authors itself.
 *
 * A Pack member configured as a workspace-authored package is judged by the
 * planning's workspace authority scan, which reads and decodes its manifest.
 * The same planning call prepares the member's native projection from that
 * package, and takes the scan's decode for the same root and type instead of
 * reading the manifest again. These examples count content reads during one
 * preview of a Registry Pack install, in real workspaces with a `file://`
 * Registry. Each row names the counts observed when the projection read the
 * manifest itself. The concept document and the rule body are still read by
 * the projection; a manager's fallback to its own read for another root or
 * type is shown where it lives, in the authoring native-projection examples.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import {
  installRequest,
  makeInstallWorld,
  previewInstall,
  type InstallWorld,
} from "../../../testing/install-world.js";
import { writeMinimalPackage } from "../../../testing/local-packages.js";

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

/** Content reads of each counted file during one preview. */
interface Counts {
  readonly knowledgeManifest: number;
  readonly conceptDocument: number;
  readonly ruleManifest: number;
  readonly ruleBody: number;
  readonly hookManifest: number;
}

describe("Pack install planning reads a workspace-authored member's manifest once less", () => {
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

  const packagePath = (
    created: InstallWorld,
    type: MemberType,
    ...relative: ReadonlyArray<string>
  ) =>
    nodePath.join(created.workspace.root, authoredDirectory[type], memberName[type], ...relative);

  /** Preview the Pack install, counting reads after the workspace is set up. */
  const measure = (created: InstallWorld) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const resolution = yield* previewInstall(
        installRequest({
          type: "pack",
          subject: { kind: "source", source: "@acme/packs/toolkit" },
        }),
      );
      const reads = (type: MemberType, ...relative: ReadonlyArray<string>) =>
        recording.contentReads(packagePath(created, type, ...relative));
      const counts: Counts = {
        knowledgeManifest: reads("knowledge", "knowledge.json"),
        conceptDocument: reads("knowledge", "src", "index.md"),
        ruleManifest: reads("rule", "rule.json"),
        ruleBody: reads("rule", "src", "RULE.md"),
        hookManifest: reads("hook", "hook.json"),
      };
      return {
        outcome: deriveOperationOutcome(resolution),
        labels: resolution.units.map((unit) => unit.label),
        counts,
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
