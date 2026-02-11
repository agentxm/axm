/**
 * Source printer for canonical shorthand strings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { descriptor as azurereposDescriptor } from "./azurerepos/index.js";
import { descriptor as bitbucketDescriptor } from "./bitbucket/index.js";
import { descriptor as githubDescriptor } from "./github/index.js";
import { descriptor as gitlabDescriptor } from "./gitlab/index.js";
import { descriptor as localDescriptor } from "./local/index.js";
import type { SourceInput } from "./types.js";

/**
 * Print a source input as its canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSourceInput = (source: SourceInput): string => {
  switch (source.source) {
    case "github":
      return githubDescriptor.print(source);
    case "gitlab":
      return gitlabDescriptor.print(source);
    case "bitbucket":
      return bitbucketDescriptor.print(source);
    case "azurerepos":
      return azurereposDescriptor.print(source);
    case "local":
      return localDescriptor.print(source);
    case "git":
      return source.url.href;
    case "registry":
      return `${source.scope}/${source.name}`;
  }
};
