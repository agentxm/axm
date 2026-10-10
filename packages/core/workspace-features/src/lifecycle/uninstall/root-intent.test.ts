import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import type { ExtensionLifecycleFailed } from "@agentxm/workspace-kernel/operations";
import { resolveRootUninstallIntent } from "./root-intent.js";

const rootFqnGrammarSnippet = "@<handle>/<plural-type>/<name>";

const guidanceOf = (failure: ExtensionLifecycleFailed): string =>
  (failure.suggestions ?? []).map((suggestion) => suggestion.description).join("\n");

describe("resolveRootUninstallIntent", () => {
  it.effect("parses supported unversioned registry FQNs", () =>
    Effect.gen(function* () {
      const cases = [
        { source: "@acme/skills/code-review", owner: "@acme", type: "skill", name: "code-review" },
        { source: "@acme/mcps/dev-server", owner: "@acme", type: "mcp-server", name: "dev-server" },
        {
          source: "@acme/subagents/researcher",
          owner: "@acme",
          type: "subagent",
          name: "researcher",
        },
        {
          source: "@acme/packs/frontend-tools",
          owner: "@acme",
          type: "pack",
          name: "frontend-tools",
        },
      ] as const;

      const results = yield* Effect.forEach(cases, ({ source }) =>
        resolveRootUninstallIntent(source),
      );

      expect(results).toEqual(cases);
    }),
  );

  it.effect("rejects plain names with per-type uninstall guidance", () =>
    Effect.gen(function* () {
      const failure = yield* resolveRootUninstallIntent("review").pipe(Effect.flip);

      expect(failure.category).toBe("usage");
      expect(failure.detail).toContain("only accepts registry FQNs");
      expect(guidanceOf(failure)).toContain("axm skills uninstall review");
    }),
  );

  it.effect("rejects local paths with generic per-type uninstall guidance", () =>
    Effect.gen(function* () {
      const failure = yield* resolveRootUninstallIntent("./local-path").pipe(Effect.flip);

      expect(failure.category).toBe("usage");
      expect(guidanceOf(failure)).toContain("axm skills uninstall <name>");
      expect(guidanceOf(failure)).toContain(rootFqnGrammarSnippet);
    }),
  );

  it.effect("rejects malformed FQNs", () =>
    Effect.gen(function* () {
      const failure = yield* resolveRootUninstallIntent("@acme/skills").pipe(Effect.flip);

      expect(failure.category).toBe("validation");
      expect(guidanceOf(failure)).toContain(rootFqnGrammarSnippet);
    }),
  );

  it.effect("rejects unknown plural types", () =>
    Effect.gen(function* () {
      const failure = yield* resolveRootUninstallIntent("@acme/widgets/policy").pipe(Effect.flip);

      expect(failure.category).toBe("not_found");
      expect(guidanceOf(failure)).toContain(
        "skills, mcps, subagents, rules, hooks, knowledge, packs",
      );
    }),
  );
});
