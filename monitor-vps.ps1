# Arth Mantra VPS Performance Monitor & Controller
# Run this from your laptop to monitor and control the VPS in real time

param(
    [string]$Url = "https://arthmantratrading.app",
    [string]$Pass = "ArthAdmin2026!"
)

Write-Host "Connecting to Arth Mantra Trading Engine VPS at $Url..." -ForegroundColor Cyan
Set-Location -Path $PSScriptRoot
node .\vps-monitor.js --url $Url --pass $Pass
