import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { resolveRootInstallIntent } from "./root-intent.js";

const guidanceOf = (failure: ExtensionLifecycleFailed): string =>
  (failure.suggestions ?? []).map((suggestion) => suggestion.description).join("\n");

describe("resolveRootInstallIntent", () => {
  it.effect("parses supported registry FQNs", () =>
    Effect.gen(function* () {
      const cases = [
        { source: "@acme/skills/code-review", type: "skill" },
        { source: "agentxm:@acme/skills/code-review", type: "skill" },
        { source: "internal:@acme/skills/code-review", type: "skill" },
        { source: "@acme/mcps/dev-server", type: "mcp-server" },
        { source: "@acme/subagents/researcher", type: "subagent" },
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
      const failure = yield* resolveRootInstallIntent("code-review").pipe(Effect.flip);

      expect(failure.category).toBe("usage");
      expect(failure.detail).toContain("registry FQN or source locator");

      const guidance = guidanceOf(failure);
      expect(guidance).toContain("axm skills install code-review");
      expect(guidance).toContain("skills, mcps, subagents, rules, hooks, knowledge, packs");
    }),
  );

  it.effect("rejects malformed FQNs", () =>
    Effect.gen(function* () {
      const failure = yield* resolveRootInstallIntent("@acme/skills").pipe(Effect.flip);

      expect(failure.category).toBe("validation");
      expect(guidanceOf(failure)).toContain("@<handle>/<plural-type>/<name>[@<version>]");
    }),
  );

  it.effect("rejects unknown plural types", () =>
    Effect.gen(function* () {
      const failure = yield* resolveRootInstallIntent("@acme/widgets/policy").pipe(Effect.flip);

      expect(failure.category).toBe("not_found");
      expect(guidanceOf(failure)).toContain(
        "skills, mcps, subagents, rules, hooks, knowledge, packs",
      );
    }),
  );

  it.effect("rejects Library install refs", () =>
    Effect.gen(function* () {
      const failure = yield* resolveRootInstallIntent("@acme/libraries/frontend").pipe(Effect.flip);

      expect(failure.category).toBe("usage");
      expect(failure.detail).toBe(
        "Libraries are curated registry collections and cannot be installed",
      );
      expect(failure.suggestions?.[0]?.description).toContain("install the individual extensions");
    }),
  );
});
