# Fix negative amounts and misclassified types/payment methods in data/vouchers_2026.json

$vouchersPath = "f:\MedicaPharmacy\data\vouchers_2026.json"
$backupPath = "f:\MedicaPharmacy\data\vouchers_2026.json.bak_fix_amounts"

if (-not (Test-Path $vouchersPath)) {
    Write-Error "File not found: $vouchersPath"
    exit 1
}

# 1. Backup
Copy-Item $vouchersPath $backupPath -Force
Write-Host "Backed up to $backupPath"

# 2. Read vouchers
$json = [System.IO.File]::ReadAllText($vouchersPath, [System.Text.Encoding]::UTF8)
$vouchers = $json | ConvertFrom-Json

Write-Host "Total vouchers read: $($vouchers.Count)"

$negFixed = 0
$typeFixed = 0
$methodFixed = 0

foreach ($v in $vouchers) {
    # Fix negative amount
    $amt = [double]$v.amount
    if ($amt -lt 0) {
        $v.amount = [Math]::Abs($amt)
        $negFixed++
    }

    # Fix misclassified types based on KiotViet ID prefixes
    # CTM = Chi Tiền Mặt, CNH = Chi Ngân Hàng, CTD = Chi Tự Động, PC = Phiếu Chi, PCPN = Phiếu Chi Phiếu Nhập
    if ($v.id -match '^(CTM|CNH|CTD|PC|PCPN)') {
        if ($v.type -ne 'payment') {
            $v.type = 'payment'
            $typeFixed++
        }
    }
    # TTM = Thu Tiền Mặt, TNH = Thu Ngân Hàng, TTD = Thu Tự Động, PT = Phiếu Thu, PTTHN = Phiếu Thu Trả Hàng Nhập, TTHD = Thu Tiền Hóa Đơn, TTHDO = Thu Tiền Hóa Đơn Khác
    elseif ($v.id -match '^(TTM|TNH|TTD|PT|PTTHN|TTHD|TTHDO)') {
        if ($v.type -ne 'receipt') {
            $v.type = 'receipt'
            $typeFixed++
        }
    }

    # Fix payment methods
    # CNH = Chi Ngân Hàng -> transfer
    # TNH = Thu Ngân Hàng -> transfer
    if ($v.id -match '^CNH' -or $v.id -match '^TNH') {
        if ($v.paymentMethod -ne 'transfer') {
            $v.paymentMethod = 'transfer'
            $methodFixed++
        }
    }
}

Write-Host "Converted negative amounts: $negFixed"
Write-Host "Corrected voucher types:    $typeFixed"
Write-Host "Corrected payment methods:  $methodFixed"

# Save normalized JSON
$fixedJson = $vouchers | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($vouchersPath, $fixedJson, [System.Text.Encoding]::UTF8)
Write-Host "Successfully wrote normalized vouchers to $vouchersPath"
