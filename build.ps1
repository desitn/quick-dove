#!/usr/bin/env pwsh
# Build Script for quick-dove
# Compiles dove CLI and packages VS Code extension

param(
    [switch]$SkipDove
)

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot
$DoveDir = Join-Path $RootDir "dove"

Write-Host "Quick Dove Build Script" -ForegroundColor Cyan
Write-Host "=" * 50

# Step 1: Build dove.exe
if (-not $SkipDove) {
    Write-Host "`n[1/2] Building dove.exe..." -ForegroundColor Yellow
    Push-Location $DoveDir
    try {
        npm run build:exe
        if (Test-Path "./dove.exe") {
            Write-Host "dove.exe built successfully" -ForegroundColor Green
        } else {
            Write-Error "dove.exe not found after build"
        }
    } finally {
        Pop-Location
    }
}

# Step 2: Package VSIX
Write-Host "`n[2/2] Packaging VSIX..." -ForegroundColor Yellow
Push-Location $RootDir
try {
    vsce package
    $vsixFiles = Get-ChildItem -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($vsixFiles) {
        Write-Host "VSIX packaged: $($vsixFiles.Name)" -ForegroundColor Green
        Write-Host "Size: $([math]::Round($vsixFiles.Length / 1KB, 2)) KB" -ForegroundColor Gray
    } else {
        Write-Error "VSIX file not found after package"
    }
} finally {
    Pop-Location
}

Write-Host "`n" + "=" * 50
Write-Host "Build completed!" -ForegroundColor Cyan