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

    expect(decode({ task: "edit", description: "Edit the file", cmd: "axm edit" })).toEqual({
      task: "edit",
      description: "Edit the file",
      cmd: "axm edit",
    });
    expect(
      decode({ task: "sync", description: "Apply changes", command: ["axm", "sync"] }),
    ).toEqual({
      task: "sync",
      description: "Apply changes",
      command: ["axm", "sync"],
    });
  });

  it("decodes guidance-only breadcrumbs", () => {
    expect(
      Schema.decodeUnknownSync(BreadcrumbSchema)({ task: "edit", description: "Edit the file" }),
    ).toEqual({ task: "edit", description: "Edit the file" });
  });
});

describe("JsonEnvelopeSchema", () => {
  it("decodes success envelopes with breadcrumbs", () => {
    const envelope = makeJsonSuccessEnvelope({
      payload: { name: "code-reviewer" },
      summary: "Created subagent code-reviewer",
      breadcrumbs: [
        { task: "edit", description: "Edit the file", cmd: "axm edit" },
        { task: "sync", description: "Apply changes", command: ["axm", "sync"] },
      ],
    });

    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toEqual(envelope);
  });

  it("decodes error envelopes with breadcrumbs from AppError", () => {
    const envelope = makeJsonErrorEnvelopeFromAppError(
      makeAppError({
        code: "WORKSPACE_NOT_FOUND",
        category: "not_found",
        what: "No workspace found",
        breadcrumbs: [
          {
            task: "init",
            description: "Initialize an AXM workspace",
            command: ["axm", "init"],
          },
        ],
      }),
      2,
    );

    expect(Schema.decodeUnknownSync(JsonEnvelopeSchema)(envelope)).toEqual({
      ok: false,
      code: "WORKSPACE_NOT_FOUND",
      category: "not_found",
      message: "No workspace found",
      breadcrumbs: [
        {
          task: "init",
          description: "Initialize an AXM workspace",
          command: ["axm", "init"],
        },
      ],
      exitCode: 2,
    });
  });
});
