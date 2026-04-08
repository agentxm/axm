import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Command } from "effect/unstable/cli";

import { jsonFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const PetResult = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
});

const sampleData = {
  name: "Mochi",
  species: "cat",
  age: "2 years",
  adoptable: true,
};

const sampleStreamData = [
  { name: "Mochi", species: "cat", age: "2 years", adoptable: true },
  { name: "Pickles", species: "dog", age: "4 months", adoptable: true },
  { name: "Juniper", species: "rabbit", age: "1 year", adoptable: false },
];

const resultConfig = {} as const;

export const resultCommand = Command.make("result", resultConfig, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const json = Option.getOrElse(yield* jsonFlag, () => false);

      if (json) {
        yield* renderer.result(sampleData, PetResult);
        yield* renderer.resultStream(Stream.fromIterable(sampleStreamData), PetResult);
      } else {
        yield* renderer.success(`Pet: ${sampleData.name}`);
        yield* renderer.info(`Species: ${sampleData.species}`);
        yield* renderer.info(`Age: ${sampleData.age}`);
        yield* renderer.info(`Adoptable: ${sampleData.adoptable ? "yes" : "no"}`);
        yield* renderer.info("--- Stream items ---");
        yield* Effect.forEach(sampleStreamData, (item) =>
          renderer.info(`  ${item.name} (${item.species}, ${item.age})`),
        );
      }
    }),
    { command: "outputs result" },
  ),
).pipe(Command.withDescription("Demo structured result output"));
