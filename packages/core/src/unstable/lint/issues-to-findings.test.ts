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
import * as SchemaIssue from "effect/SchemaIssue";
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

const NonEmptyStringSchema = Schema.String.check(
  Schema.makeFilter((value) => (value.length > 0 ? undefined : "must not be empty")),
);

const OneOfSchema = Schema.Union([Schema.Literal("a"), Schema.String]);

const expectIssue = <A, I>(schema: Schema.Codec<A, I>, input: unknown): Issue => {
  const result = Schema.decodeUnknownResult(schema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  if (result._tag === "Failure") {
    return result.failure.issue;
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

  it("wraps raw schema detail in a guide-conformant message", () => {
    const issue = expectIssue(
      Schema.Struct({
        name: Schema.String,
      }),
      { name: 1 },
    );
    const findings = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    for (const finding of findings) {
      expect(finding.message).toContain("Skill manifest field `name` has the wrong type");
      expect(finding.message).toContain(
        "Edit `skill.json` and replace it with a value of the expected type",
      );
      expect("suggestions" in finding).toBe(false);
    }
  });

  it("formats invalid value findings with constraint-specific wording", () => {
    const issue = expectIssue(
      Schema.Struct({
        name: NonEmptyStringSchema,
      }),
      { name: "" },
    );

    const [finding] = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    expect(finding?.message).toContain("Skill manifest field `name` is invalid");
    expect(finding?.message).toContain("must not be empty");
    expect(finding?.message).toContain(
      "Edit `skill.json` and update it so it satisfies the schema constraint",
    );
  });

  it("formats unexpected key findings with concrete remediation", () => {
    const issue = new SchemaIssue.Pointer(
      ["made_up_key"],
      new SchemaIssue.UnexpectedKey(ManifestSchema.ast, "value"),
    );

    const [finding] = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    expect(finding?.message).toBe(
      "Skill manifest has unrecognized field `made_up_key`. Edit `skill.json` and remove it or rename it to the intended field name.",
    );
  });

  it("does not tell users to hand-edit the lockfile for schema findings", () => {
    const issue = expectIssue(
      Schema.Struct({
        lockfileVersion: Schema.Number,
      }),
      { lockfileVersion: "one" },
    );

    const [finding] = issuesToFindings(
      "workspace/lockfile-valid",
      "error",
      ".axm/axm-lock.yaml",
      issue,
    );

    expect(finding?.message).toContain("Regenerate `.axm/axm-lock.yaml` from `.axm/settings.json`");
    expect(finding?.message).not.toContain("Edit `.axm/axm-lock.yaml`");
  });

  it("formats forbidden findings with concrete remediation", () => {
    const issue = new SchemaIssue.Pointer(
      ["name"],
      new SchemaIssue.Forbidden({ message: "forbidden in this context" }, "blocked"),
    );

    const [finding] = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    expect(finding?.message).toContain(
      "Skill manifest field `name` uses a value or operation the schema does not allow",
    );
    expect(finding?.message).toContain("forbidden in this context");
    expect(finding?.message).toContain(
      "Edit `skill.json` and update it so the document satisfies the schema",
    );
  });

  it("formats one-of findings with branch-specific wording", () => {
    const issue = new SchemaIssue.Pointer(
      ["name"],
      new SchemaIssue.OneOf(OneOfSchema.ast, [Schema.Literal("a").ast, Schema.String.ast], "a"),
    );

    const [finding] = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    expect(finding?.message).toContain(
      "Skill manifest field `name` matches more than one allowed shape",
    );
    expect(finding?.message).toContain(
      "Edit `skill.json` and rewrite it so exactly one allowed shape matches",
    );
  });

  it("formats any-of fallbacks with branch-specific wording", () => {
    const issue = new SchemaIssue.Pointer(
      ["name"],
      new SchemaIssue.AnyOf(OneOfSchema.ast, [], "z"),
    );

    const [finding] = issuesToFindings("skill/manifest-schema-valid", "error", "skill.json", issue);

    expect(finding?.message).toContain(
      "Skill manifest field `name` does not match any allowed shape",
    );
    expect(finding?.message).toContain(
      "Edit `skill.json` and rewrite it so it matches one of the allowed shapes",
    );
  });

  it("smoke: real decoder result propagates findings", () => {
    const result = Schema.decodeUnknownResult(ManifestSchema)(
      { name: "axm", version: "0.1.0", owner: "@acme" },
      { onExcessProperty: "ignore" },
    );

    Result.match(result, {
      onFailure: (error) => {
        const findings = issuesToFindings(
          "skill/manifest-schema-valid",
          "error",
          "skill.json",
          error.issue,
        );
        expect(findings.length).toBeGreaterThan(0);
      },
      onSuccess: () => {
        throw new Error("expected decode to fail");
      },
    });
  });
});
