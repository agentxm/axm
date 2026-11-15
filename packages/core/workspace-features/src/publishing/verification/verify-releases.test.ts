import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { REDACTED_SECRET } from "@agentxm/host-primitives";
import { RegistryRequestFailed } from "@agentxm/registry-client";
import { testRegistryUrl } from "@agentxm/registry-client/testing";

import { ReleaseVerificationDocumentSchema, VerifyPublishedReleases } from "../index.js";
import { expectPublishRefused } from "../test-helpers.js";
import {
  archiveBytes,
  digestOf,
  makeHttpWorld,
  makeMemoryWorld,
  publishResult,
  publishResultRequest,
  referenceRequest,
  references,
  savedEnvelope,
} from "./test-helpers.js";

describe("Release verification requests", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("refuses an empty selection and an expectation for more than one reference", () =>
    Effect.gen(function* () {
      const world = makeMemoryWorld();
      const empty = yield* world
        .provide(VerifyPublishedReleases.verify(referenceRequest([])))
        .pipe(Effect.flip);
      expect(expectPublishRefused(empty).category).toBe("usage");
      const twice = yield* world
        .provide(
          VerifyPublishedReleases.verify({
            registry: Option.none(),
            selection: {
              mode: "references",
              references: references("@acme/skills/review@1.0.0", "@acme/skills/review@1.0.0"),
              integrity: Option.some(digestOf("review")),
            },
          }),
        )
        .pipe(Effect.flip);
      expect(expectPublishRefused(twice).category).toBe("usage");
      expect(world.calls).toEqual([]);
    }),
  );

  it.effect("records the default Registry when none is named", () =>
    Effect.gen(function* () {
      const world = makeMemoryWorld({
        extensions: {
          "@acme/skills/review": [{ version: "1.0.0", integrity: digestOf("review") }],
        },
      });
      const document = yield* world.provide(
        VerifyPublishedReleases.verify(referenceRequest(["@acme/skills/review@1.0.0"])),
      );
      expect(document.registry.selectedBy).toBe("default");
      expect(document.selection.mode).toBe("references");
    }),
  );

  it.effect("emits only keys its document schema declares, through a representable schema", () =>
    Effect.gen(function* () {
      const world = makeMemoryWorld({
        extensions: {
          "@acme/skills/review": [
            {
              version: "1.0.0",
              integrity: digestOf("review"),
              yankedAt: "2026-11-14T11:00:00Z",
              yankCategory: "other",
              yankMessage: "Withdrawn.",
            },
          ],
        },
        admissionFailure: () =>
          new RegistryRequestFailed({ category: "forbidden", detail: "Held by the Registry." }),
      });
      const document = yield* world.provide(
        VerifyPublishedReleases.verify(
          referenceRequest(["@acme/skills/review@1.0.0", "@acme/skills/absent@1.0.0"], {}),
        ),
      );
      const encoded = yield* Schema.encodeEffect(ReleaseVerificationDocumentSchema)(document);
      const wire: unknown = JSON.parse(JSON.stringify(encoded));
      const decoded = yield* Schema.decodeUnknownEffect(ReleaseVerificationDocumentSchema)(wire, {
        onExcessProperty: "error",
      });
      expect(decoded).toEqual(document);
      expect(wire).toMatchObject({
        releases: [
          {
            observed: {
              published: "2026-11-14T10:02:11.000Z",
              yankedAt: "2026-11-14T11:00:00.000Z",
            },
            archive: { failure: { category: "forbidden", message: "Held by the Registry." } },
          },
          { presence: { finding: "extension-unavailable" } },
        ],
      });
      const jsonSchema = Schema.toJsonSchemaDocument(ReleaseVerificationDocumentSchema, {
        onExcessProperty: "error",
      });
      expect(
        Object.keys(jsonSchema.definitions)
          .filter((name) => name.startsWith("ReleaseVerification"))
          .sort(),
      ).toEqual([
        "ReleaseVerificationAssessment",
        "ReleaseVerificationCheck",
        "ReleaseVerificationCoverage",
        "ReleaseVerificationDocument",
        "ReleaseVerificationExpectation",
        "ReleaseVerificationObserved",
        "ReleaseVerificationRelease",
        "ReleaseVerificationReported",
        "ReleaseVerificationVerdict",
      ]);
    }),
  );

  it.effect(
    "reports a failed admission scope as archive evidence for every listed release, keeping presence and identity",
    () =>
      Effect.gen(function* () {
        const recorded = { review: digestOf("review"), format: digestOf("format") };
        const scopeFailure = {
          category: "conflict",
          message: "Registry credentials changed repeatedly during content admission.",
        };
        // A publish result supplies an expectation for every release, so identity is assessed.
        const path = "/work/publish.json";
        const world = makeMemoryWorld({
          extensions: {
            "@acme/skills/review": [{ version: "1.0.0", integrity: recorded.review }],
            "@acme/skills/format": [{ version: "2.0.0", integrity: recorded.format }],
          },
          admissionScopeFailure: new RegistryRequestFailed({
            category: "conflict",
            detail: scopeFailure.message,
          }),
          files: {
            [path]: savedEnvelope(
              publishResult([
                { name: "review", version: "1.0.0", prepared: recorded.review },
                { name: "format", version: "2.0.0", prepared: recorded.format },
                { name: "absent", version: "1.0.0", prepared: digestOf("absent") },
              ]),
            ),
          },
        });
        const document = yield* world.provide(
          VerifyPublishedReleases.verify(publishResultRequest(path, { registry: testRegistryUrl })),
        );
        const [review, format, absent] = document.releases;
        for (const listed of [review, format])
          expect(listed).toMatchObject({
            presence: { coverage: { state: "complete" }, conclusion: "satisfied" },
            identity: { coverage: { state: "complete" }, conclusion: "satisfied" },
            archive: {
              coverage: { state: "incomplete" },
              conclusion: "unknown",
              failure: scopeFailure,
            },
          });
        // The absent release was never admitted: it keeps its own presence finding.
        expect(absent).toMatchObject({
          presence: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "extension-unavailable",
          },
          identity: { coverage: { state: "incomplete" }, conclusion: "unknown" },
          archive: { coverage: { state: "incomplete" }, conclusion: "unknown" },
        });
        expect(absent?.archive.failure).toBeUndefined();
        expect(document.verdict).toEqual({
          ok: false,
          reasons: [
            {
              check: "presence",
              code: "attention-required",
              refs: ["@acme/skills/absent@1.0.0"],
            },
            {
              check: "identity",
              code: "incomplete-assessment",
              refs: ["@acme/skills/absent@1.0.0"],
            },
            {
              check: "archive",
              code: "incomplete-assessment",
              refs: [
                "@acme/skills/review@1.0.0",
                "@acme/skills/format@2.0.0",
                "@acme/skills/absent@1.0.0",
              ],
            },
          ],
        });
        expect(world.registryCalls()).toEqual([
          {
            operation: "selectMany",
            subjects: ["@acme/skills/review", "@acme/skills/format", "@acme/skills/absent"],
          },
          {
            operation: "withAccessibleContent",
            subjects: ["@acme/skills/review@1.0.0", "@acme/skills/format@2.0.0"],
          },
        ]);
      }),
  );

  it.effect(
    "redacts credentials a Registry problem quotes from the completed result it reports",
    () =>
      Effect.gen(function* () {
        const shaped = "axms_Q7f2Lm9xVb3Kp8Rt5Wn1Zc4H";
        const echoed = "proxy-echo-7Hq2";
        const world = makeHttpWorld({
          releases: [
            { name: "review", version: "1.0.0", archive: archiveBytes("review 1.0.0") },
            { name: "withheld", version: "1.0.0", archive: archiveBytes("withheld 1.0.0") },
          ],
          archiveProblem: (name) =>
            name === "withheld"
              ? {
                  type: "https://registry.agentxm.ai/v1/problems/forbidden",
                  title: "Forbidden",
                  code: "forbidden",
                  detail: `Archive withheld by the proxy: credential ${shaped} (session ${echoed}) is not admitted.`,
                  token: echoed,
                }
              : undefined,
        });
        cleanups.push(world.cleanup);
        const document = yield* world.provide(
          VerifyPublishedReleases.verify(
            referenceRequest(["@acme/skills/review@1.0.0", "@acme/skills/withheld@1.0.0"]),
          ),
        );
        const [review, withheld] = document.releases;
        expect(review?.archive.conclusion).toBe("satisfied");
        expect(withheld?.archive).toMatchObject({
          coverage: { state: "incomplete" },
          conclusion: "unknown",
          failure: {
            category: "forbidden",
            message: `Archive withheld by the proxy: credential ${REDACTED_SECRET} (session ${REDACTED_SECRET}) is not admitted.`,
          },
        });
        expect(document.verdict.ok).toBe(false);
        // The human view renders only this document's text, so what the
        // emitted document omits, the view cannot print.
        const emitted = JSON.stringify(
          yield* Schema.encodeEffect(ReleaseVerificationDocumentSchema)(document),
        );
        expect(emitted).not.toContain(shaped);
        expect(emitted).not.toContain(echoed);
      }),
  );

  it.effect(
    "fails with the network refusal, not a verdict, when an HTTP Registry is unreachable",
    () =>
      Effect.gen(function* () {
        const world = makeHttpWorld({
          offline: true,
          releases: [{ name: "review", version: "1.0.0", archive: archiveBytes("review") }],
        });
        cleanups.push(world.cleanup);
        const failure = yield* world
          .provide(VerifyPublishedReleases.verify(referenceRequest(["@acme/skills/review@1.0.0"])))
          .pipe(Effect.flip);
        expect(failure).toMatchObject({
          _tag: "RegistryRequestFailed",
          category: "network",
          reason: "network-required",
        });
        expect(world.requests.every((request) => !request.path.endsWith("/archive"))).toBe(true);
        expect(world.cachedArchives()).toEqual([]);
      }),
  );
});
