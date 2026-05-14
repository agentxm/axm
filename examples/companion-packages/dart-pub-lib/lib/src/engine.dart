/// TinyFlags evaluator with deterministic rollout bucketing.
library;

import 'dart:convert' show utf8;

import 'flags.dart';

const int _fnvOffset = 2166136261;
const int _fnvPrime = 16777619;
const int _uint32 = 0xFFFFFFFF;

/// Evaluate a set of feature flags with deterministic rollout bucketing.
final class TinyFlags {
  TinyFlags(Map<String, Flag> definitions)
      : _definitions = Map<String, Flag>.unmodifiable(definitions);

  final Map<String, Flag> _definitions;

  Map<String, Flag> get definitions => _definitions;

  Iterable<String> get names => _definitions.keys;

  bool contains(String name) => _definitions.containsKey(name);

  /// Evaluate a boolean flag. Throws if the flag is not a [BooleanFlag].
  bool enabled(String name, [FlagContext? context]) {
    final flag = _lookup(name);
    if (flag is! BooleanFlag) {
      throw StateError("TinyFlags flag '$name' is not a boolean flag");
    }
    final rollout = flag.rollout;
    if (rollout == null) return flag.defaultValue;
    return _bucket(name, context) < rollout;
  }

  /// Evaluate a variant flag. Throws if the flag is not a [VariantFlag].
  String variant(String name, [FlagContext? context]) {
    final flag = _lookup(name);
    if (flag is! VariantFlag) {
      throw StateError("TinyFlags flag '$name' is not a variant flag");
    }
    final rollout = flag.rollout;
    if (rollout == null) return flag.defaultValue;

    final bucket = _bucket(name, context);
    var upperBound = 0;
    for (final entry in rollout.entries) {
      upperBound += entry.value;
      if (bucket < upperBound) return entry.key;
    }
    return flag.defaultValue;
  }

  /// Evaluate any flag, dispatching on its kind. Returns `bool` for boolean
  /// flags and `String` for variant flags.
  Object evaluate(String name, [FlagContext? context]) {
    final flag = _lookup(name);
    if (flag is BooleanFlag) return enabled(name, context);
    return variant(name, context);
  }

  Flag _lookup(String name) {
    final flag = _definitions[name];
    if (flag == null) {
      throw ArgumentError("Unknown TinyFlags flag: '$name'");
    }
    return flag;
  }
}

int _bucket(String name, FlagContext? context) {
  var key = 'anonymous';
  if (context != null) {
    key = context.userId ?? context.accountId ?? context.sessionId ?? 'anonymous';
  }
  return _fnv1a('$name:$key') % 100;
}

int _fnv1a(String value) {
  var hash = _fnvOffset;
  for (final byte in utf8.encode(value)) {
    hash ^= byte;
    hash = (hash * _fnvPrime) & _uint32;
  }
  return hash;
}
