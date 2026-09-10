import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { ConfiguredRecordRow } from "@agentxm/workspace-state";

import { resolveConfiguredPackSelector } from "./configured-pack-selector.js";

const pack = (name: string, source: string): ConfiguredRecordRow => ({
  type: "pack",
  name,
  source,
  enabled: true,
  packagingKind: "native",
  lifecycle: "configured",
});

describe("resolveConfiguredPackSelector", () => {
  const configured = [
    pack("toolkit", "workspace"),
    pack("reviewers", "agentxm:@acme/packs/reviewers@^1.0.0"),
  ];

  it.effect("prefers an exact configured local name", () =>
    Effect.gen(function* () {
      const selected = yield* resolveConfiguredPackSelector({
        configured,
        selector: "toolkit",
      });

      expect(selected.configuredName).toBe("toolkit");
      expect(selected.match).toBe("local-name");
      expect(selected.entry.source).toBe("workspace");
    }),
  );

  it.effect("resolves a unique workspace pack FQN", () =>
    Effect.gen(function* () {
      const selected = yield* resolveConfiguredPackSelector({
        configured,
        configuredOwner: "@acme",
        selector: "@acme/packs/toolkit",
      });

      expect(selected.configuredName).toBe("toolkit");
      expect(selected.match).toBe("fqn");
    }),
  );

  it.effect("resolves a unique configured Registry pack FQN", () =>
    Effect.gen(function* () {
      const selected = yield* resolveConfiguredPackSelector({
        configured,
        selector: "@acme/packs/reviewers",
      });

      expect(selected.configuredName).toBe("reviewers");
      expect(selected.match).toBe("fqn");
    }),
  );

  it.effect("matches a source-qualified configured Registry pack by its FQN", () =>
    Effect.gen(function* () {
      const selected = yield* resolveConfiguredPackSelector({
        configured: [pack("reviewers", "internal:@acme/packs/reviewers@^1.0.0")],
        selector: "@acme/packs/reviewers",
      });

      expect(selected.configuredName).toBe("reviewers");
      expect(selected.match).toBe("fqn");
    }),
  );

  it.effect("resolves a registry shorthand with the configured owner", () =>
    Effect.gen(function* () {
      const selected = yield* resolveConfiguredPackSelector({
        configured: [pack("toolkit", "registry")],
        configuredOwner: "@acme",
        selector: "@acme/packs/toolkit",
      });

      expect(selected.configuredName).toBe("toolkit");
      expect(selected.match).toBe("fqn");
    }),
  );

  it.effect("distinguishes a non-pack FQN", () =>
    Effect.gen(function* () {
      const error = yield* resolveConfiguredPackSelector({
        configured,
        selector: "@acme/skills/toolkit",
      }).pipe(Effect.flip);

      expect(error._tag).toBe("PackSelectorNotAPack");
    }),
  );

  it.effect("distinguishes an unknown pack FQN", () =>
    Effect.gen(function* () {
      const error = yield* resolveConfiguredPackSelector({
        configured,
        selector: "@acme/packs/missing",
      }).pipe(Effect.flip);

      expect(error._tag).toBe("PackNotConfigured");
    }),
  );

  it.effect("names every configured pack an ambiguous identity matches", () =>
    Effect.gen(function* () {
      const error = yield* resolveConfiguredPackSelector({
        configured: [
          pack("toolkit", "@acme/packs/toolkit@^1.0.0"),
          pack("toolkit-copy", "@acme/packs/toolkit@^2.0.0"),
        ],
        selector: "@acme/packs/toolkit",
      }).pipe(Effect.flip);

      expect(error._tag).toBe("PackSelectorAmbiguous");
      expect(error).toMatchObject({ configuredNames: ["toolkit", "toolkit-copy"] });
    }),
  );
});
