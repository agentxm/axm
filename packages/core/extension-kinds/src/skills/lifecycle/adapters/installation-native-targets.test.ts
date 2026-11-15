/**
 * Install planning judges each existing directory target from one read of its
 * copy receipt: the currency check reads it, and the native location
 * classification of the same inspection uses what that read observed.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import {
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  resolveNativeReferent,
} from "@agentxm/workspace-kernel/locations";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";
import * as Path from "effect/Path";
import {
  ExtensionPaths,
  SettingsSchema,
  UNCONSTRAINED_DESIRED_NODE,
  WorkspaceLocation,
  computeSkillPathsForLayout,
  resolveWorkspaceExtensionRef,
  type DesiredExtensionNode,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
  configuredRow,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { SkillManagerLive } from "../../manager.js";
import { skillInstallationFacts } from "./installation.js";

const OWNER = "@acme";
const NAME = "review";

let baseDir: string;

beforeEach(() => {
  baseDir = nodeFs.realpathSync(
    nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-skill-install-targets-")),
  );
});

afterEach(() => {
  nodeFs.rmSync(baseDir, { recursive: true, force: true });
});

/** The authored package whose `src` directory is the canonical skill source. */
const writeAuthoredSkill = () => {
  const root = nodePath.join(baseDir, "skills", NAME);
  nodeFs.mkdirSync(nodePath.join(root, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(root, "skill.json"),
    JSON.stringify({ owner: OWNER, type: "skill", name: NAME, version: "1.0.0" }),
  );
  nodeFs.writeFileSync(
    nodePath.join(root, "src", "SKILL.md"),
    `---\nname: ${NAME}\ndescription: ${NAME} skill\n---\n\nUse ${NAME}.\n`,
  );
  return nodePath.join(root, "src");
};

const node: DesiredExtensionNode = {
  type: "skill",
  name: NAME,
  identity: { authority: "workspace", fqn: `${OWNER}/skills/${NAME}` },
  source: "workspace",
  enabled: true,
  origins: [{ type: "settings", source: "workspace", enabled: true }],
  constraint: UNCONSTRAINED_DESIRED_NODE,
};

/** Paths for the explicit source inspection passes; no lockfile lookup is needed. */
const ExtensionPathsForSource = Layer.effect(
  ExtensionPaths,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    return {
      skillDir: (name, source) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          if (source === undefined) return yield* Effect.die("Expected an explicit skill source");
          return computeSkillPathsForLayout(
            path.join,
            yield* Ref.get(location.layout),
            source,
            name,
          );
        }),
    };
  }),
);

/** Claude Code reads `.claude/skills`; Codex reads the shared `.agents/skills`. */
const layer = () => {
  const axmDir = nodePath.join(baseDir, ".axm");
  const settings = Schema.decodeUnknownSync(SettingsSchema)({
    owner: OWNER,
    agents: ["claude-code", "codex"],
    skills: { [NAME]: "workspace" },
  });
  const rows = [configuredRow({ type: "skill", name: NAME, source: "workspace" })];
  return SkillManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
    Layer.provideMerge(NativeWriteAuthorityLive),
    Layer.provideMerge(ExtensionPathsForSource),
    Layer.provideMerge(
      WorkspaceReadTest({
        baseDir,
        runtimeDir: axmDir,
        settings,
        graph: { packMembership: [], nodes: [node], mcpSourceClosures: [], problems: [] },
        records: { rows: (type) => Effect.succeed(type === "skill" ? rows : []) },
      }),
    ),
    Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
    Layer.provide(
      Layer.succeed(SourceHostProviders, {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: () => Effect.die("not used"),
        fetch: () => Effect.die("not used"),
        acquireForTransition: () => Effect.die("not used"),
        cloneUrl: () => Option.none(),
        origin: () => "registry",
      }),
    ),
    Layer.provideMerge(WorkspaceFileWriteLocksLive),
    Layer.provideMerge(
      Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), NativePlatformTest),
    ),
  );
};

const claudeTarget = () => nodePath.join(baseDir, ".claude", "skills", NAME);
const sharedTarget = () => nodePath.join(baseDir, ".agents", "skills", NAME);

/** A bounded copy of the canonical source at `target`, with its receipt path. */
const writeCopy = (source: string, target: string) =>
  Effect.gen(function* () {
    nodeFs.cpSync(source, target, { recursive: true });
    const canonical = yield* resolveNativeReferent(source);
    expect(Option.isSome(yield* captureCopiedDirectory(target, canonical))).toBe(true);
    return yield* copiedDirectoryReceiptPath(target);
  });

/** One planning inspection, recorded from its start. */
const inspectRecorded = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const ref = yield* resolveWorkspaceExtensionRef({
    settingsName: NAME,
    source: "workspace",
    expectedType: "skill",
    layout: yield* Ref.get(location.layout),
    scope: location.scope,
  });
  if (ref.type !== "skill") return yield* Effect.die("Expected a skill ref");
  const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
  recording.reset();
  const inspection = yield* skillInstallationFacts
    .inspect(ref)
    .pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
  return { inspection, recording };
});

const nativeLocation = (
  inspection: {
    readonly nativeLocations?: ReadonlyArray<{ readonly address: { readonly path: string } }>;
  },
  target: string,
) => inspection.nativeLocations?.find((unit) => unit.address.path === target);

describe("skill install planning of existing directory targets", () => {
  it.effect("reads each copied target's receipt once and keeps each target's own judgement", () =>
    Effect.gen(function* () {
      const source = writeAuthoredSkill();
      const currentReceipt = yield* writeCopy(source, claudeTarget());
      nodeFs.mkdirSync(nodePath.dirname(sharedTarget()), { recursive: true });
      const staleReceipt = yield* writeCopy(source, sharedTarget());
      nodeFs.writeFileSync(nodePath.join(sharedTarget(), "SKILL.md"), "# Edited copy\n");

      const { inspection, recording } = yield* inspectRecorded;

      expect(recording.contentReads(currentReceipt)).toBe(1);
      expect(recording.contentReads(staleReceipt)).toBe(1);
      expect(inspection.targets).toEqual([
        { path: ".agents/skills/review", state: "different", agentIds: ["codex"] },
        { path: ".claude/skills/review", state: "current", agentIds: ["claude-code"] },
      ]);
      expect(nativeLocation(inspection, claudeTarget())).toMatchObject({
        mechanism: "copied-directory",
        ownership: "owned",
        proof: "bounded-copy-receipt",
        state: "unchanged",
      });
      const stale = nativeLocation(inspection, sharedTarget());
      expect(stale).toMatchObject({
        mechanism: "copied-directory",
        ownership: "unverified",
        state: "updated",
        reason: "Existing native content has not been verified as owned by this installation.",
      });
      expect(stale).not.toHaveProperty("proof");
    }).pipe(Effect.provide(layer())),
  );

  it.effect("classifies a foreign directory without a copy mechanism", () =>
    Effect.gen(function* () {
      const source = writeAuthoredSkill();
      const currentReceipt = yield* writeCopy(source, claudeTarget());
      nodeFs.mkdirSync(sharedTarget(), { recursive: true });
      nodeFs.writeFileSync(nodePath.join(sharedTarget(), "SKILL.md"), "# User\n");
      const foreignReceipt = yield* copiedDirectoryReceiptPath(sharedTarget());

      const { inspection, recording } = yield* inspectRecorded;

      expect(recording.contentReads(currentReceipt)).toBe(1);
      expect(recording.contentReads(foreignReceipt)).toBe(0);
      const foreign = nativeLocation(inspection, sharedTarget());
      expect(foreign).toMatchObject({ ownership: "unverified", state: "updated" });
      expect(foreign).not.toHaveProperty("mechanism");
      expect(foreign).not.toHaveProperty("proof");
    }).pipe(Effect.provide(layer())),
  );

  it.effect("reads no copy receipt for absent and linked targets", () =>
    Effect.gen(function* () {
      const source = writeAuthoredSkill();
      nodeFs.mkdirSync(nodePath.dirname(claudeTarget()), { recursive: true });
      nodeFs.symlinkSync(source, claudeTarget());
      const linkedReceipt = yield* copiedDirectoryReceiptPath(claudeTarget());
      const absentReceipt = yield* copiedDirectoryReceiptPath(sharedTarget());

      const { inspection, recording } = yield* inspectRecorded;

      expect(recording.calls({ path: linkedReceipt })).toEqual([]);
      expect(recording.calls({ path: absentReceipt })).toEqual([]);
      expect(inspection.targets).toEqual([
        { path: ".agents/skills/review", state: "absent", agentIds: ["codex"] },
        { path: ".claude/skills/review", state: "current", agentIds: ["claude-code"] },
      ]);
      expect(nativeLocation(inspection, claudeTarget())).toMatchObject({
        mechanism: "symlink",
        ownership: "owned",
        proof: "exact-canonical-source-link",
      });
    }).pipe(Effect.provide(layer())),
  );
});
