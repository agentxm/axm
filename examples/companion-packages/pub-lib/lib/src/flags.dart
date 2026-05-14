/// Flag definitions and validation.
library;

/// Stable identity used to bucket a flag evaluation.
///
/// At least one of [userId], [accountId], or [sessionId] should be provided
/// so rollout decisions are stable across requests for the same identity.
final class FlagContext {
  const FlagContext({this.userId, this.accountId, this.sessionId});

  final String? userId;
  final String? accountId;
  final String? sessionId;
}

/// Common interface for flag definitions.
sealed class Flag {
  const Flag();
}

/// A boolean feature flag with an explicit default and an optional rollout.
final class BooleanFlag extends Flag {
  BooleanFlag({this.defaultValue = false, this.rollout}) {
    if (rollout != null) {
      _validatePercentage(rollout!, 'BooleanFlag rollout');
    }
  }

  final bool defaultValue;
  final int? rollout;
}

/// A variant flag with a fixed set of named treatments and an optional rollout.
final class VariantFlag extends Flag {
  VariantFlag({
    required List<String> variants,
    required this.defaultValue,
    Map<String, int>? rollout,
  })  : variants = List<String>.unmodifiable(variants),
        rollout = rollout == null ? null : Map<String, int>.unmodifiable(rollout) {
    if (this.variants.isEmpty) {
      throw ArgumentError('VariantFlag requires at least one variant');
    }
    final seen = <String>{};
    for (final variant in this.variants) {
      if (variant.isEmpty) {
        throw ArgumentError('VariantFlag variants must be non-empty strings');
      }
      if (!seen.add(variant)) {
        throw ArgumentError('VariantFlag variants must be unique: $variant');
      }
    }
    if (!this.variants.contains(defaultValue)) {
      throw ArgumentError('VariantFlag default must be one of the variants');
    }
    final r = this.rollout;
    if (r == null) return;

    var total = 0;
    r.forEach((name, percentage) {
      if (!this.variants.contains(name)) {
        throw ArgumentError(
          "VariantFlag rollout references unknown variant: '$name'",
        );
      }
      _validatePercentage(percentage, "rollout for '$name'");
      total += percentage;
    });
    if (total > 100) {
      throw ArgumentError('VariantFlag rollout percentages cannot exceed 100');
    }
  }

  final List<String> variants;
  final String defaultValue;
  final Map<String, int>? rollout;
}

void _validatePercentage(int value, String label) {
  if (value < 0 || value > 100) {
    throw ArgumentError('$label must be an integer from 0 to 100');
  }
}
