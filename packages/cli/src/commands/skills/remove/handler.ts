/**
 * Remove command handler - Effect-based orchestration for `axm skills remove`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Console, type Effect } from "effect";

/**
 * Handles the `axm skills remove` command.
 *
 * Currently outputs "Hello Alex" as placeholder behavior.
 * Actual skill removal functionality will be implemented in future work.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleRemove = (): Effect.Effect<void> => Console.log("Hello Alex");
