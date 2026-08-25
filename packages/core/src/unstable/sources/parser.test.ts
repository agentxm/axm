/**
 * Unit tests for source-parser module.
 *
 * Tests classification of input strings into InputPattern types.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as FastCheck from "effect/testing/FastCheck";
import { extensionName, handle, versionRange } from "../test-helpers.js";
import { type InputPattern, parseInputPattern } from "./parser.js";

describe("parseInputPattern", () => {
  describe("classification", () => {
    const expectSome = (input: string, expected: InputPattern) => {
      const result = parseInputPattern(input);
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result).pattern).toEqual(expected);
      expect(Option.getOrThrow(result).originalInput).toBe(input);
    };

    const expectNone = (input: string) => {
      expect(Option.isNone(parseInputPattern(input))).toBe(true);
    };

    it("classifies simple name as NameInput", () => {
      expectSome("some-name", { pattern: "name-input", name: "some-name" });
    });

    it("classifies @owner/skills/name as registry-pattern-input", () => {
      expectSome("@myorg/skills/some-name", {
        pattern: "registry-pattern-input",
        sourceName: "agentxm",
        type: Option.some("skills"),
        owner: handle("@myorg"),
        name: Option.some(extensionName("some-name")),
        versionRange: Option.none(),
      });
    });

    it("classifies @owner/mcps/name@constraint as registry-pattern-input", () => {
      expectSome("@myorg/mcps/server-a@^1.2.3", {
        pattern: "registry-pattern-input",
        sourceName: "agentxm",
        type: Option.some("mcps"),
        owner: handle("@myorg"),
        name: Option.some(extensionName("server-a")),
        versionRange: Option.some(versionRange("^1.2.3")),
      });
    });

    it("classifies @owner/packs/name as registry-pattern-input", () => {
      expectSome("@myorg/packs/my-pack", {
        pattern: "registry-pattern-input",
        sourceName: "agentxm",
        type: Option.some("packs"),
        owner: handle("@myorg"),
        name: Option.some(extensionName("my-pack")),
        versionRange: Option.none(),
      });
    });

    it("returns None for 2-segment @owner/name (no longer treated as registry)", () => {
      expectNone("@myorg/legacy-skill");
    });

    it("classifies @owner as registry-pattern-input with no type/name", () => {
      expectSome("@myorg", {
        pattern: "registry-pattern-input",
        sourceName: "agentxm",
        type: Option.none(),
        owner: handle("@myorg"),
        name: Option.none(),
        versionRange: Option.none(),
      });
    });

    it("classifies @owner/{type} as registry-pattern-input with no name", () => {
      expectSome("@myorg/skills", {
        pattern: "registry-pattern-input",
        sourceName: "agentxm",
        type: Option.some("skills"),
        owner: handle("@myorg"),
        name: Option.none(),
        versionRange: Option.none(),
      });
    });

    it("classifies a source-qualified registry FQN before opaque URL syntax", () => {
      expectSome("internal:@myorg/skills/some-name", {
        pattern: "registry-pattern-input",
        sourceName: "internal",
        type: Option.some("skills"),
        owner: handle("@myorg"),
        name: Option.some(extensionName("some-name")),
        versionRange: Option.none(),
      });
    });

    it("classifies https URL as UrlInput", () => {
      expectSome("https://github.com/owner/repo", {
        pattern: "url-input",
        url: new URL("https://github.com/owner/repo"),
      });
    });

    it("classifies file:// URL as FilePathPattern", () => {
      expectSome("file:///absolute/path/to/skill", {
        pattern: "file-path-pattern",
        path: "/absolute/path/to/skill",
      });
    });

    it.prop(
      "classifies credentialed URLs with ports as URLs rather than SCP addresses",
      {
        protocol: FastCheck.constantFrom("http", "https"),
        user: FastCheck.stringMatching(/^[a-z][a-z0-9]{0,12}$/),
        port: FastCheck.integer({ min: 1, max: 65_535 }),
        owner: FastCheck.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
        repo: FastCheck.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
      },
      ({ protocol, user, port, owner, repo }) => {
        const input = `${protocol}://${user}@github.com:${port}/${owner}/${repo}.git`;
        expectSome(input, { pattern: "url-input", url: new URL(input) });
      },
      { fastCheck: { numRuns: 100, seed: 0x41584d } },
    );

    it("classifies file:// URL with nested path as FilePathPattern", () => {
      expectSome("file:///Users/dev/skills/my-skill", {
        pattern: "file-path-pattern",
        path: "/Users/dev/skills/my-skill",
      });
    });

    it("classifies git@ SCP-style address with .git suffix as GitScpAddress", () => {
      expectSome("git@github.com:owner/repo.git", {
        pattern: "git-scp-address",
        user: "git",
        host: "github.com",
        path: "owner/repo.git",
      });
    });

    it("classifies git@ SCP-style address without .git suffix as GitScpAddress", () => {
      expectSome("git@github.com:owner/repo", {
        pattern: "git-scp-address",
        user: "git",
        host: "github.com",
        path: "owner/repo",
      });
    });

    it("classifies owner/repo as SlashPattern", () => {
      expectSome("owner/repo", {
        pattern: "slash-pattern",
        first: "owner",
        second: "repo",
        third: Option.none(),
      });
    });

    it("classifies slash pattern with three segments as source path", () => {
      expectSome("owner/repo/path", {
        pattern: "slash-pattern",
        first: "owner",
        second: "repo",
        third: Option.some("path"),
      });
    });

    it("classifies slash pattern with more than three segments as source path", () => {
      expectSome("owner/repo/sub/path", {
        pattern: "slash-pattern",
        first: "owner",
        second: "repo",
        third: Option.some("sub/path"),
      });
    });

    it("returns None for slash pattern with invalid segment", () => {
      expectNone("owner/-repo");
    });

    it("returns None for slash pattern with trailing hyphen segment", () => {
      expectNone("owner/repo-");
    });

    it("classifies leading slash as FilePathPattern (not SlashPattern)", () => {
      expectSome("/owner/repo", { pattern: "file-path-pattern", path: "/owner/repo" });
    });

    it("returns None for slash pattern with trailing slash", () => {
      expectNone("owner/repo/");
    });

    it("returns None for slash pattern with empty segment", () => {
      expectNone("owner//repo");
    });

    it("returns None for slash pattern with special character segment", () => {
      expectNone("owner/repo_name");
    });

    it("classifies ./local/path as FilePathPattern", () => {
      expectSome("./local/path", { pattern: "file-path-pattern", path: "./local/path" });
    });

    it("classifies /absolute/path as FilePathPattern", () => {
      expectSome("/absolute/path", { pattern: "file-path-pattern", path: "/absolute/path" });
    });

    it("classifies ~/home/path as FilePathPattern", () => {
      expectSome("~/home/path", { pattern: "file-path-pattern", path: "~/home/path" });
    });

    it("classifies single character name as NameInput", () => {
      expectSome("a", { pattern: "name-input", name: "a" });
    });

    it("returns None for name with leading hyphen", () => {
      expectNone("-foo");
    });

    it("returns None for name with trailing hyphen", () => {
      expectNone("foo-");
    });

    it("returns None for name with special characters", () => {
      expectNone("foo_bar");
    });

    it("classifies wildcard pattern as GlobInput", () => {
      expectSome("effect-*", { pattern: "glob-input", value: "effect-*" });
    });

    it("classifies standalone wildcard as GlobInput", () => {
      expectSome("*", { pattern: "glob-input", value: "*" });
    });

    it("classifies github:owner/repo as ShorthandInput", () => {
      expectSome("github:owner/repo", {
        pattern: "shorthand-input",
        prefix: "github",
        remainingInput: "owner/repo",
      });
    });

    it("classifies gitlab:owner/repo@ref as ShorthandInput", () => {
      expectSome("gitlab:owner/repo@ref", {
        pattern: "shorthand-input",
        prefix: "gitlab",
        remainingInput: "owner/repo@ref",
      });
    });

    it("classifies bitbucket:owner/repo//path@ref as ShorthandInput", () => {
      expectSome("bitbucket:owner/repo//path@ref", {
        pattern: "shorthand-input",
        prefix: "bitbucket",
        remainingInput: "owner/repo//path@ref",
      });
    });

    it("classifies a workspace locator before URL parsing", () => {
      expectSome("workspace:@myorg/mcps/server-a", {
        pattern: "workspace-pattern-input",
        owner: handle("@myorg"),
        type: "mcp-server",
        name: extensionName("server-a"),
      });
    });

    it("rejects a workspace locator with a version constraint", () => {
      expectNone("workspace:@myorg/skills/some-name@^1.2.3");
    });

    it("rejects an incomplete workspace locator", () => {
      expectNone("workspace:@myorg/skills");
    });

    it("classifies local:./path as UrlInput (no longer a shorthand)", () => {
      const result = parseInputPattern("local:./path");
      expect(Option.isSome(result)).toBe(true);
      // local: is parsed as a URL scheme, no longer a shorthand prefix
      expect(Option.getOrThrow(result).pattern.pattern).toBe("url-input");
    });

    it("returns None for empty string", () => {
      expectNone("");
    });

    it("returns None for whitespace-only string", () => {
      expectNone("   ");
    });
  });
});

// buildCloneUrl and getOrigin tests moved to service — functionality is now
// in SourceHostProviders.cloneUrl() and SourceHostProviders.origin()
