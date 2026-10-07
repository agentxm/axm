import { AcquiredContent, sourceRefContentKey } from "@agentxm/workspace-kernel/acquisition";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import { RegistryClientFactory } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { RegistryPackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { NativeWriteAuthorityPermissive } from "@agentxm/workspace-kernel/agent-adapters/testing";
import { PackManager } from "@agentxm/workspace-kernel/materialization";
import { FootprintRecorderTest } from "@agentxm/workspace-kernel/planning/testing";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import {
  computePackPathsForLayout,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";
import { WorkspaceReadTest } from "@agentxm/workspace-kernel/workspace-state/testing";
import { PackDefinitionInvalid } from "./index.js";
import { PackManagerLive } from "./live.js";

export const specification = defineSpecification({
  requirement: "packs/acquired-manifest-matches-selected-declaration",
  title: "Acquired Pack content must match its selected dependency declaration",
  statement:
    "Before publishing acquired Pack content, AXM shall decode its staged manifest and require its owner, name, version, and dependencies to match the selected declaration, preserving existing canonical content when validation fails.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Temporary fetched and canonical directories establish that invalid acquired bytes never replace the existing canonical package and that valid bytes produce the complete accepted declaration.",
  methods: ["decision-table", "example"],
  derivedFrom: ["workspace/desired-state/uncertainty-never-proves-absence"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const manifest = Schema.decodeUnknownSync(PackManifestSchema)({
  owner: "@acme",
  type: "pack",
  name: "toolkit",
  version: "1.0.0",
  dependencies: { "@acme/skills/review": "^1.0.0" },
});
const ref: RegistryPackRef = {
  type: "pack",
  refType: "registry",
  owner: manifest.owner,
  name: manifest.name,
  source: {
    type: "registry",
    name: "test",
    location: new URL("https://registry.example/"),
    owner: Option.none(),
  },
  version: manifest.version,
  publisherBindingId: "binding",
  integrity: Option.some("sha512-test"),
  packages: [],
  pack: { name: manifest.name, dependencies: manifest.dependencies },
};

const mismatches = [
  { field: "owner", text: JSON.stringify({ ...manifest, owner: "@other" }) },
  { field: "name", text: JSON.stringify({ ...manifest, name: "other" }) },
  { field: "version", text: JSON.stringify({ ...manifest, version: "2.0.0" }) },
  {
    field: "dependencies",
    text: JSON.stringify({ ...manifest, dependencies: { "@acme/skills/review": "^2.0.0" } }),
  },
  { field: "malformed JSON", text: "{ invalid" },
  {
    field: "invalid schema",
    text: JSON.stringify({ ...manifest, dependencies: { "@acme/packs/nested": "*" } }),
  },
  { field: "missing document", text: undefined },
];

const withFetched = <A, E, R>(
  text: string | undefined,
  use: (canonical: string) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-pack-manifest-" });
    const source = path.join(root, "fetched");
    yield* fs.makeDirectory(source);
    if (text !== undefined) yield* fs.writeFileString(path.join(source, "pack.json"), text);
    const workspace = WorkspaceReadTest({ baseDir: root });
    const dependencies = Layer.mergeAll(
      workspace,
      Layer.succeed(AcquiredContent, {
        requestedKeys: new Set([sourceRefContentKey(ref)]),
        filesByKey: new Map([[sourceRefContentKey(ref), { directory: source }]]),
        failuresByKey: new Map(),
      }),
      Layer.mock(RegistryClientFactory, {}),
      Layer.mock(SourceHostProviders, {
        fetch: () => Effect.succeed({ directory: source }),
        cloneUrl: () => Option.none(),
        origin: () => "unused",
      }),
      NativeWriteAuthorityPermissive,
      FootprintRecorderTest,
    );
    return yield* Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      const layout = yield* Ref.get(location.layout);
      const canonical = computePackPathsForLayout(path.join, layout, ref, ref.name).canonicalPath;
      yield* fs.makeDirectory(canonical, { recursive: true });
      yield* fs.writeFileString(path.join(canonical, "retained.txt"), "accepted content");
      return yield* use(canonical);
    }).pipe(Effect.provide(PackManagerLive.pipe(Layer.provideMerge(dependencies))));
  });

describe("Acquired Pack manifest agreement", () => {
  it.effect.each(mismatches)("preserves canonical content after a $field mismatch", ({ text }) =>
    withFetched(text, (canonical) =>
      Effect.gen(function* () {
        const manager = yield* PackManager;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const failure = yield* manager.materializeInstall({ ref }).pipe(Effect.flip);
        expect(failure).toBeInstanceOf(PackDefinitionInvalid);
        expect(yield* fs.readFileString(path.join(canonical, "retained.txt"))).toBe(
          "accepted content",
        );
        expect(yield* fs.exists(path.join(canonical, "pack.json"))).toBe(false);
      }),
    ).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("accepts equivalent formatting and records the complete dependency declaration", () =>
    withFetched(JSON.stringify({ extra: "metadata", ...manifest }, null, 2), () =>
      Effect.gen(function* () {
        const manager = yield* PackManager;
        const materialization = yield* manager.materializeInstall({ ref });
        const accepted = yield* manager.acceptedResolution({
          ref,
          materialization: Option.some(materialization),
        });
        expect(Option.isSome(accepted)).toBe(true);
        if (Option.isSome(accepted))
          expect(accepted.value.entry.dependencies).toEqual(manifest.dependencies);
      }),
    ).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
