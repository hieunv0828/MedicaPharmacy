# Import Phieu Nhap Hang (Stock-In Orders) from KiotViet XLSX
# Columns (1-indexed):
# A=Chi nhanh, B=Ma nhap hang, C=Thoi gian, D=Thoi gian tao, E=Ngay cap nhat,
# F=Ma nha cung cap, G=Ten nha cung cap, H=Dien thoai, I=Dia chi,
# J=Nguoi nhap, K=Nguoi tao, L=Tong tien hang, M=Giam gia phieu nhap,
# N=Can tra NCC, O=Tien da tra NCC, P=Ghi chu, Q=So hoa don dau vao,
# R=Tong so luong, S=Tong so mat hang, T=Trang thai,
# U=Ma hang, V=Ma vach, W=Ten hang, X=Thuong hieu,
# Y=DVT, Z=Ghi chu hang hoa, AA=Don gia, AB=Giam gia %, AC=Giam gia,
# AD=Gia nhap, AE=Thanh tien, AF=So luong

$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794080471251_b0131718.xlsx"
$outputPath = "f:\MedicaPharmacy\data\stockin_2026.json"
$medicinesPath = "f:\MedicaPharmacy\data\medicines.json"
$vouchersPath = "f:\MedicaPharmacy\data\vouchers_2026.json"

Write-Host "=== Import Phieu Nhap Hang from KiotViet ==="

# 1. Load medicines for primary ID lookup
Write-Host "Loading medicines for lookup..."
$medContent = [System.IO.File]::ReadAllText($medicinesPath, [System.Text.Encoding]::UTF8)
$medicines = $medContent | ConvertFrom-Json
$medMap = @{}
foreach ($m in $medicines) {
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
Write-Host "Loaded $($medicines.Count) medicines, $($medMap.Count) with id/barcode"

# 2. Load vouchers for payment method matching
$voucherPayMethod = @{}
if (Test-Path $vouchersPath) {
    Write-Host "Loading vouchers to match payment methods..."
    $vContent = [System.IO.File]::ReadAllText($vouchersPath, [System.Text.Encoding]::UTF8)
    $vouchers = $vContent | ConvertFrom-Json
    foreach ($v in $vouchers) {
        if ($v.refId -and $v.refId -like 'PN*' -and -not $voucherPayMethod.ContainsKey($v.refId)) {
            $voucherPayMethod[$v.refId] = if ($v.paymentMethod) { $v.paymentMethod } else { 'cash' }
        }
    }
    Write-Host "Matched $($voucherPayMethod.Count) vouchers with payment methods"
}

# 3. Extract XLSX
$tmpDir = "$env:TEMP\pn_import_$(Get-Random)"
New-Item -ItemType Directory -Path $tmpDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($xlsxPath, $tmpDir)

# 4. Load shared strings
$strings = @()
$ssFile = "$tmpDir\xl\sharedStrings.xml"
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
Write-Host "Loaded $($strings.Count) shared strings"

# 5. Load worksheet
$sheetFile = "$tmpDir\xl\worksheets\sheet2.xml"
[xml]$ws = Get-Content $sheetFile -Encoding UTF8
$rows = $ws.worksheet.sheetData.row
Write-Host "Total rows (incl header): $($rows.Count)"

function Get-CellValue($cell, $stringsArr) {
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

function Escape-Json($s) {
    if ($null -eq $s) { return '' }
    ($s -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n').Trim()
}

# 6. Parse rows into objects and group by pnId
$pnLines = New-Object System.Collections.Generic.List[object]
$skipFirst = $true
$lineIdx = 0

foreach ($row in $rows) {
    if ($skipFirst) { $skipFirst = $false; continue }

    $cells = @{}
    foreach ($c in $row.c) {
        $colRef = $c.r -replace '\d+', ''
        $cells[$colRef] = $c
    }

    $pnId = Get-CellValue $cells['B'] $strings
    if ([string]::IsNullOrEmpty($pnId)) { continue }

    $pnLine = [PSCustomObject]@{
        branch          = Get-CellValue $cells['A'] $strings
        pnId            = $pnId
        timeRaw         = Get-CellValue $cells['C'] $strings
        timeCreateRaw   = Get-CellValue $cells['D'] $strings
        supplierId      = Get-CellValue $cells['F'] $strings
        supplierName    = Get-CellValue $cells['G'] $strings
        supplierPhone   = Get-CellValue $cells['H'] $strings
        supplierAddress = Get-CellValue $cells['I'] $strings
        seller          = Get-CellValue $cells['J'] $strings
        creator         = Get-CellValue $cells['K'] $strings
        totalAmt        = Get-CellValue $cells['L'] $strings
        discount        = Get-CellValue $cells['M'] $strings
        finalAmt        = Get-CellValue $cells['N'] $strings
        paidAmt         = Get-CellValue $cells['O'] $strings
        note            = Get-CellValue $cells['P'] $strings
        invoiceNo       = Get-CellValue $cells['Q'] $strings
        status          = Get-CellValue $cells['T'] $strings
        medCode         = Get-CellValue $cells['U'] $strings
        barcode         = Get-CellValue $cells['V'] $strings
        medName         = Get-CellValue $cells['W'] $strings
        unit            = Get-CellValue $cells['Y'] $strings
        unitPrice       = Get-CellValue $cells['AA'] $strings
        discountPercent = Get-CellValue $cells['AB'] $strings
        itemDiscount    = Get-CellValue $cells['AC'] $strings
        costPrice       = Get-CellValue $cells['AD'] $strings
        lineTotal       = Get-CellValue $cells['AE'] $strings
        qty             = Get-CellValue $cells['AF'] $strings
    }
    $pnLines.Add($pnLine)
    $lineIdx++
    if ($lineIdx % 1000 -eq 0) { Write-Host "  Read $lineIdx lines..." }
}

Write-Host "Read $($pnLines.Count) stock-in order lines"

# 7. Group by pnId
$grouped = $pnLines | Group-Object -Property pnId
Write-Host "Unique stock-in orders: $($grouped.Count)"

# 8. Build JSON objects
$stockInJsonLines = New-Object System.Collections.Generic.List[string]

foreach ($grp in $grouped) {
    $lines = $grp.Group
    $first = $lines[0]

    $pnId = $first.pnId
    $createdAt = Convert-OADate $first.timeRaw
    if ([string]::IsNullOrEmpty($createdAt)) {
        $createdAt = Convert-OADate $first.timeCreateRaw
    }

    $supId = if ($first.supplierId) { $first.supplierId } else { 'NCC lẻ' }
    $supName = if ($first.supplierName) { $first.supplierName } else { 'Nhà cung cấp lẻ' }

    # Default payment method for supplier purchases is bank transfer (chuyen khoan)
    $payMethod = 'transfer'

    $totalAmt = 0
    if (-not [string]::IsNullOrEmpty($first.totalAmt)) { try { $totalAmt = [Math]::Round([double]$first.totalAmt) } catch {} }
    $finalAmt = $totalAmt
    if (-not [string]::IsNullOrEmpty($first.finalAmt)) { try { $finalAmt = [Math]::Round([double]$first.finalAmt) } catch {} }
    $discount = 0
    if (-not [string]::IsNullOrEmpty($first.discount)) { try { $discount = [Math]::Round([double]$first.discount) } catch {} }
    $paidAmt = $finalAmt
    if (-not [string]::IsNullOrEmpty($first.paidAmt)) { try { $paidAmt = [Math]::Round([double]$first.paidAmt) } catch {} }
    $debt = [Math]::Max(0, $finalAmt - $paidAmt)

    $statusStr = 'completed'
    if ($first.status -match 'Hủy') { $statusStr = 'cancelled' }

    $pharmacist = if ($first.seller) { $first.seller } elseif ($first.creator) { $first.creator } else { 'admin' }

    $id_e         = Escape-Json $pnId
    $supId_e      = Escape-Json $supId
    $supName_e    = Escape-Json $supName
    $supPhone_e   = Escape-Json $first.supplierPhone
    $supAddress_e = Escape-Json $first.supplierAddress
    $note_e       = Escape-Json $first.note
    $invoiceNo_e  = Escape-Json $first.invoiceNo
    $pharm_e      = Escape-Json $pharmacist
    $branch_e     = Escape-Json $first.branch

    # Build items array
    $itemJsonArr = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        if ([string]::IsNullOrEmpty($line.medCode) -and [string]::IsNullOrEmpty($line.medName)) { continue }

        $medId = $line.medCode
        if ($medMap.ContainsKey($line.medCode)) {
            $medObj = $medMap[$line.medCode]
            $medId = $medObj.id
        }

        $qty = 1
        if (-not [string]::IsNullOrEmpty($line.qty)) { try { $qty = [double]$line.qty } catch {} }

        $costPrice = 0
        if (-not [string]::IsNullOrEmpty($line.costPrice)) { try { $costPrice = [double]$line.costPrice } catch {} }

        $unitPrice = $costPrice
        if (-not [string]::IsNullOrEmpty($line.unitPrice)) { try { $unitPrice = [double]$line.unitPrice } catch {} }

        $lineTotal = 0
        if (-not [string]::IsNullOrEmpty($line.lineTotal)) { try { $lineTotal = [Math]::Round([double]$line.lineTotal) } catch {} }
        if ($lineTotal -eq 0 -and $costPrice -gt 0) { $lineTotal = [Math]::Round($costPrice * $qty) }

        $itemDisc = 0
        if (-not [string]::IsNullOrEmpty($line.itemDiscount)) { try { $itemDisc = [Math]::Round([double]$line.itemDiscount) } catch {} }

        $itemDiscPct = 0
        if (-not [string]::IsNullOrEmpty($line.discountPercent)) { try { $itemDiscPct = [double]$line.discountPercent } catch {} }

        $medId_e   = Escape-Json $medId
        $medCode_e = Escape-Json $line.medCode
        $medName_e = Escape-Json $line.medName
        $unit_e    = Escape-Json $line.unit
        $bar_e     = Escape-Json $line.barcode

        $costFormatted = [Math]::Round($costPrice, 2)
        $unitPriceFormatted = [Math]::Round($unitPrice, 2)

        $itemJsonArr.Add("{`"medicineId`":`"$medId_e`",`"medicineCode`":`"$medCode_e`",`"barcode`":`"$bar_e`",`"medicineName`":`"$medName_e`",`"unit`":`"$unit_e`",`"quantity`":$qty,`"costPrice`":$costFormatted,`"unitPrice`":$unitPriceFormatted,`"discount`":$itemDisc,`"discountPercent`":$itemDiscPct,`"total`":$lineTotal,`"batchNo`":`"`",`"expiryDate`":`"`"}")
    }

    $itemsJson = "[" + ($itemJsonArr -join ',') + "]"

    $stockInJsonLines.Add("  {`"id`":`"$id_e`",`"createdAt`":`"$createdAt`",`"supplierId`":`"$supId_e`",`"supplierName`":`"$supName_e`",`"supplierPhone`":`"$supPhone_e`",`"supplierAddress`":`"$supAddress_e`",`"paymentMethod`":`"$payMethod`",`"subTotal`":$totalAmt,`"discount`":$discount,`"totalAmount`":$finalAmt,`"paidAmount`":$paidAmt,`"debt`":$debt,`"note`":`"$note_e`",`"invoiceNo`":`"$invoiceNo_e`",`"status`":`"$statusStr`",`"pharmacist`":`"$pharm_e`",`"branch`":`"$branch_e`",`"items`":$itemsJson}")
}

Write-Host "Built $($stockInJsonLines.Count) stock-in order objects"

$content = "[$($stockInJsonLines -join ",`n")]"
[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.Encoding]::UTF8)

$sizeKB = [Math]::Round(([System.IO.FileInfo]$outputPath).Length / 1KB)
Write-Host "Written to: $outputPath ($sizeKB KB)"
Write-Host "=== DONE: $($stockInJsonLines.Count) stock-in orders imported successfully ==="

Remove-Item $tmpDir -Recurse -Force
