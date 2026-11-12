import { describe, expect, it } from "@effect/vitest";
import { TomlDate } from "smol-toml";
import * as Predicate from "effect/Predicate";
import * as Tracer from "effect/Tracer";
import * as Effect from "effect/Effect";
import {
  parseNativeConfigRoot,
  withNativeConfigReadView,
  type NativeConfigRootFailure,
} from "./native-config-syntax.js";

const parse = (format: "json" | "jsonc" | "yaml" | "toml", raw: string) =>
  parseNativeConfigRoot({
    format,
    raw,
    onFailure: (failure): NativeConfigRootFailure => failure,
  });

describe("native config root grammar", () => {
  it.effect("shares actual grammar work within a phase and refreshes the next phase", () =>
    Effect.gen(function* () {
      const spans: Tracer.Span[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = Tracer.nativeTracer.span(options);
          spans.push(span);
          return span;
        },
      });
      const read = withNativeConfigReadView(
        Effect.all(
          [
            parse("json", '{"servers":{"context":{"command":"node"}}}'),
            parse("json", '{"servers":{"context":{"command":"node"}}}'),
          ],
          { concurrency: "unbounded" },
        ),
      );
      yield* read.pipe(Effect.withTracer(tracer));
      expect(spans.filter((span) => span.name === "axm.parse.native")).toHaveLength(1);
      yield* read.pipe(Effect.withTracer(tracer));
      expect(spans.filter((span) => span.name === "axm.parse.native")).toHaveLength(2);
    }),
  );

  it.effect("does not let one consumer mutate another consumer's parsed snapshot", () =>
    withNativeConfigReadView(
      Effect.gen(function* () {
        const raw = '{"servers":{"context":{"command":"node"}}}';
        const first = yield* parse("json", raw);
        const servers = first["servers"];
        if (!Predicate.isObject(servers)) return expect.fail("Expected parsed servers object");
        servers["context"] = { command: "foreign mutation" };
        expect(yield* parse("json", raw)).toEqual({ servers: { context: { command: "node" } } });
      }),
    ),
  );

  it.effect("preserves TOML temporal kinds and isolates their mutable date values", () =>
    withNativeConfigReadView(
      Effect.gen(function* () {
        const raw =
          "day = 2026-10-15\nclock = 06:30:00.123\nlocal = 2026-10-15T06:30:00\noffset = 2026-10-15T06:30:00+02:30\n";
        const first = yield* parse("toml", raw);
        const day = first["day"];
        if (!(day instanceof TomlDate)) return expect.fail("Expected a TOML date value");
        expect(day.isDate()).toBe(true);
        day.setUTCFullYear(1999);
        const next = yield* parse("toml", raw);
        const expected = {
          day: "2026-10-15",
          clock: "06:30:00.123",
          local: "2026-10-15T06:30:00.000",
          offset: "2026-10-15T06:30:00.000+02:30",
        };
        for (const [key, text] of Object.entries(expected)) {
          const value = next[key];
          if (!(value instanceof TomlDate))
            return expect.fail("Expected retained TOML temporal kind");
          expect(value.toISOString()).toBe(text);
          expect(value.isDate()).toBe(key === "day");
          expect(value.isTime()).toBe(key === "clock");
          expect(value.isLocal()).toBe(key !== "offset");
        }
      }),
    ),
  );

  it.effect("keeps reader grammar and caller failure vocabulary separate when sharing", () =>
    withNativeConfigReadView(
      Effect.gen(function* () {
        const raw = '{ // comment\n "servers": {} }';
        expect(yield* parse("jsonc", raw)).toEqual({ servers: {} });
        for (const owner of ["first", "second"]) {
          const error = yield* parseNativeConfigRoot({
            format: "json",
            raw,
            onFailure: (failure) => ({ owner, reason: failure.reason }),
          }).pipe(Effect.flip);
          expect(error).toEqual({ owner, reason: "syntax" });
        }
        expect(yield* parse("json", '{"servers":{"later":true}}')).toEqual({
          servers: { later: true },
        });
      }),
    ),
  );

  it.effect("reads an empty file and a comment-only YAML document as an empty object", () =>
    Effect.gen(function* () {
      for (const format of ["json", "jsonc", "yaml", "toml"] as const)
        expect(yield* parse(format, " \n")).toEqual({});
      expect(yield* parse("yaml", "# only a comment\n")).toEqual({});
    }),
  );

  it.effect("tells a syntax failure from a root that is not an object", () =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(parse("json", "{ // comment\n}"))).toMatchObject({
        reason: "syntax",
      });
      expect(yield* parse("jsonc", "{ // comment\n}")).toEqual({});
      expect(yield* Effect.flip(parse("jsonc", "[1, 2]"))).toEqual({ reason: "shape" });
      expect(yield* Effect.flip(parse("yaml", "- item\n"))).toEqual({ reason: "shape" });
    }),
  );
});
