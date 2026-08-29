import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { makeAppError } from "../app-error/index.js";
import { SettingsDecodeError } from "../workspace/read-model/errors.js";
import { SuggestedActionSchema } from "./suggested-action.js";
import {
  JsonEnvelopeSchema,
  makeJsonErrorEnvelopeFromAppError,
  makeJsonSuccessEnvelope,
} from "./json-envelope.js";

describe("SuggestedActionSchema", () => {
  it("decodes template and runnable suggestions", () => {
    const decode = Schema.decodeUnknownSync(SuggestedActionSchema);

    expect(decode({ description: "Edit the file", cmd: "axm edit" })).toEqual({
      description: "Edit the file",
      cmd: "axm edit",
    });
    expect(decode({ description: "Apply changes", cmd: "axm sync" })).toEqual({
      description: "Apply changes",
      cmd: "axm sync",
    });
  });

  it("decodes guidance-only suggestions", () => {
    expect(
      Schema.decodeUnknownSync(SuggestedActionSchema)({ description: "Edit the file" }),
    ).toEqual({
      description: "Edit the file",
    });
  });

  it("decodes URL suggestions", () => {
    expect(
      Schema.decodeUnknownSync(SuggestedActionSchema)({
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
  const secretSentinel = "AXM_SECRET_SENTINEL_92";

  it("decodes success envelopes with suggestions", () => {
    const envelope = makeJsonSuccessEnvelope({
      payload: { name: "code-reviewer" },
      summary: "Created subagent code-reviewer",
      suggestions: [
        { description: "Edit the file", cmd: "axm edit" },
        { description: "Apply changes", cmd: "axm sync" },
      ],
    });

    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toEqual(envelope);
    expect(envelope).toMatchObject({
      ok: true,
      result: { name: "code-reviewer" },
    });
  });

  it("keeps an existing result payload at the one documented envelope key", () => {
    expect(makeJsonSuccessEnvelope({ payload: { result: { outcome: "applied" } } })).toEqual({
      ok: true,
      result: { outcome: "applied" },
    });
  });

  it("places scalar payloads at the same result envelope key", () => {
    expect(makeJsonSuccessEnvelope({ payload: "1.2.3" })).toEqual({
      ok: true,
      result: "1.2.3",
    });
    expect(makeJsonSuccessEnvelope({ payload: null })).toEqual({
      ok: true,
      result: null,
    });
  });

  it("emits the documented AppError envelope shape", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({
        code: "auth",
        detail: "Authentication required",
        suggestions: [
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
      suggestions: [
        {
          description: "Sign in, then retry.",
        },
      ],
    });
  });

  it("emits a structured human authentication handoff", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({
        code: "auth_required",
        status: "pending-human",
        retryable: true,
        blockedOn: "human",
        action: {
          kind: "open-url",
          url: "https://agentxm.ai/device?user_code=ABCD-1234",
          fallbackUrl: "https://agentxm.ai/device",
          code: "ABCD-1234",
          expiresAt: "2026-08-03T15:10:00.000Z",
          resume: "axm login --wait --json",
        },
      }),
    );

    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toMatchObject({
      ok: false,
      code: "auth_required",
      status: "pending-human",
      retryable: true,
      blockedOn: "human",
      action: {
        kind: "open-url",
        url: "https://agentxm.ai/device?user_code=ABCD-1234",
        fallbackUrl: "https://agentxm.ai/device",
        code: "ABCD-1234",
        resume: "axm login --wait --json",
      },
    });
  });

  it("emits request and normalized response metadata", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({
        code: "internal",
        detail: "Registry failed",
        metadata: {
          request: {
            service: "registry",
            method: "PUT",
            url: "http://localhost:4300/v1/extensions/@examples/packs/demo/0.1.0",
          },
          response: {
            status: 500,
            requestId: "req_123",
            problemCode: "internal",
            body: { code: "internal", requestId: "req_123" },
          },
        },
      }),
    );

    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toEqual({
      ok: false,
      code: "internal",
      title: "Internal Error",
      detail: "Registry failed",
      metadata: {
        request: {
          service: "registry",
          method: "PUT",
          url: "http://localhost:4300/v1/extensions/@examples/packs/demo/0.1.0",
        },
        response: {
          status: 500,
          requestId: "req_123",
          problemCode: "internal",
          body: { code: "internal", requestId: "req_123" },
        },
      },
      suggestions: [
        {
          description:
            "This looks like a bug. Please report it, including the request ID if one is shown.",
          url: "https://github.com/agentxm/axm/issues",
        },
      ],
    });
  });

  it("falls back to the default suggestions for the error code when none are supplied", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({ code: "internal", detail: "Something broke" }),
    );

    expect(envelope.suggestions).toEqual([
      {
        description:
          "This looks like a bug. Please report it, including the request ID if one is shown.",
        url: "https://github.com/agentxm/axm/issues",
      },
    ]);
  });

  it("omits suggestions when the error code has no defaults and none are supplied", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({ code: "not_found", detail: "Resource missing" }),
    );

    expect(envelope.suggestions).toBeUndefined();
  });

  it("includes structured cause chains without debug stacks", () => {
    const cause = new Error("decode failed");
    cause.stack = "Error: decode failed\n at test";

    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({ code: "internal", detail: "Failed to read workspace settings", cause }),
    );

    expect(envelope.cause).toEqual([{ _tag: "Error", message: "decode failed" }]);
    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toEqual(envelope);
  });

  it("serializes structured tagged error fields when the cause message is blank", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({
        code: "internal",
        detail: "Failed to read workspace settings",
        cause: new SettingsDecodeError({
          path: "/workspace/axm.json",
          issues: ["mcpServers.bad: expected source, command, or url"],
          raw: { mcpServers: { bad: { foo: "bar" } } },
        }),
      }),
    );

    expect(envelope.cause).toEqual([
      {
        _tag: "SettingsDecodeError",
        message: "mcpServers.bad: expected source, command, or url",
      },
    ]);
  });

  it("includes cause stacks only under debug", () => {
    const cause = new Error("decode failed");
    cause.stack = "Error: decode failed\n at test";

    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({ code: "internal", detail: "Failed to read workspace settings", cause }),
      { debug: true },
    );

    expect(envelope.cause).toEqual([
      { _tag: "Error", message: "decode failed", stack: "Error: decode failed\n at test" },
    ]);
  });

  it.each([
    { debug: false, label: "normal" },
    { debug: true, label: "debug" },
  ])("redacts secrets from $label error envelopes", ({ debug }) => {
    const cause = new Error(`request failed with ${secretSentinel}`);
    cause.stack = `Error: ${secretSentinel}\n at https://registry.test/callback?token=${secretSentinel}`;
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({
        code: "internal",
        title: `Failure ${secretSentinel}`,
        detail: `Registry rejected ${secretSentinel}`,
        metadata: {
          request: {
            service: "registry",
            method: "POST",
            url: `https://registry.test/v1?access_token=${secretSentinel}`,
          },
          response: {
            status: 500,
            body: {
              access_token: secretSentinel,
              nested: { message: `do not expose ${secretSentinel}` },
            },
          },
        },
        cause,
        suggestions: [
          {
            description: `Retry without ${secretSentinel}`,
            url: `https://registry.test/retry?code=${secretSentinel}`,
          },
        ],
      }),
      { debug },
    );

    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(secretSentinel);
    expect(serialized).toContain("[REDACTED]");
    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toEqual(envelope);
  });

  it("omits cause when no cause is attached", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({ code: "not_found", detail: "Resource missing" }),
    );

    expect(envelope.cause).toBeUndefined();
  });
});
