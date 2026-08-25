// Synthetic installed test used only to evaluate drift-policy behavior.
import { strict as assert } from "node:assert";
import { forEach } from "./Effect.js";

const result = forEach([1, 2], { concurrency: 2 }, (value) => value * 2);

assert.deepEqual(result, [2, 4]);
