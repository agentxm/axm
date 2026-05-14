import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { getAppError } from "../../test-helpers.js";
import { resolveRootUninstallIntent } from "./resolve-root-uninstall-intent.js";

describe("resolveRootUninstallIntent", () => {
  it.effect("parses supported registry FQNs and strips version constraints from the name", () =>
    Effect.gen(function* () {
      const cases = [
        { source: "@acme/skills/code-review", type: "skill", name: "code-review" },
        { source: "@acme/commands/release-notes@^1.2.0", type: "command", name: "release-notes" },
        { source: "@acme/mcp-servers/dev-server", type: "mcp-server", name: "dev-server" },
        { source: "@acme/subagents/researcher", type: "subagent", name: "researcher" },
        { source: "@acme/packs/frontend-tools@1.2.3", type: "pack", name: "frontend-tools" },
      ] as const;

      const results = yield* Effect.forEach(cases, ({ source }) =>
        resolveRootUninstallIntent(source),
      );

      expect(results).toEqual(cases);
    }),
  );

  it.effect("rejects plain names with per-type uninstall guidance", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUninstallIntent("review").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(appError.detail).toContain("only accepts registry FQNs");
      expect(
        (appError.breadcrumbs ?? []).map((breadcrumb) => breadcrumb.description).join("\n"),
      ).toContain("axm skills uninstall review");
      expect(
        (appError.breadcrumbs ?? []).map((breadcrumb) => breadcrumb.description).join("\n"),
      ).toContain("axm commands uninstall review");
    }),
  );

  it.effect("rejects local paths with generic per-type uninstall guidance", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUninstallIntent("./local-path").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(
        (appError.breadcrumbs ?? []).map((breadcrumb) => breadcrumb.description).join("\n"),
      ).toContain("axm skills uninstall <name>");
      expect(
        (appError.breadcrumbs ?? []).map((breadcrumb) => breadcrumb.description).join("\n"),
      ).toContain(rootFqnGrammarSnippet);
    }),
  );

  it.effect("rejects malformed FQNs", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUninstallIntent("@acme/skills").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("validation");
      expect(
        (appError.breadcrumbs ?? []).map((breadcrumb) => breadcrumb.description).join("\n"),
      ).toContain(rootFqnGrammarSnippet);
    }),
  );

  it.effect("rejects unsupported plural types", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUninstallIntent("@acme/files/policy").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(
        (appError.breadcrumbs ?? []).map((breadcrumb) => breadcrumb.description).join("\n"),
      ).toContain("skills, commands, mcp-servers, subagents, packs");
    }),
  );

  it.effect("rejects unknown plural types", () =>
    Effect.gen(function* () {
      const error = yield* resolveRootUninstallIntent("@acme/widgets/policy").pipe(Effect.flip);
      const appError = getAppError(error);

      expect(appError.code).toBe("not_found");
      expect(
        (appError.breadcrumbs ?? []).map((breadcrumb) => breadcrumb.description).join("\n"),
      ).toContain("skills, commands, mcp-servers, subagents, packs");
    }),
  );
});

const rootFqnGrammarSnippet = "@<handle>/<plural-type>/<name>[@<version>]";
