import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeCliError, type CliError } from "../cli-error/index.js";
import { ExactSemverVersionSchema } from "./schema.js";

const decodeExactSemverVersion = Schema.decodeUnknown(ExactSemverVersionSchema);

const makeResolvedVersionError = (field: string, value: string, cause: unknown): CliError =>
  makeCliError({
    code: "LOCKFILE_RESOLVED_VERSION_INVALID",
    what: "Lockfile resolved versions must be exact semver values",
    details: [
      `Field: ${field}`,
      `Received: ${value}`,
      "Resolved lockfile versions must be exact (for example, 1.2.3), not ranges.",
    ],
    howToFix:
      "Resolve the constraint first, then persist the exact resolved version (for example, 1.2.3 instead of ^1.2.3).",
    cause,
  });

export const validateExactResolvedVersion = (field: string, value: string) =>
  decodeExactSemverVersion(value).pipe(
    Effect.asVoid,
    Effect.mapError((cause) => makeResolvedVersionError(field, value, cause)),
  );

export const validateExactResolvedVersionMap = (
  field: string,
  resolvedMap: Readonly<Record<string, string>>,
) =>
  Effect.forEach(
    Object.entries(resolvedMap),
    ([fqn, value]) => validateExactResolvedVersion(`${field}.${fqn}`, value),
    { concurrency: "unbounded" },
  ).pipe(Effect.asVoid);
