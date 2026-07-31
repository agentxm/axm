# Transactional AXM installer for Windows
$ErrorActionPreference = 'Stop'

$githubRepo = if ($env:AXM_INSTALL_GITHUB_REPO) { $env:AXM_INSTALL_GITHUB_REPO } else { 'agentxm/axm' }
$userHome = if ($env:AXM_USER_HOME) { $env:AXM_USER_HOME } else { $env:USERPROFILE }
$dataDir = if ($env:AXM_INSTALL_DATA_DIR) { $env:AXM_INSTALL_DATA_DIR } else { Join-Path $userHome '.axm' }
$installDir = if ($env:AXM_INSTALL_DIR) { $env:AXM_INSTALL_DIR } else { Join-Path $dataDir 'bin' }
$target = Join-Path $installDir 'axm.exe'
$lockPath = "$target.upgrade.lock"
$targetVersion = $env:AXM_INSTALL_VERSION
$tempBinary = $null
$tempManifest = $null
$backup = $null
$replaced = $false
$committed = $false
$lockAcquired = $false
$exitCode = 0

function Resolve-Architecture {
    switch ($env:PROCESSOR_ARCHITECTURE) {
        'AMD64' { return 'x64' }
        'ARM64' { throw 'Windows arm64 is not yet supported.' }
        default { throw "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE" }
    }
}

function Acquire-InstallLock {
    param([string]$Path)

    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        try {
            $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try {
                $content = [Text.Encoding]::UTF8.GetBytes((@{
                    pid = $PID
                    targetPath = $target
                    backupPath = $null
                } | ConvertTo-Json -Compress))
                $stream.Write($content, 0, $content.Length)
            }
            finally {
                $stream.Dispose()
            }
            return
        }
        catch [IO.IOException] {
            if (-not (Test-Path -LiteralPath $Path)) {
                throw
            }
            try {
                $owner = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
                $ownerPid = [int]$owner.pid
            }
            catch {
                throw "Another AXM install may be active; lock ownership is unknown: $Path"
            }
            if (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue) {
                throw "Another AXM install is active (pid $ownerPid)."
            }
            if ($owner.backupPath -and
                -not (Test-Path -LiteralPath $owner.targetPath) -and
                (Test-Path -LiteralPath $owner.backupPath)) {
                Move-Item -LiteralPath $owner.backupPath -Destination $owner.targetPath
            }
            Remove-Item -LiteralPath $Path -Force
        }
    }
    throw 'Could not acquire the AXM install lock.'
}

function Set-LockBackup {
    param([string]$Path, [string]$BackupPath)
    @{
        pid = $PID
        targetPath = $target
        backupPath = $BackupPath
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-AxmVersion {
    param([string]$Path)
    $output = & $Path --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "AXM at $Path did not execute successfully."
    }
    return ([string]$output).Trim()
}

try {
    if ($targetVersion -and
        $targetVersion -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$') {
        throw 'AXM_INSTALL_VERSION must be an unprefixed semantic version.'
    }

    $arch = Resolve-Architecture
    $artifact = "axm-windows-$arch.exe"
    Write-Host "Detected platform: windows-$arch"

    if ($env:AXM_INSTALL_BASE_URL) {
        $baseUrl = $env:AXM_INSTALL_BASE_URL.TrimEnd('/')
    }
    elseif ($targetVersion) {
        $baseUrl = "https://github.com/$githubRepo/releases/download/cli-v$targetVersion"
    }
    else {
        $baseUrl = "https://github.com/$githubRepo/releases/latest/download"
    }

    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Acquire-InstallLock -Path $lockPath
    $lockAcquired = $true

    $tempBinary = Join-Path $installDir (".axm-download-{0}.exe" -f [Guid]::NewGuid().ToString('N'))
    $tempManifest = Join-Path $installDir (".axm-checksums-{0}.txt" -f [Guid]::NewGuid().ToString('N'))
    $progress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$artifact" -OutFile $tempBinary
        Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHA256SUMS" -OutFile $tempManifest
    }
    finally {
        $ProgressPreference = $progress
    }

    # Note: do not name the accumulator $matches - PowerShell variable names
    # are case-insensitive and the -match operator overwrites the automatic
    # $Matches variable, turning the array into a hashtable mid-loop.
    $matchedHashes = @()
    foreach ($line in (Get-Content -LiteralPath $tempManifest)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^(?<hash>[0-9a-f]{64})  (?<name>[A-Za-z0-9._-]+)$') {
            throw 'SHA256SUMS contains a malformed entry.'
        }
        if ($Matches.name -eq $artifact) {
            $matchedHashes += $Matches.hash
        }
    }
    if ($matchedHashes.Count -ne 1) {
        throw "SHA256SUMS must contain exactly one entry for $artifact."
    }
    # Hash via .NET directly: cmdlet auto-loading is unreliable in minimal
    # environments (no PSModulePath/ProgramFiles), where Get-FileHash can fail
    # to resolve even though the session is otherwise functional.
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $binaryStream = [IO.File]::OpenRead($tempBinary)
        try {
            $hashBytes = $sha256.ComputeHash($binaryStream)
        }
        finally {
            $binaryStream.Dispose()
        }
    }
    finally {
        $sha256.Dispose()
    }
    $actualHash = ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
    if ($actualHash -ne $matchedHashes[0]) {
        throw "Checksum mismatch for $artifact; the existing AXM was not changed."
    }

    $downloadedVersion = Get-AxmVersion -Path $tempBinary
    if (-not $targetVersion) {
        $targetVersion = $downloadedVersion
    }
    if ($downloadedVersion -ne $targetVersion) {
        throw "Downloaded AXM reports $downloadedVersion; expected $targetVersion."
    }

    if (Test-Path -LiteralPath $target) {
        $backup = Join-Path $installDir (".axm-backup-{0}.exe" -f [Guid]::NewGuid().ToString('N'))
        Set-LockBackup -Path $lockPath -BackupPath $backup
        Move-Item -LiteralPath $target -Destination $backup
    }
    Move-Item -LiteralPath $tempBinary -Destination $target
    $tempBinary = $null
    $replaced = $true

    $installedVersion = Get-AxmVersion -Path $target
    if ($installedVersion -ne $targetVersion) {
        throw "Installed AXM reports $installedVersion; expected $targetVersion."
    }

    $metaPath = Join-Path $dataDir 'install-meta.json'
    $metaTemp = Join-Path $dataDir (".install-meta-{0}.tmp" -f [Guid]::NewGuid().ToString('N'))
    $metaJson = @{
        schemaVersion = 2
        method = 'script'
        installedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
        executablePath = $target
    } | ConvertTo-Json
    [IO.File]::WriteAllText($metaTemp, $metaJson, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $metaTemp -Destination $metaPath -Force

    $committed = $true
    Write-Host "Installed AXM $targetVersion to $target"

    $pathCommand = Get-Command axm -ErrorAction SilentlyContinue
    if ($pathCommand) {
        $pathVersion = (& axm --version 2>$null)
        if ([string]$pathVersion -ne $targetVersion) {
            Write-Warning "AXM on PATH reports $pathVersion; installed path reports $targetVersion."
        }
    }
    else {
        Write-Host "AXM is not on PATH. Add $installDir and open a new terminal."
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
}
finally {
    if ($replaced -and -not $committed) {
        try {
            if (Test-Path -LiteralPath $target) {
                Remove-Item -LiteralPath $target -Force
            }
            if ($backup -and (Test-Path -LiteralPath $backup)) {
                Move-Item -LiteralPath $backup -Destination $target
                $backup = $null
            }
        }
        catch {
            Write-Host "Error: AXM rollback failed; recoverable backup retained at $backup" -ForegroundColor Red
            $exitCode = 10
        }
    }
    if ($tempBinary -and (Test-Path -LiteralPath $tempBinary)) {
        Remove-Item -LiteralPath $tempBinary -Force -ErrorAction SilentlyContinue
    }
    if ($tempManifest -and (Test-Path -LiteralPath $tempManifest)) {
        Remove-Item -LiteralPath $tempManifest -Force -ErrorAction SilentlyContinue
    }
    if ($committed -and $backup -and (Test-Path -LiteralPath $backup)) {
        Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    }
    if ($lockAcquired -and (Test-Path -LiteralPath $lockPath)) {
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }
}

if ($exitCode -ne 0) {
    exit $exitCode
}
