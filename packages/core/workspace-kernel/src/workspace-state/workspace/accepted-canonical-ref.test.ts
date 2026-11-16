import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
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
  observeDesiredCanonical,
  observeDesiredUsableCanonical,
  prepareAcceptedCanonicalTransition,
  usableAcceptedCanonicalFrom,
  usableAcceptedCanonicalRef,
} from "./accepted-canonical-ref.js";
import { BUNDLED_SKILL_OWNER, bundledSkillCanonicalRoot } from "./extension-paths.js";
import { resolveWorkspaceExtensionRef } from "./configured-entry-resolution/workspace-ref.js";
import type { DesiredStateReader } from "./desired-state-reader.js";
import { WorkspaceLocation } from "./location.js";
import type { LockfileReader } from "./lockfile-reader.js";
import type { SettingsReader } from "./settings-reader.js";
import { UNCONSTRAINED_DESIRED_NODE, type DesiredExtensionNode } from "./desired-state-graph.js";
import { TEST_TREE_INTEGRITY } from "./test-stubs.js";
import { WorkspaceStateTest } from "../testing.js";

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
