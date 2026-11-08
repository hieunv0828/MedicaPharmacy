# =====================================================================
# Dong bo hinh thuc thanh toan (Chuyen khoan / Tien mat) va Doi tac
# giua So Quy Thu Chi (vouchers_2026.json) va Hoa Don Ban Hang (orders_2026.json)
# =====================================================================

param (
    [string]$ordersPath = "f:\MedicaPharmacy\data\orders_2026.json",
    [string]$stockinPath = "f:\MedicaPharmacy\data\stockin_2026.json",
    [string]$vouchersPath = "f:\MedicaPharmacy\data\vouchers_2026.json"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  DONG BO HINH THUC THANH TOAN SO QUY THEO HOA DON" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

function Set-Prop($obj, $propName, $val) {
    if ($obj.PSObject.Properties[$propName]) {
        $obj.$propName = $val
    } else {
        $obj | Add-Member -NotePropertyName $propName -NotePropertyValue $val -Force
    }
}

# 1. Load orders
Write-Host "[1/4] Loading orders_2026.json..." -ForegroundColor White
$ordersJson = [System.IO.File]::ReadAllText($ordersPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$orderMap = @{}
foreach ($o in $ordersJson) {
    if ($o.id) {
        $orderMap[$o.id] = $o
    }
}
Write-Host "  [+] Loaded $($ordersJson.Count) orders." -ForegroundColor Green

# 2. Load stockins
$stockinMap = @{}
if (Test-Path $stockinPath) {
    Write-Host "[2/4] Loading stockin_2026.json..." -ForegroundColor White
    $stockinJson = [System.IO.File]::ReadAllText($stockinPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($s in $stockinJson) {
        if ($s.id) {
            $stockinMap[$s.id] = $s
        }
    }
    Write-Host "  [+] Loaded $($stockinJson.Count) stock-in orders." -ForegroundColor Green
}

# 3. Load and update vouchers
Write-Host "[3/4] Loading vouchers_2026.json..." -ForegroundColor White
$vouchersJson = [System.IO.File]::ReadAllText($vouchersPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
Write-Host "  [+] Loaded $($vouchersJson.Count) vouchers." -ForegroundColor Green

$hdCount = 0
$hdTransferCount = 0
$hdCashCount = 0
$thnCount = 0
$pnCount = 0

foreach ($v in $vouchersJson) {
    # --- 1. Hoa don ban hang (HD / TTHD) ---
    $hdId = $null
    if ($v.refId -and $v.refId -like 'HD*') {
        $hdId = $v.refId
    } elseif ($v.id -and $v.id -like 'TTHD*') {
        $hdId = $v.id -replace '^TT', ''
    }

    if ($hdId -and $orderMap.ContainsKey($hdId)) {
        $o = $orderMap[$hdId]
        $orderMethod = if ($o.paymentMethod) { $o.paymentMethod } else { 'cash' }
        
        Set-Prop $v 'paymentMethod' $orderMethod
        Set-Prop $v 'refId' $o.id

        $custName = if ($o.customerName -and $o.customerName -ne 'Khách lẻ') { $o.customerName } else { 'Khách lẻ trực tiếp' }
        Set-Prop $v 'targetType' 'customer'
        Set-Prop $v 'targetName' $custName
        Set-Prop $v 'recipientName' $custName

        $hdCount++
        if ($orderMethod -eq 'transfer') { $hdTransferCount++ } else { $hdCashCount++ }
        continue
    }

    # --- 2. Tra hang nhap (THN / PTTHN) ---
    if (($v.refId -and $v.refId -like 'THN*') -or ($v.id -and $v.id -like 'PTTHN*')) {
        Set-Prop $v 'paymentMethod' 'transfer'
        Set-Prop $v 'targetType' 'supplier'
        $thnCount++
        continue
    }

    # --- 3. Nhap hang (PN / PCPN) ---
    $pnId = $null
    if ($v.refId -and $v.refId -like 'PN*') {
        $pnId = $v.refId
    } elseif ($v.id -and $v.id -like 'PCPN*') {
        $pnId = $v.id -replace '^PC', ''
    }

    if ($pnId -and $stockinMap.ContainsKey($pnId)) {
        $s = $stockinMap[$pnId]
        if ($s.paymentMethod) {
            Set-Prop $v 'paymentMethod' $s.paymentMethod
        }
        Set-Prop $v 'targetType' 'supplier'
        if ($s.supplierName) {
            Set-Prop $v 'targetName' $s.supplierName
            Set-Prop $v 'recipientName' $s.supplierName
        }
        $pnCount++
    }
}

Write-Host ""
Write-Host "  [+] Da dong bo $hdCount phieu thu hoa don:" -ForegroundColor Cyan
Write-Host "      - Chuyen khoan: $hdTransferCount phieu" -ForegroundColor Cyan
Write-Host "      - Tien mat:     $hdCashCount phieu" -ForegroundColor Cyan
Write-Host "  [+] Da dong bo $thnCount phieu thu tra hang nhap (THN) sang Chuyen khoan" -ForegroundColor Cyan
Write-Host "  [+] Da dong bo $pnCount phieu chi nhap hang (PN)" -ForegroundColor Cyan

# 4. Save back to file
Write-Host "[4/4] Luu file vouchers_2026.json..." -ForegroundColor White
$outJson = $vouchersJson | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($vouchersPath, $outJson, [System.Text.Encoding]::UTF8)

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  HOAN TAT DONG BO SO QUY THEO HOA DON!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
