@echo off
setlocal

rem Install script for axm — the extension manager for AI coding agents.
rem Usage: install.cmd

if defined AXM_INSTALL_BASE_URL (
    set "BINARY_URL=%AXM_INSTALL_BASE_URL%/axm-windows-x64.exe"
) else (
    set "BINARY_URL=https://github.com/agentxm/axm/releases/latest/download/axm-windows-x64.exe"
)
set "INSTALL_DIR=%LOCALAPPDATA%\axm"
set "INSTALL_PATH=%INSTALL_DIR%\axm.exe"

call :check_curl
call :install_axm
call :verify
goto :eof

:check_curl
where curl >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: curl is required but not found.
    echo curl is included with Windows 10 and later.
    echo.
    echo If you are on an older version of Windows, use the PowerShell installer instead:
    echo   irm https://axm.sh/install.ps1 ^| iex
    exit /b 1
)
goto :eof

:install_axm
echo Installing axm...

if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    if %errorlevel% neq 0 (
        echo Error: Failed to create install directory: %INSTALL_DIR%
        exit /b 1
    )
)

curl -fsSL -o "%INSTALL_PATH%" "%BINARY_URL%"
if %errorlevel% neq 0 (
    echo Error: Failed to download axm binary.
    echo URL: %BINARY_URL%
    exit /b 1
)
goto :eof

:verify
where axm >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo axm was installed to %INSTALL_PATH%
    echo but is not on your PATH.
    echo.
    echo To add it, run:
    echo   setx PATH "%%PATH%%;%INSTALL_DIR%"
    echo.
    echo Then open a new terminal and run:
    echo   axm --version
    echo.
    goto :eof
)

echo.
axm --version
echo.
echo Done! Run 'axm auth login' to authenticate.
goto :eof
