import * as Context from "effect/Context";

/** Composition-only switch; exporters remain owned by the invocation runtime. */
export const LocalTraceEnabled = Context.Reference<boolean>("axm/cli/LocalTraceEnabled", {
  defaultValue: () => false,
});
