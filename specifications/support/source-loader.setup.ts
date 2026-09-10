/** Node's source-condition resolver for disposable-checkout specification runs. */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveWorkspaceSourceSpecifier } from "./source-package-resolver.js";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const sourceContext = context.conditions.includes("axm-source")
      ? context
      : { ...context, conditions: [...context.conditions, "axm-source"] };
    const workspaceSource = resolveWorkspaceSourceSpecifier(specifier);
    if (workspaceSource !== undefined) {
      return nextResolve(pathToFileURL(workspaceSource).href, sourceContext);
    }
    if (
      context.parentURL?.startsWith("file:") === true &&
      /\/(?:apps|packages|tools)\//u.test(context.parentURL) &&
      specifier.startsWith(".") &&
      specifier.endsWith(".js")
    ) {
      const sourceUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(sourceUrl))) return nextResolve(sourceUrl.href, sourceContext);
    }
    return nextResolve(specifier, sourceContext);
  },
});
