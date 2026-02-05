/**
 * Unit tests for well-known module.
 *
 * Tests well-known skills discovery per RFC 8615.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientError from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/TestClock";
import { afterEach, beforeEach } from "vitest";
import type { WellKnownIndex } from "./types.js";
import {
  discoverWellKnownSkills,
  fetchSkillFiles,
  fetchWellKnownIndex,
  isWellKnownEligible,
  WellKnownFetchError,
  WellKnownInvalidIndexError,
  WellKnownNotFoundError,
} from "./wellknown.js";

describe("wellknown", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wellknown-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Creates a mock Fetch layer that returns the specified response.
   */
  const createMockFetchLayer = (handler: (url: string) => Promise<Response>) => {
    const mockFetch = (input: string | Request | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return handler(url);
    };
    // Add preconnect as a no-op to satisfy the typeof fetch interface
    (mockFetch as typeof fetch).preconnect = () => {};
    return Layer.succeed(FetchHttpClient.Fetch, mockFetch as typeof fetch);
  };

  /**
   * Creates a mock HTTP layer from the Fetch mock, with filterStatusOk applied.
   */
  const createMockHttpLayer = (handler: (url: string) => Promise<Response>) =>
    FetchHttpClient.layer.pipe(Layer.provide(createMockFetchLayer(handler)));

  /**
   * Creates an HTTP layer that returns a JSON response.
   */
  const createJsonResponseLayer = (data: unknown) =>
    createMockHttpLayer(() =>
      Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

  /**
   * Creates an HTTP layer that simulates a 404 error by having the HttpClient
   * itself return a ResponseError.
   */
  const create404ErrorLayer = () =>
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((req) =>
        Effect.gen(function* () {
          const response = HttpClientResponse.fromWeb(
            HttpClientRequest.get(req.url),
            new Response("Not Found", { status: 404 }),
          );
          return yield* new HttpClientError.ResponseError({
            request: req,
            response,
            reason: "StatusCode",
          });
        }),
      ),
    );

  /**
   * Creates an HTTP layer that simulates a 500 error by having the HttpClient
   * itself return a ResponseError.
   */
  const create500ErrorLayer = () =>
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((req) =>
        Effect.gen(function* () {
          const response = HttpClientResponse.fromWeb(
            HttpClientRequest.get(req.url),
            new Response("Internal Server Error", { status: 500 }),
          );
          return yield* new HttpClientError.ResponseError({
            request: req,
            response,
            reason: "StatusCode",
          });
        }),
      ),
    );

  /**
   * Creates an HTTP layer that simulates a 400 error.
   */
  const create400ErrorLayer = () =>
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((req) =>
        Effect.gen(function* () {
          const response = HttpClientResponse.fromWeb(
            HttpClientRequest.get(req.url),
            new Response("Bad Request", { status: 400 }),
          );
          return yield* new HttpClientError.ResponseError({
            request: req,
            response,
            reason: "StatusCode",
          });
        }),
      ),
    );

  describe("isWellKnownEligible", () => {
    it("returns true for normal URLs", () => {
      expect(isWellKnownEligible("https://example.com")).toBe(true);
      expect(isWellKnownEligible("https://skills.mycompany.com")).toBe(true);
      expect(isWellKnownEligible("http://localhost:3000")).toBe(true);
    });

    it("returns false for GitHub URLs", () => {
      expect(isWellKnownEligible("https://github.com")).toBe(false);
      expect(isWellKnownEligible("https://github.com/owner/repo")).toBe(false);
      expect(isWellKnownEligible("https://www.github.com")).toBe(false);
    });

    it("returns false for GitLab URLs", () => {
      expect(isWellKnownEligible("https://gitlab.com")).toBe(false);
      expect(isWellKnownEligible("https://gitlab.com/owner/repo")).toBe(false);
      expect(isWellKnownEligible("https://www.gitlab.com")).toBe(false);
    });

    it("returns true for invalid URLs (they are not GitHub/GitLab)", () => {
      // Invalid URLs return true because they don't match any excluded host
      // The URL validation will fail later when actually fetching
      expect(isWellKnownEligible("not-a-url")).toBe(true);
      expect(isWellKnownEligible("")).toBe(true);
    });

    it("is case-insensitive for host matching", () => {
      expect(isWellKnownEligible("https://GITHUB.COM")).toBe(false);
      expect(isWellKnownEligible("https://GitHub.com")).toBe(false);
      expect(isWellKnownEligible("https://GITLAB.COM")).toBe(false);
    });
  });

  describe("fetchWellKnownIndex", () => {
    it.effect("fetches and parses valid index JSON", () => {
      const validIndex: WellKnownIndex = {
        skills: [
          {
            name: "commit",
            description: "Create commits",
            files: ["SKILL.md"],
          },
        ],
      };

      return Effect.gen(function* () {
        const result = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        );

        expect(result.skills).toHaveLength(1);
        expect(result.skills[0]?.name).toBe("commit");
        expect(result.skills[0]?.description).toBe("Create commits");
        expect(result.skills[0]?.files).toEqual(["SKILL.md"]);
      });
    });

    it.effect("strips trailing slashes from base URL", () => {
      let capturedUrl = "";
      const layer = createMockHttpLayer((url) => {
        capturedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({ skills: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      return Effect.gen(function* () {
        yield* fetchWellKnownIndex("https://example.com///").pipe(Effect.provide(layer));

        expect(capturedUrl).toBe("https://example.com/.well-known/skills/index.json");
      });
    });

    it.effect("returns WellKnownNotFoundError for 404 response", () =>
      Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(create404ErrorLayer()),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownNotFoundError);
        expect(error._tag).toBe("WellKnownNotFoundError");
        expect(error.url).toContain("example.com");
      }),
    );

    it.effect("returns WellKnownFetchError with retryable=true for 500 response", () =>
      Effect.gen(function* () {
        const fiber = yield* Effect.fork(
          fetchWellKnownIndex("https://example.com").pipe(
            Effect.provide(create500ErrorLayer()),
            Effect.flip,
          ),
        );
        // Fast-forward past all retry delays (1s + 2s + 4s = 7s)
        yield* TestClock.adjust("10 seconds");
        const error = yield* Fiber.join(fiber);

        expect(error).toBeInstanceOf(WellKnownFetchError);
        expect(error._tag).toBe("WellKnownFetchError");
        if (error._tag === "WellKnownFetchError") {
          expect(error.retryable).toBe(true);
        }
      }),
    );

    it.effect("returns WellKnownFetchError with retryable=false for 4xx response", () =>
      Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(create400ErrorLayer()),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownFetchError);
        if (error._tag === "WellKnownFetchError") {
          expect(error.retryable).toBe(false);
        }
      }),
    );

    it.effect("returns WellKnownInvalidIndexError for invalid JSON", () => {
      const layer = createMockHttpLayer(() =>
        Promise.resolve(new Response("not valid json", { status: 200 })),
      );

      return Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(error._tag).toBe("WellKnownInvalidIndexError");
      });
    });

    it.effect("returns WellKnownInvalidIndexError when index is not an object", () => {
      const layer = createJsonResponseLayer("just a string");

      return Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(error.message).toContain("must be an object");
      });
    });

    it.effect("returns WellKnownInvalidIndexError when skills is not an array", () => {
      const layer = createJsonResponseLayer({ skills: "not an array" });

      return Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(error.message).toContain("'skills' array");
      });
    });

    it.effect("returns WellKnownInvalidIndexError when skill is missing name", () => {
      const layer = createJsonResponseLayer({
        skills: [{ description: "No name", files: [] }],
      });

      return Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(error.message).toContain("non-empty 'name' string");
      });
    });

    it.effect("returns WellKnownInvalidIndexError when skill name is empty", () => {
      const layer = createJsonResponseLayer({
        skills: [{ name: "  ", description: "Empty name", files: [] }],
      });

      return Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(error.message).toContain("non-empty 'name' string");
      });
    });

    it.effect("returns WellKnownInvalidIndexError when skill is missing description", () => {
      const layer = createJsonResponseLayer({
        skills: [{ name: "commit", files: [] }],
      });

      return Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(error.message).toContain("'description' string");
      });
    });

    it.effect("returns WellKnownInvalidIndexError when skill is missing files", () => {
      const layer = createJsonResponseLayer({
        skills: [{ name: "commit", description: "Create commits" }],
      });

      return Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(error.message).toContain("'files' array");
      });
    });

    it.effect("returns WellKnownInvalidIndexError when file entry is not a string", () => {
      const layer = createJsonResponseLayer({
        skills: [{ name: "commit", description: "Create commits", files: [123] }],
      });

      return Effect.gen(function* () {
        const error = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(error.message).toContain("must be a string");
      });
    });

    it.effect("handles multiple skills in index", () => {
      const validIndex: WellKnownIndex = {
        skills: [
          { name: "commit", description: "Create commits", files: ["SKILL.md"] },
          {
            name: "review-pr",
            description: "Review pull requests",
            files: ["SKILL.md", "references/commands.md"],
          },
        ],
      };

      return Effect.gen(function* () {
        const result = yield* fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        );

        expect(result.skills).toHaveLength(2);
        expect(result.skills[0]?.name).toBe("commit");
        expect(result.skills[1]?.name).toBe("review-pr");
      });
    });
  });

  describe("fetchSkillFiles", () => {
    /**
     * Creates an HTTP layer that returns different responses based on URL.
     */
    const createMultiFileHttpLayer = (fileResponses: Record<string, string>) =>
      createMockHttpLayer((url) => {
        for (const [filePath, content] of Object.entries(fileResponses)) {
          if (url.includes(filePath)) {
            return Promise.resolve(new Response(content, { status: 200 }));
          }
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      });

    /**
     * Helper to provide HttpClient and FileSystem layers
     */
    const withLayers = <A, E>(
      effect: Effect.Effect<A, E, HttpClient.HttpClient | FileSystem.FileSystem>,
      httpLayer: Layer.Layer<HttpClient.HttpClient>,
    ) => effect.pipe(Effect.provide(Layer.merge(httpLayer, NodeFileSystem.layer)));

    it.effect("fetches single file skill", () => {
      const skill = {
        name: "commit",
        description: "Create commits",
        files: ["SKILL.md"] as readonly string[],
      };
      const fileContent = "# Commit Skill\n\nHelp create commits.";
      const layer = createMultiFileHttpLayer({
        "commit/SKILL.md": fileContent,
      });

      const destination = path.join(tempDir, "skills", "commit");

      return Effect.gen(function* () {
        const result = yield* withLayers(
          fetchSkillFiles("https://example.com", skill, destination),
          layer,
        );

        expect(result.name).toBe("commit");
        expect(Option.getOrNull(result.description)).toBe("Create commits");
        expect(fs.existsSync(path.join(destination, "SKILL.md"))).toBe(true);
        expect(fs.readFileSync(path.join(destination, "SKILL.md"), "utf-8")).toBe(fileContent);
      });
    });

    it.effect("fetches multiple files", () => {
      const skill = {
        name: "review-pr",
        description: "Review pull requests",
        files: ["SKILL.md", "references/commands.md"] as readonly string[],
      };
      const layer = createMultiFileHttpLayer({
        "review-pr/SKILL.md": "# Review PR",
        "review-pr/references/commands.md": "# Commands",
      });

      const destination = path.join(tempDir, "skills", "review-pr");

      return Effect.gen(function* () {
        yield* withLayers(fetchSkillFiles("https://example.com", skill, destination), layer);

        expect(fs.existsSync(path.join(destination, "SKILL.md"))).toBe(true);
        expect(fs.existsSync(path.join(destination, "references", "commands.md"))).toBe(true);
      });
    });

    it.effect("creates nested directories for files", () => {
      const skill = {
        name: "complex",
        description: "Complex skill",
        files: ["SKILL.md", "deep/nested/file.md"] as readonly string[],
      };
      const layer = createMultiFileHttpLayer({
        "complex/SKILL.md": "# Complex",
        "complex/deep/nested/file.md": "# Nested",
      });

      const destination = path.join(tempDir, "skills", "complex");

      return Effect.gen(function* () {
        yield* withLayers(fetchSkillFiles("https://example.com", skill, destination), layer);

        expect(fs.existsSync(path.join(destination, "deep", "nested", "file.md"))).toBe(true);
      });
    });

    it.effect("returns skill with correct path to SKILL.md", () => {
      const skill = {
        name: "commit",
        description: "Create commits",
        files: ["SKILL.md"] as readonly string[],
      };
      const layer = createMultiFileHttpLayer({
        "commit/SKILL.md": "# Commit",
      });

      const destination = path.join(tempDir, "skills", "commit");

      return Effect.gen(function* () {
        const result = yield* withLayers(
          fetchSkillFiles("https://example.com", skill, destination),
          layer,
        );

        expect(result.path).toBe(path.join(destination, "SKILL.md"));
      });
    });

    it.effect("handles skill.md with different casing in files list", () => {
      const skill = {
        name: "commit",
        description: "Create commits",
        files: ["skill.md"] as readonly string[],
      };
      const layer = createMultiFileHttpLayer({
        "commit/skill.md": "# Commit",
      });

      const destination = path.join(tempDir, "skills", "commit");

      return Effect.gen(function* () {
        const result = yield* withLayers(
          fetchSkillFiles("https://example.com", skill, destination),
          layer,
        );

        expect(result.path).toBe(path.join(destination, "skill.md"));
      });
    });

    it.effect("fails with WellKnownNotFoundError when file returns 404", () => {
      const skill = {
        name: "missing",
        description: "Missing files",
        files: ["SKILL.md"] as readonly string[],
      };

      const destination = path.join(tempDir, "skills", "missing");

      return Effect.gen(function* () {
        const error = yield* fetchSkillFiles("https://example.com", skill, destination).pipe(
          Effect.provide(Layer.merge(create404ErrorLayer(), NodeFileSystem.layer)),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownNotFoundError);
      });
    });

    it.live(
      "fails with WellKnownFetchError for server errors",
      () => {
        const skill = {
          name: "error",
          description: "Error skill",
          files: ["SKILL.md"] as readonly string[],
        };

        const destination = path.join(tempDir, "skills", "error");

        return Effect.gen(function* () {
          const error = yield* fetchSkillFiles("https://example.com", skill, destination).pipe(
            Effect.provide(Layer.merge(create500ErrorLayer(), NodeFileSystem.layer)),
            Effect.flip,
          );

          expect(error).toBeInstanceOf(WellKnownFetchError);
        });
      },
      { timeout: 10000 },
    );
  });

  describe("discoverWellKnownSkills", () => {
    it.effect("fetches index and returns skills array", () => {
      const validIndex: WellKnownIndex = {
        skills: [
          { name: "commit", description: "Create commits", files: ["SKILL.md"] },
          { name: "review-pr", description: "Review PRs", files: ["SKILL.md"] },
        ],
      };

      return Effect.gen(function* () {
        const result = yield* discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        );

        expect(result).toHaveLength(2);
        expect(result[0]?.name).toBe("commit");
        expect(Option.getOrNull(result[0]!.description)).toBe("Create commits");
        expect(result[1]?.name).toBe("review-pr");
      });
    });

    it.effect("returns skills with expected path format", () => {
      const validIndex: WellKnownIndex = {
        skills: [{ name: "commit", description: "Create commits", files: ["SKILL.md"] }],
      };

      return Effect.gen(function* () {
        const result = yield* discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        );

        expect(result[0]?.path).toBe("https://example.com/.well-known/skills/commit/SKILL.md");
      });
    });

    it.effect("normalizes base URL trailing slashes", () => {
      const validIndex: WellKnownIndex = {
        skills: [{ name: "commit", description: "Create commits", files: ["SKILL.md"] }],
      };

      return Effect.gen(function* () {
        const result = yield* discoverWellKnownSkills("https://example.com///").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        );

        expect(result[0]?.path).toBe("https://example.com/.well-known/skills/commit/SKILL.md");
      });
    });

    it.effect("returns empty array for empty skills list", () => {
      const validIndex: WellKnownIndex = {
        skills: [],
      };

      return Effect.gen(function* () {
        const result = yield* discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        );

        expect(result).toEqual([]);
      });
    });

    it.effect("propagates WellKnownNotFoundError from fetchWellKnownIndex", () =>
      Effect.gen(function* () {
        const error = yield* discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(create404ErrorLayer()),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownNotFoundError);
      }),
    );

    it.effect("propagates WellKnownInvalidIndexError from fetchWellKnownIndex", () => {
      const layer = createMockHttpLayer(() =>
        Promise.resolve(new Response("not json", { status: 200 })),
      );

      return Effect.gen(function* () {
        const error = yield* discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(layer),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(WellKnownInvalidIndexError);
      });
    });
  });

  describe("error types", () => {
    it("WellKnownFetchError is a tagged error", () => {
      const error = new WellKnownFetchError({
        message: "Network error",
        url: "https://example.com",
        retryable: true,
      });

      expect(error._tag).toBe("WellKnownFetchError");
      expect(error.message).toBe("Network error");
      expect(error.url).toBe("https://example.com");
      expect(error.retryable).toBe(true);
    });

    it("WellKnownNotFoundError is a tagged error", () => {
      const error = new WellKnownNotFoundError({
        message: "Not found",
        url: "https://example.com/.well-known/skills/index.json",
      });

      expect(error._tag).toBe("WellKnownNotFoundError");
      expect(error.message).toBe("Not found");
      expect(error.url).toContain("well-known");
    });

    it("WellKnownInvalidIndexError is a tagged error", () => {
      const cause = new Error("Parse error");
      const error = new WellKnownInvalidIndexError({
        message: "Invalid index",
        url: "https://example.com",
        cause,
      });

      expect(error._tag).toBe("WellKnownInvalidIndexError");
      expect(error.message).toBe("Invalid index");
      expect(error.cause).toBe(cause);
    });
  });
});
