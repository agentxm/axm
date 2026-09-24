import { describe, expect, it } from "vitest";

import { collectSensitiveStrings, redactRegistryText, redactRegistryValue } from "./redaction.js";

describe("redactRegistryText", () => {
  it("redacts a bearer credential quoted back in a problem detail", () => {
    expect(redactRegistryText("rejected Authorization: Bearer axm_ses_live_abc123")).toBe(
      "rejected Authorization: [REDACTED] [REDACTED]",
    );
  });

  it("redacts a credential carried in a query string", () => {
    expect(redactRegistryText("GET /v1/x?access_token=axm_ses_live_abc123&page=2")).toBe(
      "GET /v1/x?access_token=[REDACTED]&page=2",
    );
  });

  it("leaves text without a credential shape unchanged", () => {
    expect(redactRegistryText("version 1.2.3 is already published")).toBe(
      "version 1.2.3 is already published",
    );
  });

  it("erases an exact secret a structured boundary carried, whatever its shape", () => {
    const secrets = collectSensitiveStrings({ body: { device_code: "plain-words-only" } });
    expect(secrets).toEqual(["plain-words-only"]);
    expect(redactRegistryText("Credential plain-words-only was revoked.", { secrets })).toBe(
      "Credential [REDACTED] was revoked.",
    );
  });

  it("keeps a secret too short to identify out of the erasure set", () => {
    expect(collectSensitiveStrings({ token: "abc" })).toEqual([]);
  });
});

describe("redactRegistryValue", () => {
  it("replaces every string under a sensitive key and redacts the rest", () => {
    expect(
      redactRegistryValue({
        token: "plain-words-only",
        detail: "Credential plain-words-only was revoked.",
        nested: [{ password: "hunter22", note: "Bearer abc.def" }],
        status: 401,
      }),
    ).toEqual({
      token: "[REDACTED]",
      detail: "Credential [REDACTED] was revoked.",
      nested: [{ password: "[REDACTED]", note: "Bearer [REDACTED]" }],
      status: 401,
    });
  });

  it("cuts circular references instead of recursing", () => {
    const value: { self?: unknown; name: string } = { name: "loop" };
    value.self = value;
    expect(redactRegistryValue(value)).toEqual({ name: "loop", self: "[Circular]" });
  });
});
