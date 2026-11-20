# do_import_orders_all.ps1
# Import va hop nhat 7 file DanhSachChiTietHoaDon XLSX, dedup theo invoiceId
# File moi nhat (KV19112026) duoc uu tien khi trung id

param(
    [string]$projectDir = "F:\MedicaPharmacy"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$importsDir = Join-Path $projectDir "imports"
$dataDir    = Join-Path $projectDir "data"
$outputPath = Join-Path $dataDir "orders_2026.json"
$medPath    = Join-Path $dataDir "medicines.json"

Write-Host "=========================================================="
Write-Host " IMPORT HOA DON - 7 FILE XLSX - DEDUP"
Write-Host "=========================================================="

# Thu tu: file cu truoc, file moi nhat cuoi (uu tien ghi de khi trung id)
$xlsxFiles = @(
    "DanhSachChiTietHoaDon_KV08112026-202052-428.xlsx",
    "DanhSachChiTietHoaDon_KV08112026-202159-517.xlsx",
    "DanhSachChiTietHoaDon_KV08112026-202256-670.xlsx",
    "DanhSachChiTietHoaDon_KV08112026-202408-736.xlsx",
    "DanhSachChiTietHoaDon_KV08112026-202454-963.xlsx",
    "DanhSachChiTietHoaDon_KV08112026-214148-821.xlsx",
    "DanhSachChiTietHoaDon_KV19112026-024056-697.xlsx"
)

# Load medicines
Write-Host "Loading medicines for cost lookup..."
$medicines = [System.IO.File]::ReadAllText($medPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$medMap = @{}
foreach ($m in $medicines) {
    if ($m.id -and -not $medMap.ContainsKey($m.id)) { $medMap[$m.id] = $m }
    if ($m.barcode) {
        foreach ($p in ($m.barcode -split '[,;\s]+')) {
            $p = $p.Trim()
            if ($p -and -not $medMap.ContainsKey($p)) { $medMap[$p] = $m }
        }
    }
}
Write-Host "  -> $($medicines.Count) medicines, $($medMap.Count) lookup entries"

function Get-StrVal($cell, $strArr) {
    if ($null -eq $cell) { return '' }
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's' -and $strArr -and [int]$v -lt $strArr.Count) { return $strArr[[int]$v] }
    return $v
}

function Convert-OADate($oaVal) {
    if ([string]::IsNullOrEmpty($oaVal)) { return '' }
    try {
        $dt = [DateTime]::FromOADate([double]$oaVal)
        return $dt.ToString('yyyy-MM-ddTHH:mm:ss+07:00')
    } catch { return '' }
}

function Esc($s) {
    if ($null -eq $s) { return '' }
    ($s -replace '\\', '\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n').Trim()
}

function Get-UnitCost($m, $unit) {
    if (-not $m -or -not $m.costPrice) { return 0 }
    $pr = if ($m.packRatio -and [double]$m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
    $sr = if ($m.subRatio  -and [double]$m.subRatio  -gt 0) { [double]$m.subRatio  } else { 1.0 }
    $baseCost = [double]$m.costPrice / $pr
    if ($unit -and $unit -eq $m.packUnit) { return [Math]::Round([double]$m.costPrice) }
    if ($unit -and $m.subUnit -and $unit -eq $m.subUnit -and $m.subUnit -ne $m.packUnit) { return [Math]::Round($baseCost * $sr) }
    return [Math]::Round($baseCost)
}

# Luu tru tat ca order lines theo invoiceId: hashtable id -> array of lines
# File sau ghi de file truoc khi trung id
$allOrders = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[object]]]::new()

$fileIdx = 0
foreach ($xlsxFile in $xlsxFiles) {
    $fileIdx++
    $xlsxPath = Join-Path $importsDir $xlsxFile
    if (-not (Test-Path $xlsxPath)) {
        Write-Host "  KHONG TIM THAY: $xlsxFile - Bo qua"
        continue
    }

    Write-Host ""
    Write-Host "--- Doc file: $xlsxFile ---"

    # Giai nen vao thu muc tam
    $tmp = Join-Path $env:TEMP ("hd_imp_" + (Get-Random))
    $tmpZip = Join-Path $env:TEMP ("hd_zip_" + (Get-Random) + ".zip")
    $stream = [System.IO.File]::Open($xlsxPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $outStream = [System.IO.File]::Create($tmpZip)
    $stream.CopyTo($outStream)
    $stream.Close(); $outStream.Close()
    [System.IO.Compression.ZipFile]::ExtractToDirectory($tmpZip, $tmp)
    Remove-Item $tmpZip -Force

    # Shared strings
    $ssFile = Join-Path $tmp "xl\sharedStrings.xml"
    $strings = @()
    if (Test-Path $ssFile) {
        [xml]$ss = Get-Content $ssFile -Encoding UTF8
        $strings = @($ss.sst.si | ForEach-Object {
            $si = $_
            if ($si.r) { ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join '' }
            elseif ($si.t -ne $null) { $t = $si.t; if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t } }
            else { '' }
        })
    }

    # Worksheet - tim file lon nhat (data sheet)
    $wsDir = Join-Path $tmp "xl\worksheets"
    $sheetFile = (Get-ChildItem $wsDir -Filter "*.xml" | Sort-Object Length -Descending)[0].FullName
    [xml]$ws = Get-Content $sheetFile -Encoding UTF8
    $rows = $ws.worksheet.sheetData.row
    Write-Host "  -> $($rows.Count) rows"

    $newLines = 0
    $dupLines = 0
    $skipFirst = $true

    foreach ($row in $rows) {
        if ($skipFirst) { $skipFirst = $false; continue }

        $cells = @{}
        foreach ($c in $row.c) { $cells[$c.r -replace '\d+', ''] = $c }

        $invoiceId = Get-StrVal $cells['B'] $strings
        if ([string]::IsNullOrEmpty($invoiceId)) { continue }

        $timeRaw    = Get-StrVal $cells['C'] $strings
        $custId     = Get-StrVal $cells['G'] $strings
        $custName   = Get-StrVal $cells['H'] $strings
        $custPhone  = Get-StrVal $cells['J'] $strings
        $seller     = Get-StrVal $cells['P'] $strings
        $note       = Get-StrVal $cells['S'] $strings
        $totalAmt   = Get-StrVal $cells['T'] $strings
        $discountHD = Get-StrVal $cells['U'] $strings
        $finalAmt   = Get-StrVal $cells['V'] $strings
        $cashAmt    = Get-StrVal $cells['X'] $strings
        $transferAmt= Get-StrVal $cells['AA'] $strings
        $status     = Get-StrVal $cells['AC'] $strings
        $medCode    = Get-StrVal $cells['AE'] $strings
        $medName    = Get-StrVal $cells['AG'] $strings
        $unit       = Get-StrVal $cells['AI'] $strings
        $qty        = Get-StrVal $cells['AK'] $strings
        $unitPrice  = Get-StrVal $cells['AL'] $strings
        $lineTotal  = Get-StrVal $cells['AP'] $strings

        $line = [PSCustomObject]@{
            invoiceId=$invoiceId; timeRaw=$timeRaw; custId=$custId
            custName=$custName; custPhone=$custPhone; seller=$seller; note=$note
            totalAmt=$totalAmt; discountHD=$discountHD; finalAmt=$finalAmt
            cashAmt=$cashAmt; transferAmt=$transferAmt; status=$status
            medCode=$medCode; medName=$medName; unit=$unit
            qty=$qty; unitPrice=$unitPrice; lineTotal=$lineTotal
            fileIndex=$fileIdx
        }

        # File sau ghi de: xoa lines cu cua invoiceId nay neu day la file moi
        # (thuc te: ghi de luon - file sau trong mang xlsxFiles la uu tien cao hon)
        if (-not $allOrders.ContainsKey($invoiceId)) {
            $allOrders[$invoiceId] = [System.Collections.Generic.List[object]]::new()
            $newLines++
        } else {
            # Kiem tra dong truoc do den tu file nao
            $lastLine = $allOrders[$invoiceId][$allOrders[$invoiceId].Count - 1]
            if ($lastLine.fileIndex -eq $fileIdx) {
                # Cung file, dong tiep theo cua cung don -> them item vao
            } else {
                # Den tu file khac (file moi hon) -> ghi de toan bo don cu
                $allOrders[$invoiceId].Clear()
                $dupLines++
            }
        }
        $allOrders[$invoiceId].Add($line)
    }

    Write-Host "  -> Invoices moi: $newLines, Trung id (ghi de): $dupLines"
    Remove-Item $tmp -Recurse -Force
}

Write-Host ""
Write-Host "Tong so hoa don unique: $($allOrders.Count)"
Write-Host "Dang build JSON..."

$orderJsonLines = [System.Collections.Generic.List[string]]::new()

foreach ($kvp in $allOrders.GetEnumerator()) {
    $lines = $kvp.Value
    if ($lines.Count -eq 0) { continue }
    $first = $lines[0]

    $invoiceId  = $first.invoiceId
    $createdAt  = Convert-OADate $first.timeRaw
    $custName_r = if ([string]::IsNullOrEmpty($first.custName) -or $first.custName -eq 'Khach le') { 'Khach le' } else { $first.custName }
    
    $payMethod = 'cash'
    $cashV = 0.0; try { if ($first.cashAmt) { $cashV = [double]$first.cashAmt } } catch {}
    $trV   = 0.0; try { if ($first.transferAmt) { $trV = [double]$first.transferAmt } } catch {}
    if ($trV -gt 0) { $payMethod = 'transfer' }

    $totalAmt = 0;   try { if ($first.totalAmt)   { $totalAmt   = [Math]::Round([double]$first.totalAmt) } } catch {}
    $finalAmt = 0;   try { if ($first.finalAmt)    { $finalAmt   = [Math]::Round([double]$first.finalAmt) } } catch {}
    $discountHD = 0; try { if ($first.discountHD)  { $discountHD = [Math]::Round([double]$first.discountHD) } } catch {}

    $statusStr = 'completed'
    if ($first.status -match 'Huy' -or $first.status -match 'hu') { $statusStr = 'cancelled' }

    $itemJsonArr = [System.Collections.Generic.List[string]]::new()
    foreach ($line in $lines) {
        if ([string]::IsNullOrEmpty($line.medCode) -and [string]::IsNullOrEmpty($line.medName)) { continue }

        $medId = $line.medCode
        $costPrice = 0
        if ($medMap.ContainsKey($line.medCode)) {
            $medObj = $medMap[$line.medCode]
            $medId = $medObj.id
            $costPrice = Get-UnitCost $medObj $line.unit
        }

        $qty = 0;       try { if ($line.qty)       { $qty       = [Math]::Round([double]$line.qty) } } catch {}
        $unitPrice = 0; try { if ($line.unitPrice)  { $unitPrice = [Math]::Round([double]$line.unitPrice) } } catch {}
        $lineTotal = 0; try { if ($line.lineTotal)  { $lineTotal = [Math]::Round([double]$line.lineTotal) } } catch {}

        $itemJsonArr.Add("{`"medicineId`":`"$(Esc $medId)`",`"medicineCode`":`"$(Esc $line.medCode)`",`"medicineName`":`"$(Esc $line.medName)`",`"unit`":`"$(Esc $line.unit)`",`"quantity`":$qty,`"price`":$unitPrice,`"unitPrice`":$unitPrice,`"costPrice`":$costPrice,`"lineTotal`":$lineTotal}")
    }

    $itemsJson = "[" + ($itemJsonArr -join ',') + "]"
    $orderJsonLines.Add("  {`"id`":`"$(Esc $invoiceId)`",`"createdAt`":`"$createdAt`",`"customerId`":`"$(Esc $first.custId)`",`"customerName`":`"$(Esc $custName_r)`",`"customerPhone`":`"$(Esc $first.custPhone)`",`"paymentMethod`":`"$payMethod`",`"subTotal`":$totalAmt,`"discount`":$discountHD,`"totalAmount`":$finalAmt,`"finalAmount`":$finalAmt,`"items`":$itemsJson,`"status`":`"$statusStr`",`"pharmacist`":`"$(Esc $first.seller)`",`"note`":`"$(Esc $first.note)`",`"isCancelled`":false,`"returns`":[],`"totalRefunded`":0}")
}

Write-Host "Built $($orderJsonLines.Count) orders, dang ghi file..."
$content = "[" + ($orderJsonLines -join ",`n") + "]"
[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.Encoding]::UTF8)
$sizeKB = [Math]::Round(([System.IO.FileInfo]$outputPath).Length / 1KB)
Write-Host "Ghi xong: $outputPath ($sizeKB KB)"
Write-Host "=========================================================="
Write-Host " HOAN TAT: $($orderJsonLines.Count) hoa don"
Write-Host "=========================================================="
