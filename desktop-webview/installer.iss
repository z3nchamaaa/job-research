#ifndef SourceDir
  #error SourceDir is required
#endif
#if Rid == "win-arm64"
  #define AllowedArchitecture "arm64 and x64compatible"
#else
  #define AllowedArchitecture "x64compatible"
#endif

[Setup]
AppId={{5F477021-121A-4F85-BE66-9BF12549E3D5}
AppName=就活トラッカー
AppVersion={#Version}
AppPublisher=Job Research
AppPublisherURL=https://github.com/z3nchamaaa/job-research
DefaultDirName={localappdata}\Programs\job-research-webview
DefaultGroupName=就活トラッカー
PrivilegesRequired=lowest
ArchitecturesAllowed={#AllowedArchitecture}
ArchitecturesInstallIn64BitMode={#AllowedArchitecture}
MinVersion=10.0.22000
AppMutex=Local\JobResearchWebViewStable
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\JobResearch.WebView.exe
SetupIconFile={#SourcePath}..\assets\icons\app-icon.ico
OutputDir={#SourcePath}..\dist
OutputBaseFilename=job-research-{#Version}-{#Rid}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
LicenseFile={#SourcePath}..\LICENSE

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dependencies\MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{group}\就活トラッカー"; Filename: "{app}\JobResearch.WebView.exe"

[Code]
function RuntimeAt(Root: Integer; Key: String): Boolean;
var V: String;
begin
  Result := RegQueryStringValue(Root, Key + '\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) and (V <> '') and (V <> '0.0.0.0');
end;

function RuntimePresent(): Boolean;
begin
  Result := RuntimeAt(HKCU, 'Software\Microsoft\EdgeUpdate\Clients') or
    RuntimeAt(HKLM32, 'Software\Microsoft\EdgeUpdate\Clients') or
    RuntimeAt(HKLM64, 'Software\Microsoft\EdgeUpdate\Clients');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var Code: Integer;
begin
  Result := '';
  if RuntimePresent() then exit;
  ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
  if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, Code) then
  begin
    Result := 'WebView2 Runtimeのインストールを開始できませんでした。';
    exit;
  end;
  if (Code <> 0) and (Code <> 3010) then
  begin
    Result := 'WebView2 Runtimeをインストールできませんでした。インターネット接続を確認してください。';
    exit;
  end;
  if not RuntimePresent() then
    Result := 'WebView2 Runtimeを確認できませんでした。Microsoftのサイトからインストールして、もう一度お試しください。';
  NeedsRestart := Code = 3010;
end;
