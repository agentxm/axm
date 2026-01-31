/**
 * Unit tests for well-known module.
 *
 * Tests well-known skills discovery per RFC 8615.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Fiber, Layer, TestClock, TestContext } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
          return yield* Effect.fail(
            new HttpClientError.ResponseError({
              request: req,
              response,
              reason: "StatusCode",
            }),
          );
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
          return yield* Effect.fail(
            new HttpClientError.ResponseError({
              request: req,
              response,
              reason: "StatusCode",
            }),
          );
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
          return yield* Effect.fail(
            new HttpClientError.ResponseError({
              request: req,
              response,
              reason: "StatusCode",
            }),
          );
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
    it("fetches and parses valid index JSON", async () => {
      const validIndex: WellKnownIndex = {
        skills: [
          {
            name: "commit",
            description: "Create commits",
            files: ["SKILL.md"],
          },
        ],
      };

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        ),
      );

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("commit");
      expect(result.skills[0]?.description).toBe("Create commits");
      expect(result.skills[0]?.files).toEqual(["SKILL.md"]);
    });

    it("strips trailing slashes from base URL", async () => {
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

      await Effect.runPromise(
        fetchWellKnownIndex("https://example.com///").pipe(Effect.provide(layer)),
      );

      expect(capturedUrl).toBe("https://example.com/.well-known/skills/index.json");
    });

    it("returns WellKnownNotFoundError for 404 response", async () => {
      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(create404ErrorLayer()),
          Effect.either,
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownNotFoundError);
        expect(result.left._tag).toBe("WellKnownNotFoundError");
        expect(result.left.url).toContain("example.com");
      }
    });

    it("returns WellKnownFetchError with retryable=true for 500 response", async () => {
      // Use TestClock to fast-forward through retry delays
      const program = Effect.gen(function* () {
        const fiber = yield* Effect.fork(
          fetchWellKnownIndex("https://example.com").pipe(
            Effect.provide(create500ErrorLayer()),
            Effect.either,
          ),
        );
        // Fast-forward past all retry delays (1s + 2s + 4s = 7s)
        yield* TestClock.adjust("10 seconds");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestContext.TestContext));

      const result = await Effect.runPromise(program);

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownFetchError);
        expect(result.left._tag).toBe("WellKnownFetchError");
        if (result.left._tag === "WellKnownFetchError") {
          expect(result.left.retryable).toBe(true);
        }
      }
    });

    it("returns WellKnownFetchError with retryable=false for 4xx response", async () => {
      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(create400ErrorLayer()),
          Effect.either,
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownFetchError);
        if (result.left._tag === "WellKnownFetchError") {
          expect(result.left.retryable).toBe(false);
        }
      }
    });

    it("returns WellKnownInvalidIndexError for invalid JSON", async () => {
      const layer = createMockHttpLayer(() =>
        Promise.resolve(new Response("not valid json", { status: 200 })),
      );

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(result.left._tag).toBe("WellKnownInvalidIndexError");
      }
    });

    it("returns WellKnownInvalidIndexError when index is not an object", async () => {
      const layer = createJsonResponseLayer("just a string");

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(result.left.message).toContain("must be an object");
      }
    });

    it("returns WellKnownInvalidIndexError when skills is not an array", async () => {
      const layer = createJsonResponseLayer({ skills: "not an array" });

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(result.left.message).toContain("'skills' array");
      }
    });

    it("returns WellKnownInvalidIndexError when skill is missing name", async () => {
      const layer = createJsonResponseLayer({
        skills: [{ description: "No name", files: [] }],
      });

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(result.left.message).toContain("non-empty 'name' string");
      }
    });

    it("returns WellKnownInvalidIndexError when skill name is empty", async () => {
      const layer = createJsonResponseLayer({
        skills: [{ name: "  ", description: "Empty name", files: [] }],
      });

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(result.left.message).toContain("non-empty 'name' string");
      }
    });

    it("returns WellKnownInvalidIndexError when skill is missing description", async () => {
      const layer = createJsonResponseLayer({
        skills: [{ name: "commit", files: [] }],
      });

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(result.left.message).toContain("'description' string");
      }
    });

    it("returns WellKnownInvalidIndexError when skill is missing files", async () => {
      const layer = createJsonResponseLayer({
        skills: [{ name: "commit", description: "Create commits" }],
      });

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(result.left.message).toContain("'files' array");
      }
    });

    it("returns WellKnownInvalidIndexError when file entry is not a string", async () => {
      const layer = createJsonResponseLayer({
        skills: [{ name: "commit", description: "Create commits", files: [123] }],
      });

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
        expect(result.left.message).toContain("must be a string");
      }
    });

    it("handles multiple skills in index", async () => {
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

      const result = await Effect.runPromise(
        fetchWellKnownIndex("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        ),
      );

      expect(result.skills).toHaveLength(2);
      expect(result.skills[0]?.name).toBe("commit");
      expect(result.skills[1]?.name).toBe("review-pr");
    });
  });

  describe("fetchSkillFiles", () => {
    /**
     * Creates an HTTP layer that returns different responses based on URL.
     */
    const createMultiFileHttpLayer = (fileResponses: Record<string, string>) =>
      createMockHttpLayer((url) => {
        for (const [path, content] of Object.entries(fileResponses)) {
          if (url.includes(path)) {
            return Promise.resolve(new Response(content, { status: 200 }));
          }
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      });

    it("fetches single file skill", async () => {
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

      const result = await Effect.runPromise(
        fetchSkillFiles("https://example.com", skill, destination).pipe(
          Effect.provide(layer),
          Effect.provide(NodeFileSystem.layer),
        ),
      );

      expect(result.name).toBe("commit");
      expect(result.description).toBe("Create commits");
      expect(fs.existsSync(path.join(destination, "SKILL.md"))).toBe(true);
      expect(fs.readFileSync(path.join(destination, "SKILL.md"), "utf-8")).toBe(fileContent);
    });

    it("fetches multiple files", async () => {
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

      await Effect.runPromise(
        fetchSkillFiles("https://example.com", skill, destination).pipe(
          Effect.provide(layer),
          Effect.provide(NodeFileSystem.layer),
        ),
      );

      expect(fs.existsSync(path.join(destination, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(destination, "references", "commands.md"))).toBe(true);
    });

    it("creates nested directories for files", async () => {
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

      await Effect.runPromise(
        fetchSkillFiles("https://example.com", skill, destination).pipe(
          Effect.provide(layer),
          Effect.provide(NodeFileSystem.layer),
        ),
      );

      expect(fs.existsSync(path.join(destination, "deep", "nested", "file.md"))).toBe(true);
    });

    it("returns skill with correct path to SKILL.md", async () => {
      const skill = {
        name: "commit",
        description: "Create commits",
        files: ["SKILL.md"] as readonly string[],
      };
      const layer = createMultiFileHttpLayer({
        "commit/SKILL.md": "# Commit",
      });

      const destination = path.join(tempDir, "skills", "commit");

      const result = await Effect.runPromise(
        fetchSkillFiles("https://example.com", skill, destination).pipe(
          Effect.provide(layer),
          Effect.provide(NodeFileSystem.layer),
        ),
      );

      expect(result.path).toBe(path.join(destination, "SKILL.md"));
    });

    it("handles skill.md with different casing in files list", async () => {
      const skill = {
        name: "commit",
        description: "Create commits",
        files: ["skill.md"] as readonly string[],
      };
      const layer = createMultiFileHttpLayer({
        "commit/skill.md": "# Commit",
      });

      const destination = path.join(tempDir, "skills", "commit");

      const result = await Effect.runPromise(
        fetchSkillFiles("https://example.com", skill, destination).pipe(
          Effect.provide(layer),
          Effect.provide(NodeFileSystem.layer),
        ),
      );

      expect(result.path).toBe(path.join(destination, "skill.md"));
    });

    it("fails with WellKnownNotFoundError when file returns 404", async () => {
      const skill = {
        name: "missing",
        description: "Missing files",
        files: ["SKILL.md"] as readonly string[],
      };

      const destination = path.join(tempDir, "skills", "missing");

      const result = await Effect.runPromise(
        fetchSkillFiles("https://example.com", skill, destination).pipe(
          Effect.provide(create404ErrorLayer()),
          Effect.provide(NodeFileSystem.layer),
          Effect.either,
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownNotFoundError);
      }
    });

    it("fails with WellKnownFetchError for server errors", async () => {
      const skill = {
        name: "error",
        description: "Error skill",
        files: ["SKILL.md"] as readonly string[],
      };

      const destination = path.join(tempDir, "skills", "error");

      // Use TestClock to fast-forward through retry delays
      const program = Effect.gen(function* () {
        const fiber = yield* Effect.fork(
          fetchSkillFiles("https://example.com", skill, destination).pipe(
            Effect.provide(create500ErrorLayer()),
            Effect.provide(NodeFileSystem.layer),
            Effect.either,
          ),
        );
        // Fast-forward past all retry delays (1s + 2s + 4s = 7s)
        yield* TestClock.adjust("10 seconds");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestContext.TestContext));

      const result = await Effect.runPromise(program);

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownFetchError);
      }
    });
  });

  describe("discoverWellKnownSkills", () => {
    it("fetches index and returns skills array", async () => {
      const validIndex: WellKnownIndex = {
        skills: [
          { name: "commit", description: "Create commits", files: ["SKILL.md"] },
          { name: "review-pr", description: "Review PRs", files: ["SKILL.md"] },
        ],
      };

      const result = await Effect.runPromise(
        discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        ),
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe("commit");
      expect(result[0]?.description).toBe("Create commits");
      expect(result[1]?.name).toBe("review-pr");
    });

    it("returns skills with expected path format", async () => {
      const validIndex: WellKnownIndex = {
        skills: [{ name: "commit", description: "Create commits", files: ["SKILL.md"] }],
      };

      const result = await Effect.runPromise(
        discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        ),
      );

      expect(result[0]?.path).toBe("https://example.com/.well-known/skills/commit/SKILL.md");
    });

    it("normalizes base URL trailing slashes", async () => {
      const validIndex: WellKnownIndex = {
        skills: [{ name: "commit", description: "Create commits", files: ["SKILL.md"] }],
      };

      const result = await Effect.runPromise(
        discoverWellKnownSkills("https://example.com///").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        ),
      );

      expect(result[0]?.path).toBe("https://example.com/.well-known/skills/commit/SKILL.md");
    });

    it("returns empty array for empty skills list", async () => {
      const validIndex: WellKnownIndex = {
        skills: [],
      };

      const result = await Effect.runPromise(
        discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(createJsonResponseLayer(validIndex)),
        ),
      );

      expect(result).toEqual([]);
    });

    it("propagates WellKnownNotFoundError from fetchWellKnownIndex", async () => {
      const result = await Effect.runPromise(
        discoverWellKnownSkills("https://example.com").pipe(
          Effect.provide(create404ErrorLayer()),
          Effect.either,
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownNotFoundError);
      }
    });

    it("propagates WellKnownInvalidIndexError from fetchWellKnownIndex", async () => {
      const layer = createMockHttpLayer(() =>
        Promise.resolve(new Response("not json", { status: 200 })),
      );

      const result = await Effect.runPromise(
        discoverWellKnownSkills("https://example.com").pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(WellKnownInvalidIndexError);
      }
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
