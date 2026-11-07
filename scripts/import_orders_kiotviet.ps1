# Import Hoa Don Chi Tiet from KiotViet XLSX
# Columns (1-indexed):
# A=Chi nhanh, B=Ma hoa don, C=Thoi gian, D=Thoi gian tao, E=Ngay cap nhat,
# F=Ma tra hang, G=Ma KH, H=Ten KH, I=Email, J=Dien thoai,
# K=Dia chi KH, L=Khu vuc KH, M=Phuong/Xa KH, N=Ngay sinh, O=Bang gia,
# P=Nguoi ban, Q=Kenh ban, R=Nguoi tao, S=Ghi chu,
# T=Tong tien hang, U=Giam gia HD, V=Khach can tra, W=Khach da tra,
# X=Tien mat, Y=The, Z=Vi, AA=Chuyen khoan, AB=Diem, AC=Trang thai,
# AD=Nhom hang, AE=Ma hang, AF=Ma vach, AG=Ten hang, AH=Thuong hieu,
# AI=DVT, AJ=Ghi chu hang, AK=So luong, AL=Don gia, AM=Giam gia %, AN=Giam gia,
# AO=Gia ban, AP=Thanh tien

$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794073867257_98424e29.xlsx"
$outputPath = "f:\MedicaPharmacy\data\orders_2026.json"
$medicinesPath = "f:\MedicaPharmacy\data\medicines.json"

Write-Host "=== Import Hoa Don Chi Tiet from KiotViet ==="

# Load medicines for ID lookup
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

# Extract XLSX
$tmpDir = "$env:TEMP\hd_import_$(Get-Random)"
New-Item -ItemType Directory -Path $tmpDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($xlsxPath, $tmpDir)

# Load shared strings
[xml]$ss = Get-Content "$tmpDir\xl\sharedStrings.xml" -Encoding UTF8
$strings = @($ss.sst.si | ForEach-Object {
    $si = $_
    if ($si.r) {
        ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join ''
    } elseif ($si.t -ne $null) {
        $t = $si.t
        if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t }
    } else { '' }
})

Write-Host "Loaded $($strings.Count) shared strings"

# Load worksheet
$sheetFile = "$tmpDir\xl\worksheets\sheet2.xml"
[xml]$ws = Get-Content $sheetFile -Encoding UTF8
$rows = $ws.worksheet.sheetData.row
Write-Host "Total rows (incl header): $($rows.Count)"

function Get-CellValue($cell, $stringsArr) {
    if ($null -eq $cell) { return '' }
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's') { return $stringsArr[[int]$v] }
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

function Get-PaymentMethod($row_X, $row_AA) {
    # X=Tien mat, AA=Chuyen khoan
    $cash     = 0.0
    $transfer = 0.0
    if (-not [string]::IsNullOrEmpty($row_X))  { try { $cash     = [double]$row_X }  catch {} }
    if (-not [string]::IsNullOrEmpty($row_AA)) { try { $transfer = [double]$row_AA } catch {} }
    if ($transfer -gt 0) { return 'transfer' }
    return 'cash'
}

function Get-UnitCost($m, $unit) {
    if (-not $m -or -not $m.costPrice) { return 0 }
    $pr = if ($m.packRatio -and $m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
    $sr = if ($m.subRatio -and $m.subRatio -gt 0) { [double]$m.subRatio } else { 1.0 }
    $baseCost = [double]$m.costPrice / $pr

    if ($unit -and $unit -eq $m.packUnit) { return [Math]::Round([double]$m.costPrice) }
    if ($unit -and $unit -eq $m.subUnit -and $m.subUnit -ne $m.packUnit) { return [Math]::Round($baseCost * $sr) }
    if ($unit -and $unit -eq $m.baseUnit) { return [Math]::Round($baseCost) }
    return [Math]::Round($baseCost)
}

# Column letter to index helper
function Col-To-Index($col) {
    $col = $col.ToUpper()
    $result = 0
    foreach ($ch in $col.ToCharArray()) {
        $result = $result * 26 + ([int][char]$ch - [int][char]'A' + 1)
    }
    return $result - 1
}

# Parse all rows into order-line objects, group by invoice ID
$orderLines = New-Object System.Collections.Generic.List[object]
$skipFirst = $true
$lineIdx = 0

foreach ($row in $rows) {
    if ($skipFirst) { $skipFirst = $false; continue }

    $cells = @{}
    foreach ($c in $row.c) {
        $colRef = $c.r -replace '\d+', ''
        $cells[$colRef] = $c
    }

    $invoiceId   = Get-CellValue $cells['B'] $strings
    if ([string]::IsNullOrEmpty($invoiceId)) { continue }

    $timeRaw     = Get-CellValue $cells['C'] $strings
    $custId      = Get-CellValue $cells['G'] $strings
    $custName    = Get-CellValue $cells['H'] $strings
    $custPhone   = Get-CellValue $cells['J'] $strings
    $seller      = Get-CellValue $cells['P'] $strings
    $note        = Get-CellValue $cells['S'] $strings
    $totalAmt    = Get-CellValue $cells['T'] $strings
    $discountHD  = Get-CellValue $cells['U'] $strings
    $finalAmt    = Get-CellValue $cells['V'] $strings
    $paidAmt     = Get-CellValue $cells['W'] $strings
    $cashAmt     = Get-CellValue $cells['X'] $strings
    $transferAmt = Get-CellValue $cells['AA'] $strings
    $status      = Get-CellValue $cells['AC'] $strings

    $medCode     = Get-CellValue $cells['AE'] $strings
    $medName     = Get-CellValue $cells['AG'] $strings
    $unit        = Get-CellValue $cells['AI'] $strings
    $qty         = Get-CellValue $cells['AK'] $strings
    $unitPrice   = Get-CellValue $cells['AL'] $strings
    $lineTotal   = Get-CellValue $cells['AP'] $strings

    $orderLine = [PSCustomObject]@{
        invoiceId   = $invoiceId
        timeRaw     = $timeRaw
        custId      = $custId
        custName    = $custName
        custPhone   = $custPhone
        seller      = $seller
        note        = $note
        totalAmt    = $totalAmt
        discountHD  = $discountHD
        finalAmt    = $finalAmt
        paidAmt     = $paidAmt
        cashAmt     = $cashAmt
        transferAmt = $transferAmt
        status      = $status
        medCode     = $medCode
        medName     = $medName
        unit        = $unit
        qty         = $qty
        unitPrice   = $unitPrice
        lineTotal   = $lineTotal
    }
    $orderLines.Add($orderLine)
    $lineIdx++
    if ($lineIdx % 1000 -eq 0) { Write-Host "  Read $lineIdx lines..." }
}

Write-Host "Read $($orderLines.Count) order lines"

# Group by invoiceId
$grouped = $orderLines | Group-Object -Property invoiceId
Write-Host "Unique invoices: $($grouped.Count)"

# Build orders JSON
$orderJsonLines = New-Object System.Collections.Generic.List[string]

foreach ($grp in $grouped) {
    $lines = $grp.Group
    $first = $lines[0]

    $invoiceId  = $first.invoiceId
    $createdAt  = Convert-OADate $first.timeRaw
    $custId_e   = Escape-Json $first.custId
    $rawCustName = $first.custName
    $resolvedCustName = if ([string]::IsNullOrEmpty($rawCustName) -or $rawCustName -eq 'Khách lẻ') { 'Khách lẻ' } else { $rawCustName }
    $custName_e = Escape-Json $resolvedCustName
    $custPhone_e= Escape-Json $first.custPhone
    $seller_e   = Escape-Json $first.seller
    $note_e     = Escape-Json $first.note

    $payMethod  = Get-PaymentMethod $first.cashAmt $first.transferAmt

    $totalAmt = 0
    if (-not [string]::IsNullOrEmpty($first.totalAmt)) { try { $totalAmt = [Math]::Round([double]$first.totalAmt) } catch {} }
    $finalAmt = 0
    if (-not [string]::IsNullOrEmpty($first.finalAmt)) { try { $finalAmt = [Math]::Round([double]$first.finalAmt) } catch {} }
    $discountHD = 0
    if (-not [string]::IsNullOrEmpty($first.discountHD)) { try { $discountHD = [Math]::Round([double]$first.discountHD) } catch {} }

    # Map status
    $statusStr = 'completed'
    if ($first.status -match 'Hủy') { $statusStr = 'cancelled' }

    # Build items
    $itemJsonArr = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        if ([string]::IsNullOrEmpty($line.medCode) -and [string]::IsNullOrEmpty($line.medName)) { continue }

        $medId = ''
        $costPrice = 0
        if ($medMap.ContainsKey($line.medCode)) {
            $medObj = $medMap[$line.medCode]
            $medId = $medObj.id
            $costPrice = Get-UnitCost $medObj $line.unit
        } else {
            $medId = $line.medCode
        }

        $qty = 0
        if (-not [string]::IsNullOrEmpty($line.qty)) { try { $qty = [Math]::Round([double]$line.qty) } catch {} }
        $unitPrice = 0
        if (-not [string]::IsNullOrEmpty($line.unitPrice)) { try { $unitPrice = [Math]::Round([double]$line.unitPrice) } catch {} }
        $lineTotal = 0
        if (-not [string]::IsNullOrEmpty($line.lineTotal)) { try { $lineTotal = [Math]::Round([double]$line.lineTotal) } catch {} }

        $medId_e   = Escape-Json $medId
        $medCode_e = Escape-Json $line.medCode
        $medName_e = Escape-Json $line.medName
        $unit_e    = Escape-Json $line.unit

        $itemJsonArr.Add("{`"medicineId`":`"$medId_e`",`"medicineCode`":`"$medCode_e`",`"medicineName`":`"$medName_e`",`"unit`":`"$unit_e`",`"quantity`":$qty,`"price`":$unitPrice,`"unitPrice`":$unitPrice,`"costPrice`":$costPrice,`"lineTotal`":$lineTotal}")
    }

    $itemsJson = "[" + ($itemJsonArr -join ',') + "]"
    $id_e = Escape-Json $invoiceId

    $orderJsonLines.Add("  {`"id`":`"$id_e`",`"createdAt`":`"$createdAt`",`"customerId`":`"$custId_e`",`"customerName`":`"$custName_e`",`"customerPhone`":`"$custPhone_e`",`"paymentMethod`":`"$payMethod`",`"subTotal`":$totalAmt,`"discount`":$discountHD,`"totalAmount`":$finalAmt,`"finalAmount`":$finalAmt,`"items`":$itemsJson,`"status`":`"$statusStr`",`"pharmacist`":`"$seller_e`",`"note`":`"$note_e`"}")
}

Write-Host "Built $($orderJsonLines.Count) order objects"

$content = "[$($orderJsonLines -join ",`n")]"
[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.Encoding]::UTF8)

$sizeKB = [Math]::Round(([System.IO.FileInfo]$outputPath).Length / 1KB)
Write-Host "Written to: $outputPath ($sizeKB KB)"
Write-Host "=== DONE: $($orderJsonLines.Count) orders imported ==="

Remove-Item $tmpDir -Recurse -Force
