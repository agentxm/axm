import { describe, expect, it } from "@effect/vitest";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";

import type { PublishResultItem } from "./publish/result.js";
import { publishRecoverySelection } from "./recovery.js";

const handle = (value: string): Handle => decodeHandleSync(value);
const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

describe("publish recovery selection", () => {
  it("selects only failed items and dependents blocked by them", () => {
    const base = {
      owner: handle("@acme"),
      type: "skill" as const,
      sourceType: "workspace" as const,
      authored: true,
      phase: "upload_execution" as const,
    };
    const items: ReadonlyArray<PublishResultItem> = [
      {
        ...base,
        id: "@acme/skills/published",
        name: extensionName("published"),
        action: "publish",
        reason: "selected",
        status: "success",
      },
      {
        ...base,
        id: "@acme/skills/review",
        name: extensionName("review"),
        action: "error",
        reason: "upload_failed",
        status: "failed",
      },
      {
        ...base,
        id: "@acme/packs/toolkit",
        type: "pack",
        name: extensionName("toolkit"),
        action: "error",
        phase: "dependency_execution",
        reason: "blocked_by_dependency",
        status: "blocked",
        blockedBy: ["@acme/skills/review"],
      },
    ];
    const selection = publishRecoverySelection(items);

    expect(selection).toEqual({
      remainingItems: ["@acme/skills/review", "@acme/packs/toolkit"],
      blockedDependents: ["@acme/packs/toolkit"],
    });
  });
});
