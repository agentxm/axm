import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";

import { classifyPublishResults, type PublishResultItem } from "./result.js";

const handle = Schema.decodeUnknownSync(HandleSchema);
const extensionName = Schema.decodeUnknownSync(ExtensionNameSchema);

describe("classifyPublishResults", () => {
  it("derives every aggregate count from the item classifications", () => {
    const base: Pick<PublishResultItem, "id" | "owner" | "type" | "name" | "phase"> = {
      id: "@acme/skills/review",
      owner: handle("@acme"),
      type: "skill",
      name: extensionName("review"),
      phase: "upload_execution",
    };
    const results: ReadonlyArray<PublishResultItem> = [
      { ...base, action: "publish", status: "success", reason: "selected" },
      {
        ...base,
        name: extensionName("existing"),
        action: "skip",
        status: "success",
        reason: "version_already_published",
      },
      {
        ...base,
        name: extensionName("ignored"),
        action: "skip",
        status: "success",
        reason: "not_authored",
      },
      {
        ...base,
        name: extensionName("blocked"),
        action: "error",
        status: "blocked",
        reason: "blocked_by_preflight",
      },
      {
        ...base,
        name: extensionName("failed"),
        action: "error",
        status: "failed",
        reason: "upload_failed",
      },
      {
        ...base,
        name: extensionName("pending"),
        action: "publish",
        status: "pending",
        reason: "selected",
      },
      {
        ...base,
        name: extensionName("indeterminate"),
        action: "publish",
        status: "unknown",
        reason: "interrupted",
      },
    ];

    expect(classifyPublishResults(results)).toEqual({
      selected: 7,
      published: 1,
      alreadyPublished: 1,
      skipped: 1,
      blocked: 1,
      failed: 1,
      pending: 1,
      unknown: 1,
    });
  });
});
