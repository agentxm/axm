/**
 * Well-known skills discovery per RFC 8615.
 *
 * This module provides functionality to discover and fetch skills from
 * HTTP(S) hosts using the well-known URI pattern:
 * `{baseUrl}/.well-known/skills/index.json`
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as HttpClient from "@effect/platform/HttpClient";
import type * as HttpClientError from "@effect/platform/HttpClientError";
import { FileSystem } from "@effect/platform/FileSystem";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import type { Skill, WellKnownIndex, WellKnownSkill } from "./types.js";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Base error class for well-known discovery errors.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WellKnownError =
  | WellKnownFetchError
  | WellKnownNotFoundError
  | WellKnownInvalidIndexError;

/**
 * Network error during well-known discovery.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WellKnownFetchError extends Data.TaggedError("WellKnownFetchError")<{
  readonly message: string;
  readonly url: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

/**
 * Well-known endpoint not found (404).
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WellKnownNotFoundError extends Data.TaggedError("WellKnownNotFoundError")<{
  readonly message: string;
  readonly url: string;
}> {}

/**
 * Malformed or invalid index JSON.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WellKnownInvalidIndexError extends Data.TaggedError("WellKnownInvalidIndexError")<{
  readonly message: string;
  readonly url: string;
  readonly cause?: unknown;
}> {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const WELL_KNOWN_PATH = "/.well-known/skills";
const INDEX_FILE = "index.json";

/**
 * Hosts that should NOT use well-known discovery.
 * These hosts have their own handling via git clone.
 */
const EXCLUDED_HOSTS = ["github.com", "www.github.com", "gitlab.com", "www.gitlab.com"];

/**
 * Retry policy with exponential backoff for transient network errors.
 * Retries up to 3 times with exponential delay starting at 1 second.
 * Only retries errors marked as retryable (network errors, 5xx responses).
 */
const retryPolicy = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.whileInput((error: WellKnownError) => {
    // Only WellKnownFetchError has the retryable field
    if (error._tag === "WellKnownFetchError") {
      return error.retryable;
    }
    return false;
  }),
);

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

/**
 * Checks if a URL host is excluded from well-known discovery.
 */
const isExcludedHost = (baseUrl: string): boolean => {
  try {
    const url = new URL(baseUrl);
    return EXCLUDED_HOSTS.includes(url.host.toLowerCase());
  } catch {
    return false;
  }
};

/**
 * Normalizes the base URL by removing trailing slashes.
 */
const normalizeBaseUrl = (baseUrl: string): string => {
  return baseUrl.replace(/\/+$/, "");
};

/**
 * Maps HTTP client errors to well-known errors.
 */
const mapHttpError = (url: string, error: HttpClientError.HttpClientError): WellKnownError => {
  if (error._tag === "ResponseError") {
    const status = error.response.status;
    if (status === 404) {
      return new WellKnownNotFoundError({
        message: `Well-known skills endpoint not found at ${url}`,
        url,
      });
    }
    // 5xx errors are retryable
    const retryable = status >= 500;
    return new WellKnownFetchError({
      message: `HTTP ${status} error fetching ${url}`,
      url,
      cause: error,
      retryable,
    });
  }
  // Network errors are generally retryable
  return new WellKnownFetchError({
    message: `Network error fetching ${url}: ${error.message}`,
    url,
    cause: error,
    retryable: true,
  });
};

/**
 * Validates that the parsed JSON matches the WellKnownIndex structure.
 */
const validateIndex = (
  url: string,
  data: unknown,
): Effect.Effect<WellKnownIndex, WellKnownInvalidIndexError> =>
  Effect.gen(function* () {
    if (typeof data !== "object" || data === null) {
      return yield* new WellKnownInvalidIndexError({
        message: "Index must be an object",
        url,
      });
    }

    const obj = data as { skills?: unknown };
    const skills = obj.skills;

    if (!Array.isArray(skills)) {
      return yield* new WellKnownInvalidIndexError({
        message: "Index must have a 'skills' array",
        url,
      });
    }

    // Validate each skill in the array
    yield* Effect.forEach(
      skills.map((skill, i) => [skill, i] as const),
      ([skill, i]) =>
        Effect.gen(function* () {
          const typedSkill = skill as {
            name?: unknown;
            description?: unknown;
            files?: unknown;
          } | null;

          if (typeof typedSkill !== "object" || typedSkill === null) {
            return yield* new WellKnownInvalidIndexError({
              message: `Skill at index ${i} must be an object`,
              url,
            });
          }

          const skillName = typedSkill.name;
          const skillDescription = typedSkill.description;
          const skillFiles = typedSkill.files;

          if (typeof skillName !== "string" || skillName.trim() === "") {
            return yield* new WellKnownInvalidIndexError({
              message: `Skill at index ${i} must have a non-empty 'name' string`,
              url,
            });
          }

          if (typeof skillDescription !== "string") {
            return yield* new WellKnownInvalidIndexError({
              message: `Skill at index ${i} must have a 'description' string`,
              url,
            });
          }

          if (!Array.isArray(skillFiles)) {
            return yield* new WellKnownInvalidIndexError({
              message: `Skill at index ${i} must have a 'files' array`,
              url,
            });
          }

          // Validate each file in the skill
          yield* Effect.forEach(
            skillFiles.map((file, j) => [file, j] as const),
            ([file, j]) => {
              if (typeof file !== "string") {
                return new WellKnownInvalidIndexError({
                  message: `File at index ${j} in skill '${skillName}' must be a string`,
                  url,
                });
              }
              return Effect.void;
            },
            { discard: true },
          );
        }),
      { concurrency: "unbounded", discard: true },
    );

    return data as WellKnownIndex;
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Checks if a base URL is valid for well-known discovery.
 *
 * GitHub and GitLab hosts are excluded as they have their own handling via git clone.
 *
 * @param baseUrl - The base URL to check
 * @returns true if the URL can use well-known discovery, false otherwise
 *
 * @experimental This API is unstable and may change without notice.
 */
export const isWellKnownEligible = (baseUrl: string): boolean => {
  return !isExcludedHost(baseUrl);
};

/**
 * Fetches the well-known skills index from a host.
 *
 * @param baseUrl - The base URL of the host (e.g., "https://example.com")
 * @returns The parsed WellKnownIndex
 *
 * @experimental This API is unstable and may change without notice.
 */
export const fetchWellKnownIndex = (
  baseUrl: string,
): Effect.Effect<WellKnownIndex, WellKnownError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const normalizedUrl = normalizeBaseUrl(baseUrl);
    const indexUrl = `${normalizedUrl}${WELL_KNOWN_PATH}/${INDEX_FILE}`;

    const client = yield* HttpClient.HttpClient;

    const response = yield* pipe(
      client.get(indexUrl),
      Effect.mapError((error) => mapHttpError(indexUrl, error)),
      Effect.retry(retryPolicy),
    );

    const json = yield* pipe(
      response.json,
      Effect.mapError(
        (error) =>
          new WellKnownInvalidIndexError({
            message: `Failed to parse JSON from ${indexUrl}: ${error}`,
            url: indexUrl,
            cause: error,
          }),
      ),
    );

    const index = yield* validateIndex(indexUrl, json);

    return index;
  });

/**
 * Fetches all files for a well-known skill and saves them to the destination directory.
 *
 * @param baseUrl - The base URL of the host
 * @param skill - The WellKnownSkill with files to fetch
 * @param destination - The directory to save files to
 * @returns The Skill object with the path to the SKILL.md file
 *
 * @experimental This API is unstable and may change without notice.
 */
export const fetchSkillFiles = (
  baseUrl: string,
  skill: WellKnownSkill,
  destination: string,
): Effect.Effect<Skill, WellKnownError, HttpClient.HttpClient | FileSystem> =>
  Effect.gen(function* () {
    const normalizedUrl = normalizeBaseUrl(baseUrl);
    const client = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem;

    // Ensure destination directory exists
    yield* pipe(
      fs.makeDirectory(destination, { recursive: true }),
      Effect.mapError(
        (error) =>
          new WellKnownFetchError({
            message: `Failed to create directory ${destination}: ${error}`,
            url: normalizedUrl,
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Fetch each file listed in the skill
    for (const file of skill.files) {
      const fileUrl = `${normalizedUrl}${WELL_KNOWN_PATH}/${skill.name}/${file}`;

      const response = yield* pipe(
        client.get(fileUrl),
        Effect.mapError((error) => mapHttpError(fileUrl, error)),
        Effect.retry(retryPolicy),
      );

      const content = yield* pipe(
        response.text,
        Effect.mapError(
          (error) =>
            new WellKnownFetchError({
              message: `Failed to read content from ${fileUrl}: ${error}`,
              url: fileUrl,
              cause: error,
              retryable: false,
            }),
        ),
      );

      // Determine the file path within the destination
      const filePath = `${destination}/${file}`;

      // Create parent directories if needed (for nested files like "references/commands.md")
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
      if (parentDir !== destination) {
        yield* pipe(
          fs.makeDirectory(parentDir, { recursive: true }),
          Effect.mapError(
            (error) =>
              new WellKnownFetchError({
                message: `Failed to create directory ${parentDir}: ${error}`,
                url: fileUrl,
                cause: error,
                retryable: false,
              }),
          ),
        );
      }

      // Write the file content
      yield* pipe(
        fs.writeFileString(filePath, content),
        Effect.mapError(
          (error) =>
            new WellKnownFetchError({
              message: `Failed to write file ${filePath}: ${error}`,
              url: fileUrl,
              cause: error,
              retryable: false,
            }),
        ),
      );
    }

    // Find the SKILL.md path (it should be in the files list)
    const skillMdPath = pipe(
      Array.findFirst(
        skill.files,
        (f) => f.toLowerCase() === "skill.md" || f.endsWith("/SKILL.md"),
      ),
      Option.match({
        onNone: () => `${destination}/SKILL.md`,
        onSome: (file) => `${destination}/${file}`,
      }),
    );

    return {
      name: skill.name,
      path: skillMdPath,
      description: Option.some(skill.description),
    };
  });

/**
 * Discovers available skills from a well-known endpoint.
 *
 * This fetches the index and returns the array of available skills
 * without downloading the actual skill files.
 *
 * @param baseUrl - The base URL of the host
 * @returns Array of available skills
 *
 * @experimental This API is unstable and may change without notice.
 */
export const discoverWellKnownSkills = (
  baseUrl: string,
): Effect.Effect<Skill[], WellKnownError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const index = yield* fetchWellKnownIndex(baseUrl);

    // Map WellKnownSkill to Skill (without downloading files)
    // The path will be the expected location when fetched
    const normalizedUrl = normalizeBaseUrl(baseUrl);

    return index.skills.map((wkSkill) => ({
      name: wkSkill.name,
      path: `${normalizedUrl}${WELL_KNOWN_PATH}/${wkSkill.name}/SKILL.md`,
      description: Option.some(wkSkill.description),
    }));
  });
