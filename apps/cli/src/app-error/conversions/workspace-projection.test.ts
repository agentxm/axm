/**
 * Byte-for-byte conversion table for the workspace-projection typed failure family.
 * Each row travels the real `toAppError` path and pins the envelope its
 * construction site rendered before decoupling; a wording change in the
 * producing module fails here rather than silently reaching the terminal.
 */

import { describe, expect, it } from "vitest";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { AppError, type AppErrorCode } from "../app-error.js";
import { isKnownFailure, toAppError, type KnownFailure } from "../conversions.js";
import {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "@agentxm/workspace-projection";

const ioCause = new Error("EACCES");

interface ConversionCase {
  readonly name: string;
  readonly failure: KnownFailure;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly title?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  /** Expected `cause`; "self" pins the typed failure itself as the cause. */
  readonly cause?: unknown | "self";
}

const cases: ReadonlyArray<ConversionCase> = [
  {
    name: "DesiredStateIncomplete",
    failure: new DesiredStateIncomplete({ problems: "pack demo is missing" }),
    code: "conflict",
    detail:
      "Desired state cannot be enumerated completely; fix pack and declaration problems first: pack demo is missing",
  },
  {
    name: "AuthoredContributorUnsupported",
    failure: new AuthoredContributorUnsupported({ type: "rule" }),
    code: "validation",
    detail: "User workspaces do not support workspace-authored rule packages",
  },
  {
    name: "ContributorIdentityInvalid",
    failure: new ContributorIdentityInvalid({ type: "rule", identity: "workspace:bad" }),
    code: "validation",
    detail: "Invalid workspace rule identity: workspace:bad",
  },
  {
    name: "ContributorUnresolved",
    failure: new ContributorUnresolved({ type: "rule", name: "demo" }),
    code: "conflict",
    detail: "Active rule has no accepted resolution: demo",
  },
  {
    name: "ContributorTreeMismatch",
    failure: new ContributorTreeMismatch({ packageRoot: "/w/rules/demo" }),
    code: "conflict",
    detail: "Materialized package tree does not match the accepted lock entry: /w/rules/demo",
    suggestions: [
      {
        description:
          "Restore the accepted package with install or update, or fork it into the authored workspace tree before editing.",
      },
    ],
  },
  {
    name: "ProjectionTargetUnsupported",
    failure: new ProjectionTargetUnsupported({
      detail: "Managed-region target does not support comments: notes.txt",
    }),
    code: "validation",
    detail: "Managed-region target does not support comments: notes.txt",
  },
  {
    name: "ManagedRegionViolation with message",
    failure: new ManagedRegionViolation({
      displayPath: "AGENTS.md",
      reason: "AXM managed region rules has duplicate, nested, or unpaired markers",
    }),
    code: "conflict",
    detail: "AXM managed region rules has duplicate, nested, or unpaired markers: AGENTS.md",
  },
  {
    name: "ManagedRegionViolation without message",
    failure: new ManagedRegionViolation({ displayPath: "AGENTS.md" }),
    code: "conflict",
    detail: "Cannot reconcile managed region: AGENTS.md",
  },
  {
    name: "ProjectionIoFailed inspect",
    failure: new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "inspect", cause: ioCause }),
    code: "internal",
    detail: "Failed to inspect managed-region target: /w/AGENTS.md",
    cause: ioCause,
  },
  {
    name: "ProjectionIoFailed read",
    failure: new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "read", cause: ioCause }),
    code: "internal",
    detail: "Failed to read managed-region target: /w/AGENTS.md",
    cause: ioCause,
  },
  {
    name: "ProjectionIoFailed reconcile",
    failure: new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "reconcile", cause: ioCause }),
    code: "internal",
    detail: "Failed to reconcile managed-region target: /w/AGENTS.md",
    cause: ioCause,
  },
];

describe("workspace-projection conversions", () => {
  it.each(cases.map((entry) => [entry.name, entry] as const))(
    "converts %s byte-identically",
    (_name, entry) => {
      const converted = toAppError(entry.failure);
      expect(converted).toBeInstanceOf(AppError);
      expect(converted.code).toBe(entry.code);
      expect(converted.detail).toBe(entry.detail);
      if (entry.title !== undefined) {
        expect(converted.title).toBe(entry.title);
      }
      if (entry.suggestions === undefined) {
        expect(converted.suggestions).toBeUndefined();
      } else {
        expect(converted.suggestions).toEqual(entry.suggestions);
      }
      if (entry.cause === "self") {
        expect(converted.cause).toBe(entry.failure);
      } else {
        expect(converted.cause).toEqual(entry.cause);
      }
    },
  );

  it("registers every table row as a known failure", () => {
    for (const entry of cases) {
      expect(isKnownFailure(entry.failure)).toBe(true);
    }
  });
});
