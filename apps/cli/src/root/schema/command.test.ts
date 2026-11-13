import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaRepresentation from "effect/SchemaRepresentation";
import { TestMachineRenderer, TestRenderer } from "../../test-support/presenter-test.js";
import { handleSchemaPath } from "./command.js";
import { schemaObject } from "./json-schema.js";

const capture = (path: ReadonlyArray<string>, field?: string, json = false) =>
  Effect.gen(function* () {
    const { layer, state } = json ? TestMachineRenderer.make() : TestRenderer.make();
    yield* handleSchemaPath(path, field, json).pipe(Effect.provide(layer));
    expect(state.docs).toHaveLength(1);
    expect(state.docs[0]?.channel).toBe("stdout");
    expect(state.results).toEqual([]);
    expect(state.credentials).toEqual([]);
    return (
      state.docs[0]?.doc.flatMap((node) => (node._tag === "raw" ? [node.content] : [])).join("") ??
      ""
    );
  });
const decodeObject = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);
const validator = (document: Record<string, unknown>) =>
  Schema.decodeUnknownSync(
    Schema.toType(
      SchemaRepresentation.fromJsonSchemaDocument(
        {
          dialect: "draft-2020-12",
          schema: document,
          definitions: Schema.decodeUnknownSync(
            Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
          )(document["$defs"] ?? {}),
        },
        { patterns: "apply" },
      ),
    ),
  );

describe("passive command schema discovery", () => {
  it.effect("explains publication fields and preserves nested status literals", () =>
    Effect.gen(function* () {
      const outline = yield* capture(["publish"]);
      expect(outline).toContain("Modes: preview, apply");
      expect(outline).toContain("ok agrees with process success");
      expect(outline).toContain("axm schema publish --field");
      expect(new TextEncoder().encode(outline).length).toBeLessThanOrEqual(8192);
      const field = yield* capture(["publish"], "result.execution.outcomes[].status");
      expect(field).toContain('"success"');
      expect(field).toContain('"failed"');
      expect(field).toContain("required");
      expect(new TextEncoder().encode(field).length).toBeLessThanOrEqual(4096);
    }),
  );

  it.effect(
    "exports a standalone actual stdout schema including scalar, error, and formatter alternatives",
    () =>
      Effect.gen(function* () {
        const document = decodeObject(yield* capture(["view"], undefined, true));
        expect(document["x-axm-command"]).toBe("axm view");
        expect(document["x-axm-validates"]).toBe("stdout");
        const decode = validator(document);
        for (const result of ["1.2.0", ["1.2.0", "1.1.0"], null]) {
          const stdout = { ok: true, mode: "query", outcome: "completed", result };
          expect(decode(stdout)).toEqual(stdout);
        }
        expect(() => decode("1.2.0")).toThrow();
        const error = { ok: false, code: "not_found", title: "Not found", detail: "No target." };
        expect(decode(error)).toEqual(error);
        const help = { type: "help", description: "View", usage: "axm view [flags]", flags: [] };
        expect(decode(help)).toEqual(help);
        expect(decode({ type: "version", name: "axm", version: "1.0.0" })).toMatchObject({
          type: "version",
        });
        const selected = decodeObject(yield* capture(["view"], "result", true));
        expect(selected["x-axm-validates"]).toBe("field-value");
        expect(validator(selected)("1.2.0")).toBe("1.2.0");
      }),
  );

  it.effect("keeps self-discovery finite and avoids nested generated exports", () =>
    Effect.gen(function* () {
      const text = yield* capture(["schema"], undefined, true);
      const document = decodeObject(text);
      expect(Object.keys(schemaObject(document["$defs"]))).not.toContain("PublishResultSchema");
      expect(text.length).toBeLessThan(100_000);
      expect(validator(document)(document)).toEqual(document);
    }),
  );

  it.effect(
    "refuses credential and unavailable external schema export with typed usage errors",
    () =>
      Effect.gen(function* () {
        for (const path of [
          ["token", "show"],
          ["token", "create"],
          ["lock", "export"],
        ]) {
          const { layer, state } = TestMachineRenderer.make();
          const error = yield* Effect.flip(
            handleSchemaPath(path, undefined, true).pipe(Effect.provide(layer)),
          );
          expect(error).toMatchObject({ _tag: "AppError", code: "usage" });
          expect(state.docs).toEqual([]);
          expect(state.credentials).toEqual([]);
        }
        expect(yield* capture(["token", "show"])).toContain("plain-only credential contract");
      }),
  );

  it.effect(
    "returns bounded nearby field recovery without accepting data keys or schema keywords",
    () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        const error = yield* Effect.flip(
          handleSchemaPath(["publish"], "result.execution.outcomes[].missing", true).pipe(
            Effect.provide(layer),
          ),
        );
        expect(error).toMatchObject({ code: "not_found" });
        expect("suggestions" in error && error.suggestions?.length).toBeLessThanOrEqual(5);
        expect(state.docs).toEqual([]);
        const keyword = yield* Effect.flip(
          handleSchemaPath(["publish"], "properties", true).pipe(Effect.provide(layer)),
        );
        expect(keyword).toMatchObject({ code: "not_found" });
      }),
  );
});
