package pawmatch

import (
	"bytes"
	"strings"
	"testing"

	"github.com/agentxm/example-tinyflags/tinyflags"
)

func newTestCLI(t *testing.T) (*CLI, *bytes.Buffer, *bytes.Buffer) {
	t.Helper()
	var out, errOut bytes.Buffer
	cli := &CLI{
		Flags:   NewFlags(),
		Context: tinyflags.Context{ID: "test-session"},
		Out:     &out,
		Err:     &errOut,
		OpenURL: func(string) error { return nil },
	}
	return cli, &out, &errOut
}

func TestRunFeesExitsZero(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"fees"})
	if code != 0 {
		t.Fatalf("Run fees: got code %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Adoption fees") {
		t.Errorf("Run fees: output missing 'Adoption fees': %s", out.String())
	}
}

func TestRunReturnSupportExitsZero(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"return-support"})
	if code != 0 {
		t.Fatalf("Run return-support: got code %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Return support") {
		t.Errorf("Run return-support: output missing header: %s", out.String())
	}
}

func TestRunBrowseLists(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"browse"})
	if code != 0 {
		t.Fatalf("Run browse: got code %d, want 0", code)
	}
	for _, name := range []string{"Biscuit", "Pepper", "Marigold"} {
		if !strings.Contains(out.String(), name) {
			t.Errorf("browse missing %q in output", name)
		}
	}
}

func TestRunBrowseFiltersBySpecies(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"browse", "--species", "cat"})
	if code != 0 {
		t.Fatalf("Run browse --species cat: got code %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Pepper") {
		t.Errorf("species cat should list Pepper, got: %s", out.String())
	}
	if strings.Contains(out.String(), "Biscuit") {
		t.Errorf("species cat must not list Biscuit, got: %s", out.String())
	}
}

func TestRunShowKnownPet(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"show", "biscuit"})
	if code != 0 {
		t.Fatalf("Run show biscuit: got code %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Biscuit") {
		t.Errorf("show should display Biscuit, got: %s", out.String())
	}
}

func TestRunShowUnknownPetExitsOne(t *testing.T) {
	t.Parallel()
	cli, _, errOut := newTestCLI(t)

	code := cli.Run([]string{"show", "no-such-pet"})
	if code != 1 {
		t.Fatalf("show unknown: got code %d, want 1", code)
	}
	if !strings.Contains(errOut.String(), "Unknown pet") {
		t.Errorf("show unknown: stderr missing 'Unknown pet': %s", errOut.String())
	}
}

func TestRunMatchEmptyPrefs(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"match"})
	if code != 0 {
		t.Fatalf("Run match: got code %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Strategy:") {
		t.Errorf("match missing 'Strategy:' header: %s", out.String())
	}
	if !strings.Contains(out.String(), "(no preference flags provided") {
		t.Errorf("match without prefs should hint at flags: %s", out.String())
	}
}

func TestRunMatchWithPrefs(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"match", "--has-kids", "--quiet-home"})
	if code != 0 {
		t.Fatalf("Run match with prefs: got code %d, want 0", code)
	}
	if strings.Contains(out.String(), "(no preference flags provided") {
		t.Errorf("match with prefs should not show no-flags hint: %s", out.String())
	}
}

func TestRunApplyKnownPet(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"apply", "biscuit"})
	if code != 0 {
		t.Fatalf("Run apply biscuit: got code %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Adoption application for Biscuit") {
		t.Errorf("apply missing header: %s", out.String())
	}
}

func TestRunApplyUnknownPetExitsOne(t *testing.T) {
	t.Parallel()
	cli, _, errOut := newTestCLI(t)

	code := cli.Run([]string{"apply", "no-such-pet"})
	if code != 1 {
		t.Fatalf("apply unknown: got code %d, want 1", code)
	}
	if !strings.Contains(errOut.String(), "Unknown pet") {
		t.Errorf("apply unknown: stderr missing 'Unknown pet': %s", errOut.String())
	}
}

func TestRunDonateList(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"donate"})
	if code != 0 {
		t.Fatalf("Run donate: got code %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Animal-welfare charities") {
		t.Errorf("donate missing header: %s", out.String())
	}
	if !strings.Contains(out.String(), CharitiesDisclaimer) {
		t.Errorf("donate missing disclaimer: %s", out.String())
	}
}

func TestRunDonateFiltersByFocus(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"donate", "--focus", "rescue"})
	if code != 0 {
		t.Fatalf("Run donate --focus rescue: got code %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Brother Wolf") {
		t.Errorf("rescue focus should include Brother Wolf, got: %s", out.String())
	}
	if strings.Contains(out.String(), "ASPCA") {
		t.Errorf("rescue focus must not include ASPCA, got: %s", out.String())
	}
}

func TestRunDonateOpenInvokesOpenURL(t *testing.T) {
	t.Parallel()
	cli, _, _ := newTestCLI(t)

	var opened string
	cli.OpenURL = func(url string) error {
		opened = url
		return nil
	}

	code := cli.Run([]string{"donate", "brother-wolf", "--open"})
	if code != 0 {
		t.Fatalf("Run donate brother-wolf --open: got code %d, want 0", code)
	}
	if opened == "" {
		t.Fatal("OpenURL was not invoked")
	}
}

func TestRunDonateUnknownCharityExitsOne(t *testing.T) {
	t.Parallel()
	cli, _, errOut := newTestCLI(t)

	code := cli.Run([]string{"donate", "no-such-charity"})
	if code != 1 {
		t.Fatalf("donate unknown: got code %d, want 1", code)
	}
	if !strings.Contains(errOut.String(), "Unknown charity") {
		t.Errorf("donate unknown: stderr missing 'Unknown charity': %s", errOut.String())
	}
}

func TestRunUnknownCommandExitsTwo(t *testing.T) {
	t.Parallel()
	cli, _, errOut := newTestCLI(t)

	code := cli.Run([]string{"nonsense"})
	if code != 2 {
		t.Fatalf("unknown command: got %d, want 2", code)
	}
	if !strings.Contains(errOut.String(), "unknown command") {
		t.Errorf("unknown command: missing message: %s", errOut.String())
	}
}

func TestRunNoArgsExitsOne(t *testing.T) {
	t.Parallel()
	cli, _, _ := newTestCLI(t)

	code := cli.Run([]string{})
	if code != 1 {
		t.Fatalf("no args: got %d, want 1", code)
	}
}

func TestRunHelpExitsZero(t *testing.T) {
	t.Parallel()
	cli, out, _ := newTestCLI(t)

	code := cli.Run([]string{"--help"})
	if code != 0 {
		t.Fatalf("help: got %d, want 0", code)
	}
	if !strings.Contains(out.String(), "pawmatch — community pet adoption CLI.") {
		t.Errorf("help missing header: %s", out.String())
	}
}
