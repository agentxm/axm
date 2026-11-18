import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { rootCommand } from "../../app.js";
import { makeCanonicalRequirementValidator } from "../../test-support/command-inventory.js";
import {
  decodePreparedInputAllocation,
  preparedInputFindings,
  readPreparedInputAllocation,
  repositoryFileExists,
  scanPublicationSites,
  type DeclaredRoute,
  type PreparedInputAllocation,
  type PreparedInputFacts,
} from "../../test-support/prepared-input-inventory.js";
import { registeredCommandCapabilities } from "./command-capabilities.js";

/**
 * The prepared-input allocation names every registered route and declared
 * mode, states each owner's dispositions once in that owner's catalog with the
 * evidence its kind requires, has every route mode reach owners only through
 * entries of their catalogs, and accounts for every production file that calls
 * a physical publication primitive.
 *
 * Engineering policy, not a specification: the allocation is maintainer
 * navigation for removing repeated in-invocation work and has no standing
 * outside the repository. Canonical specifications keep authority for each
 * behavior an entry cites, and an entry's tests are its evidence.
 *
 * The publication check is a structural inventory. A static TypeScript scan of
 * production sources (tests, specifications, testing entries, test support and
 * generated files excluded) finds calls to the atomic and identity-preserving
 * writers and to write-like members of the Effect FileSystem and `node:fs`,
 * including such members passed as call arguments. It keeps the allocation
 * honest about where publication happens; it is not evidence of behavior. It
 * matches member names, not types, so it flags same-named members of other
 * objects (allocated as exclusions) and cannot see publication through a
 * renamed alias, a destructured member, computed access, or a child process.
 */

const registered = registeredCommandCapabilities(rootCommand);
const declaredRoutes = new Map<string, DeclaredRoute>(
  registered.flatMap((entry) =>
    entry.capabilities === undefined
      ? []
      : [
          [
            entry.path.join(" "),
            {
              preview: entry.capabilities.preview,
              effect: entry.capabilities.effect,
              modes: entry.capabilities.modes ?? [],
            },
          ] as const,
        ],
  ),
);
const publicationSites = scanPublicationSites();
const canonicalRequirement = makeCanonicalRequirementValidator();
const requirementProblem = (identity: string): string | undefined => {
  try {
    canonicalRequirement(identity);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
const facts: PreparedInputFacts = {
  routes: declaredRoutes,
  publicationFiles: new Set(publicationSites.keys()),
  fileExists: repositoryFileExists,
  requirementProblem,
};
const allocationFindings = readPreparedInputAllocation().pipe(
  Effect.map(({ text, allocation }) => preparedInputFindings(allocation, text, facts)),
);

describe("Prepared-input allocation", () => {
  it("reconciles against a fully declared command tree and a non-trivial publication scan", () => {
    expect(
      registered.filter((entry) => entry.capabilities === undefined).map((entry) => entry.path),
    ).toEqual([]);
    expect(declaredRoutes.size).toBeGreaterThan(100);
    expect(
      publicationSites.get("packages/generic/host-primitives/src/atomic-write.ts"),
    ).toBeDefined();
    expect(publicationSites.size).toBeGreaterThan(50);
  });

  it.effect("describes exactly the closed read purposes and uses every mode vocabulary entry", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.vocabulary).toEqual([])),
  );

  it.effect("allocates exactly the registered command routes", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.routes).toEqual([])),
  );

  it.effect("allocates exactly the modes each route declares", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.modes).toEqual([])),
  );

  it.effect("reaches each declared owner once per mode and every declared owner somewhere", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.owners).toEqual([])),
  );

  it.effect("backs every catalog entry with the evidence its kind requires and uses it", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.dispositions).toEqual([])),
  );

  it.effect("cites existing repository files and canonical requirements", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.references).toEqual([])),
  );

  it.effect("reaches an owner in every mode that changes persistent state", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.effects).toEqual([])),
  );

  it.effect("resolves every equivalent route to an allocated implementation", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.equivalences).toEqual([])),
  );

  it.effect("accounts for every publication site the structural scan finds, and no other", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.publication).toEqual([])),
  );

  it.effect("carries no private coordination context", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.privateContext).toEqual([])),
  );

  it.effect("names benchmark scenarios by scenario id", () =>
    Effect.map(allocationFindings, (findings) => expect(findings.benchmarks).toEqual([])),
  );
});

/**
 * Rules the real allocation cannot exercise while it is consistent: each
 * fixture defect must be reported under its own rule, and a catalog entry's
 * defects once however many reaches use it.
 */
describe("Prepared-input allocation rules", () => {
  const readPurposes = {
    preparation: "p",
    preservation: "p",
    "fresh-conflict-or-route-check": "p",
    "rollback-snapshot": "p",
    "integrity-validation": "p",
    "post-write-verification": "p",
    other: "p",
  };
  const owner = {
    resource: "A file.",
    publication: "Atomic replacement.",
    sources: ["apps/writer.ts"],
    publicationSites: ["apps/writer.ts"],
    requirements: [],
    reads: [],
    existingSharing: "Nothing.",
    preparedInputs: "none",
    freshChecks: ["Reads under the lock."],
    lifetime: "Released with the operation.",
    dispositions: {},
  };
  const catalog: PreparedInputAllocation["owners"][string]["dispositions"] = {
    "read-once": { disposition: "changed", basis: "Read once.", evidence: {} },
    "fresh-read": {
      disposition: "required-distinct-obligation",
      basis: "Fresh read.",
      obligation: "preparation",
      evidence: {},
    },
    shared: {
      disposition: "already-shared",
      basis: " ",
      obligation: "other",
      evidence: { tests: ["apps/writer.test.ts"] },
    },
    "nothing-repeated": { disposition: "not-applicable", basis: "No repeat.", evidence: {} },
    "nothing-cached": { disposition: "not-applicable", basis: "No cache.", evidence: {} },
    Unused_Key: {
      disposition: "changed",
      basis: "Never reached.",
      evidence: { tests: ["apps/writer.test.ts"] },
    },
    question: {
      disposition: "required-distinct-obligation",
      basis: "Snapshot.",
      obligation: "rollback-snapshot",
      openQuestion: "One?\nTwo?",
      evidence: { requirements: ["bad/id"] },
    },
    cited: {
      disposition: "changed",
      basis: "Cited.",
      evidence: { tests: ["apps/missing.test.ts"] },
    },
  };
  const fixture: PreparedInputAllocation = {
    formatVersion: 1,
    readPurposes,
    modeVocabulary: { "scope-user": "User scope." },
    owners: {
      writer: { ...owner, dispositions: catalog },
      orphan: { ...owner, publicationSites: [] },
    },
    invocationOwners: [
      { owner: "writer", dispositions: ["read-once"] },
      { owner: "writer", dispositions: ["fresh-read"] },
      { owner: "phantom", dispositions: ["read-once"] },
    ],
    routes: {
      "": {
        modes: {
          default: { notApplicable: "Help only.", evidence: { sources: ["apps/root.ts"] } },
        },
      },
      write: {
        modes: {
          default: {
            owners: [
              {
                owner: "writer",
                dispositions: ["read-once", "fresh-read", "read-once"],
                benchmark: ["Bad Scenario", "typed/write"],
              },
              { owner: "ghost", dispositions: ["read-once"] },
              { owner: "writer", dispositions: ["cited"] },
            ],
          },
        },
      },
      edit: {
        modes: {
          default: { owners: [{ owner: "writer", dispositions: [] }] },
          force: {
            owners: [
              {
                owner: "writer",
                dispositions: [
                  "nothing-repeated",
                  "read-once",
                  "shared",
                  "question",
                  "cited",
                  "typo",
                  "nothing-cached",
                ],
              },
            ],
          },
        },
      },
      list: { modes: { default: { owners: [] } } },
      view: {
        modes: {
          default: {
            owners: [{ owner: "writer", dispositions: ["nothing-repeated", "nothing-cached"] }],
          },
        },
      },
      quiet: {
        modes: { default: { notApplicable: "Nothing.", evidence: { sources: ["apps/root.ts"] } } },
      },
      alias: { sameAs: "other", via: ["apps/missing.ts"] },
      stale: {
        modes: { default: { notApplicable: "Gone.", evidence: { sources: ["apps/root.ts"] } } },
      },
    },
    exclusions: {},
  };
  const missing = new Set(["apps/missing.ts", "apps/missing.test.ts"]);
  const fixtureFacts: PreparedInputFacts = {
    routes: new Map<string, DeclaredRoute>([
      ["", { preview: false, effect: "none", modes: [] }],
      ["write", { preview: true, effect: "workspace", modes: [] }],
      [
        "edit",
        { preview: false, effect: "workspace", modes: [{ flag: "--force", effect: "workspace" }] },
      ],
      ["list", { preview: false, effect: "none", modes: [] }],
      ["view", { preview: false, effect: "none", modes: [] }],
      ["quiet", { preview: false, effect: "workspace", modes: [] }],
      ["alias", { preview: false, effect: "none", modes: [] }],
      ["fresh", { preview: false, effect: "none", modes: [] }],
    ]),
    publicationFiles: new Set(["apps/writer.ts", "apps/unowned.ts"]),
    fileExists: (relativePath) => !missing.has(relativePath),
    requirementProblem: (identity) =>
      identity === "bad/id" ? "bad/id is not canonical" : undefined,
  };
  const tracker = `${["A", "XM"].join("")}-1`;
  const reported = preparedInputFindings(fixture, `{"note": "${tracker}"}`, fixtureFacts);

  it("reports route, mode, vocabulary, effect and equivalence defects", () => {
    expect(reported.routes).toEqual([
      "axm fresh: registered but not allocated",
      "axm stale: allocated but not registered",
    ]);
    expect(reported.modes).toEqual(["axm write: missing mode preview"]);
    expect(reported.vocabulary).toEqual(["modeVocabulary scope-user: never used"]);
    expect(reported.effects).toEqual([
      "axm quiet [default]: declares effect workspace but is wholly notApplicable",
    ]);
    expect(reported.equivalences).toEqual(["axm alias: sameAs axm other is not allocated"]);
  });

  it("reports unknown owners, owners reached twice in one mode or invocation, and unreached owners", () => {
    expect(reported.owners).toEqual([
      "axm write [default]: lists owner writer more than once",
      "axm write [default]: unknown owner ghost",
      "invocation: lists owner writer more than once",
      "invocation: unknown owner phantom",
      "owner orphan: no route mode or invocation reaches it",
    ]);
  });

  it("reports each reach's missing, repeated or unknown dispositions and not-applicable mixed with another kind, then each catalog entry's defects once", () => {
    expect(reported.dispositions).toEqual([
      "axm write [default] writer: lists disposition read-once more than once",
      "axm edit [default] writer: lists no disposition",
      "axm edit [force] writer: disposition typo is not in its owner's catalog",
      "axm edit [force] writer: combines not-applicable dispositions with dispositions of another kind",
      "axm list [default]: lists no owner",
      "owner writer disposition read-once: changed names no test or specification",
      "owner writer disposition fresh-read: required-distinct-obligation names no obligation other than preparation",
      "owner writer disposition fresh-read: required-distinct-obligation cites no requirement and no open question",
      "owner writer disposition shared: basis is empty",
      "owner writer disposition shared: only required-distinct-obligation names an obligation or open question",
      "owner writer disposition shared: already-shared needs at least one source and one test or specification",
      "owner writer disposition Unused_Key: not a kebab-case key",
      "owner writer disposition Unused_Key: no route mode or invocation uses it",
      "owner writer disposition question: openQuestion is not one sentence",
    ]);
  });

  it("reports catalog entry and via references once each, and malformed benchmark scenario ids", () => {
    expect(reported.references).toEqual([
      "axm alias via: apps/missing.ts does not exist",
      "owner writer disposition question: bad/id is not canonical",
      "owner writer disposition cited test: apps/missing.test.ts does not exist",
    ]);
    expect(reported.benchmarks).toEqual([
      'axm write [default] writer: "Bad Scenario" is not a scenario id',
    ]);
  });

  it("reports publication sites the allocation misses and private context", () => {
    expect(reported.publication).toEqual([
      "apps/unowned.ts: publishes but no owner or exclusion accounts for it",
    ]);
    expect(reported.privateContext).toEqual(["line 1: private coordination context"]);
  });

  it.effect(
    "cannot decode an undecided disposition, an unknown field or an unknown read purpose",
    () =>
      Effect.gen(function* () {
        const deferred = {
          ...fixture,
          owners: {
            ...fixture.owners,
            writer: {
              ...owner,
              dispositions: {
                ...catalog,
                later: { disposition: "deferred", basis: "Later.", evidence: {} },
              },
            },
          },
        };
        const extra = { ...fixture, revision: "main" };
        const unknownPurpose = { ...fixture, readPurposes: { ...readPurposes, guess: "p" } };
        expect((yield* Effect.exit(decodePreparedInputAllocation(deferred)))._tag).toBe("Failure");
        expect((yield* Effect.exit(decodePreparedInputAllocation(extra)))._tag).toBe("Failure");
        expect((yield* Effect.exit(decodePreparedInputAllocation(unknownPurpose)))._tag).toBe(
          "Failure",
        );
        expect((yield* Effect.exit(decodePreparedInputAllocation(fixture)))._tag).toBe("Success");
      }),
  );
});
