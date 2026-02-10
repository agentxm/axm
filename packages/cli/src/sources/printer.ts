/**
 * Source printer for canonical shorthand strings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";

import { descriptor as azurereposDescriptor } from "./azurerepos/index.js";
import { descriptor as bitbucketDescriptor } from "./bitbucket/index.js";
import { descriptor as githubDescriptor } from "./github/index.js";
import { descriptor as gitlabDescriptor } from "./gitlab/index.js";
import { descriptor as localDescriptor } from "./local/index.js";
import type { Source, SourceInput, SourceDescriptor } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySourceDescriptor = SourceDescriptor<any, any>;

/** All source descriptors, type-erased for map building. */
const ALL_DESCRIPTORS: ReadonlyArray<AnySourceDescriptor> = [
  githubDescriptor,
  gitlabDescriptor,
  bitbucketDescriptor,
  azurereposDescriptor,
  localDescriptor,
];

/** Map from source type to its descriptor. */
const DESCRIPTOR_BY_SOURCE_TYPE = new Map<string, AnySourceDescriptor>(
  Array.map(ALL_DESCRIPTORS, (c) => [c.id, c] as const),
);

/**
 * Print a source as its canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSource = (source: Source | SourceInput): string => {
  const cfg = DESCRIPTOR_BY_SOURCE_TYPE.get(source.source);
  if (cfg) return cfg.print(source);

  // Fallback for types without a descriptor
  switch (source.source) {
    case "git":
      return "url" in source ? source.url : source.path;
    case "registry":
      return source.source;
    default:
      return source.source;
  }
};
