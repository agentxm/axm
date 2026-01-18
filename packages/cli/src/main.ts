#!/usr/bin/env bun
import { Effect, Console } from "effect"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

const version = "0.0.1"

const program = Effect.gen(function* () {
  const argv = yield* Effect.promise(() =>
    yargs(hideBin(process.argv))
      .scriptName("axm")
      .version(version)
      .help()
      .strict()
      .demandCommand(0)
      .parse()
  )

  yield* Console.log("AgentXM CLI ready")
})

Effect.runPromise(program).catch((error) => {
  console.error(error)
  process.exit(1)
})
