# Synthetic harness failure

The contract requires three trials. Trial one passed. Trial two ended when the
harness lost its task-local workspace before raw output was captured. No retry
budget remains, and trial three was not started. The target produced no
observable error before the harness failure.
