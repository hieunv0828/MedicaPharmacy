$appDir = "f:\MedicaPharmacy"

# Kiem tra MedicaServer da chay chua
$server = Get-Process MedicaServer -ErrorAction SilentlyContinue
if (!$server) {
    Start-Process "$appDir\MedicaServer.exe"
    Start-Sleep -Seconds 1
}

$logFile = "$appDir\tools\tunnel.log"
Remove-Item $logFile -ErrorAction SilentlyContinue

$proc = Start-Process "$appDir\tools\cloudflared.exe" -ArgumentList "tunnel --url http://localhost:80" -PassThru -NoNewWindow -RedirectStandardError $logFile

Write-Host "Dang tao duong truyen Cloudflare an toan..." -ForegroundColor Cyan

$tunnelUrl = ""
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
        $lines = Get-Content $logFile -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if ($line -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
                $tunnelUrl = $matches[0]
                break
            }
        }
    }
    if ($tunnelUrl) { break }
}

Clear-Host
if ($tunnelUrl) {
    try { Set-Clipboard -Value $tunnelUrl } catch { }
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "   DA KET NOI INTERNET THANH CONG (MIEN PHI 100%)       " -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host " Duong link mo tren dien thoai (4G / o nha / bat ky dau):" -ForegroundColor White
    Write-Host ""
    Write-Host "   $tunnelUrl" -ForegroundColor Yellow
    Write-Host ""
    Write-Host " [v] Da tu dong copy link vao Clipboard (chi can Ctrl+V gui Zalo)!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host " (Giu nguyen cua so nay khi ban dang xem tren dien thoai)" -ForegroundColor Gray
    Write-Host " Nhan Enter de ngat ket noi..." -ForegroundColor Gray
    Read-Host
} else {
    Write-Host "[!] Khong the tao link. Vui long kiem tra ket noi mang." -ForegroundColor Red
    Read-Host
}

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Remove-Item $logFile -ErrorAction SilentlyContinue

