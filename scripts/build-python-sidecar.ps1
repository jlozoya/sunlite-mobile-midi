$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root "python\prodj_link_bridge.py"
$output = Join-Path $root "resources\prodj-link"
$work = Join-Path $root "dist\pyinstaller"

python $script --self-test
python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name prodj-link-bridge `
  --distpath $output `
  --workpath $work `
  --specpath $work `
  $script

Write-Host "Built $output\prodj-link-bridge.exe"
