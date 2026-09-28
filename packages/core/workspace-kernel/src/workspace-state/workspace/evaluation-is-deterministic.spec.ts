import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { SettingsSchema } from "../desired/settings/index.js";
import { evaluateDesiredState } from "./desired-state-evaluation.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import { desiredStateIdentity } from "./desired-state-queries.js";
import { captureDesiredStateInputs } from "./desired-state-reader.js";
import { observePackManifest, type PackManifestsPort } from "./pack-manifests.js";

export const specification = defineSpecification({
  requirement: "workspace/desired-state/evaluation-is-deterministic",
  title: "Equivalent declarations evaluate to one desired state",
  statement:
    "For equivalent settings, Registry bindings, accepted resolutions, and Pack documents, desired-state evaluation shall settle the same nodes, closures, problems, membership knowledge, and semantic identity regardless of the order declarations are enumerated in, and a difference confined to diagnostic wording shall not change that identity.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "memory",
  methods: ["example"],
  derivedFrom: [
    "cli/sync/no-op-convergence-validates-current-observation",
    "workspace/desired-state/effective-constraint-has-one-owner",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const OWNER = "@acme";

const manifests: PackManifestsPort = {
  locate: ({ owner, name }) => {
    const relativePath = `agent_extensions/registry/${owner}/packs/${name}/pack.json`;
    const dependencies =
      name === "alpha"
        ? { "@acme/skills/review": "^1.0.0", "@acme/rules/guard": "^1.0.0" }
        : name === "beta"
          ? { "@acme/skills/review": ">=1.0.0 <2.0.0", "@acme/hooks/preflight": "^1.0.0" }
          : { "@other/skills/review": "^1.0.0" };
    return {
      path: `/workspace/${relativePath}`,
      relativePath,
      manifest: Effect.succeed(
        observePackManifest(
          JSON.stringify({ owner: OWNER, type: "pack", name, version: "1.0.0", dependencies }),
        ),
      ),
    };
  },
};

const evaluate = (settings: unknown): Effect.Effect<DesiredStateGraph> =>
  captureDesiredStateInputs({
    manifests,
    baseDir: "/workspace",
    settings: Schema.decodeUnknownSync(SettingsSchema)(settings),
  }).pipe(Effect.map(evaluateDesiredState));

describe("Evaluation is deterministic", () => {
  it.effect("enumeration order of declarations does not change the desired state", () =>
    Effect.gen(function* () {
      const declared = yield* evaluate({
        owner: OWNER,
        skills: { review: "@acme/skills/review@1.1.0", triage: "@acme/skills/triage" },
        rules: { guard: { enabled: false } },
        packs: { alpha: "workspace", beta: "workspace" },
      });
      const reordered = yield* evaluate({
        owner: OWNER,
        packs: { beta: "workspace", alpha: "workspace" },
        rules: { guard: { enabled: false } },
        skills: { triage: "@acme/skills/triage", review: "@acme/skills/review@1.1.0" },
      });

      expect(reordered.nodes).toEqual(declared.nodes);
      expect(reordered.mcpSourceClosures).toEqual(declared.mcpSourceClosures);
      expect(reordered.problems).toEqual(declared.problems);
      expect(
        reordered.packMembership.map(({ pack, declared, routes }) => ({ pack, declared, routes })),
      ).toEqual(
        expect.arrayContaining(
          declared.packMembership.map(({ pack, declared, routes }) => ({ pack, declared, routes })),
        ),
      );
      expect(desiredStateIdentity(reordered)).toBe(desiredStateIdentity(declared));
    }),
  );

  it.effect(
    "an identity collision settles the same representative and contenders in either order",
    () =>
      Effect.gen(function* () {
        const first = yield* evaluate({
          owner: OWNER,
          packs: { alpha: "workspace", other: "workspace" },
        });
        const second = yield* evaluate({
          owner: OWNER,
          packs: { other: "workspace", alpha: "workspace" },
        });

        expect(first.problems).toEqual([
          expect.objectContaining({ type: "projection-collision", name: "review" }),
        ]);
        expect(second.nodes).toEqual(first.nodes);
        expect(second.problems).toEqual(first.problems);
        expect(desiredStateIdentity(second)).toBe(desiredStateIdentity(first));
      }),
  );

  it.effect("a difference confined to diagnostic wording is not a different desired state", () =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
        owner: OWNER,
        packs: { alpha: "workspace", beta: "workspace" },
      });
      const problem: DesiredStateGraph["problems"][number] = {
        type: "pack-identity-mismatch",
        pack: "@acme/packs/gamma",
        path: "/workspace/packs/gamma/pack.json",
        detail: "Expected @acme/packs/gamma, found @acme/packs/delta@1.0.0.",
      };
      const reworded: DesiredStateGraph = {
        ...graph,
        problems: [{ ...problem, detail: "The Pack at that path is not the one configured." }],
      };
      const stated: DesiredStateGraph = { ...graph, problems: [problem] };

      expect(desiredStateIdentity(reworded)).toBe(desiredStateIdentity(stated));
      expect(desiredStateIdentity(stated)).not.toBe(desiredStateIdentity(graph));
    }),
  );
});
