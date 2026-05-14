{-# LANGUAGE OverloadedStrings #-}

-- |
-- Module      : AgentXM.Example.PawMatch
-- Description : PawMatch CLI library — the consumer of agentxm-example-tinyflags.
--
-- The CLI lives in 'AgentXM.Example.PawMatch.Cli'. This module re-exports
-- the entry point and the per-command runners that the test suite drives.
module AgentXM.Example.PawMatch
  ( runCli
  , module AgentXM.Example.PawMatch.Cli
  ) where

import           AgentXM.Example.PawMatch.Cli
