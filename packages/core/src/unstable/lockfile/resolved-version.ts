import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../app-error/index.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";
import type { ResolvedExtensionMap } from "./schema.js";

const decodeVersion = Schema.decodeUnknownEffect(VersionSchema);

const makeResolvedVersionError = (field: string, value: string, cause: unknown): AppError =>
  makeAppError({
    code: "validation",
    detail: "Lockfile resolved versions must be exact semver values",
    breadcrumbs: [
      {
        description:
          "Resolve the constraint first, then persist the exact resolved version (for example, 1.2.3 instead of ^1.2.3).",
      },
    ],
    cause,
  });

export const validateExactResolvedVersion = (field: string, value: string) =>
  decodeVersion(value).pipe(
    Effect.asVoid,
    Effect.mapError((cause) => makeResolvedVersionError(field, value, cause)),
  );

export const validateExactResolvedVersionMap = (field: string, resolvedMap: ResolvedExtensionMap) =>
  Effect.forEach(
    Object.entries(resolvedMap),
    ([fqn, value]) => validateExactResolvedVersion(`${field}.${fqn}`, value),
    { concurrency: "unbounded" },
  ).pipe(Effect.asVoid);
