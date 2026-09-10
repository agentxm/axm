import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  type ReleaseCandidateHost,
  runReleaseCandidatePreparation,
} from "./release-prepare-candidate-orchestration.js";
import {
  type CandidateWorkspace,
  type ReleasePreparationHost,
  runReleasePreparation,
} from "./release-prepare-orchestration.js";
import {
  AXM_SKILL_HANDLE,
  PRODUCTION_REGISTRY_PREVIEW_ARGS,
  PRODUCTION_REGISTRY_URL,
  productionRegistryPreviewArgs,
} from "./release-shared.js";

type FailurePoint =
  "registry" | "initialize" | "prepare" | "commit" | "source" | "push" | "pull-request" | "cleanup";

type CandidateFailurePoint =
  "version" | "changelog" | "stamp" | "generate" | "exact-preview" | "validate";

const makeHost = (failurePoint?: FailurePoint) => {
  const events: string[] = [];
  const workspace: CandidateWorkspace = {
    root: "/tmp/axm-release-prepare-test",
    checkout: "/tmp/axm-release-prepare-test/candidate",
  };
  const failAt = (point: FailurePoint) => {
    if (failurePoint === point) throw new Error(`${point} failed`);
  };

  const host: ReleasePreparationHost = {
    preflightSource: () => {
      events.push("source-preflight");
      return "source-sha";
    },
    preflightRegistry: () => {
      events.push("registry-preflight");
      failAt("registry");
    },
    allocateCandidateWorkspace: () => {
      events.push("allocate");
      return workspace;
    },
    initializeCandidateWorkspace: (_workspace, sourceSha) => {
      events.push(`initialize:${sourceSha}`);
      failAt("initialize");
    },
    prepareCandidate: async () => {
      events.push("prepare");
      failAt("prepare");
      return { version: "1.2.3", tag: "cli-v1.2.3" };
    },
    commitCandidate: (_workspace, tag) => {
      events.push(`commit:${tag}`);
      failAt("commit");
      return "candidate-sha";
    },
    assertSourceUnchanged: (sourceSha) => {
      events.push(`assert-source:${sourceSha}`);
      failAt("source");
    },
    pushCandidate: (_workspace, branch) => {
      events.push(`push:${branch}`);
      failAt("push");
    },
    createPullRequest: (branch, tag) => {
      events.push(`pull-request:${branch}:${tag}`);
      failAt("pull-request");
    },
    cleanupCandidateWorkspace: () => {
      events.push("cleanup");
      failAt("cleanup");
    },
  };

  return { events, host };
};

describe("release preparation orchestration", () => {
  it("previews against the production Registry", () => {
    expect(PRODUCTION_REGISTRY_URL).toBe("https://registry.agentxm.ai");
  });

  it("uses the authenticated production preview contract", () => {
    expect(PRODUCTION_REGISTRY_PREVIEW_ARGS).toEqual([
      "axm:local",
      "skills",
      "publish",
      AXM_SKILL_HANDLE,
      "--registry-url",
      PRODUCTION_REGISTRY_URL,
      "--on-existing",
      "verify",
      "--preview",
      "--json",
      "--non-interactive",
    ]);
  });

  it("can verify the published archive from its released workspace", () => {
    expect(productionRegistryPreviewArgs("/tmp/axm-released")).toEqual([
      "axm:local",
      "-C",
      "/tmp/axm-released",
      "skills",
      "publish",
      AXM_SKILL_HANDLE,
      "--registry-url",
      PRODUCTION_REGISTRY_URL,
      "--on-existing",
      "verify",
      "--preview",
      "--json",
      "--non-interactive",
    ]);
  });

  it("fully prepares a dry-run candidate after Registry preflight and then cleans it", async () => {
    const { events, host } = makeHost();

    await expect(runReleasePreparation(true, host)).resolves.toEqual({
      version: "1.2.3",
      tag: "cli-v1.2.3",
      mode: "dry-run",
    });
    expect(events).toEqual([
      "source-preflight",
      "registry-preflight",
      "allocate",
      "initialize:source-sha",
      "prepare",
      "cleanup",
    ]);
  });

  it("commits and delivers a real candidate only after preparation", async () => {
    const { events, host } = makeHost();

    await expect(runReleasePreparation(false, host)).resolves.toEqual({
      version: "1.2.3",
      tag: "cli-v1.2.3",
      mode: "prepared",
      branch: "release/cli-v1.2.3",
      commit: "candidate-sha",
    });
    expect(events).toEqual([
      "source-preflight",
      "registry-preflight",
      "allocate",
      "initialize:source-sha",
      "prepare",
      "commit:cli-v1.2.3",
      "assert-source:source-sha",
      "push:release/cli-v1.2.3",
      "pull-request:release/cli-v1.2.3:cli-v1.2.3",
      "cleanup",
    ]);
  });

  it("fails Registry preflight before allocating a candidate checkout", async () => {
    const { events, host } = makeHost("registry");

    await expect(runReleasePreparation(false, host)).rejects.toThrow("registry failed");
    expect(events).toEqual(["source-preflight", "registry-preflight"]);
  });

  const cleanupFailurePoints: readonly FailurePoint[] = [
    "initialize",
    "prepare",
    "commit",
    "source",
    "push",
    "pull-request",
  ];

  it.each(cleanupFailurePoints)(
    "cleans the isolated checkout when %s fails",
    async (failurePoint) => {
      const { events, host } = makeHost(failurePoint);

      await expect(runReleasePreparation(false, host)).rejects.toThrow(`${failurePoint} failed`);
      expect(events.at(-1)).toBe("cleanup");
    },
  );

  it("preserves the primary failure when cleanup also fails", async () => {
    const { events, host } = makeHost("prepare");
    const hostWithCleanupFailure: ReleasePreparationHost = {
      ...host,
      cleanupCandidateWorkspace: () => {
        events.push("cleanup");
        throw new Error("cleanup failed");
      },
    };

    await expect(runReleasePreparation(false, hostWithCleanupFailure)).rejects.toThrow(
      "prepare failed\nAdditionally, release candidate cleanup failed: cleanup failed",
    );
  });
});

describe("release candidate phase orchestration", () => {
  const candidateFailurePoints: readonly CandidateFailurePoint[] = [
    "version",
    "changelog",
    "stamp",
    "generate",
    "exact-preview",
    "validate",
  ];

  const makeCandidateHost = (failurePoint?: CandidateFailurePoint) => {
    const events: string[] = [];
    const failAt = (point: CandidateFailurePoint) => {
      if (failurePoint === point) throw new Error(`${point} failed`);
    };
    const host: ReleaseCandidateHost<"version-context"> = {
      version: async () => {
        events.push("version");
        failAt("version");
        return { version: "1.2.3", context: "version-context" };
      },
      changelog: async () => {
        events.push("changelog");
        failAt("changelog");
      },
      stampSkill: () => {
        events.push("stamp");
        failAt("stamp");
      },
      generateSkill: () => {
        events.push("generate");
        failAt("generate");
      },
      previewRegistry: () => {
        events.push("exact-preview");
        failAt("exact-preview");
      },
      validateCohort: () => {
        events.push("validate");
        failAt("validate");
      },
    };
    return { events, host };
  };

  it("generates the exact candidate before Registry preview", async () => {
    const { events, host } = makeCandidateHost();

    await expect(runReleaseCandidatePreparation(host)).resolves.toBe("1.2.3");
    expect(events).toEqual([
      "version",
      "changelog",
      "stamp",
      "generate",
      "exact-preview",
      "validate",
    ]);
  });

  it.each(candidateFailurePoints)("stops when candidate phase %s fails", async (failurePoint) => {
    const { events, host } = makeCandidateHost(failurePoint);

    await expect(runReleaseCandidatePreparation(host)).rejects.toThrow(`${failurePoint} failed`);
    expect(events.at(-1)).toBe(failurePoint);
  });
});

describe("release preparation host", () => {
  const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
  const readScript = (name: string): string => readFileSync(join(scriptsRoot, name), "utf8");

  it("allocates candidate state in a temporary detached worktree with a frozen lockfile", () => {
    const entrypoint = readScript("release-prepare.ts");
    expect(entrypoint).toContain('mkdtempSync(join(tmpdir(), "axm-release-prepare-"))');
    expect(entrypoint).toContain('["worktree", "add", "--detach"');
    expect(entrypoint).toContain('["install", "--frozen-lockfile"]');
    expect(entrypoint).not.toContain('["switch", "--create"');
  });

  it("applies real candidate mutations inside the isolated checkout in both modes", () => {
    const candidate = readScript("release-prepare-candidate.ts");
    expect(candidate).toContain("dryRun: false");
  });
});
