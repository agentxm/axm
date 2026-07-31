@echo off
setlocal

rem Transactional AXM installer entry point for cmd.exe.
rem The PowerShell installer is the canonical Windows transaction implementation.

where powershell >nul 2>&1
if errorlevel 1 (
  echo Error: PowerShell is required.
  exit /b 1
)

if not defined AXM_INSTALL_PS1_PATH goto download_installer

powershell -NoProfile -ExecutionPolicy Bypass -File "%AXM_INSTALL_PS1_PATH%"
exit /b %errorlevel%

:download_installer

set "INSTALLER_PATH=%TEMP%\axm-install-%RANDOM%-%RANDOM%.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://axm.sh/install.ps1' -OutFile '%INSTALLER_PATH%'"
if errorlevel 1 (
  echo Error: Failed to download the AXM PowerShell installer.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER_PATH%"
set "INSTALL_EXIT=%errorlevel%"
del /q "%INSTALLER_PATH%" >nul 2>&1
exit /b %INSTALL_EXIT%
