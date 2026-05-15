import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { makeAppError } from "../app-error/index.js";
import { BreadcrumbSchema } from "./breadcrumb.js";
import {
  JsonEnvelopeSchema,
  makeJsonErrorEnvelopeFromAppError,
  makeJsonSuccessEnvelope,
} from "./json-envelope.js";

describe("BreadcrumbSchema", () => {
  it("decodes template and runnable breadcrumbs", () => {
    const decode = Schema.decodeUnknownSync(BreadcrumbSchema);

    expect(decode({ description: "Edit the file", cmd: "axm edit" })).toEqual({
      description: "Edit the file",
      cmd: "axm edit",
    });
    expect(decode({ description: "Apply changes", cmd: "axm sync" })).toEqual({
      description: "Apply changes",
      cmd: "axm sync",
    });
  });

  it("decodes guidance-only breadcrumbs", () => {
    expect(Schema.decodeUnknownSync(BreadcrumbSchema)({ description: "Edit the file" })).toEqual({
      description: "Edit the file",
    });
  });

  it("decodes URL breadcrumbs", () => {
    expect(
      Schema.decodeUnknownSync(BreadcrumbSchema)({
        description: "View in browser",
        url: "https://agentxm.ai/acme/skills/review",
      }),
    ).toEqual({
      description: "View in browser",
      url: "https://agentxm.ai/acme/skills/review",
    });
  });
});

describe("JsonEnvelopeSchema", () => {
  it("decodes success envelopes with breadcrumbs", () => {
    const envelope = makeJsonSuccessEnvelope({
      payload: { name: "code-reviewer" },
      summary: "Created subagent code-reviewer",
      breadcrumbs: [
        { description: "Edit the file", cmd: "axm edit" },
        { description: "Apply changes", cmd: "axm sync" },
      ],
    });

    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toEqual(envelope);
  });

  it("emits the documented AppError envelope shape", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({
        code: "auth",
        detail: "Authentication required",
        breadcrumbs: [
          {
            description: "Sign in, then retry.",
          },
        ],
      }),
    );

    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toEqual({
      ok: false,
      code: "auth",
      title: "Unauthorized",
      detail: "Authentication required",
      breadcrumbs: [
        {
          description: "Sign in, then retry.",
        },
      ],
    });
  });

  it("falls back to the default breadcrumbs for the error code when none are supplied", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({ code: "internal", detail: "Something broke" }),
    );

    expect(envelope.breadcrumbs).toEqual([
      {
        description:
          "This looks like a bug. Please report it, including the request ID if one is shown.",
        url: "https://github.com/agentxm/axm/issues",
      },
    ]);
  });

  it("omits breadcrumbs when the error code has no defaults and none are supplied", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({ code: "not_found", detail: "Resource missing" }),
    );

    expect(envelope.breadcrumbs).toBeUndefined();
  });
});
