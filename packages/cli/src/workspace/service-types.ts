/**
 * Workspace context service types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Lockfile } from "../lockfile/index.js";
import type { Settings } from "../settings/index.js";

/**
 * Service interface for workspace context.
 *
 * Provides access to parsed workspace settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContextService {
  /** Whether this is a global workspace (~/.axm) or local (.axm) */
  readonly global: boolean;
  /** Parsed workspace settings from settings.json */
  readonly settings: Settings;
  /** Parsed lockfile from axm-lock.yaml */
  readonly lockfile: Lockfile;
  /** Path to the .axm directory */
  readonly path: string;
}
