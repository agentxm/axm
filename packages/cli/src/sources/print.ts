/**
 * Source printing utilities.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";

import { config as bitbucketConfig } from "./bitbucket/index.js";
import { config as githubConfig } from "./github/index.js";
import { config as gitlabConfig } from "./gitlab/index.js";
import { config as localConfig } from "./local/index.js";
import type { Source, SourceConfig } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySourceConfig = SourceConfig<any, any>;

/** All source configs, type-erased for map building. */
const ALL_CONFIGS: ReadonlyArray<AnySourceConfig> = [
  githubConfig,
  gitlabConfig,
  bitbucketConfig,
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
export const printSource = (source: Source): string => {
  const cfg = CONFIG_BY_SOURCE_TYPE.get(source.source);
  if (cfg) return cfg.print(source);

  // Fallback for types without a config yet
  switch (source.source) {
    case "azurerepos":
      return `azurerepos:${source.organization}/${source.project}/${source.repo}`;
    case "git":
    case "registry":
      return "url" in source ? source.url : source.path;
    default:
      return source.source;
  }
};
