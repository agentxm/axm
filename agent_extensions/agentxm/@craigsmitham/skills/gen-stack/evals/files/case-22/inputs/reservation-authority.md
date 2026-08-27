# Accepted reservation authority

The reservation authority alone serializes transitions that consume or restore
capacity. Payment processing may observe a confirmed reservation, but it must
not mutate capacity or decide whether capacity is restored.
