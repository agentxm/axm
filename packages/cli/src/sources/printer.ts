/**
 * Source printer for canonical shorthand strings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";

import { config as azurereposConfig } from "./azurerepos/index.js";
import { config as bitbucketConfig } from "./bitbucket/index.js";
import { config as githubConfig } from "./github/index.js";
import { config as gitlabConfig } from "./gitlab/index.js";
import { config as localConfig } from "./local/index.js";
import type { SourceInput, SourceConfig } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySourceConfig = SourceConfig<any, any>;

/** All source configs, type-erased for map building. */
const ALL_CONFIGS: ReadonlyArray<AnySourceConfig> = [
  githubConfig,
  gitlabConfig,
  bitbucketConfig,
  azurereposConfig,
  localConfig,
];

/** Map from source type to its config. */
const CONFIG_BY_SOURCE_TYPE = new Map<string, AnySourceConfig>(
  Array.map(ALL_CONFIGS, (c) => [c.id, c] as const),
);

/**
 * Print a source as its canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSource = (source: SourceInput): string => {
  const cfg = CONFIG_BY_SOURCE_TYPE.get(source.source);
  if (cfg) return cfg.print(source);

  // Fallback for types without a config
  switch (source.source) {
    case "git":
      return "url" in source ? source.url : source.path;
    case "registry":
      return source.source;
    default:
      return source.source;
  }
};
