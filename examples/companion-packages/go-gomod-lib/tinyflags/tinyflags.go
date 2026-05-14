// Package tinyflags is a tiny feature flags library used by AXM companion
// package examples.
//
// Flags are defined with [BooleanFlag] or [VariantFlag] and evaluated with
// [Flags.Enabled], [Flags.Variant], or [Flags.Evaluate]. Rollout decisions
// are deterministic for a given (flag name, [Context]) pair so that the same
// caller always receives the same answer.
package tinyflags

import (
	"errors"
	"fmt"
	"sort"
)

// Kind identifies the kind of a [Flag].
type Kind int

const (
	// KindBoolean denotes a flag whose treatment is true or false.
	KindBoolean Kind = iota
	// KindVariant denotes a flag whose treatment is one of a fixed set of
	// named string variants.
	KindVariant
)

// Flag is a feature flag definition. Construct one with [BooleanFlag] or
// [VariantFlag].
type Flag struct {
	kind           Kind
	defaultBool    bool
	defaultStr     string
	rolloutPct     int            // boolean rollout percentage, -1 when unset
	variants       []string       // ordered list of variant names
	variantRoll    map[string]int // optional per-variant rollout percentages
	hasVariantRoll bool
}

// Kind reports the kind of the flag.
func (f Flag) Kind() Kind { return f.kind }

// BooleanOption configures a boolean flag at construction time.
type BooleanOption func(*boolConfig) error

type boolConfig struct {
	defaultValue bool
	rollout      int
	hasRollout   bool
}

// BoolDefault sets the default value of a boolean flag.
func BoolDefault(value bool) BooleanOption {
	return func(c *boolConfig) error {
		c.defaultValue = value
		return nil
	}
}

// BoolRollout sets the integer rollout percentage (0..100) for a boolean
// flag.
func BoolRollout(pct int) BooleanOption {
	return func(c *boolConfig) error {
		if err := validatePercentage(pct, "BoolRollout"); err != nil {
			return err
		}
		c.rollout = pct
		c.hasRollout = true
		return nil
	}
}

// BooleanFlag constructs a boolean [Flag]. Without [BoolDefault] the default
// is false. Without [BoolRollout] the default value is returned for every
// caller.
func BooleanFlag(opts ...BooleanOption) (Flag, error) {
	cfg := boolConfig{}
	for _, opt := range opts {
		if err := opt(&cfg); err != nil {
			return Flag{}, err
		}
	}
	rollout := -1
	if cfg.hasRollout {
		rollout = cfg.rollout
	}
	return Flag{
		kind:        KindBoolean,
		defaultBool: cfg.defaultValue,
		rolloutPct:  rollout,
	}, nil
}

// MustBooleanFlag is like [BooleanFlag] but panics on invalid configuration.
// Intended for package-level flag tables where invalid input is a programmer
// error.
func MustBooleanFlag(opts ...BooleanOption) Flag {
	f, err := BooleanFlag(opts...)
	if err != nil {
		panic(err)
	}
	return f
}

// VariantOption configures a variant flag at construction time.
type VariantOption func(*variantConfig) error

type variantConfig struct {
	defaultValue string
	hasDefault   bool
	rollout      map[string]int
	hasRollout   bool
}

// VariantDefault sets the default variant of a variant flag. The value must
// be one of the variants passed to [VariantFlag].
func VariantDefault(value string) VariantOption {
	return func(c *variantConfig) error {
		c.defaultValue = value
		c.hasDefault = true
		return nil
	}
}

// VariantRollout allocates a percentage of traffic to each named variant. All
// variants referenced must appear in the [VariantFlag] variants list and the
// total must not exceed 100.
func VariantRollout(rollout map[string]int) VariantOption {
	return func(c *variantConfig) error {
		if rollout == nil {
			return errors.New("VariantRollout: rollout must not be nil")
		}
		c.rollout = rollout
		c.hasRollout = true
		return nil
	}
}

// VariantFlag constructs a variant [Flag]. variants must be non-empty and
// must contain only unique, non-empty strings. Without [VariantDefault] the
// first variant is the default.
func VariantFlag(variants []string, opts ...VariantOption) (Flag, error) {
	if len(variants) == 0 {
		return Flag{}, errors.New("VariantFlag: variants must not be empty")
	}
	seen := make(map[string]struct{}, len(variants))
	ordered := make([]string, 0, len(variants))
	for _, v := range variants {
		if v == "" {
			return Flag{}, errors.New("VariantFlag: variant names must be non-empty")
		}
		if _, dup := seen[v]; dup {
			return Flag{}, fmt.Errorf("VariantFlag: duplicate variant %q", v)
		}
		seen[v] = struct{}{}
		ordered = append(ordered, v)
	}

	cfg := variantConfig{}
	for _, opt := range opts {
		if err := opt(&cfg); err != nil {
			return Flag{}, err
		}
	}

	defaultValue := ordered[0]
	if cfg.hasDefault {
		if _, ok := seen[cfg.defaultValue]; !ok {
			return Flag{}, fmt.Errorf("VariantFlag: default %q is not a declared variant", cfg.defaultValue)
		}
		defaultValue = cfg.defaultValue
	}

	flag := Flag{
		kind:       KindVariant,
		defaultStr: defaultValue,
		rolloutPct: -1,
		variants:   ordered,
	}

	if cfg.hasRollout {
		total := 0
		normalized := make(map[string]int, len(cfg.rollout))
		for variant, pct := range cfg.rollout {
			if _, ok := seen[variant]; !ok {
				return Flag{}, fmt.Errorf("VariantFlag: rollout references unknown variant %q", variant)
			}
			if err := validatePercentage(pct, fmt.Sprintf("rollout[%q]", variant)); err != nil {
				return Flag{}, err
			}
			normalized[variant] = pct
			total += pct
		}
		if total > 100 {
			return Flag{}, fmt.Errorf("VariantFlag: rollout total %d exceeds 100", total)
		}
		flag.variantRoll = normalized
		flag.hasVariantRoll = true
	}

	return flag, nil
}

// MustVariantFlag is like [VariantFlag] but panics on invalid configuration.
func MustVariantFlag(variants []string, opts ...VariantOption) Flag {
	f, err := VariantFlag(variants, opts...)
	if err != nil {
		panic(err)
	}
	return f
}

// Context carries information about the caller for rollout bucketing. The
// zero value is valid and produces a single shared "anonymous" bucket; supply
// a stable ID to get per-caller bucketing.
type Context struct {
	// ID is a stable identifier for the caller (user ID, session ID, etc.).
	ID string
}

// Flags holds a named set of flag definitions and evaluates them.
type Flags struct {
	table map[string]Flag
}

// New constructs a [Flags] from a map of flag name to definition. It returns
// an error if definitions is nil.
func New(definitions map[string]Flag) (*Flags, error) {
	if definitions == nil {
		return nil, errors.New("tinyflags.New: definitions must not be nil")
	}
	table := make(map[string]Flag, len(definitions))
	for name, flag := range definitions {
		if name == "" {
			return nil, errors.New("tinyflags.New: flag names must be non-empty")
		}
		table[name] = flag
	}
	return &Flags{table: table}, nil
}

// MustNew is like [New] but panics on error.
func MustNew(definitions map[string]Flag) *Flags {
	f, err := New(definitions)
	if err != nil {
		panic(err)
	}
	return f
}

// Definition returns the [Flag] registered under name and whether it exists.
func (f *Flags) Definition(name string) (Flag, bool) {
	flag, ok := f.table[name]
	return flag, ok
}

// Enabled returns the boolean treatment for the named flag. It returns an
// error if name is unknown or the flag is not a boolean flag.
func (f *Flags) Enabled(name string, ctx Context) (bool, error) {
	flag, err := f.require(name)
	if err != nil {
		return false, err
	}
	if flag.kind != KindBoolean {
		return false, fmt.Errorf("tinyflags: flag %q is not a boolean flag", name)
	}
	if flag.rolloutPct < 0 {
		return flag.defaultBool, nil
	}
	return bucketFor(name, ctx) < flag.rolloutPct, nil
}

// Variant returns the named variant treatment for the named flag. It returns
// an error if name is unknown or the flag is not a variant flag.
func (f *Flags) Variant(name string, ctx Context) (string, error) {
	flag, err := f.require(name)
	if err != nil {
		return "", err
	}
	if flag.kind != KindVariant {
		return "", fmt.Errorf("tinyflags: flag %q is not a variant flag", name)
	}
	if !flag.hasVariantRoll {
		return flag.defaultStr, nil
	}

	bucket := bucketFor(name, ctx)
	upperBound := 0
	// Iterate in the order variants were declared so allocation is stable.
	for _, variant := range flag.variants {
		pct, ok := flag.variantRoll[variant]
		if !ok {
			continue
		}
		upperBound += pct
		if bucket < upperBound {
			return variant, nil
		}
	}
	return flag.defaultStr, nil
}

// Value is the evaluated treatment of a flag. Exactly one of Bool or Variant
// is meaningful depending on Kind.
type Value struct {
	Kind    Kind
	Bool    bool
	Variant string
}

// Evaluate returns a [Value] holding the treatment of the named flag. It
// dispatches to [Flags.Enabled] or [Flags.Variant] based on the flag's kind.
func (f *Flags) Evaluate(name string, ctx Context) (Value, error) {
	flag, err := f.require(name)
	if err != nil {
		return Value{}, err
	}
	switch flag.kind {
	case KindBoolean:
		on, err := f.Enabled(name, ctx)
		if err != nil {
			return Value{}, err
		}
		return Value{Kind: KindBoolean, Bool: on}, nil
	case KindVariant:
		variant, err := f.Variant(name, ctx)
		if err != nil {
			return Value{}, err
		}
		return Value{Kind: KindVariant, Variant: variant}, nil
	default:
		return Value{}, fmt.Errorf("tinyflags: flag %q has unknown kind", name)
	}
}

// Names returns the registered flag names in lexicographic order.
func (f *Flags) Names() []string {
	names := make([]string, 0, len(f.table))
	for name := range f.table {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func (f *Flags) require(name string) (Flag, error) {
	flag, ok := f.table[name]
	if !ok {
		return Flag{}, fmt.Errorf("tinyflags: unknown flag %q", name)
	}
	return flag, nil
}

func validatePercentage(pct int, label string) error {
	if pct < 0 || pct > 100 {
		return fmt.Errorf("%s: percentage %d is outside [0, 100]", label, pct)
	}
	return nil
}

// bucketFor maps (name, context.ID) to a stable bucket in [0, 100).
func bucketFor(name string, ctx Context) int {
	key := ctx.ID
	if key == "" {
		key = "anonymous"
	}
	return int(hashString(name+":"+key) % 100)
}

// hashString implements the 32-bit FNV-1a hash so bucketing is identical to
// the other TinyFlags ports.
func hashString(value string) uint32 {
	const offset = 2166136261
	const prime = 16777619
	hash := uint32(offset)
	for i := 0; i < len(value); i++ {
		hash ^= uint32(value[i])
		hash *= prime
	}
	return hash
}
