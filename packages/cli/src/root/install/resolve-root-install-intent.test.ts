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
        { source: "@acme/mcp-servers/dev-server", type: "mcp-server" },
        { source: "@acme/subagents/researcher", type: "subagent" },
        { source: "@acme/packs/frontend-tools", type: "pack" },
      ] as const;

      const results = yield* Effect.forEach(cases, ({ source }) =>
        resolveRootInstallIntent(source),
      );

      expect(results).toEqual(cases);
    }),
  );

  it.effect("rejects non-FQN sources", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootInstallIntent("owner/repo").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(appError.detail).toContain("only accepts registry FQNs");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm skills install owner/repo");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm subagents install owner/repo");
    }),
  );

  it.effect("rejects local paths with source-kind-specific guidance", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootInstallIntent("./local-path").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm skills install ./local-path");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm subagents install ./local-path");
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

  it.effect("rejects unsupported plural types", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootInstallIntent("@acme/files/policy").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("skills, commands, mcp-servers, subagents, packs");
    }),
  );

  it.effect("rejects unknown plural types", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootInstallIntent("@acme/widgets/policy").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("not_found");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("skills, commands, mcp-servers, subagents, packs");
    }),
  );
});
