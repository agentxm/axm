// Command pawmatch is the example PawMatch CLI — a reference consumer of the
// github.com/agentxm/example-tinyflags library. It is not publishable and
// exists only to demonstrate consumption.
package main

import (
	"os"

	"github.com/agentxm/example-pawmatch/internal/pawmatch"
)

func main() {
	cli := pawmatch.New()
	os.Exit(cli.Run(os.Args[1:]))
}
