import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import {
  decodeExtensionNameSync,
  PackMemberConstraintMapSchema,
} from "@agentxm/extension-model/unstable/extensions/common";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { SettingsSchema } from "../desired/settings/index.js";
import { evaluateDesiredState } from "./desired-state-evaluation.js";
import { captureDesiredStateInputs } from "./desired-state-reader.js";
import { makeRegistryPackLockEntry } from "./test-stubs.js";
import { observePackManifest, type PackManifestsPort } from "./pack-manifests.js";

const OWNER = "@acme";

/** A port that counts every document read, so collection and evaluation can be told apart. */
const countingManifests = () => {
  const reads: Array<string> = [];
  const manifests: PackManifestsPort = {
    locate: ({ owner, name }) => {
      const relativePath = `agent_extensions/registry.agentxm.ai/${owner}/packs/${name}/pack.json`;
      return {
        path: `/workspace/${relativePath}`,
        relativePath,
        manifest: Effect.sync(() => {
          reads.push(name);
          return observePackManifest(
            JSON.stringify({
              owner: OWNER,
              type: "pack",
              name,
              version: "1.0.0",
              dependencies: { "@acme/skills/review": "^1.0.0" },
            }),
          );
        }),
      };
    },
  };
  return { manifests, reads };
};

const settings = (value: unknown) => Schema.decodeUnknownSync(SettingsSchema)(value);

describe("desired-state collection", () => {
  it.effect(
    "reads each configured Pack document once per collection and never during evaluation",
    () =>
      Effect.gen(function* () {
        const { manifests, reads } = countingManifests();
        const inputs = yield* captureDesiredStateInputs({
          manifests,
          baseDir: "/workspace",
          settings: settings({ owner: OWNER, packs: { alpha: "workspace", beta: "workspace" } }),
        });
        expect([...reads].sort()).toEqual(["alpha", "beta"]);
        expect(inputs.readSet.map(({ role }) => role)).toEqual(["pack-manifest", "pack-manifest"]);

        const first = evaluateDesiredState(inputs);
        const second = evaluateDesiredState(inputs);
        expect(reads).toHaveLength(2);
        expect(second).toEqual(first);
        // Both Packs route the member, and the lock check reused the same observation.
        expect(first.packMembership.map(({ routes }) => routes)).toEqual(["active", "active"]);
      }),
  );

  it.effect(
    "a proposal over a captured base reuses its observations and reads only new documents",
    () =>
      Effect.gen(function* () {
        const { manifests, reads } = countingManifests();
        const base = yield* captureDesiredStateInputs({
          manifests,
          baseDir: "/workspace",
          settings: settings({ owner: OWNER, packs: { alpha: "workspace" } }),
        });
        expect(reads).toEqual(["alpha"]);

        const same = yield* captureDesiredStateInputs({
          manifests,
          baseDir: "/workspace",
          settings: settings({
            owner: OWNER,
            packs: { alpha: { source: "workspace", enabled: false } },
          }),
          reuse: base,
        });
        expect(reads).toEqual(["alpha"]);
        expect(same.packDocuments).toEqual(base.packDocuments);
        expect(evaluateDesiredState(same).packMembership).toEqual([
          expect.objectContaining({ enabled: false, routes: "dormant" }),
        ]);

        const added = yield* captureDesiredStateInputs({
          manifests,
          baseDir: "/workspace",
          settings: settings({ owner: OWNER, packs: { alpha: "workspace", beta: "workspace" } }),
          reuse: base,
        });
        expect(reads).toEqual(["alpha", "beta"]);
        expect(added.packDocuments.map(({ settingsName }) => settingsName)).toEqual([
          "alpha",
          "beta",
        ]);
      }),
  );

  it.effect(
    "reads acquired Pack declarations from the lock without observing installed copies",
    () =>
      Effect.gen(function* () {
        const { manifests, reads } = countingManifests();
        const accepted = makeRegistryPackLockEntry({
          owner: decodeHandleSync(OWNER),
          name: "alpha",
          dependencies: Schema.decodeUnknownSync(PackMemberConstraintMapSchema)({
            "@acme/skills/review": "^1.0.0",
            "@acme/rules/guard": {
              source: { type: "registry", url: "https://other.example/" },
              versionRange: "^2.0.0",
            },
          }),
        });
        const inputs = yield* captureDesiredStateInputs({
          manifests,
          baseDir: "/workspace",
          settings: settings({ packs: { alpha: "@acme/packs/alpha" } }),
          registryEndpoints: { agentxm: new URL("https://registry.agentxm.ai") },
          acceptedResolutions: { lockfileVersion: 11, skills: {}, packs: { alpha: accepted } },
          readSet: [{ path: "/workspace/axm-lock.yaml", role: "accepted-resolutions" }],
        });
        const graph = evaluateDesiredState(inputs);
        expect(reads).toEqual([]);
        expect(inputs.readSet).toEqual([
          { path: "/workspace/axm-lock.yaml", role: "accepted-resolutions" },
        ]);
        expect(inputs.packDocuments[0]?.provenance).toEqual({
          kind: "accepted-lock",
          lockPath: "/workspace/axm-lock.yaml",
          settingsName: "alpha",
        });
        expect(graph.problems).toEqual([]);
        expect(graph.nodes.find((node) => node.type === "rule")?.origins).toEqual([
          expect.objectContaining({
            manifestPath: 'axm-lock.yaml#packs.alpha.dependencies["@acme/rules/guard"]',
            sourceAuthority: { authority: "registry", endpoint: new URL("https://other.example/") },
            constraint: "^2.0.0",
          }),
        ]);
      }),
  );

  it.effect("a proposed manifest is recorded with its provenance and not read", () =>
    Effect.gen(function* () {
      const { manifests, reads } = countingManifests();
      const inputs = yield* captureDesiredStateInputs({
        manifests,
        baseDir: "/workspace",
        settings: settings({ packs: { alpha: "@acme/packs/alpha" } }),
        prospectivePacks: [
          {
            owner: decodeHandleSync(OWNER),
            version: decodeVersionSync("2.0.0"),
            pack: { name: decodeExtensionNameSync("alpha"), dependencies: {} },
          },
        ],
      });
      expect(reads).toEqual([]);
      expect(inputs.packDocuments).toEqual([
        expect.objectContaining({
          settingsName: "alpha",
          provenance: expect.objectContaining({ kind: "proposed" }),
        }),
      ]);
      expect(inputs.readSet).toEqual([]);
    }),
  );
});
