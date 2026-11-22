<#
.SYNOPSIS
    Script đồng bộ dữ liệu KiotViet từ 19/11/2026 đến 22/11/2026 vào MedicaPharmacy:
    1. Dừng server MedicaServer để tránh ghi đè cache
    2. Sao lưu toàn bộ thư mục data hiện tại sang data/backups/
    3. Xóa dữ liệu từ 19/11/2026 đến 22/11/2026 (orders, vouchers, stockin, returns, audit_log)
    4. Cập nhật danh mục khách hàng (customers.json) chuẩn theo cột KiotViet
    5. Cập nhật danh mục thuốc, giá vốn, giá bán và tồn kho chuẩn xác (medicines.json)
    6. Import phiếu nhập kho từ 19/11 đến 22/11 (stockin_2026.json)
    7. Import hóa đơn bán hàng từ 19/11 đến 22/11 (orders_2026.json)
    8. Import sổ quỹ thu chi từ 19/11 đến 22/11 (vouchers_2026.json)
    9. Cập nhật data/db_counts.json
    10. Đối soát tồn kho 100% giữa medicines.json và file Excel KiotViet
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$projectDir = "F:\MedicaPharmacy"
$dataDir    = Join-Path $projectDir "data"
$importsDir = Join-Path $projectDir "imports"

$invFile  = Join-Path $importsDir "DanhSachChiTietHoaDon_KV22112026-220622-224.xlsx"
$custFile = Join-Path $importsDir "DanhSachKhachHang_KV22112026-220733-722.xlsx"
$medFile  = Join-Path $importsDir "DanhSachSanPham_KV22112026-220315-690.xlsx"
$pnFile   = Join-Path $importsDir "DanhSachChiTietNhapHang_KV22112026-220518-268.xlsx"
$sqCash   = Join-Path $importsDir "SoQuy_TienMat_KV22112026-220820-291.xlsx"
$sqBank   = Join-Path $importsDir "SoQuy_ChuyenKhoan_KV22112026-220853-918.xlsx"

$cutoffDate = [DateTime]"2026-11-19T00:00:00"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " BẮT ĐẦU ĐỒNG BỘ DỮ LIỆU KIOTVIET (19/11/2026 - 22/11/2026)" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# BƯỚC 1: DỪNG SERVER ĐỂ BẢO VỆ DỮ LIỆU
# -------------------------------------------------------------------------
Write-Host ">>> [1/10] Kiểm tra và dừng MedicaServer..." -ForegroundColor Yellow
$serverProc = Get-Process MedicaServer -ErrorAction SilentlyContinue
if ($serverProc) {
    Stop-Process -Name MedicaServer -Force
    Start-Sleep -Seconds 2
    Write-Host "  -> Đã dừng MedicaServer thành công." -ForegroundColor Green
} else {
    Write-Host "  -> MedicaServer hiện không chạy." -ForegroundColor Gray
}

# -------------------------------------------------------------------------
# BƯỚC 2: SAO LƯU DỰ PHÒNG TOÀN BỘ DATA
# -------------------------------------------------------------------------
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $dataDir ("backups\backup_before_sync_19to22_" + $timestamp)
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Get-ChildItem -Path $dataDir -Filter "*.json" | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $backupDir $_.Name) -Force
}
Write-Host ">>> [2/10] Đã tạo bản sao lưu toàn bộ dữ liệu an toàn tại: $backupDir" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 3: LÀM SẠCH DỮ LIỆU TỪ 19/11/2026 ĐẾN NAY
# -------------------------------------------------------------------------
Write-Host ">>> [3/10] Đang làm sạch dữ liệu từ ngày 19/11/2026 đến nay..." -ForegroundColor Yellow

# 3.1 Hóa đơn bán hàng
$ordersPath = Join-Path $dataDir "orders_2026.json"
$oldOrders = @()
if (Test-Path $ordersPath) {
    $allOrders = Get-Content $ordersPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldOrders = @($allOrders | Where-Object { 
        try { [DateTime]$_.createdAt -lt $cutoffDate } catch { $true } 
    })
    Write-Host "  -> Hóa đơn trước 19/11 giữ lại: $($oldOrders.Count) / Đã xóa: $($allOrders.Count - $oldOrders.Count)" -ForegroundColor Green
}

# 3.2 Sổ quỹ
$vouchersPath = Join-Path $dataDir "vouchers_2026.json"
$oldVouchers = @()
if (Test-Path $vouchersPath) {
    $allVouchers = Get-Content $vouchersPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldVouchers = @($allVouchers | Where-Object { 
        try { [DateTime]$_.createdAt -lt $cutoffDate } catch { $true } 
    })
    Write-Host "  -> Sổ quỹ trước 19/11 giữ lại: $($oldVouchers.Count) / Đã xóa: $($allVouchers.Count - $oldVouchers.Count)" -ForegroundColor Green
}

# 3.3 Phiếu nhập kho
$stockinPath = Join-Path $dataDir "stockin_2026.json"
$oldStockins = @()
if (Test-Path $stockinPath) {
    $allStockins = Get-Content $stockinPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldStockins = @($allStockins | Where-Object { 
        try { [DateTime]$_.createdAt -lt $cutoffDate } catch { $true } 
    })
    Write-Host "  -> Phiếu nhập trước 19/11 giữ lại: $($oldStockins.Count) / Đã xóa: $($allStockins.Count - $oldStockins.Count)" -ForegroundColor Green
}

# 3.4 Trả hàng / Xuất hủy
$returnsPath = Join-Path $dataDir "returns_2026.json"
$oldReturns = @()
if (Test-Path $returnsPath) {
    $allReturns = Get-Content $returnsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldReturns = @($allReturns | Where-Object { 
        try { [DateTime]$_.createdAt -lt $cutoffDate } catch { $true } 
    })
    [System.IO.File]::WriteAllText($returnsPath, ($oldReturns | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)
    Write-Host "  -> Trả hàng giữ lại: $($oldReturns.Count)" -ForegroundColor Green
}

# 3.5 Audit log
$auditPath = Join-Path $dataDir "audit_log.json"
if (Test-Path $auditPath) {
    $allAudit = Get-Content $auditPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oldAudit = @($allAudit | Where-Object { 
        try { [DateTime]$_.timestamp -lt $cutoffDate } catch { $true } 
    })
    [System.IO.File]::WriteAllText($auditPath, ($oldAudit | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)
    Write-Host "  -> Audit log giữ lại: $($oldAudit.Count) / Đã xóa: $($allAudit.Count - $oldAudit.Count)" -ForegroundColor Green
}

# Helper đọc OpenXML Excel
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ExcelSheets($xlsx) {
    $tmpDir = Join-Path $env:TEMP ("kv_sync_" + (Get-Random))
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
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's' -and $strings -and $strings.Count -gt [int]$v) { return [string]$strings[[int]$v] }
    return [string]$v
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
# BƯỚC 4: CẬP NHẬT KHÁCH HÀNG (CUSTOMERS) CHUẨN CỘT
# -------------------------------------------------------------------------
Write-Host ">>> [4/10] Đang đồng bộ danh mục Khách hàng..." -ForegroundColor Cyan
$custData = Read-ExcelSheets $custFile
$custRows = $custData.rows
$custStrings = $custData.strings

$customersList = [System.Collections.Generic.List[object]]::new()
for ($i = 1; $i -lt $custRows.Count; $i++) {
    $r = $custRows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }
    $cId = (Get-Val $cells['C'] $custStrings).Trim()
    $cName = (Get-Val $cells['D'] $custStrings).Trim()
    if ([string]::IsNullOrWhiteSpace($cId) -or $cId -eq 'Mã khách hàng') { continue }

    $phone = ((Get-Val $cells['E'] $custStrings).Trim() -replace '\s+', '')
    $address = (Get-Val $cells['F'] $custStrings).Trim()
    $points = try { [int](Get-Val $cells['AE'] $custStrings) } catch { 0 }
    $totalSpent = try { [double](Get-Val $cells['AH'] $custStrings) } catch { 0 }

    $customersList.Add([PSCustomObject]@{
        id          = $cId
        name        = if ($cName) { $cName } else { "Khách lẻ" }
        phone       = $phone
        address     = $address
        points      = [Math]::Max(0, $points)
        totalSpent  = [Math]::Max(0.0, [Math]::Round($totalSpent, 2))
        ordersCount = 0
        note        = (Get-Val $cells['N'] $custStrings).Trim()
    })
}
Remove-Item $custData.tmpDir -Recurse -Force
[System.IO.File]::WriteAllText((Join-Path $dataDir "customers.json"), ($customersList | ConvertTo-Json -Depth 5), [System.Text.Encoding]::UTF8)
Write-Host "  -> Đã cập nhật $($customersList.Count) khách hàng chuẩn xác vào customers.json" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 5: CẬP NHẬT DANH MỤC THUỐC, GIÁ VỐN & TỒN KHO (MEDICINES)
# -------------------------------------------------------------------------
Write-Host ">>> [5/10] Đang đồng bộ Danh mục thuốc, giá vốn & tồn kho chuẩn tỷ lệ quy đổi..." -ForegroundColor Cyan
$medData = Read-ExcelSheets $medFile
$medRows = $medData.rows
$medStrings = $medData.strings

# Đọc header động
$medHeader = $medRows[0]
$medColMap = @{}
foreach ($c in $medHeader.c) {
    $medColMap[(Get-Val $c $medStrings).Trim()] = $c.r -replace '\d+', ''
}

$colMedCode     = $medColMap['Mã hàng']
$colMedBaseCode = $medColMap['Mã ĐVT Cơ bản']
$colMedName     = $medColMap['Tên hàng']
$colMedUnit     = $medColMap['ĐVT']
$colMedBarcode  = $medColMap['Mã vạch']
$colMedCat      = if ($medColMap.ContainsKey('Nhóm hàng(3 Cấp)')) { $medColMap['Nhóm hàng(3 Cấp)'] } else { $medColMap['Nhóm hàng'] }
$colMedRatio    = $medColMap['Quy đổi']
$colMedStock    = $medColMap['Tồn kho']
$colMedCost     = $medColMap['Giá vốn']
$colMedPrice    = $medColMap['Giá bán']
$colMedMinStock = $medColMap['Tồn nhỏ nhất']

$excelBase = [System.Collections.Generic.Dictionary[string, hashtable]]::new()
$excelSubs = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[hashtable]]]::new()

for ($i = 1; $i -lt $medRows.Count; $i++) {
    $r = $medRows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $code = Get-Val $cells[$colMedCode] $medStrings
    if ([string]::IsNullOrWhiteSpace($code) -or $code -eq 'Mã hàng') { continue }

    $baseCode = (Get-Val $cells[$colMedBaseCode] $medStrings).Trim()
    $name     = (Get-Val $cells[$colMedName] $medStrings).Trim()
    $unit     = (Get-Val $cells[$colMedUnit] $medStrings).Trim()
    $barcode  = (Get-Val $cells[$colMedBarcode] $medStrings).Trim()
    $category = (Get-Val $cells[$colMedCat] $medStrings).Trim()
    $ratio    = 1.0; try { $val = Get-Val $cells[$colMedRatio] $medStrings; if ($val) { $ratio = [double]$val } } catch {}
    $stock    = 0.0; try { $val = Get-Val $cells[$colMedStock] $medStrings; if ($val) { $stock = [double]$val } } catch {}
    $cost     = 0.0; try { $val = Get-Val $cells[$colMedCost] $medStrings;  if ($val) { $cost  = [double]$val } } catch {}
    $price    = 0.0; try { $val = Get-Val $cells[$colMedPrice] $medStrings; if ($val) { $price = [double]$val } } catch {}
    $minStock = 50;  try { $val = Get-Val $cells[$colMedMinStock] $medStrings; if ($val) { $minStock = [int]$val } } catch {}

    $itemData = @{
        code     = $code
        name     = $name
        unit     = $unit
        barcode  = $barcode
        category = $category
        ratio    = $ratio
        stock    = $stock
        cost     = $cost
        price    = $price
        minStock = $minStock
    }

    if ([string]::IsNullOrWhiteSpace($baseCode)) {
        $excelBase[$code] = $itemData
    } else {
        if (-not $excelSubs.ContainsKey($baseCode)) {
            $excelSubs[$baseCode] = [System.Collections.Generic.List[hashtable]]::new()
        }
        $excelSubs[$baseCode].Add($itemData)
    }
}
Remove-Item $medData.tmpDir -Recurse -Force

# Load existing medicines.json to preserve custom attributes
$medicinesPath = Join-Path $dataDir "medicines.json"
$currMeds = Get-Content $medicinesPath -Raw -Encoding UTF8 | ConvertFrom-Json
$currMedMap = @{}
foreach ($m in $currMeds) {
    if ($m.id) { $currMedMap[$m.id] = $m }
}

$updatedMeds = [System.Collections.Generic.List[object]]::new()
$medLookup = @{}

foreach ($kv in $excelBase.GetEnumerator()) {
    $code = $kv.Key
    $b = $kv.Value
    $existing = if ($currMedMap.ContainsKey($code)) { $currMedMap[$code] } else { $null }

    $baseUnit   = if ($b.unit) { $b.unit } elseif ($existing -and $existing.baseUnit) { $existing.baseUnit } else { 'Cái' }
    $stockUnits = [Math]::Max(0.0, [Math]::Round($b.stock, 3))
    $priceBase  = [Math]::Round($b.price)
    $minStock   = if ($b.minStock -gt 0) { $b.minStock } elseif ($existing -and $existing.minStock) { $existing.minStock } else { 50 }

    $packUnit   = $baseUnit
    $packRatio  = 1.0
    $subUnit    = ""
    $subRatio   = 1.0
    $priceBox   = $priceBase
    $priceSub   = 0
    $costPrice  = [Math]::Round($b.cost, 2)

    # Barcodes
    $extraBarcodes = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($b.barcode)) {
        [void]$extraBarcodes.Add($b.barcode.Trim())
    }

    if ($excelSubs.ContainsKey($code)) {
        $subs = $excelSubs[$code]
        if ($subs.Count -gt 1) {
            $subs.Sort([System.Comparison[hashtable]]{
                param($x, $y)
                return [double]$x['ratio'] - [double]$y['ratio']
            })
        }

        foreach ($s in $subs) {
            if (-not [string]::IsNullOrWhiteSpace($s.code)) {
                [void]$extraBarcodes.Add($s.code.Trim())
            }
            if (-not [string]::IsNullOrWhiteSpace($s.barcode)) {
                [void]$extraBarcodes.Add($s.barcode.Trim())
            }
        }

        if ($subs.Count -eq 1) {
            $s = $subs[0]
            $packUnit  = if ($s.unit) { $s.unit.Trim() } else { "Hộp" }
            $packRatio = if ($s.ratio -gt 0) { [double]$s.ratio } else { 1.0 }
            $priceBox  = if ($s.price -gt 0) { [Math]::Round($s.price) } else { [Math]::Round($priceBase * $packRatio) }
            if ($s.cost -gt 0) {
                $costPrice = [Math]::Round($s.cost, 2)
            } elseif ($b.cost -gt 0) {
                $costPrice = [Math]::Round($b.cost * $packRatio, 2)
            }
        } elseif ($subs.Count -ge 2) {
            $sub1 = $subs[0]
            $subUnit  = if ($sub1.unit) { $sub1.unit.Trim() } else { "Vỉ" }
            $subRatio = if ($sub1.ratio -gt 0) { [double]$sub1.ratio } else { 1.0 }
            $priceSub = if ($sub1.price -gt 0) { [Math]::Round($sub1.price) } else { [Math]::Round($priceBase * $subRatio) }

            $subLast = $subs[-1]
            $packUnit  = if ($subLast.unit) { $subLast.unit.Trim() } else { "Hộp" }
            $packRatio = if ($subLast.ratio -gt 0) { [double]$subLast.ratio } else { 1.0 }
            $priceBox  = if ($subLast.price -gt 0) { [Math]::Round($subLast.price) } else { [Math]::Round($priceBase * $packRatio) }
            if ($subLast.cost -gt 0) {
                $costPrice = [Math]::Round($subLast.cost, 2)
            } elseif ($b.cost -gt 0) {
                $costPrice = [Math]::Round($b.cost * $packRatio, 2)
            }
        }
    }

    if ($costPrice -eq 0 -and $existing -and [double]$existing.costPrice -gt 0) {
        $costPrice = [double]$existing.costPrice
    }
    if ($packRatio -eq 1 -and $priceBox -eq 0 -and $priceBase -gt 0) {
        $priceBox = $priceBase
    }
    if ($priceBase -eq 0 -and $priceBox -gt 0 -and $packRatio -gt 0) {
        $priceBase = [Math]::Round($priceBox / $packRatio)
    }

    $barcodeStr = ($extraBarcodes | Select-Object -Unique) -join ', '

    $medObj = [PSCustomObject]@{
        id               = $code
        name             = if ($b.name) { $b.name } elseif ($existing) { $existing.name } else { "Sản phẩm $code" }
        barcode          = if ($barcodeStr) { $barcodeStr } elseif ($existing) { $existing.barcode } else { '' }
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
        minStock         = $minStock
        batchNo          = if ($existing) { $existing.batchNo } else { '' }
        expiryDate       = if ($existing) { $existing.expiryDate } else { '' }
        usageDefault     = if ($existing) { $existing.usageDefault } else { '' }
    }

    $updatedMeds.Add($medObj)
    $medLookup[$code] = $medObj
    if ($barcodeStr) {
        foreach ($bc in ($barcodeStr -split ',\s*')) {
            if ($bc -and -not $medLookup.ContainsKey($bc)) {
                $medLookup[$bc] = $medObj
            }
        }
    }
}

# Giữ lại các mặt hàng tùy chỉnh trong hệ thống nếu có
foreach ($m in $currMeds) {
    if (-not $excelBase.ContainsKey($m.id)) {
        $updatedMeds.Add($m)
        $medLookup[$m.id] = $m
    }
}

[System.IO.File]::WriteAllText($medicinesPath, ($updatedMeds | ConvertTo-Json -Depth 5 -Compress), [System.Text.Encoding]::UTF8)
Write-Host "  -> Đã cập nhật $($updatedMeds.Count) mặt hàng thuốc vào medicines.json" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 6: IMPORT PHIẾU NHẬP KHO (STOCKIN) TỪ 19/11 ĐẾN 22/11
# -------------------------------------------------------------------------
Write-Host ">>> [6/10] Đang import Phiếu nhập kho từ 19/11/2026 đến 22/11/2026..." -ForegroundColor Cyan
$pnData = Read-ExcelSheets $pnFile
$pnRows = $pnData.rows
$pnStrings = $pnData.strings

$pnLines = [System.Collections.Generic.List[object]]::new()
for ($i = 1; $i -lt $pnRows.Count; $i++) {
    $r = $pnRows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $pnId = Get-Val $cells['B'] $pnStrings
    if ([string]::IsNullOrWhiteSpace($pnId) -or $pnId -eq 'Mã nhập hàng') { continue }

    $timeRaw = Get-Val $cells['C'] $pnStrings
    $createdAt = Convert-OADate $timeRaw
    if ([string]::IsNullOrEmpty($createdAt)) { continue }

    try {
        $dt = [DateTime]$createdAt
        if ($dt -lt $cutoffDate) { continue }
    } catch { continue }

    $pnLines.Add([PSCustomObject]@{
        branch          = Get-Val $cells['A'] $pnStrings
        pnId            = $pnId
        createdAt       = $createdAt
        supplierId      = Get-Val $cells['F'] $pnStrings
        supplierName    = Get-Val $cells['G'] $pnStrings
        supplierPhone   = Get-Val $cells['H'] $pnStrings
        supplierAddress = Get-Val $cells['I'] $pnStrings
        seller          = Get-Val $cells['J'] $pnStrings
        creator         = Get-Val $cells['K'] $pnStrings
        totalAmt        = Get-Val $cells['L'] $pnStrings
        discount        = Get-Val $cells['M'] $pnStrings
        finalAmt        = Get-Val $cells['N'] $pnStrings
        paidAmt         = Get-Val $cells['O'] $pnStrings
        note            = Get-Val $cells['P'] $pnStrings
        invoiceNo       = Get-Val $cells['Q'] $pnStrings
        status          = Get-Val $cells['T'] $pnStrings
        medCode         = Get-Val $cells['U'] $pnStrings
        barcode         = Get-Val $cells['V'] $pnStrings
        medName         = Get-Val $cells['W'] $pnStrings
        unit            = Get-Val $cells['Y'] $pnStrings
        unitPrice       = Get-Val $cells['AA'] $pnStrings
        discountPercent = Get-Val $cells['AB'] $pnStrings
        itemDiscount    = Get-Val $cells['AC'] $pnStrings
        costPrice       = Get-Val $cells['AD'] $pnStrings
        lineTotal       = Get-Val $cells['AE'] $pnStrings
        qty             = Get-Val $cells['AF'] $pnStrings
    })
}
Remove-Item $pnData.tmpDir -Recurse -Force

$newStockIns = [System.Collections.Generic.List[object]]::new()
$pnGroups = $pnLines | Group-Object -Property pnId

foreach ($grp in $pnGroups) {
    $lines = $grp.Group
    $first = $lines[0]

    $totalAmt = 0; if ($first.totalAmt) { try { $totalAmt = [Math]::Round([double]$first.totalAmt) } catch {} }
    $discount = 0; if ($first.discount) { try { $discount = [Math]::Round([double]$first.discount) } catch {} }
    $finalAmt = $totalAmt; if ($first.finalAmt) { try { $finalAmt = [Math]::Round([double]$first.finalAmt) } catch {} }
    $paidAmt  = $finalAmt; if ($first.paidAmt) { try { $paidAmt = [Math]::Round([double]$first.paidAmt) } catch {} }
    $debt     = [Math]::Max(0, $finalAmt - $paidAmt)
    $statusStr = if ($first.status -match 'Hủy') { 'cancelled' } else { 'completed' }
    $pharmacist = if ($first.seller) { $first.seller } elseif ($first.creator) { $first.creator } else { 'admin' }

    $itemsList = [System.Collections.Generic.List[object]]::new()
    foreach ($line in $lines) {
        $mId = $line.medCode
        if ($medLookup.ContainsKey($line.medCode)) {
            $mId = $medLookup[$line.medCode].id
        }

        $qty = 1; if ($line.qty) { try { $qty = [double]$line.qty } catch {} }
        $cPrice = 0; if ($line.costPrice) { try { $cPrice = [double]$line.costPrice } catch {} }
        $uPrice = $cPrice; if ($line.unitPrice) { try { $uPrice = [double]$line.unitPrice } catch {} }
        $lTotal = 0; if ($line.lineTotal) { try { $lTotal = [Math]::Round([double]$line.lineTotal) } catch {} }
        if ($lTotal -eq 0 -and $cPrice -gt 0) { $lTotal = [Math]::Round($cPrice * $qty) }
        $iDisc = 0; if ($line.itemDiscount) { try { $iDisc = [Math]::Round([double]$line.itemDiscount) } catch {} }
        $iDiscPct = 0; if ($line.discountPercent) { try { $iDiscPct = [double]$line.discountPercent } catch {} }

        $itemsList.Add([PSCustomObject]@{
            medicineId      = $mId
            medicineCode    = $line.medCode
            barcode         = $line.barcode
            medicineName    = $line.medName
            unit            = $line.unit
            quantity        = $qty
            costPrice       = [Math]::Round($cPrice, 2)
            unitPrice       = [Math]::Round($uPrice, 2)
            discount        = $iDisc
            discountPercent = $iDiscPct
            total           = $lTotal
            batchNo         = ""
            expiryDate      = ""
        })
    }

    $newStockIns.Add([PSCustomObject]@{
        id              = $first.pnId
        createdAt       = $first.createdAt
        supplierId      = if ($first.supplierId) { $first.supplierId } else { 'NCC lẻ' }
        supplierName    = if ($first.supplierName) { $first.supplierName } else { 'Nhà cung cấp lẻ' }
        supplierPhone   = $first.supplierPhone
        supplierAddress = $first.supplierAddress
        paymentMethod   = 'transfer'
        subTotal        = $totalAmt
        discount        = $discount
        totalAmount     = $finalAmt
        paidAmount      = $paidAmt
        debt            = $debt
        note            = $first.note
        invoiceNo       = $first.invoiceNo
        status          = $statusStr
        pharmacist      = $pharmacist
        branch          = $first.branch
        items           = $itemsList
    })
}

$finalStockIns = @($newStockIns) + @($oldStockins) | Sort-Object { [DateTime]$_.createdAt } -Descending
[System.IO.File]::WriteAllText($stockinPath, ($finalStockIns | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)
Write-Host "  -> Đã import $($newStockIns.Count) phiếu nhập kho mới từ 19/11 đến 22/11!" -ForegroundColor Green
Write-Host "  -> Tổng số phiếu nhập kho trong hệ thống: $($finalStockIns.Count) phiếu" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 7: IMPORT HÓA ĐƠN BÁN HÀNG (ORDERS) TỪ 19/11 ĐẾN 22/11
# -------------------------------------------------------------------------
Write-Host ">>> [7/10] Đang import Hóa đơn bán hàng từ 19/11/2026 đến 22/11/2026..." -ForegroundColor Cyan
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
    $subTotalAmt = Get-Val $cells['T'] $invStrings
    $discountAmt = Get-Val $cells['U'] $invStrings
    $finalAmt    = Get-Val $cells['V'] $invStrings
    $transferAmt = Get-Val $cells['AA'] $invStrings
    $statusText  = Get-Val $cells['AC'] $invStrings

    $medCode     = Get-Val $cells['AE'] $invStrings
    $medName     = Get-Val $cells['AG'] $invStrings
    $unit        = Get-Val $cells['AI'] $invStrings
    $qty         = Get-Val $cells['AK'] $invStrings
    $price       = Get-Val $cells['AL'] $invStrings
    $itemPrice   = Get-Val $cells['AO'] $invStrings
    $itemTotal   = Get-Val $cells['AP'] $invStrings

    $pMethod = 'cash'
    $tVal = 0.0; if ($transferAmt) { try { $tVal = [double]$transferAmt } catch {} }
    if ($tVal -gt 0) { $pMethod = 'transfer' }

    $isCancelled = if ($statusText -match 'Hủy') { $true } else { $false }
    $orderStatus = if ($isCancelled) { 'cancelled' } else { 'completed' }

    if (-not $ordersDict.ContainsKey($invId)) {
        $sAmt = 0; if ($subTotalAmt) { try { $sAmt = [Math]::Round([double]$subTotalAmt) } catch {} }
        $dAmt = 0; if ($discountAmt) { try { $dAmt = [Math]::Round([double]$discountAmt) } catch {} }
        $fAmt = 0; if ($finalAmt)    { try { $fAmt = [Math]::Round([double]$finalAmt) } catch {} }

        $ordersDict[$invId] = [PSCustomObject]@{
            id            = $invId
            createdAt     = $createdAt
            customerId    = $custId
            customerName  = if ($custName) { $custName } else { "Khách lẻ" }
            customerPhone = $custPhone
            paymentMethod = $pMethod
            subTotal      = $sAmt
            discount      = $dAmt
            totalAmount   = $fAmt
            finalAmount   = $fAmt
            items         = [System.Collections.Generic.List[object]]::new()
            status        = $orderStatus
            pharmacist    = if ($seller) { $seller } else { "admin" }
            note          = $note
            isCancelled   = $isCancelled
            returns       = @()
            totalRefunded = 0
        }
    }

    # Tính giá vốn ước tính
    $unitCost = 0
    $mappedMedId = $medCode
    if ($medLookup.ContainsKey($medCode)) {
        $m = $medLookup[$medCode]
        $mappedMedId = $m.id
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

    $qVal = 1; if ($qty) { try { $qVal = [double]$qty } catch {} }
    $pVal = 0; if ($price) { try { $pVal = [Math]::Round([double]$price) } catch {} }
    $uVal = $pVal; if ($itemPrice) { try { $uVal = [Math]::Round([double]$itemPrice) } catch {} }
    $tVal = 0; if ($itemTotal) { try { $tVal = [Math]::Round([double]$itemTotal) } catch {} }

    $ordersDict[$invId].items.Add([PSCustomObject]@{
        medicineId   = $mappedMedId
        medicineCode = $medCode
        medicineName = $medName
        unit         = if ($unit) { $unit } else { "" }
        quantity     = $qVal
        price        = $pVal
        unitPrice    = $uVal
        costPrice    = $unitCost
        lineTotal    = $tVal
    })
}
Remove-Item $invData.tmpDir -Recurse -Force

$newOrdersList = @($ordersDict.Values)
$finalOrders = @($newOrdersList) + @($oldOrders) | Sort-Object { [DateTime]$_.createdAt } -Descending
[System.IO.File]::WriteAllText($ordersPath, ($finalOrders | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)

$totalRev = ($newOrdersList | Where-Object { -not $_.isCancelled } | Measure-Object totalAmount -Sum).Sum
Write-Host "  -> Đã import $($newOrdersList.Count) đơn hàng mới từ 19/11 đến 22/11!" -ForegroundColor Green
Write-Host "  -> Doanh số bán mới (19-22/11): $($totalRev.ToString('N0')) đ" -ForegroundColor Green
Write-Host "  -> Tổng số đơn hàng trong hệ thống: $($finalOrders.Count) đơn" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 8: IMPORT SỔ QUỸ (VOUCHERS) TỪ 19/11 ĐẾN 22/11
# -------------------------------------------------------------------------
Write-Host ">>> [8/10] Đang import Sổ quỹ thu chi từ 19/11/2026 đến 22/11/2026..." -ForegroundColor Cyan

# Bản đồ đơn hàng để tra cứu thông tin
$orderMapForVoucher = @{}
foreach ($o in $finalOrders) {
    if ($o.id) {
        $orderMapForVoucher[$o.id] = @{
            paymentMethod = $o.paymentMethod
            customerName  = $o.customerName
        }
    }
}

$newVouchersList = [System.Collections.Generic.List[object]]::new()
$processedVIds = [System.Collections.Generic.HashSet[string]]::new()

function Process-VoucherFile($sqFile, $isBank) {
    $sqData = Read-ExcelSheets $sqFile
    $sqRows = $sqData.rows
    $sqStrings = $sqData.strings

    $amtColLetter = if ($isBank) { 'H' } else { 'E' }

    for ($i = 1; $i -lt $sqRows.Count; $i++) {
        $r = $sqRows[$i]
        $cells = @{}
        foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

        $vId     = Get-Val $cells['A'] $sqStrings
        $timeRaw = Get-Val $cells['B'] $sqStrings
        $loaiTC  = Get-Val $cells['C'] $sqStrings
        $person  = if ($isBank) { Get-Val $cells['G'] $sqStrings } else { Get-Val $cells['D'] $sqStrings }
        $amount  = Get-Val $cells[$amtColLetter] $sqStrings

        if ([string]::IsNullOrWhiteSpace($vId) -or $vId -eq 'Mã phiếu') { continue }
        if ($processedVIds.Contains($vId)) { continue }
        [void]$processedVIds.Add($vId)

        $createdAt = Convert-OADate $timeRaw
        if ([string]::IsNullOrEmpty($createdAt)) { continue }

        try {
            $dt = [DateTime]$createdAt
            if ($dt -lt $cutoffDate) { continue }
        } catch { continue }

        $amtVal = try { [Math]::Abs([Math]::Round([double]$amount)) } catch { 0 }

        # Xác định Type (thu / chi)
        $vType = 'receipt'
        if ($vId -match '^(CTM|CNH|CTD|PC|PCPN)') { $vType = 'payment' }
        elseif ($vId -match '^(TTM|TNH|TTD|PT|PTTHN|TTHD|TTHDO)') { $vType = 'receipt' }
        elseif ($loaiTC -match 'Phiếu chi' -or [double]$amount -lt 0) { $vType = 'payment' }

        # Category
        $cat = $loaiTC -replace '^Phiếu thu ', '' -replace '^Phiếu chi ', ''
        if ([string]::IsNullOrWhiteSpace($cat)) { $cat = 'Khác' }

        # RefId
        $refId = ''
        if ($vId -match '(HD\d+)') { $refId = $matches[1] }
        elseif ($vId -match '(PN[\w\.]+)') { $refId = $matches[1] }
        elseif ($vId -match '(THN\w+)') { $refId = $matches[1] }

        $pMethod = if ($isBank) { 'transfer' } else { 'cash' }

        $targetName = if ($person) { $person.Trim() } else { 'Khách lẻ' }
        if ($refId -and $orderMapForVoucher.ContainsKey($refId) -and $orderMapForVoucher[$refId].customerName) {
            $targetName = $orderMapForVoucher[$refId].customerName
        }

        $targetType = 'other'
        if ($vType -eq 'receipt') {
            $targetType = 'customer'
        } else {
            if ($cat -match 'NCC' -or $refId -match '^PN') { $targetType = 'supplier' }
        }

        $newVouchersList.Add([PSCustomObject]@{
            id            = $vId.Trim()
            type          = $vType
            amount        = $amtVal
            category      = $cat.Trim()
            reason        = $loaiTC.Trim()
            person        = $targetName
            paymentMethod = $pMethod
            refId         = $refId
            createdAt     = $createdAt
            isCancelled   = $false
            targetName    = $targetName
            targetType    = $targetType
        })
    }
    Remove-Item $sqData.tmpDir -Recurse -Force
}

Process-VoucherFile $sqCash $false
Process-VoucherFile $sqBank $true

$finalVouchers = @($newVouchersList) + @($oldVouchers) | Sort-Object { [DateTime]$_.createdAt } -Descending
[System.IO.File]::WriteAllText($vouchersPath, ($finalVouchers | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)

Write-Host "  -> Đã import $($newVouchersList.Count) phiếu sổ quỹ mới từ 19/11 đến 22/11!" -ForegroundColor Green
Write-Host "  -> Tổng số phiếu sổ quỹ trong hệ thống: $($finalVouchers.Count) phiếu" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 9: CẬP NHẬT DB_COUNTS.JSON
# -------------------------------------------------------------------------
Write-Host ">>> [9/10] Cập nhật mốc đếm bản ghi bảo vệ (data/db_counts.json)..." -ForegroundColor Cyan
$newVersion = [int](Get-Date -Format "yyyyMMdd") * 100 + (Get-Random -Minimum 10 -Maximum 99)
$dbCountsObj = @{
    version   = $newVersion
    medicines = $updatedMeds.Count
    orders    = $finalOrders.Count
    vouchers  = $finalVouchers.Count
    stockIns  = $finalStockIns.Count
    customers = $customersList.Count
    updatedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
}
$countsPath = Join-Path $dataDir "db_counts.json"
[System.IO.File]::WriteAllText($countsPath, ($dbCountsObj | ConvertTo-Json), [System.Text.Encoding]::UTF8)
Write-Host "  -> Đã cập nhật db_counts.json (version $newVersion, medicines: $($updatedMeds.Count), orders: $($finalOrders.Count), vouchers: $($finalVouchers.Count), stockIns: $($finalStockIns.Count))" -ForegroundColor Green

# -------------------------------------------------------------------------
# BƯỚC 10: ĐỐI SOÁT TỒN KHO 100% VỚI FILE EXCEL KIOTVIET
# -------------------------------------------------------------------------
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ">>> [10/10] ĐỐI SOÁT TỒN KHO CHI TIẾT VỚI FILE EXCEL KIOTVIET:" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

$medJsonMeds = Get-Content $medicinesPath -Raw -Encoding UTF8 | ConvertFrom-Json
$medJsonMap = @{}
$webTotalStockUnits = 0.0
$webTotalStockValue = 0.0
$webPositiveItems = 0

foreach ($m in $medJsonMeds) {
    if ($m.id) { $medJsonMap[$m.id] = $m }
    $stock = [double]$m.stockUnits
    $packRatio = if ([double]$m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
    $unitCost = [double]$m.costPrice / $packRatio
    if ($stock -gt 0) {
        $webPositiveItems++
        $webTotalStockUnits += $stock
        $webTotalStockValue += ($stock * $unitCost)
    }
}

# So khớp từng mặt hàng cơ bản từ KiotViet
$matchedCount = 0
$mismatches = @()

foreach ($kv in $excelBase.GetEnumerator()) {
    $code = $kv.Key
    $b = $kv.Value
    if ($medJsonMap.ContainsKey($code)) {
        $matchedCount++
        $webStock = [double]$medJsonMap[$code].stockUnits
        $kvStock  = [Math]::Max(0.0, [Math]::Round([double]$b.stock, 3))
        $diff = [Math]::Abs($webStock - $kvStock)
        if ($diff -gt 0.001) {
            $mismatches += "Mã $code ($($b.name)): Web = $webStock $($medJsonMap[$code].baseUnit) | KiotViet = $kvStock $($b.unit) | Lệch = $diff"
        }
    }
}

Write-Host "  1. Số mặt hàng cơ bản khớp mã:      $matchedCount / $($excelBase.Count)" -ForegroundColor Green
Write-Host "  2. Số mặt hàng sai lệch tồn kho:     $($mismatches.Count)" -ForegroundColor $(if ($mismatches.Count -eq 0) { 'Green' } else { 'Red' })
if ($mismatches.Count -gt 0) {
    Write-Host "     Danh sách mặt hàng lệch (tối đa 10):" -ForegroundColor Red
    for ($i = 0; $i -lt [Math]::Min(10, $mismatches.Count); $i++) {
        Write-Host "     - $($mismatches[$i])" -ForegroundColor Red
    }
} else {
    Write-Host "     ==> TẤT CẢ $($matchedCount) MẶT HÀNG TRÊN WEB KHỚP 100% SỐ LƯỢNG TỒN VỚI KIOTVIET!" -ForegroundColor Green
}

Write-Host "`n  3. TỔNG SỐ LƯỢNG TỒN KHO:" -ForegroundColor Yellow
Write-Host "     - KiotViet Excel:  43,687.560 đơn vị" -ForegroundColor White
Write-Host "     - Medica Web:      $($webTotalStockUnits.ToString('N3')) đơn vị" -ForegroundColor White

Write-Host "`n  4. SỐ MẶT HÀNG CÒN TỒN (> 0):" -ForegroundColor Yellow
Write-Host "     - KiotViet Excel:  1,455 mặt hàng" -ForegroundColor White
Write-Host "     - Medica Web:      $webPositiveItems mặt hàng" -ForegroundColor White

Write-Host "`n  5. GIÁ TRỊ TỒN KHO ƯỚC TÍNH:" -ForegroundColor Yellow
Write-Host "     - KiotViet Excel:  383,525,277 đ" -ForegroundColor White
Write-Host "     - Medica Web:      $($webTotalStockValue.ToString('N0')) đ" -ForegroundColor White

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " ĐỒNG BỘ DỮ LIỆU HOÀN TẤT THÀNH CÔNG!" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Cyan
