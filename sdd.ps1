<#
.SYNOPSIS
    SDD-RIPER CLI — Windows PowerShell wrapper
.DESCRIPTION
    Locates Git Bash automatically and delegates all arguments to sdd.sh.
    Requires Git for Windows: https://git-scm.com/download/win
.EXAMPLE
    .\sdd.ps1 init my-project
    .\sdd.ps1 status my-project
#>

$ErrorActionPreference = 'Stop'

# Step 1: Locate Git Bash via Windows Registry
# Git for Windows always writes InstallPath to the registry on install.
# HKLM = system-wide install, HKCU = per-user install.
$bash = $null
foreach ($regKey in @("HKLM:\SOFTWARE\GitForWindows", "HKCU:\SOFTWARE\GitForWindows")) {
    $reg = Get-ItemProperty $regKey -ErrorAction SilentlyContinue
    if ($reg -and $reg.InstallPath) {
        $candidate = Join-Path $reg.InstallPath "bin\bash.exe"
        if (Test-Path $candidate) { $bash = $candidate; break }
    }
}

if (-not $bash) {
    $bashCmd = Get-Command bash -ErrorAction SilentlyContinue
    if ($bashCmd -and $bashCmd.Source) { $bash = $bashCmd.Source }
}

if (-not $bash) {
    Write-Host "[ERROR] Git for Windows not found in registry." -ForegroundColor Red
    Write-Host "Install Git for Windows: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# Step 2: Locate sdd.sh
$sddSh = Join-Path $PSScriptRoot "sdd.sh"
if (-not (Test-Path $sddSh)) {
    Write-Host "[ERROR] sdd.sh not found at: $sddSh" -ForegroundColor Red
    exit 1
}

# Step 3: Convert Windows path to MINGW Unix format
# C:\Users\foo\sdd-riper\sdd.sh → /c/Users/foo/sdd-riper/sdd.sh
$drive    = $sddSh.Substring(0, 1).ToLower()
$rest     = $sddSh.Substring(2) -replace '\\', '/'
$sddShUnix = "/$drive$rest"

# Step 4: Execute and pass through exit code
& $bash $sddShUnix @args
exit $LASTEXITCODE
