import { createRequire } from "node:module";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { LOCKFILE_VERSION, LockfileSchema } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "settings-contract/published-lockfile-schema-agrees-with-accepted-input",
  title: "The published lockfile schema describes what the product accepts",
  statement:
    "The published lockfile schema shall admit exactly the lockfile version and required fields the product accepts, and a lockfile at any other version or missing a required field shall be refused.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "trustworthy-distribution"],
  methods: ["contract", "example"],
  derivedFrom: ["settings-contract/published-schemas-agree-with-accepted-input"],
  supersedes: ["settings-contract/published-schemas-agree-with-accepted-input"],
  assumptions: [
    "The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.",
  ],
  openQuestions: [],
});

const requireFromSpec = createRequire(import.meta.url);
const decodeJsonRecord = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));
const decodeNumberArray = Schema.decodeUnknownSync(Schema.Array(Schema.Number));
const decodeStringArray = Schema.decodeUnknownSync(Schema.Array(Schema.String));

// The generated schema document is published package content, reachable
// through the public site-content export.
const publishedLockfileSchema = (): Record<string, unknown> => {
  const loaded: unknown = requireFromSpec(
    "axm.sh/unstable/site-content/schemas/axm-lock.schema.json",
  );
  return decodeJsonRecord(loaded);
};

const child = (parent: Record<string, unknown>, key: string): Record<string, unknown> =>
  decodeJsonRecord(parent[key]);

/** Follows the document's root reference so the published structure leads. */
const lockfileDefinition = (document: Record<string, unknown>): Record<string, unknown> => {
  const prefix = "#/definitions/";
  const reference = document["$ref"];
  if (typeof reference !== "string" || !reference.startsWith(prefix)) {
    throw new Error(`Expected a definition reference, got ${JSON.stringify(reference)}`);
  }
  return child(child(document, "definitions"), reference.slice(prefix.length));
};

const admittedVersions = (document: Record<string, unknown>): ReadonlyArray<number> =>
  decodeNumberArray(
    child(child(lockfileDefinition(document), "properties"), "lockfileVersion")["enum"],
  );

const requiredFields = (document: Record<string, unknown>): ReadonlyArray<string> =>
  decodeStringArray(lockfileDefinition(document)["required"]);

/** A value the product accepts for each field the published document may require. */
const minimalValueFor = (field: string, version: number): unknown => {
  switch (field) {
    case "lockfileVersion":
      return version;
    case "skills":
      return {};
    default:
      throw new Error(
        `The published schema requires \`${field}\`, which this specification cannot supply.`,
      );
  }
};

const minimalLockfile = (
  document: Record<string, unknown>,
  version: number,
): Record<string, unknown> =>
  Object.fromEntries(
    requiredFields(document).map((field) => [field, minimalValueFor(field, version)]),
  );

const decodeLockfile = Schema.decodeUnknownEffect(LockfileSchema);

describe("Published lockfile schema", () => {
  it.effect(
    "the one lockfile version the published schema admits is the version the product accepts",
    () =>
      Effect.gen(function* () {
        const document = publishedLockfileSchema();
        const versions = admittedVersions(document);
        expect(versions).toEqual([LOCKFILE_VERSION]);
        const [version] = versions;
        if (version === undefined) {
          throw new Error("The published schema admits no lockfile version.");
        }
        yield* decodeLockfile(minimalLockfile(document, version));
      }),
  );

  it.effect("a lockfile at any version other than the published one is refused", () =>
    Effect.gen(function* () {
      const document = publishedLockfileSchema();
      const [version] = admittedVersions(document);
      if (version === undefined) {
        throw new Error("The published schema admits no lockfile version.");
      }
      for (const other of [version - 1, version + 1]) {
        yield* decodeLockfile({
          ...minimalLockfile(document, version),
          lockfileVersion: other,
        }).pipe(Effect.flip);
      }
    }),
  );

  it.effect(
    "the fields the published schema requires are exactly those the product refuses to go without",
    () =>
      Effect.gen(function* () {
        const document = publishedLockfileSchema();
        const [version] = admittedVersions(document);
        if (version === undefined) {
          throw new Error("The published schema admits no lockfile version.");
        }
        const minimal = minimalLockfile(document, version);
        expect(Object.keys(minimal).length).toBeGreaterThan(0);
        yield* decodeLockfile(minimal);

        for (const field of requiredFields(document)) {
          const withoutField = Object.fromEntries(
            Object.entries(minimal).filter(([key]) => key !== field),
          );
          yield* decodeLockfile(withoutField).pipe(Effect.flip);
        }
      }),
  );
});
