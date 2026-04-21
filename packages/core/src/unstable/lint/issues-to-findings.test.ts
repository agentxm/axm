/**
 * Unit tests for `issuesToFindings`.
 *
 * Exercises the helper against `Issue` values produced by running the real
 * Effect `Schema.decodeUnknown*` decoder. Snapshot the findings so a schema
 * refactor that reshapes issues surfaces as a diff rather than a silent
 * regression.
 */

import { describe, expect, it } from "vitest";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { Issue } from "effect/SchemaIssue";
import { issuesToFindings } from "./issues-to-findings.js";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const ManifestSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  owner: Schema.String,
  description: Schema.String,
});

const NestedSchema = Schema.Struct({
  compatibility: Schema.Struct({
    requires: Schema.Array(Schema.String),
  }),
});

const expectIssue = <A, I>(schema: Schema.Codec<A, I>, input: unknown): Issue => {
  const result = Schema.decodeUnknownResult(schema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  if (result._tag === "Failure") {
    return result.failure;
  }
  throw new Error("expected schema decode to fail");
};

// -----------------------------------------------------------------------------
// Known-issue paths
// -----------------------------------------------------------------------------

describe("issuesToFindings", () => {
  it("emits one finding per missing top-level key", () => {
    const issue = expectIssue(ManifestSchema, {
      name: "axm",
      // version missing, owner missing, description missing
    });

    const findings = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    expect(findings).toMatchSnapshot();
  });

  it("emits one finding per invalid top-level field", () => {
    const issue = expectIssue(ManifestSchema, {
      name: 123,
      version: 456,
      owner: true,
      description: null,
    });

    const findings = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    expect(findings).toMatchSnapshot();
  });

  it("emits findings at nested paths", () => {
    const issue = expectIssue(NestedSchema, {
      compatibility: {
        requires: ["a", 42, "c"],
      },
    });

    const findings = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    expect(findings).toMatchSnapshot();
  });

  it("emits advisory findings with the supplied ruleId, severity, and file", () => {
    const issue = expectIssue(ManifestSchema, {
      name: "axm",
      version: 1,
      owner: "@acme",
      description: "a description",
    });

    const findings = issuesToFindings(
      "skill/manifest-schema-valid",
      "warning",
      "path/to/skill.json",
      issue,
    );

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.kind).toBe("advisory");
      expect(finding.ruleId).toBe("skill/manifest-schema-valid");
      expect(finding.severity).toBe("warning");
      expect(finding.location?.file).toBe("path/to/skill.json");
    }
  });

  it("never ships non-empty suggestions (advisory schema rules rely on the paired keys-recognized rule)", () => {
    const issue = expectIssue(ManifestSchema, { name: 1 });
    const findings = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    for (const finding of findings) {
      expect(finding.suggestions).toEqual([]);
    }
  });

  it("smoke: real decoder result propagates findings", () => {
    const result = Schema.decodeUnknownResult(ManifestSchema)(
      { name: "axm", version: "0.1.0", owner: "@acme" },
      { onExcessProperty: "ignore" },
    );

    Result.match(result, {
      onFailure: (issue) => {
        const findings = issuesToFindings(
          "skill/manifest-schema-valid",
          "error",
          "skill.json",
          issue,
        );
        expect(findings.length).toBeGreaterThan(0);
      },
      onSuccess: () => {
        throw new Error("expected decode to fail");
      },
    });
  });
});
