import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { getAppError } from "../../test-helpers.js";
import { resolveRootInstallIntent } from "./resolve-root-install-intent.js";

describe("resolveRootInstallIntent", () => {
  it.effect("parses supported registry FQNs", () =>
    Effect.gen(function* () {
      const cases = [
        { source: "@acme/skills/code-review", type: "skill" },
        { source: "@acme/commands/release-notes@^1.2.0", type: "command" },
        { source: "@acme/mcps/dev-server", type: "mcp-server" },
        { source: "@acme/subagents/researcher", type: "subagent" },
        { source: "@ac/files/policy", type: "files" },
        { source: "@acme/packs/frontend-tools", type: "pack" },
      ] as const;

      const results = yield* Effect.forEach(cases, ({ source }) =>
        resolveRootInstallIntent(source),
      );

      expect(results).toEqual(cases);
    }),
  );

  it.effect("parses source locators", () =>
    Effect.gen(function* () {
      const cases = [
        "./local-path",
        "owner/repo",
        "github:owner/repo//skills@v1.0.0",
        "git@example.com:owner/repo.git",
        "https://example.com/owner/repo.git",
      ] as const;

      const results = yield* Effect.forEach(cases, (source) => resolveRootInstallIntent(source));

      expect(results).toEqual(cases.map((source) => ({ source, type: "locator" })));
    }),
  );

  it.effect("rejects bare names with per-type guidance", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootInstallIntent("code-review").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(appError.detail).toContain("registry FQN or source locator");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm skills install code-review");
    }),
  );

  it.effect("rejects malformed FQNs", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootInstallIntent("@acme/skills").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("validation");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("@<handle>/<plural-type>/<name>[@<version>]");
    }),
  );

  it.effect("rejects unknown plural types", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootInstallIntent("@acme/widgets/policy").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("not_found");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("skills, commands, mcps, subagents, files, rules, hooks, knowledge, packs");
    }),
  );

  it.effect("rejects Library install refs", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootInstallIntent("@acme/libraries/frontend").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(appError.detail).toBe(
        "Libraries are curated registry collections and cannot be installed",
      );
      expect(appError.suggestions?.[0]?.description).toContain("install the individual extensions");
    }),
  );
});
