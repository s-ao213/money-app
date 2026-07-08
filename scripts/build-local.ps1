$ErrorActionPreference = "Stop"
$projectPath = Resolve-Path (Join-Path $PSScriptRoot "..")
$driveName = "X:"
$existing = subst | Select-String "^$driveName\\:"
if ($existing) { subst $driveName /D | Out-Null }
subst $driveName $projectPath.Path
Set-Location "$driveName\"
$env:USERPROFILE = "$driveName\"
$env:HOME = "$driveName\"
$env:LOCALAPPDATA = "$driveName\.localappdata"
$env:APPDATA = "$driveName\.appdata"
node ".\node_modules\next\dist\bin\next" build
