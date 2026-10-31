import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { generateGlossary } from "./glossary.js";

NodeRuntime.runMain(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* generateGlossary(path.resolve(import.meta.dirname, "../../.."));
  }).pipe(Effect.provide(NodeServices.layer)),
);
