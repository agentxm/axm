import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import {
  VisibilityEvaluationResultSchema,
  VisibilityMutationRequestSchema,
  resolveVisibilityIntent,
} from "./visibility.js";

describe("visibility intent", () => {
  it("prefers manifest intent over the workspace default", () => {
    const intent = resolveVisibilityIntent({
      manifest: { value: "public", material: '{"publish":{"visibility":"public"}}' },
      workspace: { value: "private", material: '{"publish":{"defaultVisibility":"private"}}' },
    });

    expect(intent).toMatchObject({ value: "public", source: "manifest" });
  });

  it("returns the workspace default when the manifest is unconfigured", () => {
    const intent = resolveVisibilityIntent({
      workspace: { value: "private", material: '{"publish":{"defaultVisibility":"private"}}' },
    });

    expect(intent).toMatchObject({ value: "private", source: "workspace" });
  });

  it("returns null when repository intent is unconfigured", () => {
    expect(resolveVisibilityIntent({})).toBeNull();
  });

  it("changes the fingerprint with authoritative source material", () => {
    const first = resolveVisibilityIntent({
      manifest: { value: "public", material: "first" },
    });
    const second = resolveVisibilityIntent({
      manifest: { value: "public", material: "second" },
    });

    expect(first?.fingerprint).not.toBe(second?.fingerprint);
  });
});

describe("visibility transport contracts", () => {
  it("decodes an authoritative evaluation envelope", () => {
    const evaluation = Schema.decodeUnknownSync(VisibilityEvaluationResultSchema)({
      target: "@acme/skills/review",
      intent: null,
      request: null,
      resolved: {
        value: "private",
        disposition: "establish",
        source: "account",
      },
      actual: null,
      comparison: "unconfigured",
      findings: [],
    });

    expect("comparison" in evaluation ? evaluation.comparison : null).toBe("unconfigured");
  });

  it("requires repository source evidence for repository-authority mutation", () => {
    expect(() =>
      Schema.decodeUnknownSync(VisibilityMutationRequestSchema)({
        target: "@acme/skills/review",
        visibility: "public",
        revision: "opaque-revision",
        authority: { kind: "repository" },
      }),
    ).toThrow();
  });
});
