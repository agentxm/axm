const assert = require("node:assert/strict")
const test = require("node:test")

const { createRetryLease } = require("./retry-cleanup.js")

test("cancel clears the retry timer exactly once", () => {
  const timer = Symbol("retry-timer")
  const cleared = []
  const lease = createRetryLease({
    setTimer: () => timer,
    clearTimer: (value) => cleared.push(value),
  })

  lease.cancel()
  lease.cancel()

  assert.deepEqual(cleared, [timer])
})
