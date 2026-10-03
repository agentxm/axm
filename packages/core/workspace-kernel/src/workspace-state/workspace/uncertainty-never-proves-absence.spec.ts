import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { defineSpecification } from "@agentxm/specification-metadata";

import { SettingsSchema } from "../desired/settings/index.js";
import { desiredReachesAcceptedRow } from "./accepted-reachability.js";
import { evaluateDesiredState } from "./desired-state-evaluation.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import {
  contributorSetBlockers,
  contributorSetComplete,
  desiredReachability,
  desiredStateSettled,
  unresolvedPackRoutes,
} from "./desired-state-queries.js";
import { captureDesiredStateInputs } from "./desired-state-reader.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";
import {
  observePackManifest,
  type PackManifestObservation,
  type PackManifestsPort,
} from "./pack-manifests.js";
import { makeRegistryPackLockEntry } from "./test-stubs.js";

export const specification = defineSpecification({
  requirement: "workspace/desired-state/uncertainty-never-proves-absence",
  title: "Unknown Pack membership never proves an extension absent",
  statement:
    "When a configured Pack's document is absent, unreadable, malformed, or schema-invalid, or its accepted resolution cannot authorize its routes, the desired state shall record that Pack's membership or routes as unresolved with its distinct reason and shall answer every question about an extension's absence as unknown rather than not reached, while a valid empty manifest, a disabled Pack, an identity collision, and a constraint conflict shall each prove exactly what they declare.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "workspace-inventory/leftover-follows-desired-state-reachability",
    "workspace/desired-state/effective-constraint-has-one-owner",
    "cli/pack-member-configuration-does-not-create-acquisition-intent",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const OWNER = "@acme";
const owner = decodeHandleSync(OWNER);

/** Pack documents held in memory, located wherever a Pack of that name is materialized. */
const documents = (
  byName: Readonly<Record<string, PackManifestObservation>>,
): PackManifestsPort => ({
  locate: ({ owner: packOwner, name }) => {
    const relativePath = `agent_extensions/registry/${packOwner}/packs/${name}/pack.json`;
    return {
      path: `/workspace/${relativePath}`,
      relativePath,
      manifest: Effect.succeed(byName[name] ?? { status: "absent" }),
    };
  },
});

const manifestText = (name: string, dependencies: Readonly<Record<string, unknown>>) =>
  JSON.stringify({ owner: OWNER, type: "pack", name, version: "1.0.0", dependencies });

const decoded = (name: string, dependencies: Readonly<Record<string, unknown>> = {}) =>
  observePackManifest(manifestText(name, dependencies));

const settingsOf = (value: unknown) => Schema.decodeUnknownSync(SettingsSchema)(value);

const evaluate = (args: {
  readonly settings: unknown;
  readonly documents: Readonly<Record<string, PackManifestObservation>>;
  readonly lockfile?: Parameters<typeof captureDesiredStateInputs>[0]["acceptedResolutions"];
}): Effect.Effect<DesiredStateGraph> =>
  captureDesiredStateInputs({
    manifests: documents(args.documents),
    baseDir: "/workspace",
    settings: settingsOf(args.settings),
    ...(args.lockfile === undefined ? {} : { acceptedResolutions: args.lockfile }),
  }).pipe(Effect.map(evaluateDesiredState));

const stale = { type: "skill", name: "stale" } as const;

const observations = [
  {
    case: "absent document",
    observation: { status: "absent" } as const,
    problem: { type: "pack-manifest-unavailable", reason: "absent" },
    membership: { status: "unknown", reason: "absent" },
    decision: "unknown",
  },
  {
    case: "unreadable document",
    observation: { status: "unreadable", reason: "PermissionDenied" } as const,
    problem: { type: "pack-manifest-unavailable", reason: "unreadable", cause: "PermissionDenied" },
    membership: { status: "unknown", reason: "unreadable" },
    decision: "unknown",
  },
  {
    case: "malformed document",
    observation: observePackManifest("{ not json"),
    problem: { type: "pack-manifest-invalid", reason: "malformed" },
    membership: { status: "unknown", reason: "malformed" },
    decision: "unknown",
  },
  {
    case: "schema-invalid document",
    observation: observePackManifest(manifestText("toolkit", { "@acme/skills/review": 4242 })),
    problem: {
      type: "pack-manifest-invalid",
      reason: "schema-invalid",
      issues: [expect.objectContaining({ path: expect.stringContaining("dependencies") })],
    },
    membership: { status: "unknown", reason: "schema-invalid" },
    decision: "unknown",
  },
  {
    case: "valid empty manifest",
    observation: decoded("toolkit"),
    problem: undefined,
    membership: { status: "known", members: [] },
    decision: "not-reached",
  },
];

describe("Uncertainty never proves absence", () => {
  it.effect.each(observations)("keeps the reason for a $case and decides accordingly", (row) =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
        settings: { owner: OWNER, packs: { toolkit: "workspace" } },
        documents: { toolkit: row.observation },
      });

      expect(graph.problems).toEqual(
        row.problem === undefined
          ? []
          : [expect.objectContaining({ ...row.problem, pack: "@acme/packs/toolkit" })],
      );
      expect(graph.packMembership).toEqual([
        expect.objectContaining({
          pack: "@acme/packs/toolkit",
          enabled: true,
          declared: expect.objectContaining(row.membership),
          routes: row.decision === "unknown" ? "unknown" : "active",
        }),
      ]);
      // A problem never carries the value found in the document.
      expect(JSON.stringify(graph.problems)).not.toContain("4242");
      expect(desiredReachability(graph, stale)).toEqual(
        row.decision === "unknown"
          ? { decision: "unknown", blockers: unresolvedPackRoutes(graph) }
          : { decision: "not-reached" },
      );
    }),
  );

  it.effect(
    "an active external Pack whose accepted resolution cannot authorize its manifest keeps its membership known and its routes withheld",
    () =>
      Effect.gen(function* () {
        const manifest = decoded("toolkit", { "@acme/skills/review": "^1.0.0" });
        const settings = { packs: { toolkit: "@acme/packs/toolkit" } };

        const withoutResolution = yield* evaluate({ settings, documents: { toolkit: manifest } });

        expect(withoutResolution.problems).toEqual([
          expect.objectContaining({ type: "pack-resolution-unavailable" }),
        ]);
        expect(withoutResolution.packMembership).toEqual([
          expect.objectContaining({
            declared: { status: "known", members: [{ type: "skill", name: "review" }] },
            routes: "unauthorized",
          }),
        ]);
        // The member is not routed, and nothing is proved absent through it.
        expect(desiredReachability(withoutResolution, { type: "skill", name: "review" })).toEqual({
          decision: "unknown",
          blockers: withoutResolution.packMembership,
        });
        expect(desiredReachability(withoutResolution, stale).decision).toBe("unknown");

        if (manifest.status !== "decoded") throw new Error("Expected a decoded manifest");
        const authorized = yield* evaluate({
          settings,
          documents: { toolkit: manifest },
          lockfile: {
            lockfileVersion: 9,
            skills: {},
            packs: {
              toolkit: makeRegistryPackLockEntry({
                owner,
                name: "toolkit",
                sourceHash: computePackManifestContentIdentity(manifest.manifest),
              }),
            },
          },
        });

        expect(authorized.problems).toEqual([]);
        expect(authorized.packMembership).toEqual([expect.objectContaining({ routes: "active" })]);
        expect(desiredReachability(authorized, { type: "skill", name: "review" })).toEqual({
          decision: "reached",
          node: expect.objectContaining({ type: "skill", name: "review" }),
        });
        expect(desiredReachability(authorized, stale)).toEqual({ decision: "not-reached" });
      }),
  );

  it.effect(
    "a disabled Pack proves its membership without routing it, so a member preference stays bound and dormant",
    () =>
      Effect.gen(function* () {
        const toolkit = decoded("toolkit", { "@acme/rules/guard": "^1.0.0" });
        const preference = { rules: { guard: { enabled: true } } };

        const dormant = yield* evaluate({
          settings: {
            owner: OWNER,
            ...preference,
            packs: { toolkit: { source: "workspace", enabled: false } },
          },
          documents: { toolkit },
        });
        expect(dormant.problems).toEqual([]);
        expect(desiredStateSettled(dormant)).toBe(true);
        expect(dormant.nodes.some((node) => node.type === "rule")).toBe(false);
        expect(dormant.packMembership).toEqual([
          expect.objectContaining({ enabled: false, routes: "dormant" }),
        ]);
        expect(unresolvedPackRoutes(dormant)).toEqual([]);

        // With no Pack left to supply it, the preference is an orphan.
        const orphaned = yield* evaluate({
          settings: { owner: OWNER, ...preference },
          documents: {},
        });
        expect(orphaned.problems).toEqual([
          expect.objectContaining({ type: "member-configuration-unbound", name: "guard" }),
        ]);

        // With a Pack whose membership is unknown, orphanhood is unprovable.
        const unprovable = yield* evaluate({
          settings: {
            owner: OWNER,
            ...preference,
            packs: { toolkit: { source: "workspace", enabled: false } },
          },
          documents: { toolkit: { status: "absent" } },
        });
        expect(unprovable.problems).toEqual([]);
        expect(unprovable.packMembership).toEqual([
          expect.objectContaining({ declared: { status: "unknown", reason: "absent" } }),
        ]);
      }),
  );

  it.effect("an identity collision retains every contender for retention decisions", () =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
        settings: { owner: OWNER, packs: { one: "workspace", two: "workspace" } },
        documents: {
          one: decoded("one", { "@one/skills/review": "^1.0.0" }),
          two: decoded("two", { "@two/skills/review": "^1.0.0" }),
        },
      });

      expect(graph.problems).toEqual([
        expect.objectContaining({
          type: "projection-collision",
          extensionType: "skill",
          name: "review",
          identities: [
            expect.objectContaining({ fqn: "@one/skills/review" }),
            expect.objectContaining({ fqn: "@two/skills/review" }),
          ],
        }),
      ]);
      expect(graph.nodes.filter((node) => node.type === "skill")).toHaveLength(1);
      expect(desiredReachesAcceptedRow(graph, { type: "skill", key: "review" })).toBe(true);
      // The collision is about one name; every other type's contributor set is complete.
      expect(contributorSetComplete(contributorSetBlockers(graph, "skill"))).toBe(false);
      expect(contributorSetComplete(contributorSetBlockers(graph, "rule"))).toBe(true);
    }),
  );

  it.effect(
    "a constraint conflict proves the conflicting extension desired and blocks only its own type",
    () =>
      Effect.gen(function* () {
        const graph = yield* evaluate({
          settings: {
            owner: OWNER,
            skills: { review: "@acme/skills/review@2.0.0" },
            packs: { toolkit: "workspace" },
          },
          documents: { toolkit: decoded("toolkit", { "@acme/skills/review": "^1.0.0" }) },
        });

        expect(graph.problems).toEqual([
          expect.objectContaining({ type: "constraint-conflict", name: "review" }),
        ]);
        expect(desiredReachability(graph, { type: "skill", name: "review" }).decision).toBe(
          "reached",
        );
        expect(desiredReachability(graph, stale)).toEqual({ decision: "not-reached" });
        expect(desiredReachesAcceptedRow(graph, { type: "skill", key: "review" })).toBe(true);
        expect(contributorSetComplete(contributorSetBlockers(graph, "skill"))).toBe(false);
        expect(contributorSetComplete(contributorSetBlockers(graph, "rule"))).toBe(true);
      }),
  );
});
