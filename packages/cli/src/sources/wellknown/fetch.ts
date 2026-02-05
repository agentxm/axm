/**
 * Well-known skill file fetching.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as HttpClient from "@effect/platform/HttpClient";
import type * as HttpClientError from "@effect/platform/HttpClientError";
import { FileSystem } from "@effect/platform/FileSystem";
import * as Array from "effect/Array";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import { type WellKnownError, WellKnownFetchError, WellKnownNotFoundError } from "./errors.js";
import { normalizeBaseUrl, type DiscoveredSkill } from "./discovery.js";
import type { WellKnownSkill } from "./types.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const WELL_KNOWN_PATH = "/.well-known/skills";

/**
 * Retry policy with exponential backoff for transient network errors.
 */
const retryPolicy = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.whileInput((error: WellKnownError) => {
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
    const retryable = status >= 500;
    return new WellKnownFetchError({
      message: `HTTP ${status} error fetching ${url}`,
      url,
      cause: error,
      retryable,
    });
  }
  return new WellKnownFetchError({
    message: `Network error fetching ${url}: ${error.message}`,
    url,
    cause: error,
    retryable: true,
  });
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

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
): Effect.Effect<DiscoveredSkill, WellKnownError, HttpClient.HttpClient | FileSystem> =>
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
