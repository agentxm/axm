/**
 * Interaction context service types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ClackService } from "../clack-effect/service.js";

/**
 * Service interface for interaction context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InteractionContextService {
  /** Direct access to Clack prompts, logging, and spinners */
  readonly p: ClackService;
}
