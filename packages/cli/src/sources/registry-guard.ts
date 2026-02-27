/**
 * Registry guard - ensures at least one registry source is configured.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// TODO: (#36) node:os is a convention violation (CLAUDE.md requires @effect/platform).
// Could pass home directory as parameter or use a Config service.
import { homedir } from "node:os";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import { CliFlags } from "../cli-flags/index.js";
import { ClackPrompt } from "../clack-effect/index.js";
import { makeCliError } from "../cli-error/index.js";
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
  const flags = yield* CliFlags;
  const registrySources = yield* workspace.getRegistrySourceHosts();

  // Already configured - no-op
  if (registrySources.length > 0) return;

  // Not configured in non-interactive mode - fail
  if (flags.nonInteractive) {
    return yield* makeCliError({
      code: "REGISTRY_NOT_CONFIGURED",
      what: `No registry source configured`,
      howToFix: `Add a registry source to .axm/settings.json:\n\n{\n  "sources": [\n    { "name": "local", "type": "registry", "location": "/path/to/registry" }\n  ]\n}`,
    });
  }

  // Interactive mode - prompt for path
  const prompt = yield* ClackPrompt;
  const path = yield* prompt.text({
    message: "No registry configured. Enter a local registry path:",
  });

  // Normalize path (expand ~, resolve relative)
  const pathService = yield* Path.Path;
  const normalizedPath =
    path.startsWith("~/") || path === "~"
      ? pathService.resolve(homedir(), path.slice(path === "~" ? 1 : 2))
      : pathService.resolve(path);

  // Persist to settings
  yield* workspace.addConfiguredSource({
    name: "local",
    type: "registry",
    location: new URL(`file://${normalizedPath}`),
  });
});
