/**
 * Registry guard - ensures at least one registry source is configured.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../cli-error/index.js";
import { TextInput } from "../tui/index.js";
import { Workspace } from "../workspace/index.js";

/**
 * Ensure at least one registry source is configured.
 *
 * - If already configured: no-op
 * - If NOT configured:
 *   - Interactive mode: prompt for local registry path, persist via addConfiguredSource
 *   - Non-interactive mode: fail with CliError (REGISTRY_NOT_CONFIGURED)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const registryGuard = Effect.gen(function* () {
  const workspace = yield* Workspace;
  const registrySources = yield* workspace.getConfiguredRegistrySources(Option.none());

  // Already configured - no-op
  if (registrySources.length > 0) return;

  // Not configured in non-interactive mode - fail
  if (workspace.nonInteractive) {
    return yield* makeCliError({
      code: "REGISTRY_NOT_CONFIGURED",
      what: `No registry source configured`,
      howToFix: `Add a registry source to .axm/settings.json:\n\n{\n  "sources": [\n    { "name": "local", "type": "registry", "url": "/path/to/registry" }\n  ]\n}`,
    });
  }

  // Interactive mode - prompt for path
  const textInput = yield* TextInput;
  const path = yield* textInput.prompt({
    message: "No registry configured. Enter a local registry path:",
  });

  // Normalize path (expand ~, resolve relative)
  const pathService = yield* Path.Path;
  const normalizedPath =
    path.startsWith("~/") || path === "~"
      ? pathService.resolve(process.env["HOME"] ?? "~", path.slice(path === "~" ? 1 : 2))
      : pathService.resolve(path);

  // Persist to settings
  yield* workspace.addConfiguredSource({
    name: "local",
    type: "registry",
    url: new URL(`file://${normalizedPath}`),
  });
});
