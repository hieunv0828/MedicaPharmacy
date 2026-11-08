<#
.SYNOPSIS
    Script Import / Cập nhật Danh mục Thuốc KiotViet vào MedicaPharmacy
.DESCRIPTION
    Đọc file Excel KiotViet (kể cả hàng ngừng kinh doanh), gộp đa đơn vị tính (Viên / Vỉ / Hộp / Lọ...),
    tính toán giá vốn, giá bán, tồn kho chuẩn xác và cập nhật data/medicines.json.
#>

param(
    [string]$xlsxPath = "F:\MedicaPharmacy\imports\DanhSachSanPham_KV08112026-223343-897.xlsx",
    [string]$projectDir = "F:\MedicaPharmacy"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

Write-Host "=========================================================="
Write-Host " BẮT ĐẦU IMPORT DANH MỤC THUỐC TỪ KIOTVIET"
Write-Host " File nguồn: $xlsxPath"
Write-Host "=========================================================="

if (-not (Test-Path $xlsxPath)) {
    throw "Không tìm thấy file nguồn: $xlsxPath"
}

# 1. BACKUP MEDICINES.JSON
$dataDir = Join-Path $projectDir "data"
$medPath = Join-Path $dataDir "medicines.json"
$backupPath = Join-Path $dataDir ("backup_medicines_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".json")

if (Test-Path $medPath) {
    Copy-Item $medPath $backupPath -Force
    Write-Host "[1/4] Đã sao lưu medicines.json hiện tại sang: $backupPath"
}

# 2. TRÍCH XUẤT VÀ ĐỌC FILE EXCEL
Write-Host "[2/4] Đang giải nén và phân tích cấu trúc file Excel..."
$tmp = Join-Path $env:TEMP ('kv_med_imp_' + (Get-Random))
$tempZip = Join-Path $env:TEMP ('kv_med_zip_' + (Get-Random) + '.zip')

$stream = [System.IO.File]::Open($xlsxPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$outStream = [System.IO.File]::Create($tempZip)
$stream.CopyTo($outStream)
$stream.Close()
$outStream.Close()

[System.IO.Compression.ZipFile]::ExtractToDirectory($tempZip, $tmp)
Remove-Item $tempZip -Force

$ssFile = Join-Path $tmp 'xl\sharedStrings.xml'
$strArr = $null
if (Test-Path $ssFile) {
    [xml]$ssXml = Get-Content $ssFile -Encoding UTF8
    $strArr = @($ssXml.sst.si | ForEach-Object {
        if ($_.t) { $_.t } elseif ($_.r) { ($_.r | ForEach-Object { $_.t }) -join '' } else { '' }
    })
}

function Get-Val($cell) {
    if ($null -eq $cell) { return '' }
    if ($cell.is -and $cell.is.t) { return $cell.is.t }
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's' -and $strArr -and $strArr.Count -gt [int]$v) { return $strArr[[int]$v] }
    return $v
}

$sheetFile = (Get-ChildItem (Join-Path $tmp 'xl\worksheets') -Filter 'sheet*.xml' | Sort-Object Length -Descending)[0].FullName
[xml]$ws = Get-Content $sheetFile -Encoding UTF8
$rows = $ws.worksheet.sheetData.row

# Dynamic Header Mapping
$headerRow = $rows[0]
$colMap = @{}
foreach ($c in $headerRow.c) {
    $colLetter = $c.r -replace '\d+', ''
    $colName = (Get-Val $c).Trim()
    $colMap[$colName] = $colLetter
}

function Get-ColLetter($names, $fallback) {
    foreach ($n in $names) {
        if ($colMap.ContainsKey($n)) { return $colMap[$n] }
    }
    return $fallback
}

$colCode     = Get-ColLetter @('Mã hàng') 'C'
$colName     = Get-ColLetter @('Tên hàng') 'E'
$colBaseCode = Get-ColLetter @('Mã ĐVT Cơ bản') 'P'
$colUnit     = Get-ColLetter @('ĐVT') 'O'
$colBarcode  = Get-ColLetter @('Mã vạch') 'D'
$colCat      = Get-ColLetter @('Nhóm hàng(3 Cấp)', 'Nhóm hàng') 'B'
$colRatio    = Get-ColLetter @('Quy đổi') 'Q'
$colStock    = Get-ColLetter @('Tồn kho') 'J'
$colCost     = Get-ColLetter @('Giá vốn') 'I'
$colPrice    = Get-ColLetter @('Giá bán') 'H'
$colMinStock = Get-ColLetter @('Tồn nhỏ nhất') 'M'

$baseItems = [System.Collections.Generic.Dictionary[string, hashtable]]::new()
$subUnitsByBase = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[hashtable]]]::new()

for ($i = 1; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $code = Get-Val $cells[$colCode]
    if ([string]::IsNullOrWhiteSpace($code) -or $code -eq 'Mã hàng') { continue }

    $baseCode = Get-Val $cells[$colBaseCode]
    $name     = Get-Val $cells[$colName]
    $unit     = Get-Val $cells[$colUnit]
    $barcode  = Get-Val $cells[$colBarcode]
    $cat      = Get-Val $cells[$colCat]

    $ratio = 1.0; try { $val = Get-Val $cells[$colRatio]; if ($val) { $ratio = [double]$val } } catch {}
    $stock = 0.0; try { $val = Get-Val $cells[$colStock]; if ($val) { $stock = [double]$val } } catch {}
    $price = 0.0; try { $val = Get-Val $cells[$colPrice]; if ($val) { $price = [double]$val } } catch {}
    $cost  = 0.0; try { $val = Get-Val $cells[$colCost];  if ($val) { $cost  = [double]$val } } catch {}
    $minStock = 0; try { $val = Get-Val $cells[$colMinStock]; if ($val) { $minStock = [int]$val } } catch {}

    if ([string]::IsNullOrWhiteSpace($baseCode)) {
        $baseItems[$code] = @{
            id = $code
            name = $name
            barcode = $barcode
            category = $cat
            unit = $unit
            stock = $stock
            price = $price
            cost = $cost
            minStock = $minStock
        }
    } else {
        if (-not $subUnitsByBase.ContainsKey($baseCode)) {
            $subUnitsByBase[$baseCode] = [System.Collections.Generic.List[hashtable]]::new()
        }
        $subUnitsByBase[$baseCode].Add(@{
            code = $code
            unit = $unit
            ratio = $ratio
            stock = $stock
            price = $price
            cost = $cost
            barcode = $barcode
        })
    }
}
Remove-Item $tmp -Recurse -Force
Write-Host "  -> Đã đọc $($rows.Count - 1) dòng: $($baseItems.Count) mặt hàng cơ bản, $($subUnitsByBase.Count) mặt hàng có ĐVT phụ."

# 3. CHUYỂN ĐỔI SANG SCHEMA MEDICAPHARMACY
Write-Host "[3/4] Đang chuẩn hóa cấu trúc dữ liệu đa đơn vị tính và giá vốn..."
$medicines = [System.Collections.Generic.List[hashtable]]::new()

foreach ($kv in $baseItems.GetEnumerator()) {
    $code = $kv.Key
    $b = $kv.Value

    $name = if ($b.name) { $b.name.Trim() } else { "Sản phẩm $code" }
    $baseUnit = if ($b.unit) { $b.unit.Trim() } else { "Cái" }
    $category = if ($b.category) { $b.category.Trim() } else { "Thuốc chung" }
    $stockUnits = [Math]::Max(0.0, [Math]::Round($b.stock, 3))
    $priceBase = [Math]::Round($b.price)
    $minStock = if ($b.minStock -gt 0) { $b.minStock } else { 50 }

    $packUnit = $baseUnit
    $packRatio = 1.0
    $subUnit = ""
    $subRatio = 1.0
    $priceBox = $priceBase
    $priceSub = 0
    $costPrice = [Math]::Round($b.cost, 2)

    $extraBarcodes = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($b.barcode)) {
        [void]$extraBarcodes.Add($b.barcode.Trim())
    }

    if ($subUnitsByBase.ContainsKey($code)) {
        $subs = $subUnitsByBase[$code]
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
            $packUnit = if ($s.unit) { $s.unit.Trim() } else { "Hộp" }
            $packRatio = if ($s.ratio -gt 0) { [double]$s.ratio } else { 1.0 }
            $priceBox = if ($s.price -gt 0) { [Math]::Round($s.price) } else { [Math]::Round($priceBase * $packRatio) }
            if ($s.cost -gt 0) {
                $costPrice = [Math]::Round($s.cost, 2)
            } elseif ($b.cost -gt 0) {
                $costPrice = [Math]::Round($b.cost * $packRatio, 2)
            }
        } elseif ($subs.Count -ge 2) {
            $sub1 = $subs[0]
            $subUnit = if ($sub1.unit) { $sub1.unit.Trim() } else { "Vỉ" }
            $subRatio = if ($sub1.ratio -gt 0) { [double]$sub1.ratio } else { 1.0 }
            $priceSub = if ($sub1.price -gt 0) { [Math]::Round($sub1.price) } else { [Math]::Round($priceBase * $subRatio) }

            $subLast = $subs[-1]
            $packUnit = if ($subLast.unit) { $subLast.unit.Trim() } else { "Hộp" }
            $packRatio = if ($subLast.ratio -gt 0) { [double]$subLast.ratio } else { 1.0 }
            $priceBox = if ($subLast.price -gt 0) { [Math]::Round($subLast.price) } else { [Math]::Round($priceBase * $packRatio) }
            if ($subLast.cost -gt 0) {
                $costPrice = [Math]::Round($subLast.cost, 2)
            } elseif ($b.cost -gt 0) {
                $costPrice = [Math]::Round($b.cost * $packRatio, 2)
            }
        }
    }

    if ($packRatio -eq 1 -and $priceBox -eq 0 -and $priceBase -gt 0) {
        $priceBox = $priceBase
    }
    if ($priceBase -eq 0 -and $priceBox -gt 0 -and $packRatio -gt 0) {
        $priceBase = [Math]::Round($priceBox / $packRatio)
    }

    $barcodeStr = ($extraBarcodes | Select-Object -Unique) -join ', '

    $med = @{
        id = $code
        name = $name
        barcode = $barcodeStr
        activeIngredient = ""
        category = $category
        supplierId = ""
        baseUnit = $baseUnit
        packUnit = $packUnit
        packRatio = $packRatio
        subUnit = $subUnit
        subRatio = $subRatio
        costPrice = $costPrice
        priceBox = $priceBox
        priceSub = $priceSub
        priceBase = $priceBase
        stockUnits = $stockUnits
        minStock = $minStock
        batchNo = ""
        expiryDate = ""
        usageDefault = ""
    }

    [void]$medicines.Add($med)
}

# 4. GHI FILE MEDICINES.JSON
Write-Host "[4/4] Đang ghi dữ liệu vào data/medicines.json..."
$medJson = $medicines | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText($medPath, $medJson, [System.Text.Encoding]::UTF8)

# 5. TÍNH TOÁN VÀ BÁO CÁO TỒN KHO TRÊN WEB
$webTotalStockValue = 0.0
$webLowStock = 0
$webPositiveItems = 0
$webTotalStockUnits = 0.0

foreach ($m in $medicines) {
    $stock = [double]$m.stockUnits
    $packRatio = if ([double]$m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
    $costPerUnit = [double]$m.costPrice / $packRatio
    $val = [Math]::Round($costPerUnit * $stock)
    $webTotalStockValue += $val
    if ($stock -gt 0) {
        $webPositiveItems++
        $webTotalStockUnits += $stock
    }
    if ($stock -le $m.minStock) {
        $webLowStock++
    }
}

Write-Host "=========================================================="
Write-Host " HOÀN TẤT IMPORT THÀNH CÔNG!"
Write-Host " Tổng số mặt hàng trong danh mục thuốc: $($medicines.Count) mặt hàng"
Write-Host " Số mặt hàng còn tồn kho (> 0):         $webPositiveItems mặt hàng"
Write-Host " Tổng số lượng tồn kho:                 $($webTotalStockUnits.ToString('N3')) đơn vị"
Write-Host " GIÁ TRỊ TỒN KHO HIỂN THỊ TRÊN WEB:     $($webTotalStockValue.ToString('N0')) VNĐ ($([Math]::Round($webTotalStockValue / 1e6, 2)) triệu VNĐ)"
Write-Host "=========================================================="
