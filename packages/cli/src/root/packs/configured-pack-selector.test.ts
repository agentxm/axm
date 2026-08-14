import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { ConfiguredRecordRow } from "@agentxm/client-core/unstable/workspace";

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
    pack("toolkit", "workspace:@acme/packs/toolkit"),
    pack("reviewers", "@acme/packs/reviewers@^1.0.0"),
  ];

  it.effect("prefers an exact configured local name", () =>
    Effect.gen(function* () {
      const selected = yield* resolveConfiguredPackSelector({
        configured,
        selector: "toolkit",
      });

      expect(selected.configuredName).toBe("toolkit");
      expect(selected.match).toBe("local-name");
      expect(selected.entry.source).toBe("workspace:@acme/packs/toolkit");
    }),
  );

  it.effect("resolves a unique workspace pack FQN", () =>
    Effect.gen(function* () {
      const selected = yield* resolveConfiguredPackSelector({
        configured,
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

      expect(error.code).toBe("validation");
      expect(error.detail).toContain("does not identify a pack");
    }),
  );

  it.effect("distinguishes an unknown pack FQN", () =>
    Effect.gen(function* () {
      const error = yield* resolveConfiguredPackSelector({
        configured,
        selector: "@acme/packs/missing",
      }).pipe(Effect.flip);

      expect(error.code).toBe("not_found");
      expect(error.detail).toContain("not configured");
    }),
  );

  it.effect("rejects an ambiguous configured pack identity with local recovery selectors", () =>
    Effect.gen(function* () {
      const error = yield* resolveConfiguredPackSelector({
        configured: [
          pack("toolkit", "workspace:@acme/packs/toolkit"),
          pack("toolkit-copy", "workspace:@acme/packs/toolkit"),
        ],
        selector: "@acme/packs/toolkit",
        recovery: { command: "add", extension: "@acme/skills/review" },
      }).pipe(Effect.flip);

      expect(error.code).toBe("conflict");
      expect(error.detail).toContain("multiple configured packs");
      expect(error.suggestions).toEqual([
        {
          description: "Use configured pack name toolkit",
          cmd: "axm packs add toolkit @acme/skills/review",
        },
        {
          description: "Use configured pack name toolkit-copy",
          cmd: "axm packs add toolkit-copy @acme/skills/review",
        },
      ]);
    }),
  );
});
