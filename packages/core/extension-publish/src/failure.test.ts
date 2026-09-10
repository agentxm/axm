/**
 * The publish failure vocabulary: how a run's failures aggregate into one,
 * and what the publish document is allowed to say about a cause.
 */

import { describe, expect, it } from "vitest";

import { RegistryProblem, RegistryRequestFailed } from "@agentxm/registry-client";
import type { RegistryErrorCategory } from "@agentxm/registry-client";

import { PublishFailed } from "./errors.js";
import { aggregatePublishFailure, publishCause } from "./failure.js";

const retryableMetadata = {
  request: { service: "registry" as const, url: "https://registry.example.test/v1/extensions" },
  requestPolicy: {
    retryable: true,
    attemptCount: 1,
    maxAttempts: 1,
    exhausted: true,
    stoppedBy: "replay-unsafe" as const,
    replaySafety: "mutation" as const,
  },
};

const transportFailure = (category: RegistryErrorCategory, detail: string) =>
  new RegistryRequestFailed({ category, detail });

describe("aggregatePublishFailure", () => {
  it("preserves auth classification when every publish fails auth", () => {
    const failure = aggregatePublishFailure(2, [
      transportFailure("auth", "Invalid or expired token."),
      transportFailure("auth", "Invalid or expired token."),
    ]);

    expect(failure.category).toBe("auth");
    expect(failure.detail).toContain("Invalid or expired token.");
  });

  it("uses internal classification for mixed publish failures", () => {
    const failure = aggregatePublishFailure(2, [
      transportFailure("auth", "Invalid or expired token."),
      transportFailure("network", "Registry unavailable."),
    ]);

    expect(failure.category).toBe("internal");
  });

  it("preserves an external classification for mixed retryable Registry failures", () => {
    const failure = aggregatePublishFailure(2, [
      new RegistryRequestFailed({
        category: "network",
        detail: "Registry unreachable.",
        metadata: retryableMetadata,
      }),
      new RegistryRequestFailed({
        category: "unavailable",
        detail: "Registry unavailable.",
        metadata: retryableMetadata,
      }),
    ]);

    expect(failure.category).toBe("network");
  });
});

describe("publishCause", () => {
  it.each([
    ["timeout", "deadline"],
    ["network", "replay-unsafe"],
    ["rate_limit", "replay-unsafe"],
    ["unavailable", "replay-unsafe"],
  ] as const)("projects exhausted %s failures as retryable publish causes", (code, stoppedBy) => {
    const cause = publishCause(
      new RegistryProblem({
        category: code,
        detail: "Transient Registry failure",
        metadata: {
          response: {
            status: code === "rate_limit" ? 429 : 503,
            requestId: "req_public",
            problemCode: "service_unavailable",
            body: { detail: "private upstream detail", secret: "must-not-leak" },
          },
          requestPolicy: {
            retryable: true,
            attemptCount: 1,
            maxAttempts: 1,
            exhausted: true,
            stoppedBy,
            replaySafety: "mutation",
          },
        },
        cause: new Error("upstream"),
      }),
    );

    expect(cause).toMatchObject({
      code,
      class: "external",
      retryable: true,
      attemptCount: 1,
      maxAttempts: 1,
      attemptsExhausted: true,
      retryStoppedBy: stoppedBy,
      requestId: "req_public",
      responseStatus: code === "rate_limit" ? 429 : 503,
      problemCode: "service_unavailable",
    });
    expect(cause).not.toHaveProperty("body");
  });

  it.each(["auth", "validation", "conflict", "internal"] as const)(
    "projects deterministic %s failures as terminal publish causes",
    (code) => {
      expect(publishCause(transportFailure(code, `${code} failure`))).toMatchObject({
        code,
        retryable: false,
      });
    },
  );

  it("redacts a credential the Registry quoted back in its detail", () => {
    expect(
      publishCause(
        new PublishFailed({
          category: "auth",
          detail: "rejected Authorization: Bearer axm_ses_live_abcdef123456",
        }),
      ).message,
    ).toBe("rejected Authorization: [REDACTED] [REDACTED]");
  });
});
