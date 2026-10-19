import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { DiscoverPackagesRequestSchema } from "./discover-schema.js";

describe("discover-schema", () => {
  it.each([500, 501])(
    "limits the total declaration count across packages to 500 (received %s)",
    (count) => {
      const declaration = {
        ref: "@acme/skills/example",
        source: { type: "registry", url: "https://registry.example.test" },
      };
      const payload = {
        client: { axmVersion: "0.32.0" },
        packages: [250, count - 250].map((length, index) => ({
          purl: `pkg:npm/example-${index}`,
          version: "1.0.0",
          declaredExtensions: Array.from({ length }, () => declaration),
        })),
      };
      const decode = () => Schema.decodeUnknownSync(DiscoverPackagesRequestSchema)(payload);
      if (count === 500) expect(decode).not.toThrow();
      else expect(decode).toThrow();
    },
  );

  it.each([
    {
      label: "Registry",
      declaration: {
        ref: "@acme/skills/code-review",
        source: { type: "registry", url: "https://registry.example.test" },
        versionRange: "^1.0.0",
      },
    },
    {
      label: "Git",
      declaration: {
        ref: "@acme/skills/code-review",
        source: {
          type: "git",
          url: "https://github.com/acme/extensions.git",
          path: "skills/code-review",
          revision: "v1.2.3",
        },
      },
    },
    {
      label: "path",
      declaration: {
        ref: "@acme/skills/code-review",
        source: { type: "path", path: "extensions/code-review" },
      },
    },
  ])("accepts a normalized $label recommendation request", ({ declaration }) => {
    const result = Schema.decodeUnknownSync(DiscoverPackagesRequestSchema)({
      client: { axmVersion: "0.32.0" },
      packages: [
        {
          purl: "pkg:npm/react",
          version: "18.2.0",
          declaredExtensions: [declaration],
        },
      ],
    });

    expect(result.packages[0]?.declaredExtensions[0]?.source.type).toBe(declaration.source.type);
  });
});
