/**
 * Source printer for canonical shorthand strings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { print as azurereposPrint } from "./azurerepos/index.js";
import { print as bitbucketPrint } from "./bitbucket/index.js";
import { print as githubPrint } from "./github/index.js";
import { print as gitlabPrint } from "./gitlab/index.js";
import { print as localPrint } from "./local/index.js";
import type { SourceInput } from "./types.js";

/**
 * Print a source input as its canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSourceInput = (source: SourceInput): string => {
  switch (source.type) {
    case "github":
      return githubPrint(source);
    case "gitlab":
      return gitlabPrint(source);
    case "bitbucket":
      return bitbucketPrint(source);
    case "azurerepos":
      return azurereposPrint(source);
    case "local":
      return localPrint(source);
    case "git":
      return source.url.href;
    case "registry":
      return `${source.scope}/${source.name}`;
  }
};
