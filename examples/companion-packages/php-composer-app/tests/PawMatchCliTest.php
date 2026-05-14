<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch\Tests;

use AgentXM\Examples\PawMatch\PawMatchCli;
use AgentXM\Examples\PawMatch\PawMatchFlags;
use AgentXM\Examples\TinyFlags\EvaluationContext;
use PHPUnit\Framework\TestCase;

final class PawMatchCliTest extends TestCase
{
    public function testFeesCommandExitsZero(): void
    {
        $out = fopen('php://memory', 'w+');
        $err = fopen('php://memory', 'w+');
        self::assertIsResource($out);
        self::assertIsResource($err);

        $cli = new PawMatchCli(
            PawMatchFlags::create(),
            new EvaluationContext(sessionId: 'tester'),
            $out,
            $err,
        );

        $exit = $cli->run(['fees']);
        self::assertSame(0, $exit);

        rewind($out);
        $output = stream_get_contents($out);
        self::assertIsString($output);
        self::assertStringContainsString('Adoption fees', $output);
    }

    public function testBrowseListsPets(): void
    {
        $out = fopen('php://memory', 'w+');
        $err = fopen('php://memory', 'w+');
        self::assertIsResource($out);
        self::assertIsResource($err);

        $cli = new PawMatchCli(
            PawMatchFlags::create(),
            new EvaluationContext(sessionId: 'tester'),
            $out,
            $err,
        );

        $exit = $cli->run(['browse']);
        self::assertSame(0, $exit);

        rewind($out);
        $output = stream_get_contents($out);
        self::assertIsString($output);
        self::assertStringContainsString('Biscuit', $output);
    }

    public function testApplyUnknownPetExitsOne(): void
    {
        $out = fopen('php://memory', 'w+');
        $err = fopen('php://memory', 'w+');
        self::assertIsResource($out);
        self::assertIsResource($err);

        $cli = new PawMatchCli(
            PawMatchFlags::create(),
            new EvaluationContext(sessionId: 'tester'),
            $out,
            $err,
        );

        $exit = $cli->run(['apply', 'nonexistent']);
        self::assertSame(1, $exit);
    }
}
