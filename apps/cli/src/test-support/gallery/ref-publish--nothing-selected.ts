import { publishFrame } from "./samples/publish-results.js";

/** A selection that matched nothing to publish: the verdict alone. */
export const refPublishNothingSelected = publishFrame({ mode: "apply", results: [] });
