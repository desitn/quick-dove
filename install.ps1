#!/usr/bin/env pwsh
# VS Code Extension Install Script for quick-firmware-plus
# Usage: .\install.ps1 [-VsixPath <path>] [-System] [-Force]

param(
    [string]$VsixPath = "",
    [switch]$System,
    [switch]$Force,
    [switch]$Silent
)

# Extension info
$ExtensionId = "destin-zhang.quick-firmware-plus"
$ExtensionName = "quick-firmware-plus"
$DefaultVsixName = "quick-firmware-plus-0.2.6.vsix"

# Colors for output
$ColorSuccess = "Green"
$ColorError = "Red"
$ColorWarning = "Yellow"
$ColorInfo = "Cyan"

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "Info"
    )
    if ($Silent -and $Level -eq "Info") { return }
    
    $color = switch ($Level) {
        "Success" { $ColorSuccess }
        "Error" { $ColorError }
        "Warning" { $ColorWarning }
        default { $ColorInfo }
    }
    Write-Host $Message -ForegroundColor $color
}

function Find-VSCode {
    # Try to find VS Code executable
    $codeCmd = Get-Command "code" -ErrorAction SilentlyContinue
    if ($codeCmd) {
        return $codeCmd.Source
    }
    
    # Check common installation paths
    $possiblePaths = @(
        "${env:ProgramFiles}\Microsoft VS Code\bin\code.cmd",
        "${env:ProgramFiles}\Microsoft VS Code\bin\code",
        "${env:LOCALAPPDATA}\Programs\Microsoft VS Code\bin\code.cmd",
        "${env:LOCALAPPDATA}\Programs\Microsoft VS Code\bin\code",
        "${env:ProgramFiles(x86)}\Microsoft VS Code\bin\code.cmd",
        "${env:ProgramFiles(x86)}\Microsoft VS Code\bin\code"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    return $null
}

function Find-VsixFile {
    param([string]$SpecifiedPath)
    
    if ($SpecifiedPath -and (Test-Path $SpecifiedPath)) {
        return $SpecifiedPath
    }
    
    # Look in script directory
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $vsixInScriptDir = Join-Path $scriptDir $DefaultVsixName
    if (Test-Path $vsixInScriptDir) {
        return $vsixInScriptDir
    }
    
    # Look in parent directory (project root)
    $parentDir = Split-Path -Parent $scriptDir
    $vsixInParentDir = Join-Path $parentDir $DefaultVsixName
    if (Test-Path $vsixInParentDir) {
        return $vsixInParentDir
    }
    
    # Look in current directory
    $vsixInCurrentDir = Join-Path (Get-Location) $DefaultVsixName
    if (Test-Path $vsixInCurrentDir) {
        return $vsixInCurrentDir
    }
    
    return $null
}

function Test-ExtensionInstalled {
    param([string]$CodePath)
    
    try {
        $installed = & $CodePath --list-extensions 2>$null | Select-String $ExtensionId
        return ($null -ne $installed)
    } catch {
        return $false
    }
}

function Uninstall-Extension {
    param([string]$CodePath)
    
    Write-Log "Uninstalling existing extension..." "Info"
    try {
        $output = & $CodePath --uninstall-extension $ExtensionId 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Existing extension uninstalled successfully" "Success"
            return $true
        } else {
            Write-Log "Failed to uninstall existing extension: $output" "Warning"
            return $false
        }
    } catch {
        Write-Log "Error uninstalling extension: $_" "Warning"
        return $false
    }
}

function Install-Extension {
    param(
        [string]$CodePath,
        [string]$VsixPath
    )
    
    Write-Log "Installing extension from: $VsixPath" "Info"
    
    try {
        $output = & $CodePath --install-extension $VsixPath --force 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Extension installed successfully!" "Success"
            Write-Log "Output: $output" "Info"
            return $true
        } else {
            Write-Log "Installation failed with exit code $LASTEXITCODE" "Error"
            Write-Log "Output: $output" "Error"
            return $false
        }
    } catch {
        Write-Log "Error installing extension: $_" "Error"
        return $false
    }
}

# Main script
Write-Log "========================================" "Info"
Write-Log "VS Code Extension Installer" "Info"
Write-Log "Extension: $ExtensionName" "Info"
Write-Log "========================================" "Info"

# Find VS Code
Write-Log "Looking for VS Code..." "Info"
$codePath = Find-VSCode
if (-not $codePath) {
    Write-Log "VS Code not found! Please install VS Code first." "Error"
    exit 1
}
Write-Log "Found VS Code at: $codePath" "Success"

# Find VSIX file
Write-Log "Looking for VSIX file..." "Info"
$vsixFile = Find-VsixFile -SpecifiedPath $VsixPath
if (-not $vsixFile) {
    Write-Log "VSIX file not found!" "Error"
    Write-Log "Searched for: $DefaultVsixName" "Error"
    Write-Log "Please specify the path with -VsixPath parameter" "Error"
    exit 1
}
Write-Log "Found VSIX file at: $vsixFile" "Success"

# Check if extension is already installed
if (Test-ExtensionInstalled -CodePath $codePath) {
    if ($Force) {
        Write-Log "Extension is already installed. Force reinstalling..." "Warning"
        Uninstall-Extension -CodePath $codePath | Out-Null
    } else {
        Write-Log "Extension is already installed. Use -Force to reinstall." "Warning"
        exit 0
    }
}

# Install extension
if (Install-Extension -CodePath $codePath -VsixPath $vsixFile) {
    Write-Log "" "Info"
    Write-Log "Installation completed successfully!" "Success"
    Write-Log "Please reload VS Code to activate the extension." "Info"
    exit 0
} else {
    Write-Log "" "Info"
    Write-Log "Installation failed!" "Error"
    exit 1
}
