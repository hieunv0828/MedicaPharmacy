$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Green
Write-Host "      MEDICAPHARMACY - DONG GOI BO CAI DAT STANDALONE .EXE           " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host ""

$root = "f:\MedicaPharmacy"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (!(Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

if (!(Test-Path $csc)) {
    Write-Error "Khong tim thay trinh bien dich csc.exe tren he thong!"
}

# 1. Bien dich MedicaServer.exe
Write-Host "[1/4] Bien dich may chu MedicaServer.exe moi nhat..." -ForegroundColor Cyan
& $csc /target:winexe /platform:anycpu /out:"$root\MedicaServer.new.exe" "$root\server\MedicaServer.cs" "$root\server\LicenseManager.cs" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.dll /r:System.Web.Extensions.dll | Out-Null
if (Test-Path "$root\MedicaServer.new.exe") {
    # Thu thay the MedicaServer.exe neu khong bi khoa
    try {
        Move-Item -Path "$root\MedicaServer.new.exe" -Destination "$root\MedicaServer.exe" -Force
    } catch {
        Remove-Item -Path "$root\MedicaServer.new.exe" -Force -ErrorAction SilentlyContinue
    }
}

# 1.1 Bien dich MedicaKeyGen.exe (Cong cu tao key ban quyen cho Admin)
& $csc /target:winexe /platform:anycpu /out:"$root\tools\MedicaKeyGen.exe" "$root\tools\KeyGen.cs" "$root\server\LicenseManager.cs" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.dll | Out-Null

# 2. Chuan bi Payload Staging
Write-Host "[2/4] Chuan bi du lieu ung dung vao thu muc staging..." -ForegroundColor Cyan
$stagingDir = "$root\installer\staging"
$zipPath = "$root\installer\MedicaPayload.zip"

if (Test-Path $stagingDir) { Remove-Item -Path $stagingDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force }

New-Item -ItemType Directory -Path $stagingDir | Out-Null

# Copy tap tin goc
$filesToCopy = @(
    "index.html",
    "license-activation.html",
    "huong-dan-su-dung.html",
    "tai-lieu-thiet-ke.html",
    "MedicaServer.exe",
    "Start-App.bat",
    "start-app-without-ngrok.bat",
    "Stop-Server.bat",
    "Setup-Domain-Medica.bat",
    "README.md"
)

foreach ($f in $filesToCopy) {
    $src = Join-Path $root $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $stagingDir -Force
    }
}

# Copy cac thu muc
$dirsToCopy = @("css", "js", "vendor", "data", "server")
foreach ($d in $dirsToCopy) {
    $srcDir = Join-Path $root $d
    if (Test-Path $srcDir) {
        Copy-Item -Path $srcDir -Destination (Join-Path $stagingDir $d) -Recurse -Force
    }
}

# Xoa file license.key khoi goi cai dat de moi may bat buoc phai kich hoat key rieng
$stagingLicenseKey = Join-Path $stagingDir "data\license.key"
if (Test-Path $stagingLicenseKey) {
    Remove-Item -Path $stagingLicenseKey -Force
}

# Copy tools (ngrok.exe)
$stagingTools = Join-Path $stagingDir "tools"
New-Item -ItemType Directory -Path $stagingTools | Out-Null
$ngrokSrc = "$root\tools\ngrok.exe"
if (Test-Path $ngrokSrc) {
    Copy-Item -Path $ngrokSrc -Destination $stagingTools -Force
}

# 3. Nen vao tap tin ZIP
Write-Host "[3/4] Dang nen toan bo ung dung vao tap tin ZIP..." -ForegroundColor Cyan
Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -CompressionLevel Optimal -Force

$zipItem = Get-Item $zipPath
$zipSizeMb = [Math]::Round($zipItem.Length / 1MB, 2)
Write-Host "  -> Dung luong goi ung dung: $zipSizeMb MB" -ForegroundColor DarkGray

# 4. Bien dich file Setup.exe
Write-Host "[4/4] Bien dich file cai dat Standalone: MedicaPharmacy_Setup.exe..." -ForegroundColor Cyan
$setupOut = "$root\MedicaPharmacy_Setup.exe"

& $csc /target:winexe /platform:anycpu /out:"$setupOut" "$root\installer\MedicaInstaller.cs" "$root\server\LicenseManager.cs" /resource:"$zipPath,MedicaPayload" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll

if (Test-Path $setupOut) {
    $setupItem = Get-Item $setupOut
    $setupSizeMb = [Math]::Round($setupItem.Length / 1MB, 2)
    
    # Don dep staging
    Remove-Item -Path $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "   DONG GOI THANH CONG FILE CAI DAT .EXE!" -ForegroundColor Green
    Write-Host "   File cai dat: $setupOut" -ForegroundColor Yellow
    Write-Host "   Dung luong:   $setupSizeMb MB" -ForegroundColor Yellow
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ban co the gui duy nhat 1 file 'MedicaPharmacy_Setup.exe' nay cho nguoi khac."
    Write-Host "Nguoi nhan chi can mo file va bam 'Bat Dau Cai Dat', phan mem se tu dong:"
    Write-Host " 1. Giai nen phan mem vao C:\MedicaPharmacy"
    Write-Host " 2. Cau hinh ten mien http://medica.com"
    Write-Host " 3. Mo tuong lua Windows Firewall cho dien thoai ket noi Wifi"
    Write-Host " 4. Tao icon loi tat ngoai Desktop va Start Menu"
    Write-Host " 5. Khoi dong phan mem va mo trinh duyet ngay lap tuc!"
    Write-Host ""
} else {
    Write-Error "Bien dich file cai dat that bai!"
}

