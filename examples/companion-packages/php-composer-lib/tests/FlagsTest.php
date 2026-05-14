<?php

declare(strict_types=1);

namespace AgentXM\Examples\TinyFlags\Tests;

use AgentXM\Examples\TinyFlags\BooleanFlag;
use AgentXM\Examples\TinyFlags\EvaluationContext;
use AgentXM\Examples\TinyFlags\Flags;
use AgentXM\Examples\TinyFlags\VariantFlag;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class FlagsTest extends TestCase
{
    public function testBooleanFlagUsesDefaultWhenNoRollout(): void
    {
        $flags = Flags::create([
            'checkoutRedesign' => BooleanFlag::of(['default' => true]),
        ]);

        self::assertTrue(
            $flags->enabled('checkoutRedesign', new EvaluationContext(userId: 'user-1')),
        );
    }

    public function testBooleanRolloutBoundariesAreDeterministic(): void
    {
        $flags = Flags::create([
            'disabledExperiment' => BooleanFlag::of(['default' => false, 'rollout' => 0]),
            'enabledExperiment' => BooleanFlag::of(['default' => false, 'rollout' => 100]),
        ]);

        $ctx = new EvaluationContext(userId: 'user-1');

        self::assertFalse($flags->enabled('disabledExperiment', $ctx));
        self::assertTrue($flags->enabled('enabledExperiment', $ctx));
        self::assertSame(
            $flags->enabled('enabledExperiment', $ctx),
            $flags->enabled('enabledExperiment', $ctx),
            'Repeated evaluations must be stable for the same context.',
        );
    }

    public function testVariantFlagReturnsDefaultOutsideRollout(): void
    {
        $flags = Flags::create([
            'searchRanking' => VariantFlag::of(['classic', 'semantic'], [
                'default' => 'classic',
                'rollout' => ['semantic' => 0],
            ]),
        ]);

        self::assertSame(
            'classic',
            $flags->variant('searchRanking', new EvaluationContext(userId: 'user-1')),
        );
    }

    public function testVariantFlagCanAllocateAllTrafficToVariant(): void
    {
        $flags = Flags::create([
            'searchRanking' => VariantFlag::of(['classic', 'semantic'], [
                'default' => 'classic',
                'rollout' => ['semantic' => 100],
            ]),
        ]);

        self::assertSame(
            'semantic',
            $flags->variant('searchRanking', new EvaluationContext(userId: 'user-1')),
        );
    }

    public function testBooleanRolloutAbove100Fails(): void
    {
        $this->expectException(InvalidArgumentException::class);
        BooleanFlag::of(['rollout' => 101]);
    }

    public function testVariantDefaultMustBeOneOfTheVariants(): void
    {
        $this->expectException(InvalidArgumentException::class);
        VariantFlag::of(['classic', 'semantic'], ['default' => 'personalized']);
    }

    public function testVariantRolloutPercentagesCannotExceed100(): void
    {
        $this->expectException(InvalidArgumentException::class);
        VariantFlag::of(['classic', 'semantic'], [
            'rollout' => ['semantic' => 80, 'classic' => 30],
        ]);
    }

    public function testVariantRolloutMustReferenceDeclaredVariants(): void
    {
        $this->expectException(InvalidArgumentException::class);
        VariantFlag::of(['classic', 'semantic'], [
            'rollout' => ['personalized' => 50],
        ]);
    }
}
