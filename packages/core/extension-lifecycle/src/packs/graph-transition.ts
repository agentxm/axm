/**
 * The atomic pack graph transition.
 *
 * Installing or removing a pack changes the desired graph and every member's
 * canonical content together. Either the whole transition holds or none of it
 * does, so its children run inside one workspace transaction, a stale
 * candidate is caught before the first write, and the resulting graph is
 * checked against the predicate the planner declared.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import {
  WorkspaceMutations,
  desiredStateProblemsText,
  type DesiredExtensionNode,
} from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { installRefused } from "../install/vocabulary.js";

const normalizedIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

interface RequiredPack {
  readonly name: string;
  readonly identity: string;
  readonly enabled?: boolean;
}

interface RequiredMember {
  readonly type: Exclude<DesiredExtensionNode["type"], "pack">;
  readonly name: string;
  readonly packIdentity?: string;
  readonly direct?: boolean;
  readonly enabled?: boolean;
}

interface AbsentNode {
  readonly type: DesiredExtensionNode["type"];
  readonly name: string;
}

/** The desired-graph predicate a completed pack transition must satisfy. */
export const validatePackGraphPostcondition = (args: {
  readonly requiredPacks?: ReadonlyArray<RequiredPack>;
  readonly requiredMembers?: ReadonlyArray<RequiredMember>;
  readonly absent?: ReadonlyArray<AbsentNode>;
  readonly inactive?: ReadonlyArray<AbsentNode>;
}): Effect.Effect<void, ExtensionLifecycleFailed, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Desired state could not be read after the pack transition",
          cause,
        }),
      ),
    );
    const requiredPackIdentities = new Set(
      (args.requiredPacks ?? []).map((pack) => normalizedIdentity(pack.identity)),
    );
    const requiredMemberKeys = new Set(
      (args.requiredMembers ?? []).map((member) => `${member.type}:${member.name}`),
    );
    const relevantProblems = graph.problems.filter((problem) => {
      switch (problem.type) {
        case "pack-manifest-unavailable":
        case "pack-manifest-invalid":
        case "pack-identity-mismatch":
        case "pack-resolution-unavailable":
        case "pack-manifest-content-mismatch":
          return requiredPackIdentities.has(normalizedIdentity(problem.pack));
        case "projection-collision":
        case "constraint-conflict":
        case "workspace-owner-missing":
          return requiredMemberKeys.has(`${problem.extensionType}:${problem.name}`);
      }
    });
    if (relevantProblems.length > 0) {
      return yield* installRefused({
        category: "conflict",
        detail: `Pack transition left its desired member graph incomplete: ${desiredStateProblemsText(relevantProblems)}`,
      });
    }

    for (const expected of args.requiredPacks ?? []) {
      const node = graph.nodes.find(
        (candidate) => candidate.type === "pack" && candidate.name === expected.name,
      );
      if (
        node === undefined ||
        normalizedIdentity(node.identity) !== normalizedIdentity(expected.identity) ||
        (expected.enabled !== undefined && node.enabled !== expected.enabled)
      ) {
        const expectedPredicate = [
          `identity ${normalizedIdentity(expected.identity)}`,
          ...(expected.enabled === undefined
            ? []
            : [`activation ${expected.enabled ? "enabled" : "disabled"}`]),
        ].join(", ");
        const observedPredicate =
          node === undefined
            ? "absent"
            : `identity ${normalizedIdentity(node.identity)}, activation ${node.enabled ? "enabled" : "disabled"}`;
        return yield* installRefused({
          category: "internal",
          detail: `Pack graph closure ${expected.identity} failed its desired-state predicate: expected ${expectedPredicate}; observed ${observedPredicate}`,
        });
      }
    }

    for (const expected of args.requiredMembers ?? []) {
      const node = graph.nodes.find(
        (candidate) => candidate.type === expected.type && candidate.name === expected.name,
      );
      const packIdentity = expected.packIdentity;
      const hasPackOrigin =
        packIdentity === undefined ||
        node?.origins.some(
          (origin) =>
            origin.type === "pack" &&
            normalizedIdentity(origin.pack) === normalizedIdentity(packIdentity),
        ) === true;
      const hasDirectOrigin =
        expected.direct !== true ||
        node?.origins.some((origin) => origin.type === "settings") === true;
      if (
        node === undefined ||
        !hasPackOrigin ||
        !hasDirectOrigin ||
        (expected.enabled !== undefined && node.enabled !== expected.enabled)
      ) {
        const expectedPredicate = [
          ...(packIdentity === undefined
            ? []
            : [`Pack ownership ${normalizedIdentity(packIdentity)}`]),
          ...(expected.direct === true ? ["direct ownership"] : []),
          ...(expected.enabled === undefined
            ? []
            : [`activation ${expected.enabled ? "enabled" : "disabled"}`]),
        ].join(", ");
        const observedPredicate =
          node === undefined
            ? "absent"
            : `origins ${
                node.origins
                  .map((origin) =>
                    origin.type === "pack"
                      ? `Pack ${normalizedIdentity(origin.pack)}`
                      : "direct settings",
                  )
                  .join(", ") || "none"
              }, activation ${node.enabled ? "enabled" : "disabled"}`;
        return yield* installRefused({
          category: "internal",
          detail: `Pack graph closure ${packIdentity ?? "unknown"} failed the ${expected.type} "${expected.name}" desired-state predicate: expected ${expectedPredicate || "reachable"}; observed ${observedPredicate}`,
        });
      }
    }

    for (const expected of args.absent ?? []) {
      if (
        graph.nodes.some(
          (candidate) => candidate.type === expected.type && candidate.name === expected.name,
        )
      ) {
        return yield* installRefused({
          category: "internal",
          detail: `${expected.type} "${expected.name}" remained in the desired graph after the pack transition`,
        });
      }
    }

    for (const expected of args.inactive ?? []) {
      const node = graph.nodes.find(
        (candidate) => candidate.type === expected.type && candidate.name === expected.name,
      );
      if (node === undefined || node.enabled) {
        return yield* installRefused({
          category: "internal",
          detail: `${expected.type} "${expected.name}" did not remain reachable and inactive after the Pack transition`,
        });
      }
    }
  });
