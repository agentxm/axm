import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { settleMcpSourceIdentity } from "./source-admission.js";

const localName = decodeExtensionNameSync("context");

describe("MCP source identity admission", () => {
  it.effect("accepts a new local name", () =>
    Effect.gen(function* () {
      const settled = yield* settleMcpSourceIdentity({
        localName,
        requestedIdentity: "@acme/mcps/context",
        requestedLocalPath: null,
        existing: undefined,
      });
      expect(settled).toBe("@acme/mcps/context");
    }),
  );

  it.effect("accepts the same source identity", () =>
    Effect.gen(function* () {
      const settled = yield* settleMcpSourceIdentity({
        localName,
        requestedIdentity: "@acme/mcps/context",
        requestedLocalPath: null,
        existing: { sourceIdentity: "@acme/mcps/context", localPath: null },
      });
      expect(settled).toBe("@acme/mcps/context");
    }),
  );

  it.effect("keeps the accepted identity for the same absolute local path", () =>
    Effect.gen(function* () {
      const settled = yield* settleMcpSourceIdentity({
        localName,
        requestedIdentity: "./packages/context",
        requestedLocalPath: "/workspace/packages/context",
        existing: {
          sourceIdentity: "../context",
          localPath: "/workspace/packages/context",
        },
      });
      expect(settled).toBe("../context");
    }),
  );

  it.effect("refuses a different source", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        settleMcpSourceIdentity({
          localName,
          requestedIdentity: "@other/mcps/context",
          requestedLocalPath: null,
          existing: { sourceIdentity: "@acme/mcps/context", localPath: null },
        }),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toMatchObject({
          _tag: "McpConnectionConflict",
          requestedIdentity: "@other/mcps/context",
          owningIdentity: "@acme/mcps/context",
        });
      }
    }),
  );

  it.effect("refuses a name already owned by an inline connection", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        settleMcpSourceIdentity({
          localName,
          requestedIdentity: "@acme/mcps/context",
          requestedLocalPath: null,
          existing: { sourceIdentity: null, localPath: null },
        }),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.owningIdentity).toBe("inline");
    }),
  );
});
