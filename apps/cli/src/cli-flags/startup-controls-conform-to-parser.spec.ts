import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { Command } from "effect/cli";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  axmGlobalFlags,
  jsonFlag,
  nonInteractiveFlag,
  quietFlag,
  debugFlag,
  verboseFlag,
} from "./index.js";
import { booleanOptionFromArgv } from "./argv-boolean.js";
import { baseLayer } from "../runtime.js";

export const specification = defineSpecification({
  requirement: "cli/startup-controls-conform-to-parser",
  title: "Startup control readers honor the registered Boolean grammar",
  statement:
    "Before parsing, AXM's readers of JSON, diagnostic verbosity, credential export, and unattended posture shall honor the registered Boolean vocabulary, including bare switches, explicit Boolean values, negation, and the option terminator, rather than interpreting an explicit false request as enabled. Startup diagnostic precedence shall agree with parsed diagnostic precedence.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const controls = [
  { names: ["--json", "-j"], setting: jsonFlag },
  { names: ["--non-interactive"], setting: nonInteractiveFlag },
] as const;
const diagnosticControls = [
  { names: ["--quiet", "-q"], setting: quietFlag },
  { names: ["--debug"], setting: debugFlag },
  { names: ["--verbose", "-v"], setting: verboseFlag },
] as const;

const values = ["true", "yes", "on", "1", "y", "false", "no", "off", "0", "n"] as const;

describe("Startup Boolean grammar", () => {
  for (const control of controls)
    for (const name of control.names) {
      it.effect(`matches the real parser for ${name}`, () =>
        Effect.gen(function* () {
          const parsed = yield* Ref.make(Option.none<boolean>());
          const command = Command.make("probe", {}, () =>
            Effect.flatMap(control.setting, (value) => Ref.set(parsed, value)),
          ).pipe(Command.withGlobalFlags(axmGlobalFlags));
          for (const args of [
            [name],
            [name, "true"],
            [name, "false"],
            ...values.map((value) => [`${name}=${value}`]),
            ...(name.startsWith("--") ? [[`--no-${name.slice(2)}`]] : []),
          ]) {
            yield* Command.runWith(command, { version: "0.0.0-test" })(args).pipe(
              Effect.provide(baseLayer),
            );
            expect(booleanOptionFromArgv(args, control.names)).toEqual(yield* Ref.get(parsed));
          }
          expect(booleanOptionFromArgv(["--", name], control.names)).toEqual(Option.none());
        }),
      );
    }
  for (const control of diagnosticControls) {
    it.effect(`matches the real parser for ${control.names[0]}`, () =>
      Effect.gen(function* () {
        const parsed = yield* Ref.make(false);
        const command = Command.make("probe", {}, () =>
          Effect.flatMap(control.setting, (value) => Ref.set(parsed, value)),
        ).pipe(Command.withGlobalFlags(axmGlobalFlags));
        for (const value of values) {
          const args = [`${control.names[0]}=${value}`];
          yield* Command.runWith(command, { version: "0.0.0-test" })(args).pipe(
            Effect.provide(baseLayer),
          );
          expect(Option.getOrElse(booleanOptionFromArgv(args, control.names), () => false)).toBe(
            yield* Ref.get(parsed),
          );
        }
      }),
    );
  }
});
