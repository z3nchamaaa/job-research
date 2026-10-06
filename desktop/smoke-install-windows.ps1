$ErrorActionPreference = 'Stop'
$installer = (Get-Item $args[0]).FullName
$destination = Join-Path $env:RUNNER_TEMP ('job-research-install-' + [guid]::NewGuid())
$process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$destination") -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer exited: $($process.ExitCode)" }
$executable = Join-Path $destination '就活トラッカー.exe'
$uninstaller = Join-Path $destination 'Uninstall 就活トラッカー.exe'
if (!(Test-Path $executable) -or !(Test-Path $uninstaller)) { throw 'Installed files missing' }
node desktop/verify-nsis.cjs $uninstaller --uninstaller
if ($LASTEXITCODE -ne 0) { throw 'Installed uninstaller CRC invalid' }
$process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Uninstaller exited: $($process.ExitCode)" }
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  if (!(Test-Path $executable) -and !(Test-Path $uninstaller)) {
    Write-Output 'PASS: clean Windows silent install, installed uninstaller CRC, silent uninstall'
    exit 0
  }
  Start-Sleep -Seconds 1
}
throw 'Uninstall did not remove installed executables'
