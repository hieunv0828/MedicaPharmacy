# =====================================================================
# Import Phieu Tra Hang Nhap (Purchase Returns) from KiotViet XLSX / CSV
# MedicaPharmacy - Ho tro quan ly phieu tra hang nha cung cap (THN)
# =====================================================================

param (
    [string]$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794081928382_aa3c4a53.xlsx",
    [string]$outputPath = "f:\MedicaPharmacy\data\returns_2026.json",
    [string]$medicinesPath = "f:\MedicaPharmacy\data\medicines.json",
    [string]$vouchersPath = "f:\MedicaPharmacy\data\vouchers_2026.json"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  IMPORT PHIEU TRA HANG NHAP (THN) TU KIOTVIET" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Load medicines for mapping
$medMap = @{}
if (Test-Path $medicinesPath) {
    Write-Host "[1/5] Loading medicines map..." -ForegroundColor White
    $medJson = [System.IO.File]::ReadAllText($medicinesPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($m in $medJson) {
        if ($m.id -and -not $medMap.ContainsKey($m.id)) {
            $medMap[$m.id] = $m
        }
        if ($m.barcode) {
            $parts = $m.barcode -split '[,;\s]+'
            foreach ($p in $parts) {
                $p = $p.Trim()
                if ($p -and -not $medMap.ContainsKey($p)) {
                    $medMap[$p] = $m
                }
            }
        }
    }
    Write-Host "  [+] Da load $($medJson.Count) thuoc, $($medMap.Count) khoa tra cuu." -ForegroundColor Green
}

# 2. Load vouchers for paymentMethod matching
$voucherPayMap = @{}
if (Test-Path $vouchersPath) {
    Write-Host "[2/5] Loading vouchers de map phuong thuc thanh toan..." -ForegroundColor White
    $vouchers = [System.IO.File]::ReadAllText($vouchersPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($v in $vouchers) {
        $thnId = $null
        if ($v.refId -and $v.refId -like 'THN*') {
            $thnId = $v.refId
        } elseif ($v.id -and $v.id -like 'PTTHN*') {
            $thnId = $v.id -replace '^PT', ''
        }
        if ($thnId -and -not $voucherPayMap.ContainsKey($thnId)) {
            $pm = if ($v.paymentMethod) { $v.paymentMethod } else { 'transfer' }
            $voucherPayMap[$thnId] = $pm
        }
    }
    Write-Host "  [+] Da map $($voucherPayMap.Count) vouchers THN." -ForegroundColor Green
}

# 3. Read XLSX file
if (-not (Test-Path $xlsxPath)) {
    Write-Host "[!] Khong tim thay file XLSX tai: $xlsxPath" -ForegroundColor Red
    exit 1
}

Write-Host "[3/5] Giai nen va doc file Excel KiotViet..." -ForegroundColor White
$tmpDir = Join-Path $env:TEMP ("thn_import_" + (Get-Random))
New-Item -ItemType Directory -Path $tmpDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($xlsxPath, $tmpDir)

# Load shared strings
$strings = @()
$ssFile = Join-Path $tmpDir "xl\sharedStrings.xml"
if (Test-Path $ssFile) {
    [xml]$ss = Get-Content $ssFile -Encoding UTF8
    $strings = @($ss.sst.si | ForEach-Object {
        $si = $_
        if ($si.r) {
            ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join ''
        } elseif ($si.t -ne $null) {
            $t = $si.t
            if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t }
        } else { '' }
    })
}
Write-Host "  [+] Da load $($strings.Count) shared strings." -ForegroundColor Green

# Load worksheet
$sheetFile = Join-Path $tmpDir "xl\worksheets\sheet2.xml"
if (-not (Test-Path $sheetFile)) {
    $sheetFile = Join-Path $tmpDir "xl\worksheets\sheet1.xml"
}
[xml]$ws = Get-Content $sheetFile -Encoding UTF8
$rows = $ws.worksheet.sheetData.row
Write-Host "  [+] Tong so dong (ca tieu de): $($rows.Count)" -ForegroundColor Green

function Get-CellVal($cell, $stringsArr) {
    if ($null -eq $cell) { return '' }
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's' -and $stringsArr.Count -gt 0) { return $stringsArr[[int]$v] }
    return $v
}

function Convert-OADate($oaVal) {
    if ([string]::IsNullOrEmpty($oaVal)) { return '' }
    try {
        $dt = [DateTime]::FromOADate([double]$oaVal)
        return $dt.ToString('yyyy-MM-ddTHH:mm:ss+07:00')
    } catch { return '' }
}

# 4. Parse all line items
Write-Host "[4/5] Phan tich tung dong chi tiet..." -ForegroundColor White
$thnLines = New-Object System.Collections.Generic.List[object]
$skipFirst = $true

foreach ($row in $rows) {
    if ($skipFirst) { $skipFirst = $false; continue }

    $cells = @{}
    foreach ($c in $row.c) {
        $colRef = $c.r -replace '\d+', ''
        $cells[$colRef] = $c
    }

    $thnId = Get-CellVal $cells['B'] $strings
    if ([string]::IsNullOrEmpty($thnId)) { continue }

    $lineObj = [PSCustomObject]@{
        branch          = Get-CellVal $cells['A'] $strings
        thnId           = $thnId
        timeRaw         = Get-CellVal $cells['C'] $strings
        timeCreateRaw   = Get-CellVal $cells['D'] $strings
        supplierId      = Get-CellVal $cells['E'] $strings
        supplierName    = Get-CellVal $cells['F'] $strings
        supplierPhone   = Get-CellVal $cells['G'] $strings
        supplierAddress = Get-CellVal $cells['H'] $strings
        seller          = Get-CellVal $cells['I'] $strings
        totalAmt        = Get-CellVal $cells['J'] $strings
        discount        = Get-CellVal $cells['K'] $strings
        finalAmt        = Get-CellVal $cells['L'] $strings
        paidAmt         = Get-CellVal $cells['M'] $strings
        creator         = Get-CellVal $cells['N'] $strings
        note            = Get-CellVal $cells['O'] $strings
        status          = Get-CellVal $cells['R'] $strings
        medCode         = Get-CellVal $cells['S'] $strings
        barcode         = Get-CellVal $cells['T'] $strings
        medName         = Get-CellVal $cells['U'] $strings
        brand           = Get-CellVal $cells['V'] $strings
        unit            = Get-CellVal $cells['W'] $strings
        unitCost        = Get-CellVal $cells['Y'] $strings
        qty             = Get-CellVal $cells['Z'] $strings
        itemDiscount    = Get-CellVal $cells['AA'] $strings
        discountPct     = Get-CellVal $cells['AB'] $strings
        lineTotal       = Get-CellVal $cells['AD'] $strings
    }
    $thnLines.Add($lineObj)
}

Write-Host "  [+] Da doc $($thnLines.Count) dong hang hoa xuat tra." -ForegroundColor Green

# 5. Group by thnId and create JSON objects
Write-Host "[5/5] Tong hop don va xuat file JSON..." -ForegroundColor White
$grouped = $thnLines | Group-Object -Property thnId
Write-Host "  [+] Tong so phieu THN duy nhat: $($grouped.Count)" -ForegroundColor Green

$returnOrders = New-Object System.Collections.Generic.List[object]

foreach ($grp in $grouped) {
    $lines = $grp.Group
    $first = $lines[0]
    $id = $first.thnId

    $createdAt = Convert-OADate $first.timeRaw
    if ([string]::IsNullOrEmpty($createdAt)) {
        $createdAt = Convert-OADate $first.timeCreateRaw
    }

    $supId = if ($first.supplierId) { $first.supplierId } else { 'NCC lẻ' }
    $supName = if ($first.supplierName) { $first.supplierName } else { 'Nhà cung cấp lẻ' }

    # Payment method from vouchers or default transfer
    $payMethod = if ($voucherPayMap.ContainsKey($id)) { $voucherPayMap[$id] } else { 'transfer' }

    $totalAmt = 0
    if (-not [string]::IsNullOrEmpty($first.totalAmt)) { try { $totalAmt = [Math]::Round([double]$first.totalAmt) } catch {} }

    $finalAmt = $totalAmt
    if (-not [string]::IsNullOrEmpty($first.finalAmt)) { try { $finalAmt = [Math]::Round([double]$first.finalAmt) } catch {} }

    $discount = 0
    if (-not [string]::IsNullOrEmpty($first.discount)) { try { $discount = [Math]::Round([double]$first.discount) } catch {} }

    $paidAmt = $finalAmt
    if (-not [string]::IsNullOrEmpty($first.paidAmt)) { try { $paidAmt = [Math]::Round([double]$first.paidAmt) } catch {} }

    $pharmacist = if ($first.seller) { $first.seller } elseif ($first.creator) { $first.creator } else { 'admin' }

    $itemsList = New-Object System.Collections.Generic.List[object]
    $totQty = 0

    foreach ($l in $lines) {
        if ([string]::IsNullOrEmpty($l.medCode) -and [string]::IsNullOrEmpty($l.medName)) { continue }

        $medId = $l.medCode
        if ($medMap.ContainsKey($l.medCode)) {
            $medId = $medMap[$l.medCode].id
        }

        $qty = 1
        if (-not [string]::IsNullOrEmpty($l.qty)) { try { $qty = [double]$l.qty } catch {} }
        $totQty += $qty

        $costPrice = 0
        if (-not [string]::IsNullOrEmpty($l.unitCost)) { try { $costPrice = [double]$l.unitCost } catch {} }

        $itemDisc = 0
        if (-not [string]::IsNullOrEmpty($l.itemDiscount)) { try { $itemDisc = [Math]::Round([double]$l.itemDiscount) } catch {} }

        $discPct = 0
        if (-not [string]::IsNullOrEmpty($l.discountPct)) { try { $discPct = [double]$l.discountPct } catch {} }

        $lineTotal = 0
        if (-not [string]::IsNullOrEmpty($l.lineTotal)) { try { $lineTotal = [Math]::Round([double]$l.lineTotal) } catch {} }
        if ($lineTotal -eq 0 -and $costPrice -gt 0) { $lineTotal = [Math]::Round($costPrice * $qty - $itemDisc) }

        $itemsList.Add([PSCustomObject]@{
            medicineId      = $medId
            medicineCode    = $l.medCode
            barcode         = $l.barcode
            medicineName    = $l.medName
            unit            = $l.unit
            quantity        = $qty
            costPrice       = [Math]::Round($costPrice, 2)
            unitPrice       = [Math]::Round($costPrice, 2)
            discount        = $itemDisc
            discountPercent = $discPct
            totalRefund     = $lineTotal
            batchNo         = ''
            expiryDate      = ''
        })
    }

    $reasonStr = if ($first.note) { $first.note } else { 'Xuất trả hàng cho nhà cung cấp' }

    $orderObj = [PSCustomObject]@{
        id              = $id
        type            = 'general_return'
        returnType      = 'general_return'
        stockInId       = $null
        supplierId      = $supId
        supplierName    = $supName
        supplierPhone   = $first.supplierPhone
        supplierAddress = $first.supplierAddress
        createdAt       = $createdAt
        date            = $createdAt
        paymentMethod   = $payMethod
        reason          = $reasonStr
        note            = $first.note
        status          = 'completed'
        pharmacist      = $pharmacist
        creator         = $first.creator
        branch          = $first.branch
        items           = $itemsList
        totalItems      = $itemsList.Count
        totalQuantity   = $totQty
        totalAmount     = $totalAmt
        discount        = $discount
        refundTotal     = $finalAmt
        paidAmount      = $paidAmt
    }

    $returnOrders.Add($orderObj)
}

# Sort by createdAt descending
$sortedOrders = @($returnOrders | Sort-Object { [DateTime]$_.createdAt } -Descending)

# Write output JSON
$jsonOut = $sortedOrders | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($outputPath, $jsonOut, [System.Text.Encoding]::UTF8)

# Cleanup temp
Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  IMPORT THANH CONG $($sortedOrders.Count) PHIEU TRA HANG NHAP!" -ForegroundColor Green
Write-Host "  File dich: $outputPath" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
