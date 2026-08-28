import { strict as assert } from "node:assert"
import { requestRecovery } from "../../src/recovery/request.js"

assert.equal(
  requestRecovery({ memberId: "member-17", registeredDeviceToken: "synthetic-token" }),
  "pending",
)
