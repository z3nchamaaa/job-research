param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('job-research-install-' + [guid]::NewGuid())
$installDir = Join-Path $testRoot 'app'
$data = Join-Path $testRoot 'data'
$setup = Start-Process (Resolve-Path $Installer).Path -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="' + $installDir + '"') -Wait -PassThru
if ($setup.ExitCode -notin @(0,3010)) { throw "Installer failed: $($setup.ExitCode)" }
$exe = Join-Path $installDir 'JobResearch.WebView.exe'
$runtimeCheck = Start-Process $exe -ArgumentList '--check-runtime' -Wait -PassThru
if ($runtimeCheck.ExitCode -ne 0) { throw 'Installed WebView2 Runtime is unavailable' }
for ($pass = 0; $pass -lt 2; $pass++) {
    # Second pass checks restart and reading the same DB/profile rather than a fresh installation.
    $current = $data
    $process = Start-Process $exe -ArgumentList '--smoke-test',('"' + $current + '"') -PassThru
    if (!$process.WaitForExit(90000)) { Stop-Process -Id $process.Id; throw 'Installed app timed out' }
    if ($process.ExitCode -ne 0) {
        if (Test-Path (Join-Path $current 'smoke-error.txt')) { Get-Content (Join-Path $current 'smoke-error.txt') }
        throw "Installed app smoke failed: $($process.ExitCode)"
    }
    Get-Content (Join-Path $current 'smoke-result.json')
}
if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like "*$installDir*" }) { throw 'Backend left running' }
$crashData = Join-Path $testRoot 'crash-data'
$crash = Start-Process $exe -ArgumentList '--lifecycle-test',('"' + $crashData + '"') -PassThru
$ready = Join-Path $crashData 'lifecycle-ready.txt'
$deadline = (Get-Date).AddSeconds(60)
while (!(Test-Path $ready) -and (Get-Date) -lt $deadline -and !$crash.HasExited) { Start-Sleep -Milliseconds 200 }
if (!(Test-Path $ready)) { throw 'Crash cleanup test failed to start' }
$children = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like "*$installDir*" })
if ($children.Count -lt 2) { throw 'Expected backend and server before crash' }
Stop-Process -Id $crash.Id -Force
Start-Sleep -Seconds 2
foreach ($child in $children) { if (Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue) { throw 'Host crash left a Node process running' } }
$uninstall = Start-Process (Join-Path $installDir 'unins000.exe') -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "Uninstall failed: $($uninstall.ExitCode)" }
if (!(Test-Path (Join-Path $data 'syukatsu.db'))) { throw 'Uninstall removed data' }
