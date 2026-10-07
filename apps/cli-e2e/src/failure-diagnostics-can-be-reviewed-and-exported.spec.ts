import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeOutputControlsFixture } from "./test-support/output-controls-harness.js";

export const specification = defineSpecification({
  requirement: "system/reliability/failure-diagnostics-can-be-reviewed-and-exported",
  title: "Terminal failure diagnostics remain locally reviewable with telemetry disabled",
  statement:
    "A failed invocation shall expose the same Diagnostic ID in its terminal output and bounded local record independently of remote telemetry consent, and AXM shall export that record only to a new local file after the operator supplies the SHA-256 of the exact content they reviewed, without transmitting local messages, stacks or paths. Any remotely eligible source frames shall contain only AXM-owned module names and source-relative locations verified against the reporting build.",
  class: "functional",
  role: "experience",
  goals: ["privacy-and-consent", "safe-repetition"],
  boundary: "process",
  boundaryRationale:
    "The built CLI must retain the failure after its invocation ends, expose its identity through both human and machine output, and admit a separate review and export invocation under the selected user home.",
  methods: ["example"],
  derivedFrom: [
    "system/security/telemetry-consent-and-precedence",
    "system/reliability/telemetry-failure-never-alters-outcomes",
  ],
  supersedes: [],
  assumptions: [
    "The selected user home is writable and the retained record has not expired or been evicted.",
  ],
  openQuestions: [],
});

const FailureOutput = Schema.Struct({
  ok: Schema.Literal(false),
  cause: Schema.Array(Schema.Struct({ _tag: Schema.String, message: Schema.String })),
  diagnosticId: Schema.String.check(
    Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u),
  ),
});
const ReviewOutput = Schema.Struct({
  ok: Schema.Literal(true),
  result: Schema.Struct({
    diagnosticId: Schema.String,
    sha256: Schema.String,
    record: Schema.Unknown,
  }),
});
const decodeFailure = Schema.decodeUnknownSync(Schema.fromJsonString(FailureOutput));
const decodeReview = Schema.decodeUnknownSync(Schema.fromJsonString(ReviewOutput));

describe("Local failure diagnostics", () => {
  it.each(["json", "text"])(
    "retains and exports a reviewed %s failure with remote telemetry disabled",
    async (format) => {
      const fixture = makeOutputControlsFixture();
      try {
        fs.writeFileSync(path.join(fixture.project, "axm.json"), "{\n");
        const env = { DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1", AXM_TELEMETRY: "0" };
        const failed = await fixture.run(
          ["list", "--scope", "project", ...(format === "json" ? ["--json"] : [])],
          env,
        );
        expect(failed.exitCode, failed.stdout + failed.stderr).not.toBe(0);
        if (format === "json") {
          expect(
            decodeFailure(failed.stdout).cause.some((entry) => entry._tag === "SettingsParseError"),
          ).toBe(true);
        }
        const id =
          format === "json"
            ? decodeFailure(failed.stdout).diagnosticId
            : /Diagnostic ID\s*:?\s*([0-9a-f-]{36})/u.exec(failed.stderr)?.[1];
        if (id === undefined)
          throw new Error("The failed invocation did not expose a Diagnostic ID.");
        const recordPath = path.join(fixture.home, ".axm", "diagnostics", `${id}.json`);
        expect(fs.statSync(recordPath).size).toBeLessThanOrEqual(64 * 1024);
        if (process.platform !== "win32") expect(fs.statSync(recordPath).mode & 0o777).toBe(0o600);
        // The separate support invocation does not need the malformed workspace.
        const reviewed = await fixture.run(["diagnostics", "show", id, "--json"], env);
        expect(reviewed.exitCode, reviewed.stdout + reviewed.stderr).toBe(0);
        const review = decodeReview(reviewed.stdout).result;
        expect(review.diagnosticId).toBe(id);
        expect(review.record).toMatchObject({ eventId: id });
        const output = path.join(fixture.project, "reviewed-diagnostic.json");
        const unreviewed = await fixture.run(
          [
            "diagnostics",
            "export",
            id,
            "--review-sha256",
            "0".repeat(64),
            "--output",
            output,
            "--json",
          ],
          env,
        );
        expect(unreviewed.exitCode).not.toBe(0);
        expect(fs.existsSync(output)).toBe(false);
        const exported = await fixture.run(
          [
            "diagnostics",
            "export",
            id,
            "--review-sha256",
            review.sha256,
            "--output",
            output,
            "--json",
          ],
          env,
        );
        expect(exported.exitCode, exported.stdout + exported.stderr).toBe(0);
        expect(fs.readFileSync(output, "utf8")).toBe(`${JSON.stringify(review.record, null, 2)}\n`);
        const retained = fs.readFileSync(output, "utf8");
        const overwrite = await fixture.run(
          [
            "diagnostics",
            "export",
            id,
            "--review-sha256",
            review.sha256,
            "--output",
            output,
            "--json",
          ],
          env,
        );
        expect(overwrite.exitCode).not.toBe(0);
        expect(fs.readFileSync(output, "utf8")).toBe(retained);
      } finally {
        fixture.cleanup();
      }
    },
  );
});
