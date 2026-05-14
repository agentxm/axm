import 'package:agentxm_example_tinyflags/agentxm_example_tinyflags.dart';
import 'package:test/test.dart';

void main() {
  group('TinyFlags boolean flags', () {
    test('use defaults when no rollout is configured', () {
      final flags = TinyFlags({
        'checkout_redesign': BooleanFlag(defaultValue: true),
      });

      expect(
        flags.enabled('checkout_redesign', const FlagContext(userId: 'user-1')),
        isTrue,
      );
    });

    test('rollout boundaries are deterministic', () {
      final flags = TinyFlags({
        'disabled_experiment': BooleanFlag(defaultValue: false, rollout: 0),
        'enabled_experiment': BooleanFlag(defaultValue: false, rollout: 100),
      });

      const ctx = FlagContext(userId: 'user-1');

      expect(flags.enabled('disabled_experiment', ctx), isFalse);
      expect(flags.enabled('enabled_experiment', ctx), isTrue);
      expect(
        flags.enabled('enabled_experiment', ctx),
        flags.enabled('enabled_experiment', ctx),
      );
    });
  });

  group('TinyFlags variant flags', () {
    test('return defaults outside rollout allocations', () {
      final flags = TinyFlags({
        'search_ranking': VariantFlag(
          variants: ['classic', 'semantic'],
          defaultValue: 'classic',
          rollout: {'semantic': 0},
        ),
      });

      expect(
        flags.variant('search_ranking', const FlagContext(userId: 'user-1')),
        'classic',
      );
    });

    test('can allocate all traffic to a variant', () {
      final flags = TinyFlags({
        'search_ranking': VariantFlag(
          variants: ['classic', 'semantic'],
          defaultValue: 'classic',
          rollout: {'semantic': 100},
        ),
      });

      expect(
        flags.variant('search_ranking', const FlagContext(userId: 'user-1')),
        'semantic',
      );
    });
  });

  test('evaluate dispatches on flag kind', () {
    final flags = TinyFlags({
      'checkout_redesign': BooleanFlag(defaultValue: true),
      'search_ranking': VariantFlag(
        variants: ['classic', 'semantic'],
        defaultValue: 'classic',
      ),
    });

    expect(flags.evaluate('checkout_redesign'), isTrue);
    expect(flags.evaluate('search_ranking'), 'classic');
  });

  group('invalid flag definitions fail at construction time', () {
    test('boolean rollout above 100', () {
      expect(
        () => BooleanFlag(rollout: 101),
        throwsA(isA<ArgumentError>().having(
          (e) => e.message, 'message', contains('0 to 100'),
        )),
      );
    });

    test('boolean rollout negative', () {
      expect(
        () => BooleanFlag(rollout: -1),
        throwsA(isA<ArgumentError>().having(
          (e) => e.message, 'message', contains('0 to 100'),
        )),
      );
    });

    test('variant empty', () {
      expect(
        () => VariantFlag(variants: const [], defaultValue: 'classic'),
        throwsA(isA<ArgumentError>().having(
          (e) => e.message, 'message', contains('at least one variant'),
        )),
      );
    });

    test('variant default not listed', () {
      expect(
        () => VariantFlag(
          variants: ['classic', 'semantic'],
          defaultValue: 'personalized',
        ),
        throwsA(isA<ArgumentError>().having(
          (e) => e.message, 'message', contains('default must be one of the variants'),
        )),
      );
    });

    test('variant rollout over 100', () {
      expect(
        () => VariantFlag(
          variants: ['classic', 'semantic'],
          defaultValue: 'classic',
          rollout: {'semantic': 80, 'classic': 30},
        ),
        throwsA(isA<ArgumentError>().having(
          (e) => e.message, 'message', contains('cannot exceed 100'),
        )),
      );
    });

    test('variant rollout references unknown variant', () {
      expect(
        () => VariantFlag(
          variants: ['classic', 'semantic'],
          defaultValue: 'classic',
          rollout: {'mystery': 50},
        ),
        throwsA(isA<ArgumentError>().having(
          (e) => e.message, 'message', contains('unknown variant'),
        )),
      );
    });
  });

  test('unknown flag throws ArgumentError', () {
    final flags = TinyFlags(const {});

    expect(
      () => flags.enabled('missing'),
      throwsA(isA<ArgumentError>().having(
        (e) => e.message, 'message', contains('Unknown TinyFlags flag'),
      )),
    );
  });
}
