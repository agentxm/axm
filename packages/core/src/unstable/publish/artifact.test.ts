import { describe, expect, it } from "vitest";
import { makeAppError } from "../app-error/index.js";
import { publishArtifact, withPublishArtifact } from "./artifact.js";

describe("publish artifacts", () => {
  it("creates a standard publish artifact", () => {
    expect(
      publishArtifact({
        path: "https://registry.example/@acme/skills/review",
        scope: "project",
        version: "1.2.3",
      }),
    ).toEqual({
      path: "https://registry.example/@acme/skills/review",
      scope: "project",
      version: "1.2.3",
      change: "created",
      targets: [
        {
          path: "https://registry.example/@acme/skills/review",
          change: "created",
        },
      ],
    });
  });

  it("attaches linked publish artifacts to successful step results", () => {
    expect(
      withPublishArtifact({
        result: {
          result: "success",
          message: "Published @acme/hooks/block-secrets@1.0.0",
          links: { html: "https://registry.example/@acme/hooks/block-secrets" },
        },
        fqn: "@acme/hooks/block-secrets",
        scope: "user",
        version: "1.0.0",
      }),
    ).toEqual({
      result: "success",
      message: "Published @acme/hooks/block-secrets@1.0.0",
      links: { html: "https://registry.example/@acme/hooks/block-secrets" },
      artifact: {
        path: "https://registry.example/@acme/hooks/block-secrets",
        scope: "user",
        version: "1.0.0",
        change: "created",
        targets: [
          {
            path: "https://registry.example/@acme/hooks/block-secrets",
            change: "created",
          },
        ],
      },
    });
  });

  it("uses the FQN fallback path and leaves errors unchanged", () => {
    expect(
      withPublishArtifact({
        result: {
          result: "success",
          message: "Published @acme/mcps/context@1.0.0",
        },
        fqn: "@acme/mcps/context",
        scope: "project",
        version: "1.0.0",
      }),
    ).toMatchObject({
      artifact: {
        path: "@acme/mcps/context@1.0.0",
      },
    });

    const error = {
      result: "error" as const,
      message: "failed",
      error: makeAppError({ code: "internal", detail: "failed" }),
    };

    expect(
      withPublishArtifact({
        result: error,
        fqn: "@acme/mcps/context",
        scope: "project",
        version: "1.0.0",
      }),
    ).toBe(error);
  });
});
