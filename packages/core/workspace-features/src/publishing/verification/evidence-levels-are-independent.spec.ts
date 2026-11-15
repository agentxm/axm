import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { RegistryRetryObservation } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";

import { VerifyPublishedReleases, type ReleaseVerificationDocument } from "../index.js";
import {
  archiveBytes,
  makeFileWorld,
  makeHttpWorld,
  referenceRequest,
  sri,
  type HttpWorldOptions,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/verify/evidence-levels-are-independent",
  title: "Release verification keeps presence, identity and archive evidence independent",
  statement:
    "For each selected release, verify shall assess presence from current Registry metadata, intended identity by comparing the recorded integrity with the caller's expectation, and archive integrity through an admitted archive read against the recorded integrity, keeping an unavailable extension, a missing version, an integrity mismatch, an unreadable archive and unavailable Registry evidence distinct, and shall verify a release named more than once only once while attributing it to every request.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "machine-automation"],
  boundary: "platform",
  boundaryRationale:
    "The production Registry client reads a native file Registry, and over a controlled HTTP Registry admits and downloads archives through the real archive cache in an isolated user home; the compiled command and a deployed Registry need separate evidence.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The controlled HTTP Registry decides admission and serves bytes from fixtures, so whether a deployed Registry refuses or serves a given release is not observed here.",
      retirementCondition:
        "Process evidence against a Registry service records the same distinctions for a published release.",
    },
  ],
});

describe("Release verification evidence levels", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const fileWorld = () => {
    const world = makeFileWorld();
    cleanups.push(world.cleanup);
    world.registry.writeSkill("review", [
      { version: "1.0.0", body: "one" },
      { version: "1.1.0", body: "yanked", yankedAt: "2026-11-14T11:00:00Z" },
    ]);
    return world;
  };
  const recordedIntegrity = (root: string, version: string) =>
    sri(
      new Uint8Array(
        fs.readFileSync(
          nodePath.join(root, "extensions", "@acme", "skills", "review", `${version}.zip`),
        ),
      ),
    );

  const httpWorld = (options: HttpWorldOptions) => {
    const world = makeHttpWorld(options);
    cleanups.push(world.cleanup);
    return world;
  };

  it.effect(
    "distinguishes a present, yanked, missing and unavailable release, verifying a repeated one once",
    () =>
      Effect.gen(function* () {
        const world = fileWorld();
        const document = yield* world.provide(
          VerifyPublishedReleases.verify(
            referenceRequest([
              "@acme/skills/review@1.0.0",
              "@acme/skills/review@1.1.0",
              "@acme/skills/review@9.9.9",
              "@acme/skills/absent@1.0.0",
              "@acme/skills/review@1.0.0",
            ]),
          ),
        );
        expect(document.selection.requests.map((request) => request.id)).toEqual([
          "request-1",
          "request-2",
          "request-3",
          "request-4",
          "request-5",
        ]);
        const [present, yanked, missing, absent, ...rest] = document.releases;
        expect(rest).toEqual([]);
        expect(present).toMatchObject({
          id: "@acme/skills/review@1.0.0",
          requestRefs: ["request-1", "request-5"],
          observed: {
            integrity: recordedIntegrity(world.registry.root, "1.0.0"),
            publisherBindingId: "hbnd_test",
            yanked: false,
          },
          presence: { coverage: { state: "complete" }, conclusion: "satisfied" },
          identity: {
            coverage: { state: "not-applicable", reason: "No expected integrity was supplied." },
            conclusion: "not-applicable",
          },
          archive: { coverage: { state: "complete" }, conclusion: "satisfied" },
        });
        expect(yanked).toMatchObject({
          requestRefs: ["request-2"],
          observed: { yanked: true },
          presence: { conclusion: "satisfied" },
          archive: { conclusion: "satisfied" },
        });
        expect(missing).toMatchObject({
          presence: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "version-missing",
          },
          archive: { coverage: { state: "incomplete" }, conclusion: "unknown" },
        });
        expect(missing?.observed).toBeUndefined();
        expect(absent).toMatchObject({
          presence: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "extension-unavailable",
          },
          archive: { coverage: { state: "incomplete" }, conclusion: "unknown" },
        });
        expect(document.verdict).toEqual({
          ok: false,
          reasons: [
            {
              check: "presence",
              code: "attention-required",
              refs: ["@acme/skills/review@9.9.9", "@acme/skills/absent@1.0.0"],
            },
            {
              check: "archive",
              code: "incomplete-assessment",
              refs: ["@acme/skills/review@9.9.9", "@acme/skills/absent@1.0.0"],
            },
          ],
        });
      }),
  );

  it.effect(
    "compares the recorded integrity with the expectation and still assesses the archive",
    () =>
      Effect.gen(function* () {
        const world = fileWorld();
        const recorded = recordedIntegrity(world.registry.root, "1.0.0");
        const matching = yield* world.provide(
          VerifyPublishedReleases.verify(
            referenceRequest(["@acme/skills/review@1.0.0"], { integrity: recorded }),
          ),
        );
        expect(matching.releases[0]?.identity).toEqual({
          coverage: { state: "complete" },
          conclusion: "satisfied",
        });
        expect(matching.verdict.ok).toBe(true);

        const intended = sri(archiveBytes("the release the publisher intended"));
        const differing = yield* world.provide(
          VerifyPublishedReleases.verify(
            referenceRequest(["@acme/skills/review@1.0.0"], { integrity: intended }),
          ),
        );
        expect(differing.releases[0]).toMatchObject({
          expectation: { integrity: intended, source: "flag" },
          observed: { integrity: recorded },
          presence: { conclusion: "satisfied" },
          identity: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "integrity-mismatch",
          },
          archive: { coverage: { state: "complete" }, conclusion: "satisfied" },
        });
        expect(differing.verdict).toEqual({
          ok: false,
          reasons: [
            { check: "identity", code: "attention-required", refs: ["@acme/skills/review@1.0.0"] },
          ],
        });
      }),
  );

  it.effect(
    "leaves identity unknown, not mismatched, when the expected release is not listed",
    () =>
      Effect.gen(function* () {
        const world = fileWorld();
        const expected = recordedIntegrity(world.registry.root, "1.0.0");
        for (const [id, finding] of [
          ["@acme/skills/review@9.9.9", "version-missing"],
          ["@acme/skills/absent@1.0.0", "extension-unavailable"],
        ] as const) {
          const document = yield* world.provide(
            VerifyPublishedReleases.verify(referenceRequest([id], { integrity: expected })),
          );
          const [release] = document.releases;
          expect(release).toMatchObject({
            expectation: { integrity: expected, source: "flag" },
            presence: { coverage: { state: "complete" }, finding },
            identity: { coverage: { state: "incomplete" }, conclusion: "unknown" },
            archive: { coverage: { state: "incomplete" }, conclusion: "unknown" },
          });
          expect(release?.identity.finding).toBeUndefined();
          expect(release?.observed).toBeUndefined();
          expect(document.verdict).toEqual({
            ok: false,
            reasons: [
              { check: "presence", code: "attention-required", refs: [id] },
              { check: "identity", code: "incomplete-assessment", refs: [id] },
              { check: "archive", code: "incomplete-assessment", refs: [id] },
            ],
          });
        }
      }),
  );

  it.effect(
    "reads present releases in one selection and one admission exchange, reusing a verified cached copy only after fresh admission",
    () =>
      Effect.gen(function* () {
        const world = httpWorld({
          releases: [
            { name: "review", version: "1.0.0", archive: archiveBytes("review 1.0.0") },
            { name: "format", version: "2.0.0", archive: archiveBytes("format 2.0.0") },
          ],
        });
        const request = referenceRequest([
          "@acme/skills/review@1.0.0",
          "@acme/skills/format@2.0.0",
          "@acme/skills/review@1.0.0",
        ]);
        const first = yield* world.provide(VerifyPublishedReleases.verify(request));
        expect(first.verdict).toEqual({ ok: true, reasons: [] });
        // A repeated release is verified once and attributed to every request.
        expect(first.releases.map(({ id, requestRefs }) => ({ id, requestRefs }))).toEqual([
          { id: "@acme/skills/review@1.0.0", requestRefs: ["request-1", "request-3"] },
          { id: "@acme/skills/format@2.0.0", requestRefs: ["request-2"] },
        ]);
        expect(world.exchanges("select")).toHaveLength(1);
        expect(world.exchanges("authorize-exact")).toHaveLength(1);
        expect([...(world.exchanges("authorize-exact")[0]?.names ?? [])].sort()).toEqual([
          "format",
          "review",
        ]);
        expect(world.exchanges("archive")).toHaveLength(2);
        expect(world.exchanges("archive").map((exchange) => exchange.usagePurpose)).toEqual([
          "verification",
          "verification",
        ]);
        // Selection, admission and archive download are the only requests.
        expect(world.requests).toHaveLength(4);
        expect(world.cachedArchives()).toHaveLength(2);

        const second = yield* world.provide(VerifyPublishedReleases.verify(request));
        expect(second.releases.map((release) => release.archive)).toEqual([
          { coverage: { state: "complete" }, conclusion: "satisfied" },
          { coverage: { state: "complete" }, conclusion: "satisfied" },
        ]);
        expect(world.exchanges("select")).toHaveLength(2);
        expect(world.exchanges("authorize-exact")).toHaveLength(2);
        expect(world.exchanges("archive")).toHaveLength(2);
        expect(world.requests).toHaveLength(6);
      }),
  );

  it.effect(
    "reports downloaded bytes that do not match the recorded integrity without caching them",
    () =>
      Effect.gen(function* () {
        const world = httpWorld({
          releases: [
            {
              name: "review",
              version: "1.0.0",
              archive: archiveBytes("review 1.0.0"),
              served: archiveBytes("altered in transit"),
            },
          ],
        });
        const document = yield* world.provide(
          VerifyPublishedReleases.verify(referenceRequest(["@acme/skills/review@1.0.0"])),
        );
        expect(document.releases[0]).toMatchObject({
          presence: { conclusion: "satisfied" },
          archive: {
            coverage: { state: "incomplete" },
            conclusion: "unknown",
            failure: {
              category: "validation",
              message: "Downloaded registry archive did not match its published integrity.",
            },
          },
        });
        expect(document.verdict.ok).toBe(false);
        expect(world.cachedArchives()).toEqual([]);
      }),
  );

  it.effect("keeps presence and identity when admission refuses a held release", () =>
    Effect.gen(function* () {
      const recorded = archiveBytes("review 1.0.0");
      const world = httpWorld({
        releases: [{ name: "review", version: "1.0.0", archive: recorded }],
        admission: () => ({ outcome: "lifecycle-blocked", reason: "held" }),
      });
      const document = yield* world.provide(
        VerifyPublishedReleases.verify(
          referenceRequest(["@acme/skills/review@1.0.0"], { integrity: sri(recorded) }),
        ),
      );
      expect(document.releases[0]).toMatchObject({
        presence: { coverage: { state: "complete" }, conclusion: "satisfied" },
        identity: { coverage: { state: "complete" }, conclusion: "satisfied" },
        archive: {
          coverage: { state: "incomplete" },
          conclusion: "unknown",
          failure: { category: "forbidden" },
        },
      });
      expect(document.verdict).toEqual({
        ok: false,
        reasons: [
          { check: "archive", code: "incomplete-assessment", refs: ["@acme/skills/review@1.0.0"] },
        ],
      });
      expect(world.exchanges("archive")).toEqual([]);
    }),
  );

  it.effect(
    "reports unavailable evidence for a batch whose selection exchange fails in transport while the other batch keeps its results",
    () =>
      Effect.gen(function* () {
        const releases = Array.from({ length: 101 }, (_, index) => {
          const name = `release-${String(index).padStart(3, "0")}`;
          return { name, version: "1.0.0", archive: archiveBytes(name) };
        });
        const world = httpWorld({
          releases,
          dropSelection: (names) => names.includes("release-000"),
        });
        // The client retries a transport failure on the clock; each scheduled
        // wait is announced, so the test clock advances exactly past it.
        const waits = yield* Queue.unbounded<number>();
        const fiber = yield* world
          .provide(
            VerifyPublishedReleases.verify(
              referenceRequest(releases.map(({ name }) => `@acme/skills/${name}@1.0.0`)),
            ),
          )
          .pipe(
            Effect.provideService(RegistryRetryObservation, {
              waiting: (retry) => Queue.offer(waits, retry.delayMillis).pipe(Effect.asVoid),
              ended: () => Effect.void,
            }),
            Effect.forkChild,
          );
        const settled = Effect.map(Fiber.join(fiber), (document) => ({ document }) as const);
        const waited = Effect.map(Queue.take(waits), (delay) => ({ delay }) as const);
        let document: ReleaseVerificationDocument | undefined;
        while (document === undefined) {
          const next = yield* Effect.raceFirst(settled, waited);
          if ("document" in next) document = next.document;
          else yield* TestClock.adjust(Duration.millis(next.delay));
        }
        const dropped = new Set(
          world.exchanges("select").find((exchange) => exchange.names.includes("release-000"))
            ?.names,
        );
        expect(dropped.size).toBeGreaterThan(0);
        expect(dropped.size).toBeLessThan(101);
        for (const release of document.releases) {
          if (dropped.has(release.name)) {
            expect(release.presence).toMatchObject({
              coverage: { state: "incomplete" },
              conclusion: "unknown",
              failure: { category: "network" },
            });
            expect(release.archive.conclusion).toBe("unknown");
            expect(release.observed).toBeUndefined();
          } else {
            expect(release.presence.conclusion).toBe("satisfied");
            expect(release.archive.conclusion).toBe("satisfied");
          }
        }
        // Only the other batch's releases were admitted and downloaded.
        expect(world.exchanges("archive")).toHaveLength(101 - dropped.size);
        expect(document.verdict.ok).toBe(false);
      }),
  );
});
