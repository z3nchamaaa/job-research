param([ValidateSet('win-x64','win-arm64')][string]$Rid = 'win-x64')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
function Run([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed: $LASTEXITCODE" }
}
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Stable version required' }
$output = Join-Path $root "dist/webview/$Rid"
Run 'npm.cmd' @('run','desktop:prepare-win-arm64')
Run 'npm.cmd' @('run','webview:prepare')
Run 'dotnet' @('publish','desktop-webview/WebViewHost.csproj','-c','Release','-r',$Rid,'--self-contained','true','-o',$output)
if ($Rid -eq 'win-x64') {
    $env:JOB_WEBVIEW_TEST_HOST = Join-Path $output 'JobResearch.WebView.exe'
    Run 'npm.cmd' @('run','webview:test')
}
$dependencies = Join-Path $PSScriptRoot 'dependencies'
New-Item -ItemType Directory -Force $dependencies | Out-Null
$bootstrapper = Join-Path $dependencies 'MicrosoftEdgeWebview2Setup.exe'
Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper
$signature = Get-AuthenticodeSignature $bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw 'WebView2 bootstrapper signature verification failed'
}
$compiler = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'
if (!(Test-Path $compiler)) { throw 'Inno Setup 6 is required' }
Run $compiler @("/DSourceDir=$output", "/DVersion=$version", "/DRid=$Rid", 'desktop-webview/installer.iss')
