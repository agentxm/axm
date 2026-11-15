/**
 * The skills manager composes refs resolved from disk with refs restored from
 * accepted canonical state. An authored skill both passes reach is resolved
 * once per call; every other combination resolves exactly as each pass does.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
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
  WorkspaceLocation,
  resolveWorkspaceExtensionRef,
  type DesiredExtensionNode,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
  configuredRow,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { SkillManagerLive } from "./manager.js";

const OWNER = "@acme";

let baseDir: string;

beforeEach(() => {
  baseDir = nodeFs.realpathSync(
    nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-skills-materializable-")),
  );
});

afterEach(() => {
  nodeFs.rmSync(baseDir, { recursive: true, force: true });
});

/** An authored skill package under the project's authored root. */
const writeAuthoredSkill = (name: string, options: { readonly payload?: boolean } = {}) => {
  const root = nodePath.join(baseDir, "skills", name);
  nodeFs.mkdirSync(nodePath.join(root, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(root, "skill.json"),
    JSON.stringify({ owner: OWNER, type: "skill", name, version: "1.0.0" }),
  );
  if (options.payload !== false)
    nodeFs.writeFileSync(
      nodePath.join(root, "src", "SKILL.md"),
      `---\nname: ${name}\ndescription: ${name} skill\n---\n\nUse ${name}.\n`,
    );
  return root;
};

const authoredNode = (name: string, source = "workspace"): DesiredExtensionNode => ({
  type: "skill",
  name,
  identity: { authority: "workspace", fqn: `${OWNER}/skills/${name}` },
  source,
  enabled: true,
  origins: [{ type: "settings", source: "workspace", enabled: true }],
  constraint: UNCONSTRAINED_DESIRED_NODE,
});

const bundledNode = (name: string): DesiredExtensionNode => ({
  type: "skill",
  name,
  identity: { authority: "bundled", fqn: `@agentxm/skills/${name}` },
  source: "workspace",
  enabled: true,
  origins: [{ type: "settings", source: "workspace", enabled: true }],
  constraint: UNCONSTRAINED_DESIRED_NODE,
});

const decodeSettings = Schema.decodeUnknownSync(SettingsSchema);

/** The manager over explicit settings, rows, and desired nodes for `baseDir`. */
const managerLayer = (args: {
  readonly skills: Readonly<Record<string, unknown>>;
  readonly nodes: ReadonlyArray<DesiredExtensionNode>;
}) => {
  const axmDir = nodePath.join(baseDir, ".axm");
  const settings = decodeSettings({ owner: OWNER, agents: [], skills: args.skills });
  const rows = Object.keys(args.skills).map((name) =>
    configuredRow({ type: "skill", name, source: "workspace" }),
  );
  return SkillManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
    Layer.provideMerge(NativeWriteAuthorityLive),
    Layer.provideMerge(
      WorkspaceReadTest({
        baseDir,
        runtimeDir: axmDir,
        settings,
        graph: { packMembership: [], nodes: args.nodes, mcpSourceClosures: [], problems: [] },
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

/** One `listMaterializable` call and the package hashes it executed. */
const listOnce = Effect.gen(function* () {
  const manager = yield* SkillManager;
  const work = workObservations(false);
  const refs = yield* work.provide(manager.listMaterializable());
  return {
    refs,
    packageHashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
  };
});

/** The facts a returned ref carries, independent of object identity. */
const refFacts = (ref: SkillExtensionRef) => ({
  name: ref.skill.name,
  refType: ref.refType,
  ...(ref.refType === "workspace" ? { location: ref.location, sourceHash: ref.sourceHash } : {}),
});

describe("SkillManager.listMaterializable", () => {
  it.effect("resolves each authored skill once when both passes reach it", () => {
    const alpha = writeAuthoredSkill("alpha");
    const beta = writeAuthoredSkill("beta");
    return Effect.gen(function* () {
      const { refs, packageHashes } = yield* listOnce;
      // Measured before the accepted pass reused the disk pass's ref: 4, one
      // hash per pass for each of the two authored skills.
      expect(packageHashes).toBe(2);
      expect(refs.map(refFacts)).toEqual([
        { name: "alpha", refType: "workspace", location: alpha, sourceHash: expect.any(String) },
        { name: "beta", refType: "workspace", location: beta, sourceHash: expect.any(String) },
      ]);
    }).pipe(
      Effect.provide(
        managerLayer({
          skills: { alpha: "workspace", beta: "workspace" },
          nodes: [authoredNode("alpha"), authoredNode("beta")],
        }),
      ),
    );
  });

  it.effect("returns the refs a standalone resolution of each skill produces", () => {
    writeAuthoredSkill("alpha");
    writeAuthoredSkill("beta");
    return Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      const layout = yield* Ref.get(location.layout);
      const standalone = yield* Effect.forEach(["alpha", "beta"], (settingsName) =>
        resolveWorkspaceExtensionRef({
          settingsName,
          source: "workspace",
          expectedType: "skill",
          layout,
          scope: location.scope,
        }),
      );
      const { refs } = yield* listOnce;
      expect(refs).toEqual(standalone);
    }).pipe(
      Effect.provide(
        managerLayer({
          skills: { alpha: "workspace", beta: "workspace" },
          nodes: [authoredNode("alpha"), authoredNode("beta")],
        }),
      ),
    );
  });

  it.effect("resolves afresh on every call", () => {
    const alpha = writeAuthoredSkill("alpha");
    writeAuthoredSkill("beta");
    return Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      const layout = yield* Ref.get(location.layout);
      const first = yield* listOnce;
      nodeFs.writeFileSync(
        nodePath.join(alpha, "src", "SKILL.md"),
        "---\nname: alpha\ndescription: alpha skill, edited\n---\n\nUse alpha again.\n",
      );
      const second = yield* listOnce;
      const edited = yield* resolveWorkspaceExtensionRef({
        settingsName: "alpha",
        source: "workspace",
        expectedType: "skill",
        layout,
        scope: location.scope,
      });
      // Nothing the first call resolved is reused by the second.
      expect(second.packageHashes).toBe(2);
      const firstAlpha = first.refs.find((ref) => ref.skill.name === "alpha");
      const secondAlpha = second.refs.find((ref) => ref.skill.name === "alpha");
      expect(secondAlpha).toEqual(edited);
      expect(
        firstAlpha?.refType === "workspace" && secondAlpha?.refType === "workspace"
          ? firstAlpha.sourceHash === secondAlpha.sourceHash
          : undefined,
      ).toBe(false);
    }).pipe(
      Effect.provide(
        managerLayer({
          skills: { alpha: "workspace", beta: "workspace" },
          nodes: [authoredNode("alpha"), authoredNode("beta")],
        }),
      ),
    );
  });

  it.effect("reports a corrupt authored manifest from the disk pass", () => {
    const alpha = writeAuthoredSkill("alpha");
    writeAuthoredSkill("beta");
    nodeFs.writeFileSync(nodePath.join(alpha, "skill.json"), "{ not json");
    return Effect.gen(function* () {
      const manager = yield* SkillManager;
      const failure = yield* Effect.flip(manager.listMaterializable());
      expect(failure).toMatchObject({
        _tag: "WorkspaceSourceInvalid",
        source: "workspace",
        detail: `the manifest at ${nodePath.join(alpha, "skill.json")} is not valid JSON`,
      });
    }).pipe(
      Effect.provide(
        managerLayer({
          skills: { alpha: "workspace", beta: "workspace" },
          nodes: [authoredNode("alpha"), authoredNode("beta")],
        }),
      ),
    );
  });

  it.effect("keeps the disk ref when the accepted package is not usable", () => {
    writeAuthoredSkill("alpha");
    const beta = writeAuthoredSkill("beta", { payload: false });
    return Effect.gen(function* () {
      const { refs, packageHashes } = yield* listOnce;
      // The incomplete package is only resolved by the disk pass. Measured
      // before: 3, the usable package hashed once per pass.
      expect(packageHashes).toBe(2);
      expect(refs.map(refFacts)).toEqual([
        expect.objectContaining({ name: "alpha", refType: "workspace" }),
        { name: "beta", refType: "workspace", location: beta, sourceHash: expect.any(String) },
      ]);
    }).pipe(
      Effect.provide(
        managerLayer({
          skills: { alpha: "workspace", beta: "workspace" },
          nodes: [authoredNode("alpha"), authoredNode("beta")],
        }),
      ),
    );
  });

  it.effect("leaves bundled skills to their own materialization", () => {
    writeAuthoredSkill("alpha");
    return Effect.gen(function* () {
      const { refs, packageHashes } = yield* listOnce;
      // Measured before: 2, both for the authored package; the bundled entry
      // is resolved by neither pass.
      expect(packageHashes).toBe(1);
      expect(refs.map((ref) => ref.skill.name)).toEqual(["alpha"]);
    }).pipe(
      Effect.provide(
        managerLayer({
          skills: { alpha: "workspace", axm: { source: "workspace", origin: "bundled" } },
          nodes: [authoredNode("alpha"), bundledNode("axm")],
        }),
      ),
    );
  });

  it.effect("resolves a desired source other than the configured one as before", () => {
    writeAuthoredSkill("alpha");
    return Effect.gen(function* () {
      const manager = yield* SkillManager;
      const failure = yield* Effect.flip(manager.listMaterializable());
      expect(failure).toMatchObject({
        _tag: "WorkspaceSourceInvalid",
        source: "workspace:@acme/skills/alpha",
        detail: 'expected the compact selector "workspace"',
      });
    }).pipe(
      Effect.provide(
        managerLayer({
          skills: { alpha: "workspace" },
          nodes: [authoredNode("alpha", "workspace:@acme/skills/alpha")],
        }),
      ),
    );
  });
});
