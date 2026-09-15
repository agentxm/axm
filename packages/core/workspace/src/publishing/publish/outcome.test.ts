/**
 * The settlement rule that keeps an apply which confirmed no publication from
 * reading as one.
 */

import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";

import { unconfirmedPublishOutcomes } from "./outcome.js";
import type { PublishResultItem } from "./result.js";

const handle = Schema.decodeUnknownSync(HandleSchema);
const extensionName = Schema.decodeUnknownSync(ExtensionNameSchema);

describe("unconfirmedPublishOutcomes", () => {
  const base: Pick<PublishResultItem, "id" | "owner" | "type" | "name" | "phase"> = {
    id: "@acme/skills/review",
    owner: handle("@acme"),
    type: "skill",
    name: extensionName("review"),
    phase: "upload_execution",
  };
  const unknown: PublishResultItem = {
    ...base,
    action: "publish",
    status: "unknown",
    reason: "settlement_unresolved",
  };
  const pending: PublishResultItem = {
    ...base,
    id: "@acme/skills/triage",
    name: extensionName("triage"),
    action: "publish",
    status: "pending",
    reason: "selected",
  };
  const published: PublishResultItem = {
    ...base,
    id: "@acme/skills/audit",
    name: extensionName("audit"),
    action: "publish",
    status: "success",
    reason: "selected",
  };

  it("reports every unsettled outcome when an executed apply confirmed nothing", () => {
    expect(unconfirmedPublishOutcomes([unknown, pending], true)).toEqual([unknown, pending]);
  });

  it("reports nothing once a publication settled", () => {
    expect(unconfirmedPublishOutcomes([published, unknown], true)).toEqual([]);
  });

  it("reports nothing when the apply never executed", () => {
    expect(unconfirmedPublishOutcomes([unknown, pending], false)).toEqual([]);
  });
});
