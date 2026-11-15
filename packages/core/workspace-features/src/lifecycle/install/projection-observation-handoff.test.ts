/**
 * Install planning observes each shared projection plan once per manager call:
 * the eager pre-write observation the manager makes while preparing the
 * projection is handed to the consumer that derives the exposed sources.
 *
 * Counts are exact for these fixtures. Each observation of the hook unit reads
 * `.claude/settings.json` once; each observation of an instruction region reads
 * `AGENTS.md` once. Every row names the counts observed when each consumer
 * observed the plans again, and the counts without those repeated observations.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";

import { makeLifecycleFixture, type LifecycleFixture } from "../testing.js";
import {
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
} from "../../testing/local-packages.js";
import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
  previewInstall,
} from "../../testing/install-world.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const SETTINGS = ".claude/settings.json";
const INSTRUCTIONS = "AGENTS.md";
const FOREIGN_REGISTRATION = `${JSON.stringify(
  {
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo foreign" }] }],
    },
  },
  null,
  2,
)}\n`;

const writers = {
  hook: writeLocalHookPackage,
  rule: writeLocalRulePackage,
  knowledge: writeLocalKnowledgePackage,
} satisfies Partial<Record<InstallableExtensionType, unknown>>;

/** Install `source` as `type`, counting the preview or the apply. */
const measureSourceInstall = (
  workspace: LifecycleFixture,
  type: InstallableExtensionType,
  source: string,
  mode: "preview" | "apply",
) =>
  Effect.gen(function* () {
    const request = installRequest({ type, subject: { kind: "source", source } });
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const work = workObservations(false);
    const resolution = yield* (
      mode === "preview" ? previewInstall : applyInstallAcceptingExecutionChanges
    )(request).pipe(work.provide);
    return {
      outcome: deriveOperationOutcome(resolution),
      settingsReads: recording.contentReads(nodePath.join(workspace.root, SETTINGS)),
      instructionReads: recording.contentReads(nodePath.join(workspace.root, INSTRUCTIONS)),
      nativeParses: work.facts.filter((fact) => fact.kind === "axm.parse.native").length,
    };
  }).pipe(workspace.provide, Effect.provide(recordedNodeServices));

/** Settings reads, instruction-file reads and native parses of one counted install. */
type Counts = readonly [settingsReads: number, instructionReads: number, nativeParses: number];

const countsOf = (counted: {
  readonly settingsReads: number;
  readonly instructionReads: number;
  readonly nativeParses: number;
}): Counts => [counted.settingsReads, counted.instructionReads, counted.nativeParses];

describe("Install hands each manager's eager projection observation to its consumer", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  /** Knowledge discovery renders into the instruction file only when instruction files are managed. */
  const workspaceWith = (instructionFiles: boolean) => {
    const workspace = makeLifecycleFixture({
      sources: "live",
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        ...(instructionFiles
          ? { instructionFiles: { fileName: INSTRUCTIONS, gitignoreAliases: false } }
          : {}),
      },
      files: { [SETTINGS]: FOREIGN_REGISTRATION, [INSTRUCTIONS]: "# Human instructions\n" },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const rows: ReadonlyArray<{
    readonly type: keyof typeof writers;
    readonly mode: "preview" | "apply";
    readonly packages: ReadonlyArray<string>;
    readonly repeated: Counts;
    readonly observed: Counts;
  }> = [
    { type: "hook", mode: "preview", packages: ["demo"], repeated: [4, 0, 8], observed: [3, 0, 4] },
    {
      type: "hook",
      mode: "apply",
      packages: ["demo"],
      repeated: [10, 0, 16],
      observed: [9, 0, 12],
    },
    { type: "rule", mode: "preview", packages: ["demo"], repeated: [0, 3, 0], observed: [0, 2, 0] },
    { type: "rule", mode: "apply", packages: ["demo"], repeated: [0, 12, 0], observed: [0, 10, 0] },
    {
      type: "knowledge",
      mode: "preview",
      packages: ["demo"],
      repeated: [0, 11, 0],
      observed: [0, 9, 0],
    },
    {
      type: "knowledge",
      mode: "apply",
      packages: ["demo"],
      repeated: [0, 34, 0],
      observed: [0, 31, 0],
    },
    // Several members of one kind render their shared unit once, after every member.
    {
      type: "hook",
      mode: "apply",
      packages: ["first", "second"],
      repeated: [10, 0, 16],
      observed: [9, 0, 12],
    },
    {
      type: "rule",
      mode: "apply",
      packages: ["first", "second"],
      repeated: [0, 12, 0],
      observed: [0, 10, 0],
    },
    {
      type: "knowledge",
      mode: "apply",
      packages: ["first", "second"],
      repeated: [0, 34, 0],
      observed: [0, 31, 0],
    },
  ];

  for (const { type, mode, packages, repeated, observed } of rows) {
    it.effect(
      `${mode === "preview" ? "previews" : "applies"} an install of ${packages.length} local ${type} package(s)`,
      () =>
        Effect.gen(function* () {
          const workspace = workspaceWith(type === "knowledge");
          const sourceRoot = nodePath.join(workspace.root, "source");
          for (const name of packages) writers[type](sourceRoot, { name });
          const source =
            packages.length === 1 ? nodePath.join(sourceRoot, "vendor", "demo") : sourceRoot;
          const counted = yield* measureSourceInstall(workspace, type, source, mode);
          expect(counted.outcome).toBe(mode === "preview" ? "previewed" : "applied");
          if (mode === "apply") {
            const settings = workspace.readFile("axm.json");
            for (const name of packages) expect(settings).toContain(`"${name}"`);
            expect(workspace.readFile(SETTINGS)).toContain("echo foreign");
          }
          expect(countsOf(counted), `repeated observations: ${repeated.join("/")}`).toEqual(
            observed,
          );
        }),
      { timeout: 60_000 },
    );
  }

  for (const { mode, repeated, observed } of [
    { mode: "preview", repeated: [2, 14, 8], observed: [1, 10, 4] },
    { mode: "apply", repeated: [7, 47, 16], observed: [6, 41, 12] },
  ] as const) {
    it.effect(
      `${mode === "preview" ? "previews" : "applies"} a Pack install whose rule, hook and knowledge members share native units`,
      () =>
        Effect.gen(function* () {
          const world = makeInstallWorld({
            settings: { instructionFiles: { fileName: INSTRUCTIONS, gitignoreAliases: false } },
          });
          cleanups.push(world.cleanup);
          world.workspace.writeFile(SETTINGS, FOREIGN_REGISTRATION);
          world.workspace.writeFile(INSTRUCTIONS, "# Human instructions\n");
          world.registry.writeRule("guide", [{ version: "1.0.0", body: "Follow the guide.\n" }]);
          world.registry.writeHook("audit", [{ version: "1.0.0" }]);
          world.registry.writeKnowledge("handbook", [
            { version: "1.0.0", body: "# Handbook\n\nTeam knowledge.\n" },
          ]);
          world.registry.writePack("bundle", [
            {
              version: "1.0.0",
              dependencies: {
                "@acme/rules/guide": "^1.0.0",
                "@acme/hooks/audit": "^1.0.0",
                "@acme/knowledge/handbook": "^1.0.0",
              },
            },
          ]);
          const counted = yield* measureSourceInstall(
            world.workspace,
            "pack",
            "@acme/packs/bundle",
            mode,
          );
          expect(counted.outcome).toBe(mode === "preview" ? "previewed" : "applied");
          expect(countsOf(counted), `repeated observations: ${repeated.join("/")}`).toEqual(
            observed,
          );
        }),
      { timeout: 60_000 },
    );
  }
});
