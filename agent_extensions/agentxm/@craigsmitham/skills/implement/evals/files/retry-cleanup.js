function createRetryLease({ setTimer, clearTimer }) {
  let timer = setTimer(() => {}, 1_000)

  return {
    cancel() {
      // Synthetic defect F-7: the active timer is not cleared.
      timer = null
    },
  }
}

module.exports = { createRetryLease }
