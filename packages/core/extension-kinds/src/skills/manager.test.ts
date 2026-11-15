/**
 * Withdrawing a skill's native projection: the copy receipt the output
 * inventory proved is not read again only to classify the removal target,
 * while the removal's source check and the retirement still read it fresh.
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
import { SkillManager } from "@agentxm/workspace-kernel/materialization";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";
import {
  SettingsSchema,
  UNCONSTRAINED_DESIRED_NODE,
  type DesiredExtensionNode,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
  configuredRow,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { extensionName } from "@agentxm/workspace-kernel/workspace-state/testing";
import { SkillManagerLive } from "./manager.js";

const OWNER = "@acme";
const NAME = "review";

let baseDir: string;

beforeEach(() => {
  baseDir = nodeFs.realpathSync(
    nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-skill-removal-")),
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

const managerLayer = () => {
  const axmDir = nodePath.join(baseDir, ".axm");
  const settings = Schema.decodeUnknownSync(SettingsSchema)({
    owner: OWNER,
    agents: [],
    skills: { [NAME]: "workspace" },
  });
  const rows = [configuredRow({ type: "skill", name: NAME, source: "workspace" })];
  return SkillManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
    Layer.provideMerge(NativeWriteAuthorityLive),
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

const projection = () => nodePath.join(baseDir, ".agents", "skills", NAME);

/** A bounded copy of the canonical source at the shared skill directory. */
const writeCopiedProjection = (source: string) =>
  Effect.gen(function* () {
    const target = projection();
    nodeFs.cpSync(source, target, { recursive: true });
    const canonical = yield* resolveNativeReferent(source);
    expect(Option.isSome(yield* captureCopiedDirectory(target, canonical))).toBe(true);
    return yield* copiedDirectoryReceiptPath(target);
  });

/** One removal call, recorded from its start. */
const removeRecorded = (mode: "materializeUninstall" | "materializeDeactivate") =>
  Effect.gen(function* () {
    const manager = yield* SkillManager;
    const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    recording.reset();
    const facts = yield* manager[mode]({
      target: { type: "skill", name: extensionName(NAME) },
    }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
    return { facts, recording };
  });

describe("skill projection withdrawal", () => {
  it.effect.each(["materializeUninstall", "materializeDeactivate"] as const)(
    "%s reads a copied projection's receipt for inventory, source check and retirement only",
    (mode) =>
      Effect.gen(function* () {
        const source = writeAuthoredSkill();
        const receiptPath = yield* writeCopiedProjection(source);

        const { facts, recording } = yield* removeRecorded(mode);

        expect(recording.contentReads(receiptPath)).toBe(3);
        expect(nodeFs.existsSync(projection())).toBe(false);
        expect(nodeFs.existsSync(receiptPath)).toBe(false);
        expect(facts.observation.nativeLocations).toEqual([
          expect.objectContaining({
            address: { kind: "entry", path: projection() },
            mechanism: "copied-directory",
            ownership: "absent",
            state: "removed",
          }),
        ]);
        expect(facts.observation.nativeLocations?.[0]).not.toHaveProperty("proof");
      }).pipe(Effect.provide(managerLayer())),
  );

  it.effect("keeps foreign children and reports the withdrawn copy as unowned", () =>
    Effect.gen(function* () {
      const source = writeAuthoredSkill();
      const receiptPath = yield* writeCopiedProjection(source);
      nodeFs.writeFileSync(nodePath.join(projection(), "personal.txt"), "Foreign\n");

      const { facts, recording } = yield* removeRecorded("materializeUninstall");

      expect(recording.contentReads(receiptPath)).toBe(3);
      expect(nodeFs.readdirSync(projection())).toEqual(["personal.txt"]);
      expect(nodeFs.existsSync(receiptPath)).toBe(false);
      expect(facts.observation.nativeLocations).toEqual([
        expect.objectContaining({
          address: { kind: "entry", path: projection() },
          mechanism: "copied-directory",
          ownership: "unowned",
          state: "retained",
          reason:
            "Owned copied contents were withdrawn; user additions or modified entries remain.",
        }),
      ]);
    }).pipe(Effect.provide(managerLayer())),
  );

  it.effect("reads no copy receipt when withdrawing a linked projection", () =>
    Effect.gen(function* () {
      const source = writeAuthoredSkill();
      nodeFs.mkdirSync(nodePath.dirname(projection()), { recursive: true });
      nodeFs.symlinkSync(source, projection());
      const receiptPath = yield* copiedDirectoryReceiptPath(projection());

      const { facts, recording } = yield* removeRecorded("materializeUninstall");

      expect(recording.calls({ path: receiptPath })).toEqual([]);
      expect(nodeFs.existsSync(projection())).toBe(false);
      expect(facts.observation.nativeLocations).toEqual([
        expect.objectContaining({ mechanism: "symlink", ownership: "absent", state: "removed" }),
      ]);
    }).pipe(Effect.provide(managerLayer())),
  );

  it.effect.each(["materializeUninstall", "materializeDeactivate"] as const)(
    "%s resolves a linked projection for the inventory, write admission and exact-link proof only",
    (mode) =>
      Effect.gen(function* () {
        const source = writeAuthoredSkill();
        nodeFs.mkdirSync(nodePath.dirname(projection()), { recursive: true });
        nodeFs.symlinkSync(source, projection());

        const { facts, recording } = yield* removeRecorded(mode);

        // The inventory and the write admission each resolve the link entry;
        // classifying the removal target reuses the inventory's entry. After
        // the unlink, retirement observes the entry's absence afresh.
        expect(recording.counts(projection())).toEqual({ readLink: 6, stat: 3, realPath: 2 });
        // The inventory and the removal's exact-link proof each resolve the
        // canonical source as referent and as the link's immediate entry.
        expect(recording.counts(source)).toEqual({ readLink: 2, stat: 2, realPath: 4 });
        // The shared container: inventory listing and two entry resolutions,
        // write admission, and retirement.
        expect(recording.counts(nodePath.dirname(projection()))).toEqual({
          readDirectory: 3,
          realPath: 4,
        });
        expect(nodeFs.existsSync(projection())).toBe(false);
        expect(nodeFs.existsSync(source)).toBe(true);
        expect(facts.observation.nativeLocations).toEqual([
          expect.objectContaining({
            address: { kind: "entry", path: projection() },
            aliases: [projection()],
            mechanism: "symlink",
            ownership: "absent",
            policyReasons: ["workspace-shared-skills"],
            state: "removed",
          }),
        ]);
      }).pipe(Effect.provide(managerLayer())),
  );

  it.effect("fails before any write when the shared skill directory cannot be resolved", () =>
    Effect.gen(function* () {
      const source = writeAuthoredSkill();
      const reader = nodePath.join(baseDir, ".claude", "skills", NAME);
      nodeFs.mkdirSync(nodePath.dirname(reader), { recursive: true });
      nodeFs.symlinkSync(source, reader);
      // A self-referential link makes the shared directory unresolvable.
      const shared = nodePath.dirname(projection());
      nodeFs.mkdirSync(nodePath.dirname(shared), { recursive: true });
      nodeFs.symlinkSync(shared, shared);
      const manager = yield* SkillManager;

      const failure = yield* manager
        .materializeUninstall({ target: { type: "skill", name: extensionName(NAME) } })
        .pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: "SkillDefinitionInvalid",
        detail: "Cannot observe native Skill removal targets",
        cause: { _tag: "NativeLocationError", target: shared, reason: "unreadable" },
      });
      expect(nodeFs.readlinkSync(reader)).toBe(source);
    }).pipe(Effect.provide(managerLayer())),
  );
});
