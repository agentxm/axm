import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";

import { getAppError } from "../../test-helpers.js";
import { resolveRootUpdateIntent } from "./resolve-root-update-intent.js";

describe("resolveRootUpdateIntent", () => {
  it.effect("parses supported registry FQNs", () =>
    Effect.gen(function* () {
      const cases = [
        { source: "@acme/skills/code-review", type: "skill" },
        { source: "@acme/commands/release-notes@^1.2.0", type: "command" },
        { source: "@acme/mcp-servers/dev-server", type: "mcp-server" },
        { source: "@acme/subagents/researcher", type: "subagent" },
        { source: "@acme/packs/frontend-tools", type: "pack" },
      ] as const;

      const results = yield* Effect.forEach(cases, ({ source }) => resolveRootUpdateIntent(source));

      expect(results).toEqual(cases);
    }),
  );

  it.effect("rejects non-FQN sources", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("owner/repo").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("UPDATE_SOURCE_NOT_FQN");
      expect(appError.what).toContain("only accepts registry FQNs");
      expect(Option.getOrElse(appError.howToFix, () => "")).toContain(
        "axm skills update owner/repo",
      );
      expect(Option.getOrElse(appError.howToFix, () => "")).toContain(
        "axm subagents update owner/repo",
      );
    }),
  );

  it.effect("rejects local paths with source-kind-specific guidance", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("./local-path").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("UPDATE_SOURCE_NOT_FQN");
      expect(Option.getOrElse(appError.howToFix, () => "")).toContain(
        "axm skills update ./local-path",
      );
      expect(Option.getOrElse(appError.howToFix, () => "")).toContain(
        "axm subagents update ./local-path",
      );
    }),
  );

  it.effect("rejects malformed FQNs", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("@acme/skills").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("UPDATE_SOURCE_INVALID_FQN");
      expect(Option.getOrElse(appError.howToFix, () => "")).toContain(
        "@<handle>/<plural-type>/<name>[@<version>]",
      );
    }),
  );

  it.effect("rejects unsupported plural types", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("@acme/files/policy").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("UPDATE_SOURCE_UNSUPPORTED_TYPE");
      expect(Option.getOrElse(appError.howToFix, () => "")).toContain(
        "skills, commands, mcp-servers, subagents, packs",
      );
    }),
  );

  it.effect("rejects unknown plural types", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("@acme/widgets/policy").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("UPDATE_SOURCE_UNKNOWN_TYPE");
      expect(Option.getOrElse(appError.howToFix, () => "")).toContain(
        "skills, commands, mcp-servers, subagents, packs",
      );
    }),
  );
});
