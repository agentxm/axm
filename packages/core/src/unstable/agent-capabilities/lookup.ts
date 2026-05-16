/**
 * Catalog lookup helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { AGENTS_BY_ID, type AgentId } from "./catalog.generated.js";
import type { Agent } from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export const agentById = (id: AgentId): Agent => AGENTS_BY_ID[id];
