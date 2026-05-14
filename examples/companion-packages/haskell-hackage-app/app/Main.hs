module Main (main) where

import           AgentXM.Example.PawMatch (runCli)
import           System.Environment (getArgs)
import           System.Exit (exitWith)
import           System.IO (stderr, stdout)

main :: IO ()
main = do
  argv <- getArgs
  code <- runCli argv stdout stderr
  exitWith code
