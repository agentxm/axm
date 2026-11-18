import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Tracer from "effect/Tracer";
import {
  manifestFilenameForType,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import { NativeEntryRemovalLive } from "../../locations/live.js";
import { NativePlatformTest, workObservations } from "../../locations/testing.js";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import * as Option from "effect/Option";
import {
  LOCKFILE_VERSION,
  type RuleLockEntry,
  type SkillLockEntry,
} from "../desired/lockfile/schema.js";
import { emitLockfileToml } from "../desired/lockfile/toml.js";
import type { GitHostedSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { exactVersion, extensionName, handle, storedLockfileFixture } from "../testing.js";
import {
  acceptedCanonicalObservation,
  acceptedCanonicalObservationCapturing,
  acceptedCanonicalObservationOfKeptRoot,
  acceptedCanonicalObservationPath,
  acceptedLockedResolutionRef,
  acceptedResolutionRef,
  observeDesiredCanonical,
  observeDesiredUsableCanonical,
  prepareAcceptedCanonicalTransition,
  usableAcceptedCanonicalFrom,
  usableAcceptedCanonicalRef,
} from "./accepted-canonical-ref.js";
import { BUNDLED_SKILL_OWNER, bundledSkillCanonicalRoot } from "./extension-paths.js";
import { resolveWorkspaceExtensionRef } from "./configured-entry-resolution/workspace-ref.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import { DesiredStateWriter } from "./desired-state-writer.js";
import { McpSourceKey } from "./mcp-source-identity.js";
import { withWorkspaceReadView } from "./read-view.js";
import { WorkspaceLocation } from "./location.js";
import type { LockfileReader } from "./lockfile-reader.js";
import type { SettingsReader } from "./settings-reader.js";
import { UNCONSTRAINED_DESIRED_NODE, type DesiredExtensionNode } from "./desired-state-graph.js";
import { TEST_TREE_INTEGRITY, makeRegistryMcpServerLockEntry } from "./test-stubs.js";
import { WorkspaceLayerTest, WorkspaceStateTest } from "../testing.js";

describe("accepted canonical source transitions", () => {
  it.effect("removes only the superseded accepted package", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-source-transition-"));
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
      );

      const previousPath = nodePath.join(
        root,
        "agent_extensions",
        "registry.agentxm.ai",
        "@acme",
        "skills",
        "review",
      );
      const unrelatedPath = nodePath.join(
        root,
        "agent_extensions",
        "github",
        "other",
        "extensions",
        "skills",
        "review",
      );
      nodeFs.mkdirSync(previousPath, { recursive: true });
      nodeFs.mkdirSync(unrelatedPath, { recursive: true });

      const accepted = {
        source: {
          type: "registry",
          url: decodeRegistryEndpointSync("https://registry.agentxm.ai"),
        },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: {
          version: exactVersion("1.0.0"),
          integrity:
            "sha512-W6hmaNcCrEx5sOAbpgd9XOw+u68VBl+mKXJFoIxt5kihKN1+FVD/jdm1bqL40gSWuROKd0lEc0d45/aL2aNWqg==",
          publisherBindingId: "hbnd_review",
        },
        treeIntegrity: TEST_TREE_INTEGRITY,
      } satisfies SkillLockEntry;
      nodeFs.writeFileSync(nodePath.join(root, "axm.json"), "{}\n");
      nodeFs.writeFileSync(
        nodePath.join(root, "axm.lock"),
        emitLockfileToml(
          storedLockfileFixture({
            lockfileVersion: LOCKFILE_VERSION,
            skills: { review: accepted },
          }),
        ),
      );
      const sourcePath = "skills/review";
      const sourceRoot = nodePath.join(root, "checkout", sourcePath);
      const ref = {
        type: "skill",
        refType: "git-hosted",
        source: {
          type: "git",
          url: new URL("https://github.com/acme/extensions.git"),
          ref: Option.some("main"),
          subPath: Option.some(sourcePath),
        },
        name: extensionName("review"),
        sourcePath,
        portable: true,
        location: pathToFileURL(sourceRoot).href,
        gitTreeSha: "tree-2",
        gitCommitSha: "commit-2",
        skill: {
          name: extensionName("review"),
          description: Option.none(),
          metadata: Option.none(),
        },
      } satisfies GitHostedSkillRef;

      const cleanup = yield* prepareAcceptedCanonicalTransition({
        type: "skill",
        name: "review",
        ref,
      }).pipe(
        Effect.provide(
          WorkspaceStateTest({
            scope: "project",
            projectRoot: decodeAbsolutePathSync(root),
          }),
        ),
      );
      expect(nodeFs.existsSync(previousPath)).toBe(true);

      yield* cleanup;

      expect(nodeFs.existsSync(previousPath)).toBe(false);
      expect(nodeFs.existsSync(unrelatedPath)).toBe(true);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
    ),
  );
});

describe("accepted canonical observation with manifest text", () => {
  it.effect("observes exactly as the plain observation and hands back the text it read", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-accepted-capture-"));
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
      );
      nodeFs.writeFileSync(nodePath.join(root, "axm.json"), '{ "owner": "@acme" }\n');
      const canonical = nodePath.join(root, "skills", "review");
      nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
      nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Authored\n");
      const manifestPath = nodePath.join(canonical, "skill.json");
      nodeFs.writeFileSync(
        manifestPath,
        `${JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" })}\n`,
      );
      const source = "workspace:@acme/skills/review";
      const desired: DesiredExtensionNode = {
        type: "skill",
        name: "review",
        identity: { authority: "workspace", fqn: "@acme/skills/review" },
        source,
        enabled: true,
        constraint: UNCONSTRAINED_DESIRED_NODE,
        origins: [{ type: "settings", source, enabled: true }],
      };
      const state = WorkspaceStateTest({
        scope: "project",
        projectRoot: decodeAbsolutePathSync(root),
      });

      const authored = { type: "skill", name: "review", desired } as const;
      const capture = yield* acceptedCanonicalObservationCapturing(authored).pipe(
        Effect.provide(state),
      );
      expect(Option.map(capture.observed, (observed) => observed.observation.status)).toEqual(
        Option.some("usable"),
      );
      expect(capture.observed).toEqual(
        yield* acceptedCanonicalObservation(authored).pipe(Effect.provide(state)),
      );
      expect(capture.manifest.pipe(Option.map(({ path, text }) => ({ path, text })))).toEqual(
        Option.some({ path: manifestPath, text: nodeFs.readFileSync(manifestPath, "utf8") }),
      );
      expect(capture.manifest.pipe(Option.flatMap(({ decode }) => decode()))).toEqual(
        Option.some({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
      );

      const undeclared = { type: "skill", name: "absent" } as const;
      const none = yield* acceptedCanonicalObservationCapturing(undeclared).pipe(
        Effect.provide(state),
      );
      expect(none).toEqual({ observed: Option.none(), manifest: Option.none() });
      expect(yield* acceptedCanonicalObservation(undeclared).pipe(Effect.provide(state))).toEqual(
        Option.none(),
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
    ),
  );
});

/**
 * One authored package of each kind, with the payload its observation requires
 * and how many times one usable lookup reads its manifest: the observation's
 * read and the package hash's walk, plus the subagent package load's own read.
 */
const authoredPackages = [
  {
    type: "skill",
    name: "review",
    manifest: { description: "Reviews changes" },
    files: { "src/SKILL.md": "# Review\n" },
    manifestReads: 2,
  },
  {
    type: "subagent",
    name: "researcher",
    manifest: { description: "Research", core: { instructions: "src/instructions.md" } },
    files: { "src/instructions.md": "Research carefully.\n" },
    manifestReads: 3,
  },
  {
    type: "mcp-server",
    name: "browser",
    manifest: {
      server: { name: "io.agentxm/browser", description: "Browser MCP", version: "1.0.0" },
    },
    files: {},
    manifestReads: 2,
  },
  {
    type: "pack",
    name: "reviewers",
    manifest: { dependencies: { "@acme/skills/review": "^1.0.0" } },
    files: {},
    manifestReads: 2,
  },
  {
    type: "rule",
    name: "policy",
    manifest: {},
    files: { "src/index.md": "#\n" },
    manifestReads: 2,
  },
  {
    type: "hook",
    name: "audit",
    manifest: {
      implementations: [
        {
          id: "claude",
          protocol: "claude-code",
          bindings: [
            {
              id: "stop",
              event: "Stop",
              handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
            },
          ],
        },
      ],
    },
    files: { "src/index.md": "#\n" },
    manifestReads: 2,
  },
  {
    type: "knowledge",
    name: "handbook",
    manifest: { format: { name: "okf", version: "0.2" }, bundleRoot: "src" },
    files: { "src/index.md": "#\n" },
    manifestReads: 2,
  },
] as const;

/** A project owned by `@acme` holding every authored package above, and its services. */
const authoredProject = Effect.gen(function* () {
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-accepted-authored-"));
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
  );
  nodeFs.writeFileSync(nodePath.join(root, "axm.json"), '{ "owner": "@acme" }\n');
  const packages = authoredPackages.map((authored) => {
    const packageDir = nodePath.join(root, toExtensionTypePlural(authored.type), authored.name);
    nodeFs.mkdirSync(nodePath.join(packageDir, "src"), { recursive: true });
    for (const [file, content] of Object.entries(authored.files))
      nodeFs.writeFileSync(nodePath.join(packageDir, file), content);
    const manifestPath = nodePath.join(packageDir, manifestFilenameForType(authored.type));
    nodeFs.writeFileSync(
      manifestPath,
      `${JSON.stringify({
        owner: "@acme",
        type: authored.type,
        name: authored.name,
        version: "1.0.0",
        ...authored.manifest,
      })}\n`,
    );
    const desired: DesiredExtensionNode = {
      type: authored.type,
      name: authored.name,
      identity: { authority: "workspace", fqn: `@acme/${authored.type}/${authored.name}` },
      source: "workspace",
      enabled: true,
      constraint: UNCONSTRAINED_DESIRED_NODE,
      origins: [{ type: "settings", source: "workspace", enabled: true }],
    };
    return { ...authored, packageDir, manifestPath, desired };
  });
  const state = WorkspaceStateTest({ scope: "project", projectRoot: decodeAbsolutePathSync(root) });
  return { root, packages, state };
});

/** Run `effect` against the project's services, recording its filesystem calls and work. */
const recordedRun = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | FileSystem.FileSystem
    | Path.Path
    | WorkspaceLocation
    | SettingsReader
    | LockfileReader
    | DesiredStateReader
  >,
  state: ReturnType<typeof WorkspaceStateTest>,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const work = workObservations(false);
    const services = yield* Layer.build(state);
    recording.reset();
    const value = yield* effect.pipe(Effect.provideContext(services), work.provide);
    const hashes = work.facts.filter((fact) => fact.kind === "axm.hash.package").length;
    return { value, recording, hashes };
  });

const recordingPlatform = Layer.mergeAll(WorkspaceFileWriteLocksLive, NativeEntryRemovalLive).pipe(
  Layer.provideMerge(layerRecordingFileSystem(NodeServices.layer)),
  Layer.provideMerge(NodeServices.layer),
);

/** The ref the package resolves to on its own, reading and decoding its manifest. */
const todaysRef = (subject: {
  readonly type: DesiredExtensionNode["type"];
  readonly name: string;
}) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    return yield* resolveWorkspaceExtensionRef({
      settingsName: subject.name,
      source: "workspace",
      expectedType: subject.type,
      layout: yield* Ref.get(location.layout),
      scope: location.scope,
    });
  });

describe("usable accepted canonical of an authored package", () => {
  for (const authored of authoredPackages)
    it.effect(`decodes the ${authored.type} manifest the observation read, once`, () =>
      Effect.gen(function* () {
        const { packages, state } = yield* authoredProject;
        const subject = packages.find((candidate) => candidate.type === authored.type);
        if (subject === undefined) return yield* Effect.die("fixture package missing");
        const args = { type: subject.type, name: subject.name, desired: subject.desired };

        const { value, recording, hashes } = yield* recordedRun(
          usableAcceptedCanonicalRef(args),
          state,
        );

        // The resolution decodes nothing again.
        expect(recording.contentReads(subject.manifestPath)).toBe(authored.manifestReads);
        // Both presence probes still run: the observation's and the resolution's.
        expect(recording.counts(subject.packageDir).access).toBe(2);
        expect(hashes).toBe(1);
        expect(Option.isSome(value)).toBe(true);
        expect(value).toEqual(Option.some(yield* Effect.provide(todaysRef(subject), state)));
      }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
    );

  for (const authored of authoredPackages)
    it.effect(`observes the ${authored.type} and resolves it from that observation's read`, () =>
      Effect.gen(function* () {
        const { packages, state } = yield* authoredProject;
        const subject = packages.find((candidate) => candidate.type === authored.type);
        if (subject === undefined) return yield* Effect.die("fixture package missing");

        const { value, recording, hashes } = yield* recordedRun(
          observeDesiredUsableCanonical(subject.desired),
          state,
        );

        // The observation's read and the package hash's walk; the resolution
        // decodes nothing again.
        expect(recording.contentReads(subject.manifestPath)).toBe(authored.manifestReads);
        expect(recording.counts(subject.packageDir).access).toBe(2);
        expect(hashes).toBe(1);
        expect(value.observed).toEqual(
          yield* Effect.provide(observeDesiredCanonical(subject.desired), state),
        );
        expect(Option.map(value.usable, (usable) => usable.ref)).toEqual(
          Option.some(yield* Effect.provide(todaysRef(subject), state)),
        );
      }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
    );

  for (const manifest of [
    {
      label: "names another owner",
      text: JSON.stringify({ owner: "@other", type: "rule", name: "policy", version: "1.0.0" }),
    },
    { label: "is not valid JSON", text: "{" },
  ])
    it.effect(`observes without resolving when the manifest ${manifest.label}`, () =>
      Effect.gen(function* () {
        const { packages, state } = yield* authoredProject;
        const subject = packages.find((candidate) => candidate.type === "rule");
        if (subject === undefined) return yield* Effect.die("fixture package missing");
        nodeFs.writeFileSync(subject.manifestPath, manifest.text);

        const { value, recording, hashes } = yield* recordedRun(
          observeDesiredUsableCanonical(subject.desired),
          state,
        );

        expect(value.usable).toEqual(Option.none());
        expect(recording.contentReads(subject.manifestPath)).toBe(1);
        expect(recording.counts(subject.packageDir).access).toBe(1);
        expect(hashes).toBe(0);
      }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
    );

  it.effect("keeps reading the manifest for an observation taken elsewhere", () =>
    Effect.gen(function* () {
      const { packages, state } = yield* authoredProject;
      const subject = packages.find((candidate) => candidate.type === "rule");
      if (subject === undefined) return yield* Effect.die("fixture package missing");
      const args = { type: subject.type, name: subject.name, desired: subject.desired };
      const observed = yield* Effect.provide(acceptedCanonicalObservation(args), state);
      if (Option.isNone(observed)) return yield* Effect.die("observation missing");

      const { value, recording, hashes } = yield* recordedRun(
        usableAcceptedCanonicalFrom(observed.value),
        state,
      );

      expect(Option.isSome(value)).toBe(true);
      // The resolution's own read and the package hash's walk.
      expect(recording.contentReads(subject.manifestPath)).toBe(2);
      expect(recording.counts(subject.packageDir).access).toBe(1);
      expect(hashes).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
  );

  const unusable = [
    {
      label: "names another owner",
      text: JSON.stringify({ owner: "@other", type: "rule", name: "policy", version: "1.0.0" }),
      status: "wrong-origin",
    },
    { label: "is not valid JSON", text: "{", status: "corrupt" },
    {
      label: "fails the rule grammar",
      text: JSON.stringify({ owner: "@acme", type: "rule", name: "policy" }),
      status: "corrupt",
    },
  ] as const;

  for (const manifest of unusable)
    it.effect(`resolves nothing when the manifest ${manifest.label}`, () =>
      Effect.gen(function* () {
        const { packages, state } = yield* authoredProject;
        const subject = packages.find((candidate) => candidate.type === "rule");
        if (subject === undefined) return yield* Effect.die("fixture package missing");
        nodeFs.writeFileSync(subject.manifestPath, manifest.text);
        const args = { type: subject.type, name: subject.name, desired: subject.desired };

        const observed = yield* Effect.provide(acceptedCanonicalObservation(args), state);
        expect(Option.map(observed, (canonical) => canonical.observation.status)).toEqual(
          Option.some(manifest.status),
        );

        const { value, recording, hashes } = yield* recordedRun(
          usableAcceptedCanonicalRef(args),
          state,
        );

        expect(value).toEqual(Option.none());
        expect(recording.contentReads(subject.manifestPath)).toBe(1);
        expect(hashes).toBe(0);
      }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
    );

  it.effect("touches no package for an undeclared name", () =>
    Effect.gen(function* () {
      const { root, state } = yield* authoredProject;

      const { value, recording, hashes } = yield* recordedRun(
        usableAcceptedCanonicalRef({ type: "rule", name: "absent" }),
        state,
      );

      expect(value).toEqual(Option.none());
      expect(
        recording
          .calls()
          .filter((call) =>
            call.path.startsWith(nodePath.join(root, toExtensionTypePlural("rule"))),
          ),
      ).toEqual([]);
      expect(hashes).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
  );
});

/** A project whose bundled `axm` Skill package sits at its canonical root, and its services. */
const bundledProject = Effect.gen(function* () {
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-accepted-bundled-"));
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
  );
  nodeFs.writeFileSync(nodePath.join(root, "axm.json"), '{ "owner": "@acme" }\n');
  const state = WorkspaceStateTest({ scope: "project", projectRoot: decodeAbsolutePathSync(root) });
  const packageDir = yield* Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    return bundledSkillCanonicalRoot(
      (yield* Path.Path).join,
      yield* Ref.get(location.layout),
      "axm",
    );
  }).pipe(Effect.provide(state));
  nodeFs.mkdirSync(nodePath.join(packageDir, "src"), { recursive: true });
  nodeFs.writeFileSync(nodePath.join(packageDir, "src", "SKILL.md"), "# AXM\n");
  const manifestPath = nodePath.join(packageDir, "skill.json");
  nodeFs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: "1.0.0" })}\n`,
  );
  const desired: DesiredExtensionNode = {
    type: "skill",
    name: "axm",
    identity: { authority: "bundled", fqn: "@agentxm/skills/axm" },
    source: "workspace",
    enabled: true,
    constraint: UNCONSTRAINED_DESIRED_NODE,
    origins: [{ type: "settings", source: "workspace", enabled: true }],
  };
  return { state, packageDir, manifestPath, desired };
});

describe("usable accepted canonical of a bundled skill", () => {
  /** The ref the bundled package resolves to on its own, reading and decoding its manifest. */
  const standaloneRef = (packageDir: string) =>
    Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      return yield* resolveWorkspaceExtensionRef({
        settingsName: "axm",
        source: "workspace",
        expectedType: "skill",
        layout: yield* Ref.get(location.layout),
        scope: location.scope,
        staticPackage: { owner: BUNDLED_SKILL_OWNER, name: extensionName("axm"), root: packageDir },
      });
    });

  it.effect("decodes the manifest the observation read, once", () =>
    Effect.gen(function* () {
      const { state, packageDir, manifestPath, desired } = yield* bundledProject;

      const { value, recording, hashes } = yield* recordedRun(
        usableAcceptedCanonicalRef({ type: "skill", name: "axm", desired }),
        state,
      );

      // The observation's read and the package hash's walk.
      expect(recording.contentReads(manifestPath)).toBe(2);
      // Both presence probes still run: the observation's and the resolution's.
      expect(recording.counts(packageDir).access).toBe(2);
      expect(hashes).toBe(1);
      expect(value).toEqual(Option.some(yield* Effect.provide(standaloneRef(packageDir), state)));
    }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
  );

  it.effect("keeps reading the manifest for an observation taken elsewhere", () =>
    Effect.gen(function* () {
      const { state, packageDir, manifestPath, desired } = yield* bundledProject;
      const observed = yield* Effect.provide(observeDesiredCanonical(desired), state);

      const { value, recording, hashes } = yield* recordedRun(
        usableAcceptedCanonicalFrom(observed),
        state,
      );

      // The resolution's own read and the package hash's walk.
      expect(recording.contentReads(manifestPath)).toBe(2);
      expect(recording.counts(packageDir).access).toBe(1);
      expect(hashes).toBe(1);
      expect(Option.map(value, (usable) => usable.ref)).toEqual(
        Option.some(yield* Effect.provide(standaloneRef(packageDir), state)),
      );
    }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
  );
});

describe("observing an accepted canonical root the caller keeps", () => {
  const endpoint = decodeRegistryEndpointSync("https://registry.agentxm.ai");

  /** A project accepting one Registry Rule at `version`, as its only accepted row. */
  const registryRuleProject = (version: string) =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-accepted-kept-"));
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
      );
      nodeFs.writeFileSync(nodePath.join(root, "axm.json"), "{}\n");
      const accepted = {
        source: { type: "registry", url: endpoint },
        identity: { owner: handle("@acme"), name: extensionName("policy") },
        resolved: {
          version: exactVersion(version),
          integrity:
            "sha512-W6hmaNcCrEx5sOAbpgd9XOw+u68VBl+mKXJFoIxt5kihKN1+FVD/jdm1bqL40gSWuROKd0lEc0d45/aL2aNWqg==",
          publisherBindingId: "hbnd_policy",
        },
        treeIntegrity: TEST_TREE_INTEGRITY,
      } satisfies RuleLockEntry;
      nodeFs.writeFileSync(
        nodePath.join(root, "axm.lock"),
        emitLockfileToml(
          storedLockfileFixture({ lockfileVersion: LOCKFILE_VERSION, rules: { policy: accepted } }),
        ),
      );
      const source = "@acme/rules/policy";
      const desired: DesiredExtensionNode = {
        type: "rule",
        name: "policy",
        identity: {
          authority: "registry",
          fqn: "@acme/rules/policy",
          registry: { sourceName: undefined, endpoint },
        },
        source,
        enabled: true,
        constraint: UNCONSTRAINED_DESIRED_NODE,
        origins: [{ type: "settings", source, enabled: true }],
      };
      const state = WorkspaceStateTest({
        scope: "project",
        projectRoot: decodeAbsolutePathSync(root),
      });
      return { state, args: { type: "rule", name: "policy", desired } as const };
    });

  /**
   * Observe the kept root, counting the derivations of the acquired canonical
   * root from the layout's acquired tree: one per judgement of the accepted row.
   */
  const observeKeptCounting = (
    args: { readonly type: "rule"; readonly name: string; readonly desired: DesiredExtensionNode },
    discarded: (canonicalPath: string) => boolean,
  ) =>
    Effect.gen(function* () {
      const base = yield* Path.Path;
      const layout = yield* Ref.get((yield* WorkspaceLocation).layout);
      let derivations = 0;
      const join = (...parts: Array<string>) => {
        if (parts[0] === layout.acquiredRoot) derivations += 1;
        return base.join(...parts);
      };
      const value = yield* acceptedCanonicalObservationOfKeptRoot(args, discarded).pipe(
        Effect.provideService(Path.Path, Path.Path.of({ ...base, join })),
      );
      return { value, derivations };
    });

  for (const scenario of [
    { label: "an observed root", version: "1.0.0", status: "missing" },
    {
      label: "a root whose accepted version is excluded",
      version: "1.0.0-beta.1",
      status: "constraint-mismatch",
    },
  ] as const)
    it.effect(`judges the accepted row once for ${scenario.label}`, () =>
      Effect.gen(function* () {
        const { state, args } = yield* registryRuleProject(scenario.version);

        const { value, derivations } = yield* Effect.provide(
          observeKeptCounting(args, () => false),
          state,
        );

        expect(derivations).toBe(1);
        const plain = yield* Effect.provide(acceptedCanonicalObservation(args), state);
        expect(Option.map(plain, (observed) => observed.observation.status)).toEqual(
          Option.some(scenario.status),
        );
        expect(value).toEqual(
          Option.flatMap(plain, (observed) =>
            Option.map(Option.fromUndefinedOr(observed.observation.path), (path) => ({
              path,
              observed,
            })),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
    );

  it.effect("judges once and observes nothing for a discarded root", () =>
    Effect.gen(function* () {
      const { state, args } = yield* registryRuleProject("1.0.0");

      const { value, derivations } = yield* Effect.provide(
        observeKeptCounting(args, () => true),
        state,
      );

      expect(value).toEqual(Option.none());
      expect(derivations).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(recordingPlatform)),
  );
});

/**
 * One project declaring a Registry MCP connection and a Registry Skill, each
 * with its accepted row, and one authored Pack, so every desired-graph
 * evaluation reads that Pack's manifest. The user settings are absent.
 */
const acceptedRowsProject = (options: { readonly sharedSkillRow?: boolean } = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const temp = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "axm-rows-" }));
    const root = path.join(temp, "project");
    const home = path.join(temp, "home");
    yield* fs.makeDirectory(path.join(root, "packs", "reviewers"), { recursive: true });
    yield* fs.makeDirectory(home, { recursive: true });
    const settings = path.join(root, "axm.json");
    const lock = path.join(root, "axm.lock");
    const packManifest = path.join(root, "packs", "reviewers", "pack.json");
    const userSettings = path.join(home, ".axm", "workspace", "axm.json");
    yield* fs.writeFileString(
      settings,
      `${JSON.stringify({
        owner: "@acme",
        agents: [],
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location: "https://registry.agentxm.ai/" }],
      })}\n`,
    );
    yield* fs.writeFileString(
      lock,
      emitLockfileToml(storedLockfileFixture({ lockfileVersion: LOCKFILE_VERSION, skills: {} })),
    );
    yield* fs.writeFileString(
      packManifest,
      `${JSON.stringify({ owner: "@acme", type: "pack", name: "reviewers", version: "1.0.0", dependencies: {} })}\n`,
    );
    const services = yield* Layer.build(
      WorkspaceLayerTest({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
    ).pipe(
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
      ),
    );
    const writer = Context.get(services, DesiredStateWriter);
    const mcpEntry = makeRegistryMcpServerLockEntry({ owner: handle("@acme"), name: "docs" });
    yield* writer.declare("mcp-server", {
      name: "docs",
      resolutionKey: McpSourceKey.fromLockEntry(mcpEntry),
      lockEntry: mcpEntry,
      versionRange: Option.none(),
    });
    const skillEntry = {
      source: { type: "registry", url: decodeRegistryEndpointSync("https://registry.agentxm.ai") },
      identity: { owner: handle("@acme"), name: extensionName("review") },
      resolved: {
        version: exactVersion("1.0.0"),
        integrity: `sha512-${"A".repeat(86)}==`,
        publisherBindingId: "hbnd_review",
      },
      treeIntegrity: TEST_TREE_INTEGRITY,
    } satisfies SkillLockEntry;
    yield* writer.declare("skill", {
      name: "review",
      lockEntry: skillEntry,
      versionRange: Option.none(),
    });
    // The second Skill row binds the same accepted package under another name.
    if (options.sharedSkillRow === true)
      yield* writer.declare("skill", {
        name: "review-copy",
        lockEntry: skillEntry,
        versionRange: Option.none(),
      });
    const declared: unknown = JSON.parse(yield* fs.readFileString(settings));
    yield* fs.writeFileString(
      settings,
      `${JSON.stringify({ ...Object(declared), packs: { reviewers: "workspace" } }, undefined, 2)}\n`,
    );
    return { root, settings, lock, packManifest, userSettings, services, mcpEntry, skillEntry };
  });

type AcceptedRowsProject = Effect.Success<ReturnType<typeof acceptedRowsProject>>;

/**
 * Run `effect` against the project's services outside any read phase,
 * counting desired-graph evaluations and the reads of each document they
 * consult, from a reset recorder.
 */
const countedRows = <A, E>(
  project: AcceptedRowsProject,
  effect: Effect.Effect<
    A,
    E,
    | FileSystem.FileSystem
    | Path.Path
    | WorkspaceLocation
    | SettingsReader
    | LockfileReader
    | DesiredStateReader
  >,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    recording.reset();
    const value = yield* effect.pipe(
      Effect.provideContext(project.services),
      Effect.withTracer(tracer),
    );
    return {
      value,
      counts: {
        evaluations: spans.filter((span) => span.name === "DesiredStateReader.evaluate").length,
        lockReads: recording.contentReads(project.lock),
        settingsReads: recording.contentReads(project.settings),
        userProbes: recording.counts(project.userSettings).access ?? 0,
        packReads: recording.contentReads(project.packManifest),
      },
    };
  });

/** The desired node the project's own graph holds for `type` and `name`. */
const desiredNode = (
  project: AcceptedRowsProject,
  type: DesiredExtensionNode["type"],
  name: string,
) =>
  Effect.gen(function* () {
    const graph = yield* (yield* DesiredStateReader).graph();
    const node = graph.nodes.find(
      (candidate) => candidate.type === type && candidate.name === name,
    );
    if (node === undefined) return yield* Effect.die(`${type} ${name} is not desired`);
    return node;
  }).pipe(Effect.provideContext(project.services));

const rowsPlatform = Layer.mergeAll(WorkspaceFileWriteLocksLive, NativeEntryRemovalLive).pipe(
  Layer.provideMerge(layerRecordingFileSystem(NodeServices.layer)),
  Layer.provideMerge(NodeServices.layer),
);

describe("accepted row lookups of one observation outside a read phase", () => {
  it.effect("evaluates the desired graph once to observe an MCP connection", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservation({ type: "mcp-server", name: "docs" }),
      );
      expect(Option.map(value, (observed) => observed.accepted)).toEqual(
        Option.some(project.mcpEntry),
      );
      expect(counts).toEqual({
        evaluations: 1,
        lockReads: 2,
        settingsReads: 1,
        userProbes: 1,
        packReads: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("reads an MCP connection's accepted row once to restore its ref", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const { value, counts } = yield* countedRows(
        project,
        acceptedLockedResolutionRef({ type: "mcp-server", name: "docs" }),
      );
      expect(Option.map(value, (ref) => ref.type)).toEqual(Option.some("mcp-server"));
      expect(counts).toEqual({
        evaluations: 1,
        lockReads: 2,
        settingsReads: 1,
        userProbes: 1,
        packReads: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("reads a Skill's accepted row once to restore its ref", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const { value, counts } = yield* countedRows(
        project,
        acceptedLockedResolutionRef({ type: "skill", name: "review" }),
      );
      expect(Option.map(value, (ref) => ref.type)).toEqual(Option.some("skill"));
      expect(counts).toEqual({
        evaluations: 0,
        lockReads: 1,
        settingsReads: 0,
        userProbes: 0,
        packReads: 0,
      });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("evaluates the graph once to restore a desired MCP connection's ref", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const { value, counts } = yield* countedRows(
        project,
        acceptedResolutionRef({ type: "mcp-server", name: "docs" }),
      );
      expect(Option.map(value, (ref) => ref.type)).toEqual(Option.some("mcp-server"));
      expect(counts).toEqual({
        evaluations: 1,
        lockReads: 2,
        settingsReads: 1,
        userProbes: 1,
        packReads: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("evaluates the graph once to derive an MCP connection's kept root", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservationOfKeptRoot({ type: "mcp-server", name: "docs" }, () => false),
      );
      expect(Option.map(value, ({ observed }) => observed.accepted)).toEqual(
        Option.some(project.mcpEntry),
      );
      expect(counts).toEqual({
        evaluations: 1,
        lockReads: 2,
        settingsReads: 1,
        userProbes: 1,
        packReads: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("evaluates the graph once to report an MCP connection's canonical root", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservationPath({ type: "mcp-server", name: "docs" }),
      );
      expect(Option.isSome(value)).toBe(true);
      expect(counts).toEqual({
        evaluations: 1,
        lockReads: 2,
        settingsReads: 1,
        userProbes: 1,
        packReads: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("reads the lockfile once for a supplied Skill's row and shared-package verdict", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const desired = yield* desiredNode(project, "skill", "review");
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservation({ type: "skill", name: "review", desired }),
      );
      expect(Option.map(value, (observed) => observed.sharedPackage)).toEqual(Option.some(false));
      expect(counts).toEqual({
        evaluations: 0,
        lockReads: 1,
        settingsReads: 0,
        userProbes: 0,
        packReads: 0,
      });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("keeps the graph's own lockfile read beside one row read for a Skill", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservation({ type: "skill", name: "review" }),
      );
      expect(Option.map(value, (observed) => observed.sharedPackage)).toEqual(Option.some(false));
      expect(counts).toEqual({
        evaluations: 1,
        lockReads: 2,
        settingsReads: 1,
        userProbes: 1,
        packReads: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("reads the lockfile once to keep a package another Skill row binds", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject({ sharedSkillRow: true });
      const desired = yield* desiredNode(project, "skill", "review");
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservation({ type: "skill", name: "review", desired }),
      );
      expect(Option.map(value, (observed) => observed.sharedPackage)).toEqual(Option.some(true));
      expect(counts).toMatchObject({ lockReads: 1 });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );
});

describe("accepted row lookups that keep their own reads", () => {
  it.effect("evaluates once inside an active read phase", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const { value, counts } = yield* countedRows(
        project,
        withWorkspaceReadView(acceptedCanonicalObservation({ type: "mcp-server", name: "docs" })),
      );
      expect(Option.map(value, (observed) => observed.accepted)).toEqual(
        Option.some(project.mcpEntry),
      );
      expect(counts).toMatchObject({ evaluations: 1, lockReads: 1, packReads: 1 });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("evaluates live for each lookup through a read phase that has ended", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const ended = yield* withWorkspaceReadView(
        Effect.context<LockfileReader | DesiredStateReader | SettingsReader>(),
      ).pipe(Effect.provideContext(project.services));
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservation({ type: "mcp-server", name: "docs" }).pipe(
          Effect.provideContext(ended),
        ),
      );
      expect(Option.map(value, (observed) => observed.accepted)).toEqual(
        Option.some(project.mcpEntry),
      );
      expect(counts).toMatchObject({ evaluations: 2, packReads: 2 });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("keys an MCP row by the lockfile reader's own graph beside another reader", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const base = Context.get(project.services, DesiredStateReader);
      // A reader whose graph binds the connection to another identity, as a
      // planning reader proposing a change would.
      const swapped = {
        ...base,
        graph: (options?: Parameters<typeof base.graph>[0]) =>
          Effect.map(base.graph(options), (graph) => ({
            ...graph,
            nodes: graph.nodes.map((node) =>
              node.type === "mcp-server" && node.identity.authority === "registry"
                ? { ...node, identity: { ...node.identity, fqn: "@other/mcp-servers/docs" } }
                : node,
            ),
          })),
      };
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservation({ type: "mcp-server", name: "docs" }).pipe(
          Effect.provideService(DesiredStateReader, swapped),
        ),
      );
      expect(Option.map(value, (observed) => observed.accepted)).toEqual(
        Option.some(project.mcpEntry),
      );
      expect(counts).toMatchObject({ evaluations: 2 });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("keys a proposed MCP connection's row by the current graph", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const current = yield* desiredNode(project, "mcp-server", "docs");
      const proposed: DesiredExtensionNode =
        current.identity.authority === "registry"
          ? { ...current, identity: { ...current.identity, fqn: "@other/mcp-servers/docs" } }
          : current;
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservation({ type: "mcp-server", name: "docs", desired: proposed }),
      );
      expect(Option.map(value, (observed) => observed.accepted)).toEqual(
        Option.some(project.mcpEntry),
      );
      expect(counts).toMatchObject({ evaluations: 1 });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );

  it.effect("reads no lockfile beyond the graph's for an inline MCP connection", () =>
    Effect.gen(function* () {
      const project = yield* acceptedRowsProject();
      const fs = yield* FileSystem.FileSystem;
      const declared: unknown = JSON.parse(yield* fs.readFileString(project.settings));
      const settings = Object(declared);
      yield* fs.writeFileString(
        project.settings,
        `${JSON.stringify({
          ...settings,
          mcpServers: {
            ...settings.mcpServers,
            local: { connection: { transport: "stdio", command: "node" } },
          },
        })}\n`,
      );
      const { value, counts } = yield* countedRows(
        project,
        acceptedCanonicalObservation({ type: "mcp-server", name: "local" }),
      );
      expect(Option.map(value, (observed) => observed.accepted)).toEqual(Option.some(undefined));
      // The connection has no accepted key and its observation reports no
      // root: only the graph's own evaluation reads the lockfile.
      expect(counts).toMatchObject({ evaluations: 1, lockReads: 1 });
    }).pipe(Effect.scoped, Effect.provide(rowsPlatform)),
  );
});
