import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { defineSpecification } from "@agentxm/specification-metadata";
import { normalizePublishResult, type PublishResultItem } from "@agentxm/workspace/publishing";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { emitPublishResult } from "../root/publish/result.js";
import { candidate } from "../test-support/gallery/samples/publish-results.js";
import { humanScreenLayer, makeRecordingStreams } from "../test-support/screen-harness.js";
import { Screen } from "./screen.js";

export const specification = defineSpecification({
  requirement: "cli/quiet-keeps-actionable-results",
  title: "Quiet output keeps the facts needed to act",
  statement:
    "Quiet human output shall suppress routine activity and successful item detail while retaining requested values, required instructions, a concise disposition, and the identities, available reasons, safe correlation facts and recovery needed to act on unsuccessful or unconfirmed work.",
  class: "human-factors",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "cli/diagnostic-controls-select-the-requested-detail",
    "cli/unsettled-units-state-their-reason",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const item = (name: string) => candidate("skill", name, "1.0.0", { files: 1, zipBytes: 100 });
const published: PublishResultItem = {
  ...item("done"),
  status: "success",
  phase: "upload_execution",
};
const failed: PublishResultItem = {
  ...item("failed"),
  action: "error",
  phase: "upload_execution",
  status: "failed",
  reason: "upload_failed",
  message: "The Registry refused this upload.",
  cause: {
    code: "unavailable",
    class: "external",
    message: "The Registry refused this upload.",
    retryable: true,
    requestId: "request-visible",
  },
};
const unconfirmed: PublishResultItem = {
  ...item("unknown"),
  phase: "upload_execution",
  status: "unknown",
  reason: "settlement_unresolved",
  settlement: "unresolved",
  message: "The Registry may have committed this version; its outcome could not be verified.",
};
const blocked: PublishResultItem = {
  ...item("dependent"),
  action: "error",
  phase: "upload_execution",
  status: "blocked",
  reason: "blocked_by_dependency",
  message: "The required dependency could not be published.",
};

describe("Quiet actionable output", () => {
  it.effect.each([20, 80, 200])(
    "keeps independent failed, blocked and unknown publication outcomes at %s columns",
    (columns) => {
      const streams = makeRecordingStreams({ stdoutIsTTY: true, columns });
      const result = normalizePublishResult({
        mode: "apply",
        results: [published, failed, unconfirmed, blocked],
        recovery: {
          description: "Verify the unresolved versions before continuing",
          cmd: "axm publish --on-existing verify @acme/skills/failed @acme/skills/unknown",
          remainingItems: [failed.id, unconfirmed.id],
          blockedDependents: [blocked.id],
        },
      });
      return Effect.gen(function* () {
        yield* emitPublishResult(result, { exitCode: 8 });
        const stdout = streams.lines("stdout").join("\n").replace(/\s+/gu, "");
        for (const row of [failed, unconfirmed, blocked]) {
          expect(stdout).toContain(row.id);
          expect(stdout).toContain(row.message?.replace(/\s+/gu, ""));
        }
        expect(stdout).toContain("request-visible");
        expect(stdout).toContain("axmpublish--on-existingverify");
        expect(stdout).not.toContain(published.id);
      }).pipe(
        Effect.provide(
          Layer.merge(
            humanScreenLayer(streams, { quiet: true, env: { NO_COLOR: "1" } }),
            TestFlagsLayer({ quiet: true }),
          ),
        ),
      );
    },
  );

  it.effect("retains a required action under quiet", () => {
    const streams = makeRecordingStreams();
    return Effect.gen(function* () {
      const screen = yield* Screen;
      yield* screen.instruction([
        { _tag: "paragraph", text: "Visit https://example.test/approve and enter ABCD" },
      ]);
      expect(streams.lines("stderr").join("\n")).toContain(
        "https://example.test/approve and enter ABCD",
      );
    }).pipe(Effect.provide(humanScreenLayer(streams, { quiet: true })));
  });
});
