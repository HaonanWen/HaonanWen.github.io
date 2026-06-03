$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DataDir = Join-Path $Root "data"
$Output = Join-Path $DataDir "openreview-profile.json"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$Url = "https://api2.openreview.net/profiles?id=%7EHaonan_Wen2"
Invoke-WebRequest -Uri $Url -OutFile $Output

Write-Host "Saved OpenReview profile to $Output"
