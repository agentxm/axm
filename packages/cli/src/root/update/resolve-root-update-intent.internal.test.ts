import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";

import { getAppError } from "../../test-helpers.js";
import { resolveRootUpdateIntent } from "./resolve-root-update-intent.js";

describe("resolveRootUpdateIntent", () => {
  it.effect("parses supported registry FQNs", () =>
    Effect.gen(function* () {
      const cases = [
        {
          source: "@acme/skills/code-review",
          type: "skill",
          owner: "@acme",
          name: "code-review",
          versionRange: Option.none(),
          target: "@acme/skills/code-review",
        },
        {
          source: "@acme/mcps/dev-server",
          type: "mcp-server",
          owner: "@acme",
          name: "dev-server",
          versionRange: Option.none(),
          target: "@acme/mcps/dev-server",
        },
        {
          source: "@acme/subagents/researcher",
          type: "subagent",
          owner: "@acme",
          name: "researcher",
          versionRange: Option.none(),
          target: "@acme/subagents/researcher",
        },
        {
          source: "@acme/packs/frontend-tools",
          type: "pack",
          owner: "@acme",
          name: "frontend-tools",
          versionRange: Option.none(),
          target: "@acme/packs/frontend-tools",
        },
      ] as const;

      const results = yield* Effect.forEach(cases, ({ source }) => resolveRootUpdateIntent(source));

      expect(results).toEqual(cases);
    }),
  );

  it.effect("rejects non-FQN sources", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("owner/repo").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(appError.detail).toContain("only accepts registry FQNs");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm skills update owner/repo");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm subagents update owner/repo");
    }),
  );

  it.effect("rejects local paths with source-kind-specific guidance", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("./local-path").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm skills update ./local-path");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("axm subagents update ./local-path");
    }),
  );

  it.effect("rejects malformed FQNs", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("@acme/skills").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("validation");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("@<handle>/<plural-type>/<name>[@<version>]");
    }),
  );

  it.effect("rejects Library update refs", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("@acme/libraries/frontend").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(appError.detail).toBe(
        "Libraries are curated registry collections and cannot be updated",
      );
      expect(appError.suggestions?.[0]?.description).toContain(
        "Update installed extensions individually",
      );
    }),
  );

  it.effect("rejects unknown plural types", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUpdateIntent("@acme/widgets/policy").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("not_found");
      expect(
        (appError.suggestions ?? []).map((suggestion) => suggestion.description).join("\n"),
      ).toContain("skills, mcps, subagents, rules, hooks, knowledge, packs");
    }),
  );
});
