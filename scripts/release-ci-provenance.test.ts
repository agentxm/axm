import { describe, expect, it } from "@effect/vitest";

import {
  parseCiArtifacts,
  parseGitHubRuns,
  validateCiRunDetails,
  validateExactCiRunDetails,
} from "./release-ci-provenance.js";

describe("release CI producer provenance", () => {
  const sha = "a".repeat(40);
  const listedRun = {
    databaseId: 42,
    event: "workflow_dispatch",
    headSha: sha,
    number: 7,
    status: "completed",
    conclusion: "success",
    url: "https://github.com/agentxm/axm/actions/runs/42",
    // `gh run list` exposes the configured run name here, not the immutable
    // workflow identity. The REST details' workflow path is authoritative.
    workflowName: "CI - main",
  };

  it("accepts an exact successful workflow_dispatch attempt", () => {
    const parsed = parseGitHubRuns(JSON.stringify([listedRun]));
    expect(parsed).toEqual([listedRun]);
    expect(
      validateCiRunDetails(
        {
          id: 42,
          event: "workflow_dispatch",
          head_sha: sha,
          path: ".github/workflows/ci.yml",
          run_attempt: 3,
          status: "completed",
          conclusion: "success",
        },
        listedRun,
      ).attempt,
    ).toBe(3);
  });

  it("binds an explicitly selected merged-revision run to push CI", () => {
    expect(
      validateExactCiRunDetails(
        {
          id: 42,
          event: "push",
          head_sha: sha,
          path: ".github/workflows/ci.yml",
          run_attempt: 2,
          run_number: 8,
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/agentxm/axm/actions/runs/42",
          name: "CI - main",
        },
        { databaseId: 42, headSha: sha, event: "push" },
      ),
    ).toMatchObject({ databaseId: 42, headSha: sha, event: "push", attempt: 2 });

    expect(() =>
      validateExactCiRunDetails(
        {
          id: 42,
          event: "workflow_dispatch",
          head_sha: sha,
          path: ".github/workflows/ci.yml",
          run_attempt: 2,
          run_number: 8,
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/agentxm/axm/actions/runs/42",
          name: "CI - main",
        },
        { databaseId: 42, headSha: sha, event: "push" },
      ),
    ).toThrow("provenance");
  });

  it("rejects an ineligible event or mismatched producer identity", () => {
    expect(() =>
      validateCiRunDetails(
        {
          id: 42,
          event: "pull_request",
          head_sha: sha,
          path: ".github/workflows/ci.yml",
          run_attempt: 1,
          status: "completed",
          conclusion: "success",
        },
        { ...listedRun, event: "pull_request" },
      ),
    ).toThrow("not an eligible release producer");
    expect(() =>
      validateCiRunDetails(
        {
          id: 42,
          event: "workflow_dispatch",
          head_sha: "b".repeat(40),
          path: ".github/workflows/ci.yml",
          run_attempt: 1,
          status: "completed",
          conclusion: "success",
        },
        listedRun,
      ),
    ).toThrow("provenance");
  });

  it("requires exact, live artifacts from the selected run", () => {
    const run = { ...listedRun, attempt: 2 };
    expect(
      parseCiArtifacts(
        [
          {
            artifacts: [
              {
                id: 9,
                name: `axm-npm-cohort-${sha}`,
                digest: `sha256:${"c".repeat(64)}`,
                expired: false,
                workflow_run: { id: 42, head_sha: sha },
              },
            ],
          },
        ],
        run,
      ),
    ).toEqual([{ id: 9, name: `axm-npm-cohort-${sha}`, digest: `sha256:${"c".repeat(64)}` }]);
  });
});
