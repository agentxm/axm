/**
 * The settlement rule that keeps an apply which confirmed no publication from
 * reading as one.
 */

import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import { StepFailure, type OperationJournalState } from "@agentxm/workspace-kernel/operations";

import {
  interruptedPublishResults,
  unconfirmedPublishOutcomes,
  UnresolvedCandidateOutput,
} from "./outcome.js";
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

describe("interruptedPublishResults", () => {
  for (const reason of ["settlement_unresolved", "authorization_expired"] as const) {
    it(`retains ${reason} evidence recorded before another upload is interrupted`, () => {
      const base: PublishResultItem = {
        id: "@acme/skills/review",
        owner: handle("@acme"),
        type: "skill",
        name: extensionName("review"),
        phase: "upload_execution",
        action: "publish",
        status: "pending",
        reason: "selected",
      };
      const pending: PublishResultItem = {
        ...base,
        id: "@acme/skills/triage",
        name: extensionName("triage"),
      };
      const journal: OperationJournalState = {
        name: "Publish extensions",
        description: Option.none(),
        mode: "apply",
        atomicity: { declared: "non-rollbackable", applied: "non-rollbackable" },
        plannedUnits: [],
        phase: "apply",
        startedUnitIds: [base.id, pending.id],
        resolved: [
          {
            key: base.id,
            label: "Publish review",
            result: {
              result: "error",
              message: "Readback did not confirm publication",
              error: new StepFailure({ category: "network", detail: "Readback unavailable" }),
              output: new UnresolvedCandidateOutput({
                targetKey: "@acme/skills/review@1.0.0",
                reason,
              }),
            },
          },
        ],
        restoresOnFailure: false,
      };

      const results = interruptedPublishResults(
        [base, pending],
        Option.some(journal),
        new Set([base.id, pending.id]),
      );

      expect(results[0]).toMatchObject({
        action: "publish",
        status: "unknown",
        settlement: "unresolved",
        reason,
      });
      expect(results[1]).toMatchObject({ status: "unknown", reason: "interrupted" });
    });
  }
});
