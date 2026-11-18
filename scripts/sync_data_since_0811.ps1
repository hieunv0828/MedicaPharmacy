<#
.SYNOPSIS
    Script đồng bộ dữ liệu từ 5 file Excel KiotViet mới xuất ngày 17/11/2026:
    1. Sao lưu an toàn toàn bộ thư mục data hiện tại sang data/backups/
    2. Xóa sạch dữ liệu (orders, vouchers, stockin, returns, audit_log) từ ngày 08/11/2026 đến nay
    3. Cập nhật danh mục nhà cung cấp (suppliers.json)
    4. Cập nhật danh mục khách hàng (customers.json)
    5. Cập nhật danh mục thuốc, giá vốn, giá bán, tồn kho (medicines.json) chuẩn theo tỷ lệ quy đổi ĐVT
    6. Import toàn bộ hóa đơn bán hàng từ ngày 08/11/2026 đến 17/11/2026
    7. Import toàn bộ sổ quỹ thu chi từ ngày 08/11/2026 đến 17/11/2026
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$projectDir = "F:\MedicaPharmacy"
$dataDir    = Join-Path $projectDir "data"
$importsDir = Join-Path $projectDir "imports"

$invFile  = Join-Path $importsDir "DanhSachChiTietHoaDon_KV17112026-223147-791.xlsx"
$custFile = Join-Path $importsDir "DanhSachKhachHang_KV17112026-223220-200.xlsx"
$supFile  = Join-Path $importsDir "DanhSachNhaCungCap_KV17112026-232231-063.xlsx"
$medFile  = Join-Path $importsDir "DanhSachSanPham_KV17112026-222737-433.xlsx"
$sqFile   = Join-Path $importsDir "SoQuy_KV17112026-223318-419.xlsx"

$cutoffDate = [DateTime]"2026-11-08T00:00:00"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " BẮT ĐẦU ĐỒNG BỘ TOÀN DIỆN DỮ LIỆU TỪ 08/11/2026 ĐẾN NAY" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# BƯỚC 1: SAO LƯU DỰ PHÒNG THƯ MỤC DATA
# -------------------------------------------------------------------------
$backupDir = Join-Path $dataDir ("backups\backup_before_sync_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Get-ChildItem -Path $dataDir -Filter "*.json" | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $backupDir $_.Name) -Force
}
Write-Host ">>> [1/7] Đã tạo bản sao lưu dữ liệu an toàn tại: $backupDir" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 2: XÓA DỮ LIỆU TỪ NGÀY 08/11/2026 ĐẾN NAY
# -------------------------------------------------------------------------
Write-Host ">>> [2/7] Đang làm sạch dữ liệu từ ngày 08/11/2026 đến nay..." -ForegroundColor Yellow

# 2.1 Hóa đơn bán hàng
$ordersPath = Join-Path $dataDir "orders_2026.json"
$oldOrders = @()
if (Test-Path $ordersPath) {
    $allOrders = Get-Content $ordersPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldOrders = @($allOrders | Where-Object { 
        try { [DateTime]$_.createdAt -lt $cutoffDate } catch { $true } 
    })
    Write-Host "  -> Đơn hàng trước 08/11: $($oldOrders.Count) / Đã xóa: $($allOrders.Count - $oldOrders.Count)"
}

# 2.2 Sổ quỹ
$vouchersPath = Join-Path $dataDir "vouchers_2026.json"
$oldVouchers = @()
if (Test-Path $vouchersPath) {
    $allVouchers = Get-Content $vouchersPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldVouchers = @($allVouchers | Where-Object { 
        try { [DateTime]$_.createdAt -lt $cutoffDate } catch { $true } 
    })
    Write-Host "  -> Sổ quỹ trước 08/11: $($oldVouchers.Count) / Đã xóa: $($allVouchers.Count - $oldVouchers.Count)"
}

# 2.3 Phiếu nhập kho
$stockinPath = Join-Path $dataDir "stockin_2026.json"
$oldStockins = @()
if (Test-Path $stockinPath) {
    $allStockins = Get-Content $stockinPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldStockins = @($allStockins | Where-Object { 
        try { [DateTime]$_.createdAt -lt $cutoffDate } catch { $true } 
    })
    [System.IO.File]::WriteAllText($stockinPath, ($oldStockins | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)
    Write-Host "  -> Phiếu nhập trước 08/11: $($oldStockins.Count) / Đã xóa: $($allStockins.Count - $oldStockins.Count)"
}

# 2.4 Trả hàng / Xuất hủy
$returnsPath = Join-Path $dataDir "returns_2026.json"
if (Test-Path $returnsPath) {
    $allReturns = Get-Content $returnsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldReturns = @($allReturns | Where-Object { 
        try { [DateTime]$_.createdAt -lt $cutoffDate } catch { $true } 
    })
    [System.IO.File]::WriteAllText($returnsPath, ($oldReturns | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)
}

# 2.5 Audit log
$auditPath = Join-Path $dataDir "audit_log.json"
if (Test-Path $auditPath) {
    $allAudit = Get-Content $auditPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldAudit = @($allAudit | Where-Object { 
        try { [DateTime]$_.timestamp -lt $cutoffDate } catch { $true } 
    })
    [System.IO.File]::WriteAllText($auditPath, ($oldAudit | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

# Helper đọc nhanh file Excel (OpenXML)
function Read-ExcelSheets($xlsx) {
    $tmpDir = Join-Path $env:TEMP ("kv_read_" + (Get-Random))
    New-Item -ItemType Directory -Path $tmpDir | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($xlsx, $tmpDir)

    $ssFile = Join-Path $tmpDir "xl\sharedStrings.xml"
    $strings = @()
    if (Test-Path $ssFile) {
        [xml]$ss = Get-Content $ssFile -Encoding UTF8
        $strings = @($ss.sst.si | ForEach-Object {
            if ($_.r) {
                ($_.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join ''
            } elseif ($_.t -ne $null) {
                $t = $_.t
                if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t }
            } else { '' }
        })
    }

    $candidateSheets = Get-ChildItem (Join-Path $tmpDir "xl\worksheets") -Filter "sheet*.xml" | Sort-Object Length -Descending
    [xml]$ws = Get-Content $candidateSheets[0].FullName -Encoding UTF8
    $rows = $ws.worksheet.sheetData.row

    return @{
        tmpDir  = $tmpDir
        strings = $strings
        rows    = $rows
    }
}

function Get-Val($cell, $strings) {
    if ($null -eq $cell) { return '' }
    if ($cell.is -and $cell.is.t) { return $cell.is.t }
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's' -and $strings -and $strings.Count -gt [int]$v) { return $strings[[int]$v] }
    return $v
}

function Convert-OADate($oaVal) {
    if ([string]::IsNullOrEmpty($oaVal)) { return '' }
    if ($oaVal -match '^(\d{1,2})/(\d{1,2})/(\d{4})') {
        $d = $matches[1].PadLeft(2, '0')
        $m = $matches[2].PadLeft(2, '0')
        $y = $matches[3]
        $timePart = if ($oaVal -match '\d{2}:\d{2}:\d{2}') { $matches[0] } elseif ($oaVal -match '\d{2}:\d{2}') { $matches[0] + ":00" } else { "08:00:00" }
        return "$y-$m-${d}T${timePart}+07:00"
    }
    try {
        $dt = [DateTime]::FromOADate([double]$oaVal)
        return $dt.ToString('yyyy-MM-ddTHH:mm:ss+07:00')
    } catch { return '' }
}

# -------------------------------------------------------------------------
# BƯỚC 3: CẬP NHẬT NHÀ CUNG CẤP (SUPPLIERS)
# -------------------------------------------------------------------------
Write-Host ">>> [3/7] Đang đồng bộ danh mục Nhà cung cấp..." -ForegroundColor Cyan
$supData = Read-ExcelSheets $supFile
$supRows = $supData.rows
$supStrings = $supData.strings

$suppliersList = [System.Collections.Generic.List[object]]::new()
for ($i = 1; $i -lt $supRows.Count; $i++) {
    $r = $supRows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }
    $sId = Get-Val $cells['A'] $supStrings
    $sName = Get-Val $cells['B'] $supStrings
    if ([string]::IsNullOrWhiteSpace($sId) -or $sId -eq 'Mã NCC') { continue }

    $suppliersList.Add([PSCustomObject]@{
        id       = $sId.Trim()
        name     = if ($sName) { $sName.Trim() } else { "NCC $sId" }
        phone    = (Get-Val $cells['D'] $supStrings).Trim()
        address  = (Get-Val $cells['E'] $supStrings).Trim()
        email    = (Get-Val $cells['C'] $supStrings).Trim()
        taxCode  = (Get-Val $cells['J'] $supStrings).Trim()
        debt     = try { [double](Get-Val $cells['I'] $supStrings) } catch { 0 }
    })
}
Remove-Item $supData.tmpDir -Recurse -Force
[System.IO.File]::WriteAllText((Join-Path $dataDir "suppliers.json"), ($suppliersList | ConvertTo-Json -Depth 5), [System.Text.Encoding]::UTF8)
Write-Host "  -> Đã cập nhật $($suppliersList.Count) nhà cung cấp vào suppliers.json" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 4: CẬP NHẬT KHÁCH HÀNG (CUSTOMERS)
# -------------------------------------------------------------------------
Write-Host ">>> [4/7] Đang đồng bộ danh mục Khách hàng..." -ForegroundColor Cyan
$custData = Read-ExcelSheets $custFile
$custRows = $custData.rows
$custStrings = $custData.strings

$customersList = [System.Collections.Generic.List[object]]::new()
for ($i = 1; $i -lt $custRows.Count; $i++) {
    $r = $custRows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }
    $cId = Get-Val $cells['A'] $custStrings
    $cName = Get-Val $cells['B'] $custStrings
    if ([string]::IsNullOrWhiteSpace($cId) -or $cId -eq 'Mã khách hàng') { continue }

    $phone = (Get-Val $cells['D'] $custStrings).Trim()
    $points = try { [int](Get-Val $cells['G'] $custStrings) } catch { 0 }
    $totalSpent = try { [double](Get-Val $cells['H'] $custStrings) } catch { 0 }

    $customersList.Add([PSCustomObject]@{
        id         = $cId.Trim()
        name       = if ($cName) { $cName.Trim() } else { "Khách lẻ" }
        phone      = $phone
        address    = (Get-Val $cells['E'] $custStrings).Trim()
        points     = [Math]::Max(0, $points)
        totalSpent = [Math]::Max(0, $totalSpent)
        ordersCount= 0
    })
}
Remove-Item $custData.tmpDir -Recurse -Force
[System.IO.File]::WriteAllText((Join-Path $dataDir "customers.json"), ($customersList | ConvertTo-Json -Depth 5), [System.Text.Encoding]::UTF8)
Write-Host "  -> Đã cập nhật $($customersList.Count) khách hàng vào customers.json" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 5: CẬP NHẬT DANH MỤC THUỐC, GIÁ VỐN & TỒN KHO (MEDICINES)
# -------------------------------------------------------------------------
Write-Host ">>> [5/7] Đang đồng bộ Danh mục thuốc, giá vốn & tồn kho chuẩn tỷ lệ quy đổi..." -ForegroundColor Cyan
$medData = Read-ExcelSheets $medFile
$medRows = $medData.rows
$medStrings = $medData.strings

$excelBase = @{}
$excelSubs = @{}

for ($i = 1; $i -lt $medRows.Count; $i++) {
    $r = $medRows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }
    $code = Get-Val $cells['C'] $medStrings
    if ([string]::IsNullOrWhiteSpace($code) -or $code -eq 'Mã hàng') { continue }

    $baseCode = (Get-Val $cells['P'] $medStrings).Trim()
    $name     = (Get-Val $cells['E'] $medStrings).Trim()
    $unit     = (Get-Val $cells['O'] $medStrings).Trim()
    $barcode  = (Get-Val $cells['D'] $medStrings).Trim()
    $category = (Get-Val $cells['B'] $medStrings).Trim()
    $ratio    = 1.0; try { $val = Get-Val $cells['Q'] $medStrings; if ($val) { $ratio = [double]$val } } catch {}
    $stock    = 0.0; try { $val = Get-Val $cells['J'] $medStrings; if ($val) { $stock = [double]$val } } catch {}
    $cost     = 0.0; try { $val = Get-Val $cells['I'] $medStrings; if ($val) { $cost  = [double]$val } } catch {}
    $price    = 0.0; try { $val = Get-Val $cells['H'] $medStrings; if ($val) { $price = [double]$val } } catch {}

    if ([string]::IsNullOrWhiteSpace($baseCode)) {
        $excelBase[$code] = @{
            code     = $code
            name     = $name
            unit     = $unit
            barcode  = $barcode
            category = $category
            stock    = $stock
            cost     = $cost
            price    = $price
        }
    } else {
        if (-not $excelSubs.ContainsKey($baseCode)) {
            $excelSubs[$baseCode] = [System.Collections.Generic.List[hashtable]]::new()
        }
        $excelSubs[$baseCode].Add(@{
            code     = $code
            baseCode = $baseCode
            name     = $name
            unit     = $unit
            barcode  = $barcode
            ratio    = $ratio
            stock    = $stock
            cost     = $cost
            price    = $price
        })
    }
}
Remove-Item $medData.tmpDir -Recurse -Force

# Load existing medicines.json to preserve custom meds (MED*) and custom unit configurations (e.g. SP005599)
$medicinesPath = Join-Path $dataDir "medicines.json"
$currMeds = Get-Content $medicinesPath -Raw -Encoding UTF8 | ConvertFrom-Json
$currMedMap = @{}
foreach ($m in $currMeds) {
    if ($m.id) { $currMedMap[$m.id] = $m }
}

$updatedMeds = [System.Collections.Generic.List[object]]::new()

# Cập nhật các mặt hàng từ Excel
foreach ($kv in $excelBase.GetEnumerator()) {
    $code = $kv.Key
    $b = $kv.Value

    $existing = if ($currMedMap.ContainsKey($code)) { $currMedMap[$code] } else { $null }

    $baseUnit  = if ($existing -and $existing.baseUnit) { $existing.baseUnit } elseif ($b.unit) { $b.unit } else { 'Cái' }
    $packUnit  = if ($existing -and $existing.packUnit) { $existing.packUnit } elseif ($b.unit) { $b.unit } else { 'Hộp' }
    $packRatio = if ($existing -and $existing.packRatio -gt 0) { [double]$existing.packRatio } else { 1.0 }
    $subUnit   = if ($existing) { $existing.subUnit } else { '' }
    $subRatio  = if ($existing -and $existing.subRatio -gt 0) { [double]$existing.subRatio } else { 1.0 }

    # Tính giá vốn chuẩn
    $costPrice = [double]$b.cost
    if ($excelSubs.ContainsKey($code)) {
        $subs = $excelSubs[$code]
        $packSub = $subs | Where-Object { $_.unit.Trim().ToLower() -eq $packUnit.Trim().ToLower() }
        if ($packSub -and $packSub.cost -gt 0) {
            $costPrice = [double]$packSub.cost
        } elseif ($b.cost -gt 0 -and $packRatio -gt 1) {
            $costPrice = [double]$b.cost * $packRatio
        }
    }
    $costPrice = [Math]::Round($costPrice, 2)
    if ($costPrice -eq 0 -and $existing -and [double]$existing.costPrice -gt 0) {
        $costPrice = [double]$existing.costPrice
    }

    # Tính tồn kho: Nếu mặt hàng có quy cách ĐV lớn (ví dụ 1 Hộp = 20 ống) và Excel lưu theo ĐVT Hộp, nhân theo packRatio
    $excelStock = [double]$b.stock
    $stockUnits = $excelStock
    if ($packRatio -gt 1 -and $packUnit.Trim().ToLower() -eq $b.unit.Trim().ToLower()) {
        $stockUnits = $excelStock * $packRatio
    }
    $stockUnits = [Math]::Max(0.0, [Math]::Round($stockUnits, 3))

    $priceBox  = if ($existing -and $existing.priceBox -gt 0) { $existing.priceBox } else { [Math]::Round([double]$b.price) }
    $priceBase = if ($existing -and $existing.priceBase -gt 0) { $existing.priceBase } else { [Math]::Round([double]$b.price) }
    $priceSub  = if ($existing -and $existing.priceSub -gt 0) { $existing.priceSub } else { 0 }

    $updatedMeds.Add([PSCustomObject]@{
        id               = $code
        name             = if ($b.name) { $b.name } else { $existing.name }
        barcode          = if ($b.barcode) { $b.barcode } elseif ($existing) { $existing.barcode } else { '' }
        activeIngredient = if ($existing) { $existing.activeIngredient } else { '' }
        category         = if ($b.category) { $b.category } elseif ($existing) { $existing.category } else { 'Thuốc chung' }
        supplierId       = if ($existing) { $existing.supplierId } else { '' }
        baseUnit         = $baseUnit
        packUnit         = $packUnit
        packRatio        = $packRatio
        subUnit          = $subUnit
        subRatio         = $subRatio
        costPrice        = $costPrice
        priceBox         = $priceBox
        priceSub         = $priceSub
        priceBase        = $priceBase
        stockUnits       = $stockUnits
        minStock         = if ($existing -and $existing.minStock) { $existing.minStock } else { 50 }
        batchNo          = if ($existing) { $existing.batchNo } else { '' }
        expiryDate       = if ($existing) { $existing.expiryDate } else { '' }
        usageDefault     = if ($existing) { $existing.usageDefault } else { '' }
    })
}

# Giữ lại các mặt hàng tạo thủ công trong hệ thống (như MED*)
foreach ($m in $currMeds) {
    if (-not $excelBase.ContainsKey($m.id)) {
        $updatedMeds.Add($m)
    }
}

[System.IO.File]::WriteAllText($medicinesPath, ($updatedMeds | ConvertTo-Json -Depth 5 -Compress), [System.Text.Encoding]::UTF8)
Write-Host "  -> Đã cập nhật $($updatedMeds.Count) mặt hàng thuốc vào medicines.json" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 6: IMPORT HÓA ĐƠN BÁN HÀNG TỪ NGÀY 08/11/2026 ĐẾN NAY
# -------------------------------------------------------------------------
Write-Host ">>> [6/7] Đang import hóa đơn bán hàng từ 08/11/2026 đến nay..." -ForegroundColor Cyan

# Tạo bản đồ thuốc để tra cứu giá vốn ước tính
$medLookup = @{}
foreach ($m in $updatedMeds) {
    if ($m.id) { $medLookup[$m.id] = $m }
}

$invData = Read-ExcelSheets $invFile
$invRows = $invData.rows
$invStrings = $invData.strings

$ordersDict = [System.Collections.Generic.Dictionary[string, object]]::new()

for ($i = 1; $i -lt $invRows.Count; $i++) {
    $r = $invRows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $invId = Get-Val $cells['B'] $invStrings
    if ([string]::IsNullOrWhiteSpace($invId) -or $invId -eq 'Mã hóa đơn') { continue }

    $timeRaw   = Get-Val $cells['C'] $invStrings
    $createdAt = Convert-OADate $timeRaw
    if ([string]::IsNullOrEmpty($createdAt)) { continue }

    try {
        $dt = [DateTime]$createdAt
        if ($dt -lt $cutoffDate) { continue }
    } catch { continue }

    $custId      = Get-Val $cells['G'] $invStrings
    $custName    = Get-Val $cells['H'] $invStrings
    $custPhone   = Get-Val $cells['J'] $invStrings
    $seller      = Get-Val $cells['P'] $invStrings
    $note        = Get-Val $cells['S'] $invStrings
    $finalAmt    = Get-Val $cells['V'] $invStrings
    $cashAmt     = Get-Val $cells['X'] $invStrings
    $transferAmt = Get-Val $cells['AA'] $invStrings

    $medCode     = Get-Val $cells['AE'] $invStrings
    $medName     = Get-Val $cells['AG'] $invStrings
    $unit        = Get-Val $cells['AI'] $invStrings
    $qty         = Get-Val $cells['AK'] $invStrings
    $price       = Get-Val $cells['AL'] $invStrings
    $itemTotal   = Get-Val $cells['AP'] $invStrings

    $pMethod = 'cash'
    $tVal = 0.0; if ($transferAmt) { try { $tVal = [double]$transferAmt } catch {} }
    if ($tVal -gt 0) { $pMethod = 'transfer' }

    if (-not $ordersDict.ContainsKey($invId)) {
        $ordersDict[$invId] = [PSCustomObject]@{
            id            = $invId
            customerId    = $custId
            customerName  = if ($custName) { $custName } else { "Khách lẻ" }
            customerPhone = $custPhone
            pharmacist    = if ($seller) { $seller } else { "admin" }
            note          = $note
            totalAmount   = [Math]::Round([double]$finalAmt)
            paymentMethod = $pMethod
            status        = 'completed'
            createdAt     = $createdAt
            items         = [System.Collections.Generic.List[object]]::new()
            returns       = @()
            totalRefunded = 0
        }
    }

    # Tính giá vốn ước tính
    $unitCost = 0
    if ($medLookup.ContainsKey($medCode)) {
        $m = $medLookup[$medCode]
        if ($m.costPrice) {
            $cPrice = [double]$m.costPrice
            $pRatio = if ($m.packRatio -and [double]$m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
            $sRatio = if ($m.subRatio -and [double]$m.subRatio -gt 0) { [double]$m.subRatio } else { 1.0 }
            $baseCost = $cPrice / $pRatio

            $pUnitNorm = if ($m.packUnit) { $m.packUnit.Trim().ToLower() } else { '' }
            $sUnitNorm = if ($m.subUnit) { $m.subUnit.Trim().ToLower() } else { '' }
            $uNorm = if ($unit) { $unit.Trim().ToLower() } else { '' }

            if ($uNorm -and $uNorm -eq $pUnitNorm) {
                $unitCost = [Math]::Round($cPrice)
            } elseif ($uNorm -and $uNorm -eq $sUnitNorm) {
                $unitCost = [Math]::Round($baseCost * $sRatio)
            } else {
                $unitCost = [Math]::Round($baseCost)
            }
        }
    }

    $itemObj = [PSCustomObject]@{
        medicineId   = $medCode
        medicineName = $medName
        unit         = if ($unit) { $unit } else { "Đơn vị" }
        quantity     = if ($qty) { [double]$qty } else { 1 }
        price        = if ($price) { [Math]::Round([double]$price) } else { 0 }
        costPrice    = $unitCost
        total        = if ($itemTotal) { [Math]::Round([double]$itemTotal) } else { 0 }
    }
    $ordersDict[$invId].items.Add($itemObj)
}
Remove-Item $invData.tmpDir -Recurse -Force

$newOrdersList = @($ordersDict.Values)
$finalOrders = $newOrdersList + $oldOrders | Sort-Object { [DateTime]$_.createdAt } -Descending
[System.IO.File]::WriteAllText($ordersPath, ($finalOrders | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)

$totalRev = ($newOrdersList | Measure-Object totalAmount -Sum).Sum
Write-Host "  -> Đã import $($newOrdersList.Count) đơn hàng mới kể từ ngày 08/11/2026!" -ForegroundColor Green
Write-Host "  -> Doanh số bán mới: $($totalRev.ToString('N0')) đ" -ForegroundColor Green
Write-Host "  -> Tổng số đơn hàng trong hệ thống: $($finalOrders.Count) đơn" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 7: IMPORT SỔ QUỸ (VOUCHERS) TỪ NGÀY 08/11/2026 ĐẾN NAY
# -------------------------------------------------------------------------
Write-Host ">>> [7/7] Đang import Sổ quỹ thu chi từ 08/11/2026 đến nay..." -ForegroundColor Cyan

# Bản đồ phương thức thanh toán từ hóa đơn
$orderMapForVoucher = @{}
foreach ($o in $finalOrders) {
    if ($o.id) {
        $orderMapForVoucher[$o.id] = @{
            paymentMethod = $o.paymentMethod
            customerName  = $o.customerName
        }
    }
}

$sqData = Read-ExcelSheets $sqFile
$sqRows = $sqData.rows
$sqStrings = $sqData.strings

function Get-VoucherType($loaiTC, $vId) {
    if ($vId -match '^(CTM|CNH|CTD|PC|PCPN)') { return 'payment' }
    if ($vId -match '^(TTM|TNH|TTD|PT|PTTHN|TTHD|TTHDO)') { return 'receipt' }
    if ($loaiTC -match 'Phiếu thu') { return 'receipt' }
    if ($loaiTC -match 'Phiếu chi') { return 'payment' }
    return 'receipt'
}

function Get-Category($loaiTC) {
    $cat = $loaiTC -replace '^Phiếu thu ', '' -replace '^Phiếu chi ', ''
    if ([string]::IsNullOrWhiteSpace($cat)) { return 'Khác' }
    return $cat.Trim()
}

$newVouchersList = [System.Collections.Generic.List[object]]::new()
$processedVIds = [System.Collections.Generic.HashSet[string]]::new()

for ($i = 1; $i -lt $sqRows.Count; $i++) {
    $r = $sqRows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $vId     = Get-Val $cells['A'] $sqStrings
    $timeRaw = Get-Val $cells['B'] $sqStrings
    $loaiTC  = Get-Val $cells['C'] $sqStrings
    $person  = Get-Val $cells['D'] $sqStrings
    $amount  = Get-Val $cells['E'] $sqStrings

    if ([string]::IsNullOrWhiteSpace($vId) -or $vId -eq 'Mã phiếu') { continue }
    if ($processedVIds.Contains($vId)) { continue }
    [void]$processedVIds.Add($vId)

    $createdAt = Convert-OADate $timeRaw
    if ([string]::IsNullOrEmpty($createdAt)) { continue }

    try {
        $dt = [DateTime]$createdAt
        if ($dt -lt $cutoffDate) { continue }
    } catch { continue }

    $vType = Get-VoucherType $loaiTC $vId
    $category = Get-Category $loaiTC
    $amtVal = try { [Math]::Abs([Math]::Round([double]$amount)) } catch { 0 }

    $refId = ''
    if ($vId -match '^TT(HD\w+)') { $refId = $matches[1] }
    elseif ($vId -match '^PC(PN\w+)') { $refId = $matches[1] }
    elseif ($vId -match '^PT(THN\w+)') { $refId = $matches[1] }

    $pMethod = 'cash'
    if ($vId -match '^CK' -or $vId -match 'CK$' -or $vId -match '^CNH' -or $vId -match '^TNH') { 
        $pMethod = 'transfer' 
    } elseif ($refId -and $orderMapForVoucher.ContainsKey($refId)) {
        $pMethod = $orderMapForVoucher[$refId].paymentMethod
    }

    $targetName = if ($person) { $person.Trim() } else { 'Khách lẻ' }
    if ($refId -and $orderMapForVoucher.ContainsKey($refId) -and $orderMapForVoucher[$refId].customerName) {
        $targetName = $orderMapForVoucher[$refId].customerName
    }

    $newVouchersList.Add([PSCustomObject]@{
        id            = $vId.Trim()
        type          = $vType
        amount        = $amtVal
        category      = $category
        reason        = $loaiTC.Trim()
        person        = $targetName
        paymentMethod = $pMethod
        refId         = $refId
        createdAt     = $createdAt
        targetType    = if ($vType -eq 'receipt') { 'customer' } else { 'supplier' }
        targetName    = $targetName
        recipientName = $targetName
        isAccounting  = $true
    })
}
Remove-Item $sqData.tmpDir -Recurse -Force

# Tự động sinh thêm phiếu thu TTHD cho các đơn hàng mới nếu trong file Sổ Quỹ chưa có dòng tương ứng
$vMap = [System.Collections.Generic.HashSet[string]]::new()
foreach ($v in $newVouchersList) { [void]$vMap.Add($v.id) }
foreach ($v in $oldVouchers) { if ($v.id) { [void]$vMap.Add($v.id) } }

$autoAddedCount = 0
foreach ($o in $newOrdersList) {
    $expectedVid = "TT" + $o.id
    if (-not $vMap.Contains($expectedVid)) {
        $newVouchersList.Add([PSCustomObject]@{
            id            = $expectedVid
            type          = 'receipt'
            amount        = $o.totalAmount
            category      = 'Tiền khách trả'
            reason        = 'Phiếu thu Tiền khách trả'
            person        = $o.customerName
            paymentMethod = $o.paymentMethod
            refId         = $o.id
            createdAt     = $o.createdAt
            targetType    = 'customer'
            targetName    = $o.customerName
            recipientName = $o.customerName
            isAccounting  = $true
        })
        [void]$vMap.Add($expectedVid)
        $autoAddedCount++
    }
}

$finalVouchers = @($newVouchersList) + @($oldVouchers) | Sort-Object { [DateTime]$_.createdAt } -Descending
[System.IO.File]::WriteAllText($vouchersPath, ($finalVouchers | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)

Write-Host "  -> Đã import $($newVouchersList.Count) phiếu sổ quỹ mới kể từ ngày 08/11/2026!" -ForegroundColor Green
Write-Host "  -> Tổng số phiếu sổ quỹ trong hệ thống: $($finalVouchers.Count) phiếu" -ForegroundColor Green

# -------------------------------------------------------------------------
# KIỂM TRA SẢN PHẨM FYSLINE SP005599
# -------------------------------------------------------------------------
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " KIỂM TRA THÔNG TIN FYSLINE (SP005599) SAU KHI ĐỒNG BỘ:" -ForegroundColor Cyan
$fysoline = $updatedMeds | Where-Object { $_.id -eq 'SP005599' }
if ($fysoline) {
    Write-Host "  Mã:       $($fysoline.id)" -ForegroundColor White
    Write-Host "  Tên:      $($fysoline.name)" -ForegroundColor White
    Write-Host "  Quy cách: 1 $($fysoline.packUnit) = $($fysoline.packRatio) $($fysoline.baseUnit) (ĐVT phụ: $($fysoline.subUnit) = $($fysoline.subRatio) $($fysoline.baseUnit))" -ForegroundColor White
    Write-Host "  Giá vốn:  $($fysoline.costPrice.ToString('N0')) đ / $($fysoline.packUnit)" -ForegroundColor White
    Write-Host "  TỒN KHO:  $($fysoline.stockUnits) $($fysoline.baseUnit) (= $([double]$fysoline.stockUnits / $fysoline.packRatio) $($fysoline.packUnit))" -ForegroundColor Green
}
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " HOÀN TẤT ĐỒNG BỘ DỮ LIỆU THÀNH CÔNG RỰC RỠ!" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Cyan
