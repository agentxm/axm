import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import {
  settleMcpSourceIdentity,
  type McpSourceAdmissionCodec,
  type McpSourceOwner,
} from "./source-admission.js";

const localName = decodeExtensionNameSync("context");

/** A source as admission sees it: where it is acquired from, and the package there. */
interface Source {
  readonly location: string;
  readonly fqn: string;
}

const codec: McpSourceAdmissionCodec<Source, string> = {
  encode: (source) => `key(${source.location}|${source.fqn})`,
  equals: (left, right) => left.location === right.location && left.fqn === right.fqn,
  display: (source) => `${source.fqn} from ${source.location}`,
};

const registry: Source = { location: "https://registry.example", fqn: "@acme/mcps/context" };
const git: Source = {
  location: "https://github.com/acme/extensions.git",
  fqn: "@acme/mcps/context",
};

const owner = (
  identity: Option.Option<Source>,
  fields: Partial<Extract<McpSourceOwner<Source>, { readonly kind: "sourced" }>> = {},
): McpSourceOwner<Source> => ({
  kind: "sourced",
  identity,
  localPath: null,
  locator: "@acme/mcps/context",
  display: "@acme/mcps/context",
  ...fields,
});

const settle = (
  requested: Source,
  existing: McpSourceOwner<Source> | undefined,
  request: { readonly localPath?: string; readonly locator?: string } = {},
) =>
  settleMcpSourceIdentity({
    localName,
    requested,
    requestedLocalPath: request.localPath ?? null,
    requestedLocator: request.locator ?? "@acme/mcps/context",
    existing,
    codec,
  });

describe("MCP source identity admission", () => {
  it.effect("accepts a new local name under the requested source's key", () =>
    Effect.gen(function* () {
      expect(yield* settle(registry, undefined)).toBe(codec.encode(registry));
    }),
  );

  it.effect(
    "matches a Git-sourced update to its own accepted source, whatever revision it names",
    () =>
      Effect.gen(function* () {
        const settled = yield* settle(
          git,
          owner(Option.some(git), { locator: "acme/extensions" }),
          {
            locator: "https://github.com/acme/extensions.git#v2",
          },
        );
        expect(settled).toBe(codec.encode(git));
      }),
  );

  it.effect("keeps the accepted identity for the same absolute local path", () =>
    Effect.gen(function* () {
      const accepted: Source = { location: "../context", fqn: "@acme/mcps/context" };
      const settled = yield* settle(
        { location: "./packages/context", fqn: "@acme/mcps/context" },
        owner(Option.some(accepted), { localPath: "/workspace/packages/context" }),
        { localPath: "/workspace/packages/context" },
      );
      expect(settled).toBe(codec.encode(accepted));
    }),
  );

  it.effect("matches an unresolved owner by the locator it declares", () =>
    Effect.gen(function* () {
      const settled = yield* settle(git, owner(Option.none(), { locator: "acme/extensions" }), {
        locator: "acme/extensions",
      });
      expect(settled).toBe(codec.encode(git));
    }),
  );

  it.effect("refuses the same package from a different source", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        settle({ ...registry, location: "https://mirror.example" }, owner(Option.some(registry))),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toMatchObject({
          requestedIdentity: "@acme/mcps/context from https://mirror.example",
          owningIdentity: "@acme/mcps/context",
        });
      }
    }),
  );

  it.effect("refuses a name already owned by an inline connection", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(settle(registry, { kind: "inline" }));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.owningIdentity).toBe("inline");
    }),
  );
});
