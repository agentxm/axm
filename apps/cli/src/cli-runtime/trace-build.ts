import * as Schema from "effect/Schema";

declare const __AXM_BUILD_REVISION__: string;
declare const __AXM_BUILD_DIRTY__: boolean;
declare const __AXM_VERSION__: string;

const revision = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|unknown)$/));
const version = Schema.String.check(
  Schema.isPattern(/^(?:\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?|unknown)$/),
);
export const TraceBuildSchema = Schema.Struct({
  version,
  revision,
  dirty: Schema.Boolean,
  execution: Schema.Literals(["source", "compiled"]),
  runtime: Schema.Literals(["node", "bun"]),
  runtimeVersion: version,
});
export type TraceBuild = typeof TraceBuildSchema.Type;

/** Build metadata is supplied by the producer; diagnostics never invoke Git. */
export const traceBuild = (
  environment: Readonly<Record<string, string | undefined>>,
  sourceVersion = "unknown",
): TraceBuild => {
  const compiled = typeof __AXM_BUILD_REVISION__ === "string";
  const sourceRevision = compiled
    ? __AXM_BUILD_REVISION__
    : environment["AXM_TRACE_BUILD_REVISION"];
  const packageVersion = typeof __AXM_VERSION__ === "string" ? __AXM_VERSION__ : sourceVersion;
  const runtimeVersion = process.versions["bun"] ?? process.versions.node;
  return {
    version: Schema.is(version)(packageVersion) ? packageVersion : "unknown",
    revision: Schema.is(revision)(sourceRevision) ? sourceRevision : "unknown",
    dirty: compiled ? __AXM_BUILD_DIRTY__ : environment["AXM_TRACE_BUILD_DIRTY"] === "1",
    execution: compiled ? "compiled" : "source",
    runtime: process.versions["bun"] === undefined ? "node" : "bun",
    runtimeVersion: Schema.is(version)(runtimeVersion) ? runtimeVersion : "unknown",
  };
};
