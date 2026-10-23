; The compiler and payload paths are supplied by build-windows-installer.py.
#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef PayloadDir
  #error PayloadDir is required
#endif
#ifndef TargetArch
  #error TargetArch is required
#endif
#ifndef AppDisplayVersion
  #define AppDisplayVersion AppVersion
#endif

[Setup]
AppId={{3B79CA38-C53B-4BE7-B690-7B7274B87229}
AppName=Sensa
AppVersion={#AppVersion}
AppVerName=Sensa {#AppDisplayVersion}
AppPublisher=SeaLoong
AppPublisherURL=https://sealoong.github.io/Sensa/
AppSupportURL=https://github.com/SeaLoong/Sensa/issues
DefaultDirName={localappdata}\Programs\Sensa
DefaultGroupName=Sensa
PrivilegesRequired=lowest
#if TargetArch == "arm64"
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
#else
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#endif
MinVersion=10.0.17763
DisableProgramGroupPage=yes
LicenseFile={#PayloadDir}\LICENSE
UninstallDisplayIcon={app}\Sensa.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Sensa"; Filename: "{app}\Sensa.exe"; Parameters: "--open-browser=true"; WorkingDir: "{app}"
Name: "{group}\Sensa documentation"; Filename: "https://sealoong.github.io/Sensa/"

[Run]
Filename: "{app}\Sensa.exe"; Parameters: "--open-browser=true"; Description: "Launch Sensa"; Flags: nowait postinstall skipifsilent

; config.json, recordings and other user-created files are deliberately absent
; from the payload and are preserved when upgrading or uninstalling.
