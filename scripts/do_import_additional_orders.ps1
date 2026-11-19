# do_import_additional_orders.ps1
# Import bo sung hoa don thang 9 va thang 10 tu file DanhSachChiTietHoaDon_KV20112026-000611-006.xlsx
param(
    [string]$xlsxFile = "DanhSachChiTietHoaDon_KV20112026-000611-006.xlsx",
    [string]$projectDir = "F:\MedicaPharmacy"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$importsDir = Join-Path $projectDir "imports"
$dataDir    = Join-Path $projectDir "data"
$ordersPath = Join-Path $dataDir "orders_2026.json"
$medPath    = Join-Path $dataDir "medicines.json"
$countsPath = Join-Path $dataDir "db_counts.json"
$xlsxPath   = Join-Path $importsDir $xlsxFile

Write-Host "=========================================================="
Write-Host " IMPORT BO SUNG HOA DON THANG 9 & 10 TU KIOTVIET"
Write-Host " File: $xlsxFile"
Write-Host "=========================================================="

if (-not (Test-Path $xlsxPath)) { throw "Khong tim thay file: $xlsxPath" }

# 1. Dung server neu dang chay
$proc = Get-Process -Name MedicaServer -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "Dung MedicaServer (PID: $($proc.Id))..."
    Stop-Process -Id $proc.Id -Force
    Start-Sleep -Seconds 2
}

# 2. Load medicines de tra cuu costPrice va ID
Write-Host "Loading medicines map..."
$medContent = [System.IO.File]::ReadAllText($medPath, [System.Text.Encoding]::UTF8)
$medicines = $medContent | ConvertFrom-Json
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
Write-Host "  -> $($medicines.Count) medicines loaded."

function Get-UnitCost($m, $unit) {
    if (-not $m -or -not $m.costPrice) { return 0 }
    $pr = if ($m.packRatio -and [double]$m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
    $sr = if ($m.subRatio  -and [double]$m.subRatio  -gt 0) { [double]$m.subRatio  } else { 1.0 }
    $baseCost = [double]$m.costPrice / $pr
    if ($unit -and $unit -eq $m.packUnit) { return [Math]::Round([double]$m.costPrice) }
    if ($unit -and $m.subUnit -and $unit -eq $m.subUnit -and $m.subUnit -ne $m.packUnit) { return [Math]::Round($baseCost * $sr) }
    return [Math]::Round($baseCost)
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

# 3. Giai nen file XLSX
$tmpDir = Join-Path $env:TEMP ("hd_add_imp_" + (Get-Random))
$tmpZip = Join-Path $env:TEMP ("hd_add_zip_" + (Get-Random) + ".zip")
$stream = [System.IO.File]::Open($xlsxPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$outStream = [System.IO.File]::Create($tmpZip)
$stream.CopyTo($outStream)
$stream.Close(); $outStream.Close()
[System.IO.Compression.ZipFile]::ExtractToDirectory($tmpZip, $tmpDir)
Remove-Item $tmpZip -Force

# 4. Shared strings
$strings = @()
$ssFile = Join-Path $tmpDir "xl\sharedStrings.xml"
if (Test-Path $ssFile) {
    [xml]$ss = Get-Content $ssFile -Encoding UTF8
    $strings = @($ss.sst.si | ForEach-Object {
        $si = $_
        if ($si.r) { ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join '' }
        elseif ($si.t -ne $null) { $t = $si.t; if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t } }
        else { '' }
    })
}
Write-Host "Loaded $($strings.Count) shared strings."

function Get-StrVal($cell) {
    if ($null -eq $cell) { return '' }
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's' -and $strings -and [int]$v -lt $strings.Count) { return $strings[[int]$v] }
    return $v
}

# 5. Worksheet
$wsDir = Join-Path $tmpDir "xl\worksheets"
$sheetFile = (Get-ChildItem $wsDir -Filter "*.xml" | Sort-Object Length -Descending)[0].FullName
[xml]$ws = Get-Content $sheetFile -Encoding UTF8
$rows = $ws.worksheet.sheetData.row
Write-Host "Total rows in sheet: $($rows.Count)"

$newOrdersDict = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[object]]]::new()
$skipFirst = $true

for ($i = 0; $i -lt $rows.Count; $i++) {
    if ($skipFirst) { $skipFirst = $false; continue }
    $row = $rows[$i]

    $cells = @{}
    foreach ($c in $row.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $invoiceId = Get-StrVal $cells['B']
    if ([string]::IsNullOrEmpty($invoiceId)) { continue }

    $line = [PSCustomObject]@{
        invoiceId   = $invoiceId
        timeRaw     = Get-StrVal $cells['C']
        custId      = Get-StrVal $cells['G']
        custName    = Get-StrVal $cells['H']
        custPhone   = Get-StrVal $cells['J']
        seller      = Get-StrVal $cells['P']
        note        = Get-StrVal $cells['S']
        totalAmt    = Get-StrVal $cells['T']
        discountHD  = Get-StrVal $cells['U']
        finalAmt    = Get-StrVal $cells['V']
        cashAmt     = Get-StrVal $cells['X']
        transferAmt = Get-StrVal $cells['AA']
        status      = Get-StrVal $cells['AC']
        medCode     = Get-StrVal $cells['AE']
        medName     = Get-StrVal $cells['AG']
        unit        = Get-StrVal $cells['AI']
        qty         = Get-StrVal $cells['AK']
        unitPrice   = Get-StrVal $cells['AL']
        lineTotal   = Get-StrVal $cells['AP']
    }

    if (-not $newOrdersDict.ContainsKey($invoiceId)) {
        $newOrdersDict[$invoiceId] = [System.Collections.Generic.List[object]]::new()
    }
    $newOrdersDict[$invoiceId].Add($line)
}

Remove-Item $tmpDir -Recurse -Force
Write-Host "Parsed $($newOrdersDict.Count) unique invoices from file."

# 6. Load existing orders_2026.json
$existingOrdersJson = [System.IO.File]::ReadAllText($ordersPath, [System.Text.Encoding]::UTF8)
$existingOrders = $existingOrdersJson | ConvertFrom-Json
$ordersMap = [System.Collections.Generic.Dictionary[string, PSCustomObject]]::new()

foreach ($o in $existingOrders) {
    if ($o.id) {
        $ordersMap[$o.id] = $o
    }
}
Write-Host "Current orders in database: $($ordersMap.Count)"

# 7. Convert and merge new orders
$addedCount = 0
$updatedCount = 0

foreach ($kvp in $newOrdersDict.GetEnumerator()) {
    $invoiceId = $kvp.Key
    $lines = $kvp.Value
    if ($lines.Count -eq 0) { continue }
    $first = $lines[0]

    $createdAt  = Convert-OADate $first.timeRaw
    $custName_r = if ([string]::IsNullOrEmpty($first.custName) -or $first.custName -eq 'Khách lẻ') { 'Khách lẻ' } else { $first.custName }

    $payMethod = 'cash'
    $cashV = 0.0; try { if ($first.cashAmt) { $cashV = [double]$first.cashAmt } } catch {}
    $trV   = 0.0; try { if ($first.transferAmt) { $trV = [double]$first.transferAmt } } catch {}
    if ($trV -gt 0) { $payMethod = 'transfer' }

    $totalAmt = 0;   try { if ($first.totalAmt)   { $totalAmt   = [Math]::Round([double]$first.totalAmt) } } catch {}
    $finalAmt = 0;   try { if ($first.finalAmt)    { $finalAmt   = [Math]::Round([double]$first.finalAmt) } } catch {}
    $discountHD = 0; try { if ($first.discountHD)  { $discountHD = [Math]::Round([double]$first.discountHD) } } catch {}

    $statusStr = 'completed'
    if ($first.status -match 'Hủy' -or $first.status -match 'hủy') { $statusStr = 'cancelled' }

    $itemsList = [System.Collections.Generic.List[object]]::new()
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

        $itemsList.Add([PSCustomObject]@{
            medicineId   = $medId
            medicineCode = $line.medCode
            medicineName = $line.medName
            unit         = $line.unit
            quantity     = $qty
            price        = $unitPrice
            unitPrice    = $unitPrice
            costPrice    = $costPrice
            lineTotal    = $lineTotal
        })
    }

    $orderObj = [PSCustomObject]@{
        id            = $invoiceId
        createdAt     = $createdAt
        customerId    = $first.custId
        customerName  = $custName_r
        customerPhone = $first.custPhone
        paymentMethod = $payMethod
        subTotal      = $totalAmt
        discount      = $discountHD
        totalAmount   = $finalAmt
        finalAmount   = $finalAmt
        items         = $itemsList
        status        = $statusStr
        pharmacist    = $first.seller
        note          = $first.note
        isCancelled   = ($statusStr -eq 'cancelled')
        returns       = @()
        totalRefunded = 0
    }

    if ($ordersMap.ContainsKey($invoiceId)) {
        $updatedCount++
    } else {
        $addedCount++
    }
    $ordersMap[$invoiceId] = $orderObj
}

Write-Host "New orders added: $addedCount"
Write-Host "Existing orders updated: $updatedCount"
Write-Host "Total orders after merge: $($ordersMap.Count)"

# 8. Sort by createdAt descending and save
$allSortedOrders = @($ordersMap.Values | Sort-Object { [DateTime]$_.createdAt } -Descending)
$jsonOut = $allSortedOrders | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($ordersPath, $jsonOut, [System.Text.Encoding]::UTF8)
$sizeMB = [Math]::Round(([System.IO.FileInfo]$ordersPath).Length / 1MB, 2)
Write-Host "Saved to: $ordersPath ($sizeMB MB)"

# 9. Update db_counts.json
if (Test-Path $countsPath) {
    $counts = [System.IO.File]::ReadAllText($countsPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $counts.orders = $allSortedOrders.Count
    $counts.updatedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    [System.IO.File]::WriteAllText($countsPath, ($counts | ConvertTo-Json -Compress), [System.Text.Encoding]::UTF8)
    Write-Host "Updated db_counts.json: orders = $($allSortedOrders.Count)"
}

Write-Host "=========================================================="
Write-Host " HOAN TAT IMPORT BO SUNG $addedCount HOA DON!"
Write-Host "=========================================================="
