import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineBoundEvidence, defineSpecification } from "@agentxm/specification-metadata";

import {
  type ReleaseCandidateHost,
  runReleaseCandidatePreparation,
} from "./release-prepare-candidate-orchestration.js";
import {
  type CandidateWorkspace,
  type ReleasePreparationHost,
  runReleasePreparation,
} from "./release-prepare-orchestration.js";
import { selectReleasedSkillTag } from "./release-preflight.js";
import {
  AXM_SKILL_HANDLE,
  PRODUCTION_REGISTRY_URL,
  productionRegistryPreviewArgs,
} from "./release-shared.js";

export const specification = defineSpecification({
  requirement: "system/process/release-preparation-validates-production-gates",
  title: "Release preparation validates production Registry gates without distribution",
  statement:
    "Release preparation shall preflight the production Registry from the latest reachable released CLI at or before the current version before allocating candidate state and shall validate the exact generated candidate against the production Registry in preview-only mode, never applying a publication.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "The orchestrations accept an injected host, so the ordering of the production Registry preflight against candidate allocation, and the preview-only shape of the exact-candidate validation, are observable in the repository without contacting the production Registry.",
  methods: ["example", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "A preview publication against the production Registry reports the same gate outcomes a real publication would enforce.",
    "Release tags are created only by the canonical GitHub Release workflow.",
  ],
  openQuestions: [],
});

/**
 * The release-preparation entry point's own host — the disposable detached
 * worktree, its frozen-lockfile install, and the uncacheable task interface —
 * is realization detail pinned by the repository tooling tests. Their results
 * are evidence bound to this identity; the specification remains the sole
 * requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: axm:test (scripts/release-prepare.test.ts)",
    verifies:
      "Drives the release-preparation entry point against a fake host and checks that it allocates a disposable detached worktree installed with a frozen lockfile, and cleans it up on every failure.",
  },
  {
    gate: "test: axm:test (scripts/repository-task-interface.test.ts)",
    verifies:
      "Checks that the release-preparation and candidate targets never replay a cached result, so neither the production preflight nor the exact preview can be skipped.",
  },
]);

interface Recorded {
  readonly events: ReadonlyArray<string>;
  readonly host: ReleasePreparationHost;
}

const workspace: CandidateWorkspace = {
  root: "/tmp/axm-release-preparation-spec",
  checkout: "/tmp/axm-release-preparation-spec/candidate",
};

/** A release-preparation host that records what it was asked to do, in order. */
const recordingHost = (options: { readonly registryPreflightFails?: boolean } = {}): Recorded => {
  const events: string[] = [];
  const host: ReleasePreparationHost = {
    preflightSource: () => {
      events.push("source-preflight");
      return "source-sha";
    },
    preflightRegistry: () => {
      events.push("registry-preflight");
      if (options.registryPreflightFails === true) {
        throw new Error("production Registry authentication failed");
      }
    },
    allocateCandidateWorkspace: () => {
      events.push("allocate");
      return workspace;
    },
    initializeCandidateWorkspace: (_workspace, sourceSha) => {
      events.push(`initialize:${sourceSha}`);
    },
    prepareCandidate: async () => {
      events.push("prepare");
      return { version: "1.2.3", tag: "cli-v1.2.3" };
    },
    commitCandidate: () => {
      events.push("commit");
      return "candidate-sha";
    },
    assertSourceUnchanged: () => events.push("assert-source"),
    pushCandidate: () => events.push("push"),
    createPullRequest: () => events.push("pull-request"),
    cleanupCandidateWorkspace: () => events.push("cleanup"),
  };
  return { events, host };
};

/** A candidate-phase host that records the order its phases ran in. */
const recordingCandidateHost = () => {
  const events: string[] = [];
  const host: ReleaseCandidateHost<"version-context"> = {
    version: async () => {
      events.push("version");
      return { version: "1.2.3", context: "version-context" as const };
    },
    changelog: async () => {
      events.push("changelog");
    },
    stampSkill: () => events.push("stamp"),
    generateSkill: () => events.push("generate"),
    previewRegistry: () => events.push("exact-preview"),
    validateCohort: () => events.push("validate"),
  };
  return { events, host };
};

describe("Release preparation Registry gates", () => {
  it.effect("preflights the production Registry before any candidate state exists", () =>
    Effect.promise(async () => {
      const { events, host } = recordingHost();
      await runReleasePreparation(true, host);
      expect(events.indexOf("registry-preflight")).toBeGreaterThan(-1);
      expect(events.indexOf("allocate")).toBeGreaterThan(events.indexOf("registry-preflight"));
    }),
  );

  it.effect("falls back to the prior release when the current candidate was not published", () =>
    Effect.sync(() => {
      expect(selectReleasedSkillTag("0.29.3", ["cli-v0.29.1", "cli-v0.29.2"])).toBe("cli-v0.29.2");
    }),
  );

  it.effect("stops on a failed production preflight without allocating candidate state", () =>
    Effect.promise(async () => {
      const { events, host } = recordingHost({ registryPreflightFails: true });
      await expect(runReleasePreparation(false, host)).rejects.toThrow(
        "production Registry authentication failed",
      );
      expect(events).toEqual(["source-preflight", "registry-preflight"]);
      expect(events).not.toContain("allocate");
      expect(events).not.toContain("commit");
      expect(events).not.toContain("push");
    }),
  );

  it.effect("previews the exact candidate only after it has been generated", () =>
    Effect.promise(async () => {
      const { events, host } = recordingCandidateHost();
      await runReleaseCandidatePreparation(host);
      // Versioning, the changelog, and the bundled skill all land before the
      // Registry is shown anything, so what it validates is the exact
      // candidate rather than an intermediate state.
      expect(events).toEqual([
        "version",
        "changelog",
        "stamp",
        "generate",
        "exact-preview",
        "validate",
      ]);
    }),
  );

  it.effect("the preview targets the production Registry and can never apply a publication", () =>
    Effect.sync(() => {
      const preview = productionRegistryPreviewArgs();
      expect(preview).toContain(AXM_SKILL_HANDLE);
      expect(preview).toContain("--registry-url");
      expect(preview[preview.indexOf("--registry-url") + 1]).toBe(PRODUCTION_REGISTRY_URL);
      expect(preview).toContain("--preview");
      expect(
        preview.slice(preview.indexOf("--on-existing"), preview.indexOf("--on-existing") + 2),
      ).toEqual(["--on-existing", "verify"]);
      // Nothing in the invocation can approve or force a publication.
      for (const applying of ["--yes", "-y", "--force", "--backfill"]) {
        expect(preview).not.toContain(applying);
      }
      // The released-workspace verification keeps the same preview contract.
      expect(productionRegistryPreviewArgs("/tmp/axm-released")).toContain("--preview");
    }),
  );
});
