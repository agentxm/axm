import { withDetailedWork, workObservations } from "../locations/testing.js";
import { describe, expect, it } from "@effect/vitest";
import { TomlDate } from "smol-toml";
import * as Equal from "effect/Equal";
import * as Predicate from "effect/Predicate";
import * as Tracer from "effect/Tracer";
import * as Effect from "effect/Effect";
import {
  parseNativeConfigRoot,
  withNativeConfigObservationView,
  withNativeConfigPublicationView,
  withNativeConfigReadView,
  type NativeConfigRootFailure,
} from "./native-config-syntax.js";

const parse = (format: "json" | "jsonc" | "yaml" | "toml", raw: string) =>
  parseNativeConfigRoot({
    format,
    raw,
    onFailure: (failure): NativeConfigRootFailure => failure,
  });

/** Executed native parses of one effect, with its result. */
const counted = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const observations = workObservations(false);
    const value = yield* effect.pipe(observations.provide);
    return {
      value,
      parses: observations.facts.filter(({ kind }) => kind === "axm.parse.native").length,
    };
  });

/** What a reader can observe of a JSON-like value: own keys, reads, `in`, and the prototype chain. */
const observable = (value: unknown): unknown => {
  if (Array.isArray(value)) return { array: value.map(observable) };
  if (!Predicate.isObject(value)) return value;
  const prototype: unknown = Object.getPrototypeOf(value);
  return {
    own: Object.keys(value).map((key) => [key, observable(value[key])]),
    reads: ["version", "hooks", "a", "__proto__", "toString"].map((key) => [
      key,
      key in value,
      key === "__proto__" || key === "toString" ? typeof value[key] : observable(value[key]),
    ]),
    prototype:
      prototype === null
        ? null
        : prototype === Object.prototype
          ? "Object.prototype"
          : observable(prototype),
  };
};

/** What a reader can observe of YAML's tagged values and alias sharing. */
const observableYaml = (root: Readonly<Record<string, unknown>>) => {
  const { a, b, c, d, e, f } = root;
  return {
    keys: Object.keys(root),
    ownProto: Object.hasOwn(root, "__proto__") ? root["__proto__"] : "missing",
    date: a instanceof Date ? a.getTime() : "not a date",
    set: b instanceof Set ? [...b] : "not a set",
    bytes: c instanceof Uint8Array ? [...c] : "not bytes",
    map: d instanceof Map ? [...d] : "not a map",
    alias: Predicate.isObject(e) && e === f,
  };
};

const taggedYaml = (date = "2001-12-14", member = "x", base64 = "aGVsbG8=", value = 1) =>
  `a: !!timestamp ${date}\nb: !!set {${member}}\nc: !!binary ${base64}\nd: !!omap [{k: ${value}}]\ne: &shared {n: 1}\nf: *shared\n__proto__: {p: 1}\n`;

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
      yield* read.pipe(withDetailedWork(tracer));
      expect(spans.filter((span) => span.name === "axm.parse.native")).toHaveLength(1);
      yield* read.pipe(withDetailedWork(tracer));
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

  it.effect("observation views join an active enclosing view or open a faithful one", () =>
    Effect.gen(function* () {
      const raw = '{"__proto__":{"version":2}}';
      const joined = yield* counted(
        withNativeConfigReadView(
          Effect.all([parse("json", raw), withNativeConfigObservationView(parse("json", raw))]),
        ),
      );
      // The enclosing view's result and structured copies are kept.
      expect(joined.parses).toBe(1);
      expect(joined.value.map((root) => root["version"])).toEqual([undefined, undefined]);
      const opened = yield* counted(
        withNativeConfigObservationView(Effect.all([parse("json", raw), parse("json", raw)])),
      );
      expect(opened.parses).toBe(1);
      expect(opened.value.map((root) => root["version"])).toEqual([2, 2]);
      expect(opened.value[0]).not.toBe(opened.value[1]);
    }),
  );

  it.effect("publication views use fresh results and keep the enclosing copy mode", () =>
    Effect.gen(function* () {
      const raw = '{"__proto__":{"version":2}}';
      const enclosed = yield* counted(
        withNativeConfigReadView(
          Effect.all([
            parse("json", raw),
            withNativeConfigPublicationView(Effect.all([parse("json", raw), parse("json", raw)])),
          ]),
        ),
      );
      expect(enclosed.parses).toBe(2);
      expect(enclosed.value[1].map((root) => root["version"])).toEqual([undefined, undefined]);
      const alone = yield* counted(
        withNativeConfigPublicationView(Effect.all([parse("json", raw), parse("json", raw)])),
      );
      expect(alone.parses).toBe(1);
      expect(alone.value.map((root) => root["version"])).toEqual([2, 2]);
    }),
  );

  it.effect.each(["json", "jsonc"] as const)(
    "gives %s consumers of a faithful view exactly what an unshared parse gives them",
    (format) =>
      Effect.gen(function* () {
        for (const raw of [
          '{"__proto__":{"version":2}}',
          '{"__proto__":{"hooks":{"PreToolUse":"x"}}}',
          '{"__proto__":{"hooks":{}}}',
          '{"__proto__":null,"a":1}',
          '{"__proto__":{"__proto__":{"version":2},"hooks":[1]},"a":[{"__proto__":null}]}',
          '{"__proto__":[1,{"a":2}],"hooks":{}}',
        ]) {
          const unshared = yield* parse(format, raw);
          const shared = yield* withNativeConfigObservationView(
            Effect.all([parse(format, raw), parse(format, raw)]),
          );
          for (const copy of shared) expect(observable(copy)).toEqual(observable(unshared));
        }
        // An array root is refused before any copy, exactly as without a view.
        const arrayRoot = '[1,{"a":2}]';
        expect(yield* Effect.flip(parse(format, arrayRoot))).toEqual({ reason: "shape" });
        expect(
          yield* Effect.flip(withNativeConfigObservationView(parse(format, arrayRoot))),
        ).toEqual({ reason: "shape" });
      }),
  );

  it.effect("keeps null-prototype TOML records, own __proto__ keys and temporal kinds", () =>
    Effect.gen(function* () {
      const raw = "__proto__ = 1\nday = 2026-10-15\n[x]\n__proto__ = { a = 1 }\n";
      const unshared = yield* parse("toml", raw);
      const [first, second] = yield* withNativeConfigObservationView(
        Effect.all([parse("toml", raw), parse("toml", raw)]),
      );
      if (first === undefined || second === undefined) return expect.fail("Expected two copies");
      expect(observable(first)).toEqual(observable(unshared));
      expect(Object.getPrototypeOf(first)).toBeNull();
      expect(Object.hasOwn(first, "__proto__")).toBe(true);
      const day = first["day"];
      if (!(day instanceof TomlDate)) return expect.fail("Expected a TOML date value");
      expect(day.isDate()).toBe(true);
      expect(day).not.toBe(second["day"]);
    }),
  );

  it.effect("gives YAML consumers tagged values and aliases equal to an unshared parse", () =>
    Effect.gen(function* () {
      const raw = taggedYaml();
      const unshared = yield* parse("yaml", raw);
      const faithful = yield* withNativeConfigObservationView(parse("yaml", raw));
      const structured = yield* withNativeConfigReadView(
        withNativeConfigObservationView(parse("yaml", raw)),
      );
      expect(observableYaml(unshared)).toEqual({
        keys: ["a", "b", "c", "d", "e", "f", "__proto__"],
        ownProto: { p: 1 },
        date: Date.UTC(2001, 11, 14),
        set: ["x"],
        bytes: [104, 101, 108, 108, 111],
        map: [["k", 1]],
        alias: true,
      });
      expect(observableYaml(faithful)).toEqual(observableYaml(unshared));
      expect(observableYaml(structured)).toEqual(observableYaml(unshared));
      for (const changed of [
        taggedYaml("2001-12-15"),
        taggedYaml(undefined, "y"),
        taggedYaml(undefined, undefined, "aGVsbG9v"),
        taggedYaml(undefined, undefined, undefined, 2),
      ]) {
        const other = yield* withNativeConfigObservationView(parse("yaml", changed));
        expect(Equal.equals(faithful, other)).toBe(false);
        expect(Equal.equals(unshared, yield* parse("yaml", changed))).toBe(false);
      }
      expect(Equal.equals(faithful, unshared)).toBe(true);
    }),
  );

  it.effect("keeps each faithful consumer's values independent", () =>
    withNativeConfigObservationView(
      Effect.gen(function* () {
        const json = '{"__proto__":{"version":2},"hooks":{"Stop":[1]}}';
        const first = yield* parse("jsonc", json);
        const hooks = first["hooks"];
        const prototype: unknown = Object.getPrototypeOf(first);
        // Never mutate the shared Object.prototype if a copy dropped the parsed prototype.
        if (
          !Predicate.isObject(hooks) ||
          !Predicate.isObject(prototype) ||
          prototype === Object.prototype
        )
          return expect.fail("Expected parsed records with their parsed prototype");
        hooks["Stop"] = [];
        prototype["version"] = 3;
        const second = yield* parse("jsonc", json);
        expect([second["version"], second["hooks"]]).toEqual([2, { Stop: [1] }]);

        const yaml = taggedYaml();
        const tagged = yield* parse("yaml", yaml);
        const { a, b } = tagged;
        if (!(a instanceof Date) || !(b instanceof Set))
          return expect.fail("Expected tagged values");
        a.setTime(0);
        b.add("y");
        expect(observableYaml(yield* parse("yaml", yaml))).toMatchObject({
          date: Date.UTC(2001, 11, 14),
          set: ["x"],
        });
      }),
    ),
  );
});
