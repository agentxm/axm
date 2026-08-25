# Reservation recovery test evidence

The maintained recovery test stops the reservation process between durable
transition steps and verifies that recovery cannot both confirm a reservation
and restore the same capacity. The executable test owns the exact transition
sequence and assertions.
