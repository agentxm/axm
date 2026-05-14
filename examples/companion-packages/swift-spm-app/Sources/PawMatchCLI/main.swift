// pawmatch — the example PawMatch CLI. The executable is a thin shim that
// dispatches to the `PawMatch` library module's root command so the command
// graph is testable.

import PawMatchKit

PawMatchCommand.main()
