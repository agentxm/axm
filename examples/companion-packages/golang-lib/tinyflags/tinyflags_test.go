package tinyflags

import (
	"fmt"
	"strings"
	"testing"
)

func TestBooleanDefaults(t *testing.T) {
	t.Parallel()

	flags, err := New(map[string]Flag{
		"checkoutRedesign": MustBooleanFlag(BoolDefault(true)),
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}

	got, err := flags.Enabled("checkoutRedesign", Context{ID: "user-1"})
	if err != nil {
		t.Fatalf("Enabled returned error: %v", err)
	}
	if !got {
		t.Fatalf("Enabled: want true, got false")
	}
}

func TestBooleanRolloutBoundaries(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"off": MustBooleanFlag(BoolDefault(false), BoolRollout(0)),
		"on":  MustBooleanFlag(BoolDefault(false), BoolRollout(100)),
	})

	for _, id := range []string{"user-1", "user-2", "alice", "bob", "carol", "dave", "eve", ""} {
		ctx := Context{ID: id}
		off, err := flags.Enabled("off", ctx)
		if err != nil {
			t.Fatalf("Enabled(off, %q): %v", id, err)
		}
		if off {
			t.Errorf("rollout 0 returned true for %q", id)
		}

		on, err := flags.Enabled("on", ctx)
		if err != nil {
			t.Fatalf("Enabled(on, %q): %v", id, err)
		}
		if !on {
			t.Errorf("rollout 100 returned false for %q", id)
		}
	}
}

func TestBooleanRolloutFiftyPercent(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"half": MustBooleanFlag(BoolDefault(false), BoolRollout(50)),
	})

	// Synthetic IDs should split roughly evenly. We don't need a tight bound
	// — just a sanity check that both branches occur over a large sample.
	const n = 1000
	enabledCount := 0
	for i := 0; i < n; i++ {
		ctx := Context{ID: fmt.Sprintf("user-%d", i)}
		on, err := flags.Enabled("half", ctx)
		if err != nil {
			t.Fatalf("Enabled: %v", err)
		}
		if on {
			enabledCount++
		}
	}
	if enabledCount < n/4 || enabledCount > (3*n)/4 {
		t.Errorf("50%% rollout produced %d/%d enabled — looks skewed", enabledCount, n)
	}
}

func TestBooleanDeterministicStability(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"experiment": MustBooleanFlag(BoolDefault(false), BoolRollout(37)),
	})

	ctx := Context{ID: "user-42"}
	first, err := flags.Enabled("experiment", ctx)
	if err != nil {
		t.Fatalf("Enabled: %v", err)
	}
	for i := 0; i < 100; i++ {
		got, err := flags.Enabled("experiment", ctx)
		if err != nil {
			t.Fatalf("Enabled: %v", err)
		}
		if got != first {
			t.Fatalf("decision flipped on iteration %d: first=%v got=%v", i, first, got)
		}
	}
}

func TestVariantDefaults(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"searchRanking": MustVariantFlag(
			[]string{"classic", "semantic"},
			VariantDefault("classic"),
		),
	})

	got, err := flags.Variant("searchRanking", Context{ID: "user-1"})
	if err != nil {
		t.Fatalf("Variant: %v", err)
	}
	if got != "classic" {
		t.Fatalf("Variant: want classic, got %q", got)
	}
}

func TestVariantRolloutHundred(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"searchRanking": MustVariantFlag(
			[]string{"classic", "semantic"},
			VariantDefault("classic"),
			VariantRollout(map[string]int{"semantic": 100}),
		),
	})

	for _, id := range []string{"alice", "bob", "carol", "dave"} {
		got, err := flags.Variant("searchRanking", Context{ID: id})
		if err != nil {
			t.Fatalf("Variant(%q): %v", id, err)
		}
		if got != "semantic" {
			t.Fatalf("rollout 100%% to semantic returned %q for %q", got, id)
		}
	}
}

func TestVariantRolloutZeroReturnsDefault(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"searchRanking": MustVariantFlag(
			[]string{"classic", "semantic"},
			VariantDefault("classic"),
			VariantRollout(map[string]int{"semantic": 0}),
		),
	})

	got, err := flags.Variant("searchRanking", Context{ID: "user-1"})
	if err != nil {
		t.Fatalf("Variant: %v", err)
	}
	if got != "classic" {
		t.Fatalf("rollout 0 should fall back to default, got %q", got)
	}
}

func TestVariantDeterministicStability(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"strategy": MustVariantFlag(
			[]string{"a", "b", "c"},
			VariantDefault("a"),
			VariantRollout(map[string]int{"b": 25, "c": 25}),
		),
	})

	ctx := Context{ID: "user-7"}
	first, err := flags.Variant("strategy", ctx)
	if err != nil {
		t.Fatalf("Variant: %v", err)
	}
	for i := 0; i < 100; i++ {
		got, err := flags.Variant("strategy", ctx)
		if err != nil {
			t.Fatalf("Variant: %v", err)
		}
		if got != first {
			t.Fatalf("variant flipped on iteration %d: first=%q got=%q", i, first, got)
		}
	}
}

func TestVariantValidationRejectsUnknownDefault(t *testing.T) {
	t.Parallel()

	_, err := VariantFlag(
		[]string{"classic", "semantic"},
		VariantDefault("personalized"),
	)
	if err == nil {
		t.Fatal("expected error for unknown default variant")
	}
	if !strings.Contains(err.Error(), "default") {
		t.Errorf("error %q should mention default", err)
	}
}

func TestVariantValidationRejectsUnknownRolloutKey(t *testing.T) {
	t.Parallel()

	_, err := VariantFlag(
		[]string{"classic", "semantic"},
		VariantRollout(map[string]int{"personalized": 50}),
	)
	if err == nil {
		t.Fatal("expected error for unknown rollout variant")
	}
}

func TestVariantValidationRejectsRolloutOverHundred(t *testing.T) {
	t.Parallel()

	_, err := VariantFlag(
		[]string{"classic", "semantic"},
		VariantRollout(map[string]int{"classic": 80, "semantic": 30}),
	)
	if err == nil {
		t.Fatal("expected error for rollout totals > 100")
	}
}

func TestVariantValidationRejectsDuplicates(t *testing.T) {
	t.Parallel()

	_, err := VariantFlag([]string{"a", "a"})
	if err == nil {
		t.Fatal("expected error for duplicate variants")
	}
}

func TestVariantValidationRejectsEmptyList(t *testing.T) {
	t.Parallel()

	_, err := VariantFlag([]string{})
	if err == nil {
		t.Fatal("expected error for empty variant list")
	}
}

func TestBooleanValidationRejectsBadPercentage(t *testing.T) {
	t.Parallel()

	if _, err := BooleanFlag(BoolRollout(-1)); err == nil {
		t.Error("expected error for negative percentage")
	}
	if _, err := BooleanFlag(BoolRollout(101)); err == nil {
		t.Error("expected error for percentage > 100")
	}
}

func TestEnabledOnVariantFlagErrors(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"strategy": MustVariantFlag([]string{"a", "b"}),
	})

	if _, err := flags.Enabled("strategy", Context{}); err == nil {
		t.Fatal("Enabled on a variant flag should return an error")
	}
}

func TestVariantOnBooleanFlagErrors(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"toggle": MustBooleanFlag(BoolDefault(true)),
	})

	if _, err := flags.Variant("toggle", Context{}); err == nil {
		t.Fatal("Variant on a boolean flag should return an error")
	}
}

func TestEvaluateDispatchesByKind(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"toggle":   MustBooleanFlag(BoolDefault(true)),
		"strategy": MustVariantFlag([]string{"a", "b"}, VariantDefault("b")),
	})

	v1, err := flags.Evaluate("toggle", Context{})
	if err != nil {
		t.Fatalf("Evaluate(toggle): %v", err)
	}
	if v1.Kind != KindBoolean || !v1.Bool {
		t.Errorf("Evaluate(toggle): unexpected %+v", v1)
	}

	v2, err := flags.Evaluate("strategy", Context{})
	if err != nil {
		t.Fatalf("Evaluate(strategy): %v", err)
	}
	if v2.Kind != KindVariant || v2.Variant != "b" {
		t.Errorf("Evaluate(strategy): unexpected %+v", v2)
	}
}

func TestUnknownFlagErrors(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{})

	if _, err := flags.Enabled("missing", Context{}); err == nil {
		t.Error("Enabled on unknown flag should error")
	}
	if _, err := flags.Variant("missing", Context{}); err == nil {
		t.Error("Variant on unknown flag should error")
	}
	if _, err := flags.Evaluate("missing", Context{}); err == nil {
		t.Error("Evaluate on unknown flag should error")
	}
}

func TestNewRejectsNilDefinitions(t *testing.T) {
	t.Parallel()

	if _, err := New(nil); err == nil {
		t.Error("New(nil) should error")
	}
}

func TestNamesReturnsAllFlags(t *testing.T) {
	t.Parallel()

	flags := MustNew(map[string]Flag{
		"b": MustBooleanFlag(),
		"a": MustBooleanFlag(),
		"c": MustVariantFlag([]string{"x"}),
	})

	names := flags.Names()
	want := []string{"a", "b", "c"}
	if len(names) != len(want) {
		t.Fatalf("Names returned %d entries, want %d", len(names), len(want))
	}
	for i, n := range names {
		if n != want[i] {
			t.Errorf("Names[%d] = %q, want %q", i, n, want[i])
		}
	}
}
