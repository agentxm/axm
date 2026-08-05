/**
 * Shared helper for parsing provider shorthand patterns.
 *
 * Parses the `owner/repo[//subpath][@ref]` portion (after stripping the prefix)
 * into constituent parts.
 *
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { makeAppError, type AppError } from "../../app-error/index.js";
import {
  GitHostedSourceParamPartsSchema,
  type GitHostedSourceParamParts,
} from "../../sources/types.js";

const decodeGitHostedSourceParamParts = Schema.decodeUnknownResult(GitHostedSourceParamPartsSchema);

type ParsedProviderShorthand = {
  readonly owner: string;
  readonly repo: string;
  readonly subPath?: string;
  readonly ref?: string;
};

const parseRef = (input: string) => {
  const refIndex = input.lastIndexOf("@");
  if (refIndex <= 0) {
    return { coordinate: input };
  }

  const ref = input.slice(refIndex + 1);
  if (ref.length === 0) {
    return { coordinate: input };
  }

  const subPathMarker = input.indexOf("//");
  const isAtPathSegment =
    subPathMarker !== -1 &&
    refIndex > subPathMarker + 1 &&
    input[refIndex - 1] === "/" &&
    ref.includes("/");
  if (isAtPathSegment) {
    return { coordinate: input };
  }

  return { coordinate: input.slice(0, refIndex), ref };
};

const parseCoordinate = (input: string): ParsedProviderShorthand | undefined => {
  const { coordinate, ref } = parseRef(input);
  const subPathMarker = coordinate.indexOf("//");
  const repoCoordinate = subPathMarker === -1 ? coordinate : coordinate.slice(0, subPathMarker);
  const subPath = subPathMarker === -1 ? undefined : coordinate.slice(subPathMarker + 2);
  const segments = repoCoordinate.split("/");
  const repo = segments.at(-1);
  const ownerSegments = segments.slice(0, -1);

  if (repo === undefined || repo.length === 0 || ownerSegments.length === 0) {
    return undefined;
  }

  const owner = ownerSegments.join("/");

  return {
    owner,
    repo,
    ...(subPath === undefined ? {} : { subPath }),
    ...(ref === undefined ? {} : { ref }),
  };
};

/**
 * Parse the body of a provider shorthand (the part after the `prefix:` prefix).
 *
 * Returns `{ owner, repo, subPath?, ref? }` or fails with AppError.
 */
export const parseProviderShorthand = (
  input: string,
  original: string,
): Effect.Effect<GitHostedSourceParamParts, AppError> =>
  Effect.gen(function* () {
    const parsed = parseCoordinate(input);
    if (parsed === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid provider shorthand "${original}": expected owner/repo[//subpath][@ref]`,
      });
    }

    const decoded = decodeGitHostedSourceParamParts(parsed);

    if (Result.isFailure(decoded)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid provider shorthand "${original}": subpaths cannot traverse outside the repository, and shorthand refs cannot contain "/"`,
        cause: decoded.failure,
      });
    }

    return decoded.success;
  });
