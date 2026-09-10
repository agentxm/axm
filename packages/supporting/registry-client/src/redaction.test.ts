import { describe, expect, it } from "vitest";

import { redactRegistryText } from "./redaction.js";

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
});
