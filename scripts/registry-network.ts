import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { controlNetwork, NetworkControlError, Profile } from "./registry-network/control.js";

const program = Effect.gen(function* () {
  const args = yield* Effect.try({
    try: () => parseArgs({
      args: process.argv.slice(2), allowPositionals: true, strict: true,
      options: {
        upstream: { type: "string" }, port: { type: "string" }, profile: { type: "string" },
        json: { type: "boolean" }, help: { type: "boolean" },
      },
    }),
    catch: () => new NetworkControlError({ message: "Invalid arguments. Use registry:network --help." }),
  });
  if (args.values.help) return yield* Console.log(
    "registry:network start --upstream http://127.0.0.1:PORT [--port 18080] [--profile baseline|typical|slow|variable|constrained]\n" +
    "registry:network status [--json]\nregistry:network stop\n" +
    "Start the pinned control server separately with registry:network:serve. All results are JSON; Nx adds launcher output.",
  );
  const action = yield* Schema.decodeUnknownEffect(Schema.Literals(["start", "status", "stop"]))(args.positionals[0] ?? "status");
  if (args.positionals.length > 1 || (action !== "start" &&
      (args.values.upstream !== undefined || args.values.port !== undefined || args.values.profile !== undefined))) {
    return yield* new NetworkControlError({ message: "Only start accepts upstream, port, and profile options." });
  }
  const worktree = yield* Effect.try({
    try: () => realpathSync(fileURLToPath(new URL("..", import.meta.url))),
    catch: () => new NetworkControlError({ message: "Cannot resolve this worktree's root." }),
  });
  const result = yield* controlNetwork({
    action, worktree,
    api: process.env["AXM_REGISTRY_NETWORK_API"] ?? "http://127.0.0.1:8474",
    ...(args.values.upstream === undefined ? {} : { upstream: args.values.upstream }),
    ...(args.values.port === undefined ? {} : { port: Number(args.values.port) }),
    ...(args.values.profile === undefined ? {} : {
      profile: yield* Schema.decodeUnknownEffect(Profile)(args.values.profile),
    }),
  });
  yield* Console.log(JSON.stringify(result));
});

NodeRuntime.runMain(program.pipe(
  Effect.provide(FetchHttpClient.layer),
  Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", cache: "no-store" }),
));
