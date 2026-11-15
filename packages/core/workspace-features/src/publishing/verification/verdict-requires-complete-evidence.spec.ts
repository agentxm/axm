import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { RegistryRequestFailed } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  decideReleaseVerdict,
  VerifyPublishedReleases,
  type ReleaseVerificationDocument,
} from "../index.js";
import { digestOf, makeMemoryWorld, referenceRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/verify/verdict-requires-complete-evidence",
  title: "Release verification passes only on complete satisfied evidence",
  statement:
    "Verify shall return a positive verdict only when every applicable assessment of every selected release is complete and satisfied, treat a yanked version as present, report a negative or incomplete verification as a completed result that is not ok, and fail with the existing error contract instead of a verdict when no selected release yields any Registry observation.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "machine-automation"],
  boundary: "memory",
  boundaryRationale:
    "The verdict is a pure decision over assessments, and the use case runs over a recording Registry port; the production Registry client, archive cache, process exit and envelope need separate evidence.",
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

type Release = ReleaseVerificationDocument["releases"][number];
type Assessment = Release["presence"];

const satisfied: Assessment = { coverage: { state: "complete" }, conclusion: "satisfied" };
const notApplicable: Assessment = {
  coverage: { state: "not-applicable", reason: "No expected integrity was supplied." },
  conclusion: "not-applicable",
};
const verified = (
  id: string,
  overrides: Partial<Pick<Release, "presence" | "identity" | "archive">> = {},
) => ({
  id,
  presence: satisfied,
  identity: satisfied,
  archive: satisfied,
  ...overrides,
});

const review = "@acme/skills/review@1.0.0";
const format = "@acme/skills/format@2.0.0";

describe("Release verification verdict", () => {
  it("passes only complete satisfied evidence, with identity optionally not applicable", () => {
    expect(decideReleaseVerdict([verified(review)])).toEqual({ ok: true, reasons: [] });
    expect(decideReleaseVerdict([verified(review, { identity: notApplicable })])).toEqual({
      ok: true,
      reasons: [],
    });
  });

  it.each<[string, Partial<Pick<Release, "presence" | "identity" | "archive">>, string, string]>([
    [
      "an integrity mismatch",
      {
        identity: {
          coverage: { state: "complete" },
          conclusion: "attention-required",
          finding: "integrity-mismatch",
        },
      },
      "identity",
      "attention-required",
    ],
    [
      "an archive that could not be read",
      {
        archive: {
          coverage: { state: "incomplete", reasons: ["The archive was not read."] },
          conclusion: "unknown",
          failure: { category: "forbidden", message: "Held." },
        },
      },
      "archive",
      "incomplete-assessment",
    ],
    [
      "unknown evidence reported as complete",
      { presence: { coverage: { state: "complete" }, conclusion: "unknown" } },
      "presence",
      "incomplete-assessment",
    ],
    [
      "a satisfied conclusion drawn from incomplete coverage",
      {
        archive: {
          coverage: { state: "incomplete", reasons: ["Only part of the archive was read."] },
          conclusion: "satisfied",
        },
      },
      "archive",
      "incomplete-assessment",
    ],
  ])("does not pass %s", (_case, overrides, check, code) => {
    expect(decideReleaseVerdict([verified(format), verified(review, overrides)])).toEqual({
      ok: false,
      reasons: [{ check, code, refs: [review] }],
    });
  });

  it("states each reason once per check, listing release ids in release order", () => {
    const missing: Partial<Pick<Release, "presence" | "identity" | "archive">> = {
      presence: {
        coverage: { state: "complete" },
        conclusion: "attention-required",
        finding: "version-missing",
      },
      archive: {
        coverage: { state: "incomplete", reasons: ["The archive was not read."] },
        conclusion: "unknown",
      },
    };
    expect(
      decideReleaseVerdict([
        verified(format, missing),
        verified(review),
        verified(review, missing),
      ]),
    ).toEqual({
      ok: false,
      reasons: [
        { check: "presence", code: "attention-required", refs: [format, review] },
        { check: "archive", code: "incomplete-assessment", refs: [format, review] },
      ],
    });
  });
});

describe("Release verification completion", () => {
  it.effect("treats a yanked version as present and reports its yank facts", () =>
    Effect.gen(function* () {
      const world = makeMemoryWorld({
        extensions: {
          "@acme/skills/review": [
            {
              version: "1.0.0",
              integrity: digestOf("review-1.0.0"),
              yankedAt: "2026-11-14T11:00:00Z",
              yankCategory: "security",
              yankMessage: "Superseded.",
            },
          ],
        },
      });
      const document = yield* world.provide(
        VerifyPublishedReleases.verify(referenceRequest([review])),
      );
      expect(document.verdict).toEqual({ ok: true, reasons: [] });
      const [release] = document.releases;
      expect(release?.presence).toEqual(satisfied);
      expect(release?.archive).toEqual(satisfied);
      expect(release?.observed).toMatchObject({
        yanked: true,
        yankCategory: "security",
        yankMessage: "Superseded.",
      });
      expect(release?.observed?.yankedAt).toBeDefined();
    }),
  );

  it.effect("completes a negative verification as a result that is not ok", () =>
    Effect.gen(function* () {
      const world = makeMemoryWorld({
        extensions: {
          "@acme/skills/review": [{ version: "1.1.0", integrity: digestOf("review-1.1.0") }],
        },
      });
      const document = yield* world.provide(
        VerifyPublishedReleases.verify(referenceRequest([review])),
      );
      expect(document.contract).toBe("release-verification-v1");
      expect(document.verdict).toEqual({
        ok: false,
        reasons: [
          { check: "presence", code: "attention-required", refs: [review] },
          { check: "archive", code: "incomplete-assessment", refs: [review] },
        ],
      });
      expect(world.registryCalls().map((call) => call.operation)).toEqual(["selectMany"]);
    }),
  );

  it.effect("fails with the Registry's own error when no selected release is observed", () =>
    Effect.gen(function* () {
      const unreachable = new RegistryRequestFailed({
        reason: "transport",
        category: "network",
        detail: "The Registry could not be reached.",
      });
      const world = makeMemoryWorld({
        extensions: {
          "@acme/skills/review": [{ version: "1.0.0", integrity: digestOf("review-1.0.0") }],
        },
        selectionFailure: () => unreachable,
      });
      const failure = yield* world
        .provide(VerifyPublishedReleases.verify(referenceRequest([review, format])))
        .pipe(Effect.flip);
      expect(failure).toBe(unreachable);
      expect(world.registryCalls().map((call) => call.operation)).toEqual(["selectMany"]);
    }),
  );
});
