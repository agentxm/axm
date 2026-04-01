# Install script for axm — the extension manager for AI coding agents.
# Usage: irm https://axm.sh/install.ps1 | iex
$ErrorActionPreference = 'Stop'

$GITHUB_REPO = if ($env:AXM_INSTALL_GITHUB_REPO) { $env:AXM_INSTALL_GITHUB_REPO } else { "agentxm/axm" }
$BASE_URL = if ($env:AXM_INSTALL_BASE_URL) {
    $env:AXM_INSTALL_BASE_URL
}
else {
    "https://github.com/$GITHUB_REPO/releases/latest/download"
}

function Detect-Architecture {
    $arch = $env:PROCESSOR_ARCHITECTURE

    switch ($arch) {
        "AMD64" {
            return "x64"
        }
        "ARM64" {
            Write-Host "Error: Windows arm64 is not yet supported." -ForegroundColor Red
            exit 1
        }
        default {
            Write-Host "Error: Unsupported architecture: $arch" -ForegroundColor Red
            Write-Host ""
            Write-Host "Supported architectures:"
            Write-Host "  - x64 (AMD64)"
            exit 1
        }
    }
}

function Download-Binary {
    param (
        [string]$Arch
    )

    $artifact = "axm-windows-${Arch}.exe"
    $downloadUrl = "$BASE_URL/$artifact"
    $installDir = Join-Path $env:LOCALAPPDATA "axm"
    $target = Join-Path $installDir "axm.exe"

    Write-Host "Detected platform: windows-$Arch"
    Write-Host "Downloading $artifact..."

    if (-not (Test-Path $installDir)) {
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    }

    $previousProgressPreference = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $target -UseBasicParsing
    }
    catch {
        Write-Host ""
        Write-Host "Error: Failed to download $artifact." -ForegroundColor Red
        Write-Host "URL: $downloadUrl"
        Write-Host ""
        Write-Host "Check that the release exists and your network connection is working."
        exit 1
    }
    finally {
        $ProgressPreference = $previousProgressPreference
    }

    Write-Host "Installed to $target"

    # Write install metadata
    $metaFile = Join-Path $installDir "install-meta.json"
    $timestamp = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $metaContent = "{`"method`": `"script`", `"installedAt`": `"$timestamp`"}"
    Set-Content -Path $metaFile -Value $metaContent -Encoding UTF8

    return $installDir
}

function Test-AxmOnPath {
    $cmd = Get-Command "axm" -ErrorAction SilentlyContinue
    return $null -ne $cmd
}

function Print-PathInstructions {
    param (
        [string]$InstallDir
    )

    Write-Host "Add axm to your PATH:"
    Write-Host ""
    Write-Host "  Option 1: Via System Properties"
    Write-Host "    1. Press Win+R, type 'sysdm.cpl', press Enter"
    Write-Host "    2. Go to Advanced > Environment Variables"
    Write-Host "    3. Under User variables, select Path, click Edit"
    Write-Host "    4. Click New, add: $InstallDir"
    Write-Host "    5. Click OK to save"
    Write-Host ""
    Write-Host "  Option 2: Via PowerShell (current user):"
    Write-Host "    `$currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')"
    Write-Host "    [Environment]::SetEnvironmentVariable('Path', `"$InstallDir;`$currentPath`", 'User')"
}

function Verify {
    param (
        [string]$InstallDir
    )

    Write-Host ""

    if (Test-AxmOnPath) {
        & axm --version
        Write-Host ""
        Write-Host "Done! Run 'axm auth login' to get started."
    }
    else {
        Write-Host "axm was installed to $InstallDir but it is not on your PATH."
        Write-Host ""
        Print-PathInstructions -InstallDir $InstallDir
        Write-Host ""
        Write-Host "Then open a new terminal and run: axm auth login"
    }
}

# Main
$arch = Detect-Architecture
$installDir = Download-Binary -Arch $arch
Verify -InstallDir $installDir
