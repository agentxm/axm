import {
  normalizePublishResult,
  type PublishResultItem,
} from "@agentxm/workspace-features/publishing";
import { describe, expect, it } from "@effect/vitest";
import { extensionName, handle } from "../../test-support/test-stubs.js";
import { publishResultFailure } from "./failure-diagnostic.js";

const item = (
  index: number,
  status: PublishResultItem["status"],
  kind?: string,
): PublishResultItem => ({
  id: `@acme/skills/private-label-${index}`,
  owner: handle("@acme"),
  type: "skill",
  name: extensionName(`private-label-${index}`),
  sourceType: "workspace",
  authored: true,
  action: status === "failed" ? "error" : "publish",
  phase: "upload_execution",
  reason: status === "failed" ? "upload_failed" : "selected",
  status,
  ...(kind === undefined
    ? {}
    : {
        cause: {
          code: "internal",
          class: "internal",
          message: "private local detail",
          retryable: false,
          diagnostic: { kind, operation: "publish.upload" },
        },
      }),
});

describe("publication failure diagnostics", () => {
  it("preserves five evidenced cardinalities and bounds distinct failure groups", () => {
    const result = normalizePublishResult({
      mode: "apply",
      results: [
        ...Array.from({ length: 10 }, (_, index) => item(index, "failed", `test.failure-${index}`)),
        item(10, "success"),
        item(11, "blocked"),
        item(12, "pending"),
        item(13, "unknown"),
      ],
    });
    const diagnostic = publishResultFailure(result, "issues");
    expect(diagnostic).toMatchObject({
      kind: "publish.multiple-failures",
      operation: "publish.execution",
      code: "internal",
      counts: { confirmed: 1, failed: 10, blocked: 1, unattempted: 1, unknown: 1 },
      relatedOmitted: 2,
    });
    expect(diagnostic.related).toHaveLength(8);
    expect(JSON.stringify(diagnostic)).not.toContain("private");
  });

  it("keeps homogeneous producer identity and occurrence counts", () => {
    const result = normalizePublishResult({
      mode: "apply",
      results: [
        item(0, "failed", "registry.response-decode"),
        item(1, "failed", "registry.response-decode"),
      ],
    });
    const diagnostic = publishResultFailure(result, "issues");
    expect(diagnostic.kind).toBe("registry.response-decode");
    expect(diagnostic.operation).toBe("publish.upload");
    expect(diagnostic.related).toEqual([
      { kind: "registry.response-decode", operation: "publish.upload", count: 2 },
    ]);
  });
});
