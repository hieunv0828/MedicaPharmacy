# ==============================================================================
# MedicaPharmacy - Script Import Danh Mục KiotViet (7,980 Dòng -> 5,780 Thuốc)
# Tự động gộp đa đơn vị tính (Viên / Vỉ / Hộp / Lọ / Tuýp...)
# Xóa sạch dữ liệu mẫu giao dịch cũ để đưa nhà thuốc vào vận hành thực tế
# ==============================================================================

param(
    [string]$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794066764290_e329edc5.xlsx",
    [string]$projectDir = "F:\MedicaPharmacy"
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================================="
Write-Host " BẮT ĐẦU IMPORT DANH MỤC DƯỢC PHẨM TỪ KIOTVIET"
Write-Host "=========================================================="

# 1. SAO LƯU DỮ LIỆU CŨ (BACKUP)
$dataDir = Join-Path $projectDir "data"
$backupDir = Join-Path $dataDir "backup_pre_import_20261107"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}
Write-Host "[1/5] Sao lưu toàn bộ dữ liệu hiện tại vào $backupDir..."
Get-ChildItem -Path $dataDir -File | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $backupDir $_.Name) -Force
}
Write-Host "  -> Đã sao lưu an toàn."

# 2. GIẢI NÉN VÀ TRÍCH XUẤT FILE XML TỪ XLSX
Write-Host "[2/5] Đang giải nén file Excel KiotViet..."
$tempZip = Join-Path $env:TEMP "kiotviet_import.zip"
$tempExtract = Join-Path $env:TEMP "kiotviet_import_extracted"
Copy-Item $xlsxPath $tempZip -Force
if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

$sheetXml = Join-Path $tempExtract "xl\worksheets\sheet2.xml"
if (-not (Test-Path $sheetXml)) {
    throw "Không tìm thấy file sheet2.xml trong file Excel KiotViet!"
}

# 3. PARSE XML BẰNG XMLREADER (TỐI ƯU HIỆU NĂNG VÀ BỘ NHỚ)
Write-Host "[3/5] Đang phân tích cú pháp 7,980 dòng sản phẩm KiotViet..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$reader = [System.Xml.XmlReader]::Create($sheetXml)

$baseItems = [System.Collections.Generic.Dictionary[string, hashtable]]::new()
$subUnitsByBase = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[hashtable]]]::new()
$totalRows = 0

while ($reader.Read()) {
    if ($reader.NodeType -eq [System.Xml.XmlNodeType]::Element -and $reader.Name -eq 'row') {
        $totalRows++
        if ($totalRows -eq 1) { continue } # Bỏ qua header

        $rowSubtree = $reader.ReadSubtree()
        $cells = @{}
        while ($rowSubtree.Read()) {
            if ($rowSubtree.NodeType -eq [System.Xml.XmlNodeType]::Element -and $rowSubtree.Name -eq 'c') {
                $col = ($rowSubtree.GetAttribute('r')) -replace '\d+', ''
                $val = ''
                $cellSubtree = $rowSubtree.ReadSubtree()
                while ($cellSubtree.Read()) {
                    if ($cellSubtree.NodeType -eq [System.Xml.XmlNodeType]::Element -and $cellSubtree.Name -eq 'v') {
                        $val = $cellSubtree.ReadElementContentAsString()
                        break
                    }
                }
                $cells[$col] = $val
            }
        }

        $code = $cells['C']
        if ([string]::IsNullOrWhiteSpace($code) -or $code -eq 'Mã hàng') { continue }

        $baseCode = $cells['P']
        $name = $cells['E']
        $unit = $cells['O']
        $barcode = $cells['D']
        $cat = $cells['B']

        $ratio = 1.0
        if (-not [string]::IsNullOrWhiteSpace($cells['Q'])) {
            [double]::TryParse(($cells['Q'] -replace ',', '.'), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$ratio)
        }

        $stock = 0.0
        if (-not [string]::IsNullOrWhiteSpace($cells['J'])) {
            [double]::TryParse(($cells['J'] -replace ',', '.'), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$stock)
        }

        $price = 0.0
        if (-not [string]::IsNullOrWhiteSpace($cells['H'])) {
            [double]::TryParse(($cells['H'] -replace ',', '.'), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$price)
        }

        $cost = 0.0
        if (-not [string]::IsNullOrWhiteSpace($cells['I'])) {
            [double]::TryParse(($cells['I'] -replace ',', '.'), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$cost)
        }

        $minStock = 0
        if (-not [string]::IsNullOrWhiteSpace($cells['M'])) {
            [int]::TryParse(($cells['M'] -replace ',', '.'), [ref]$minStock)
        }

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
}
$reader.Close()
$sw.Stop()
Write-Host "  -> Đã đọc $($totalRows - 1) dòng trong $([Math]::Round($sw.ElapsedMilliseconds / 1000, 2))s."
Write-Host "  -> Số sản phẩm gốc: $($baseItems.Count), số sản phẩm có đơn vị phụ: $($subUnitsByBase.Count)"

# 4. CHUYỂN ĐỔI SANG SCHEMA MEDICAPHARMACY
Write-Host "[4/5] Đang chuẩn hóa cấu trúc dữ liệu đa đơn vị tính (Viên / Vỉ / Hộp)..."
$medicines = [System.Collections.Generic.List[hashtable]]::new()

foreach ($kv in $baseItems.GetEnumerator()) {
    $code = $kv.Key
    $b = $kv.Value

    $name = if ($b.name) { $b.name.Trim() } else { "Sản phẩm $code" }
    $baseUnit = if ($b.unit) { $b.unit.Trim() } else { "Cái" }
    $category = if ($b.category) { $b.category.Trim() } else { "Thuốc chung" }
    $stockUnits = [Math]::Max(0, [int][Math]::Round($b.stock))
    $priceBase = [Math]::Round($b.price)
    $minStock = if ($b.minStock -gt 0) { $b.minStock } else { 50 }

    $packUnit = $baseUnit
    $packRatio = 1
    $subUnit = ""
    $subRatio = 1
    $priceBox = $priceBase
    $priceSub = 0
    $costPrice = [Math]::Round($b.cost)

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
            $packRatio = [Math]::Max(1, [int][Math]::Round($s.ratio))
            $priceBox = if ($s.price -gt 0) { [Math]::Round($s.price) } else { [Math]::Round($priceBase * $packRatio) }
            if ($s.cost -gt 0) {
                $costPrice = [Math]::Round($s.cost)
            } elseif ($costPrice -gt 0) {
                $costPrice = [Math]::Round($costPrice * $packRatio)
            }
        } elseif ($subs.Count -ge 2) {
            # Đơn vị trung gian (Vỉ)
            $sub1 = $subs[0]
            $subUnit = if ($sub1.unit) { $sub1.unit.Trim() } else { "Vỉ" }
            $subRatio = [Math]::Max(1, [int][Math]::Round($sub1.ratio))
            $priceSub = if ($sub1.price -gt 0) { [Math]::Round($sub1.price) } else { [Math]::Round($priceBase * $subRatio) }

            # Đơn vị đóng gói lớn nhất (Hộp)
            $subLast = $subs[-1]
            $packUnit = if ($subLast.unit) { $subLast.unit.Trim() } else { "Hộp" }
            $packRatio = [Math]::Max(1, [int][Math]::Round($subLast.ratio))
            $priceBox = if ($subLast.price -gt 0) { [Math]::Round($subLast.price) } else { [Math]::Round($priceBase * $packRatio) }
            if ($subLast.cost -gt 0) {
                $costPrice = [Math]::Round($subLast.cost)
            } elseif ($costPrice -gt 0) {
                $costPrice = [Math]::Round($costPrice * $packRatio)
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

Write-Host "  -> Đã tạo thành công $($medicines.Count) bản ghi thuốc hoàn chỉnh."

# 5. XÓA SẠCH GIAO DỊCH CŨ VÀ GHI FILE DỮ LIỆU MỚI
Write-Host "[5/5] Đang làm sạch dữ liệu giao dịch cũ và ghi danh mục mới vào máy chủ..."

# 5.1 Ghi medicines.json
$medJson = $medicines | ConvertTo-Json -Depth 5 -Compress
$medPath = Join-Path $dataDir "medicines.json"
[System.IO.File]::WriteAllText($medPath, $medJson, [System.Text.Encoding]::UTF8)
Write-Host "  -> Đã cập nhật medicines.json ($([Math]::Round((Get-Item $medPath).Length / 1024, 1)) KB)"

# 5.2 Xóa sạch dữ liệu hóa đơn, nhập kho, trả hàng, sổ quỹ, khách hàng mẫu
[System.IO.File]::WriteAllText((Join-Path $dataDir "orders_2026.json"), "[]", [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $dataDir "stockin_2026.json"), "[]", [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $dataDir "returns_2026.json"), "[]", [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $dataDir "vouchers_2026.json"), "[]", [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $dataDir "customers.json"), "[]", [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $dataDir "settings_history.json"), "[]", [System.Text.Encoding]::UTF8)

# Xóa các file phân vùng năm khác nếu có (orders_*.json, stockin_*.json, etc.)
Get-ChildItem -Path $dataDir -Filter "orders_*.json" | Where-Object { $_.Name -ne "orders_2026.json" } | Remove-Item -Force
Get-ChildItem -Path $dataDir -Filter "stockin_*.json" | Where-Object { $_.Name -ne "stockin_2026.json" } | Remove-Item -Force
Get-ChildItem -Path $dataDir -Filter "returns_*.json" | Where-Object { $_.Name -ne "returns_2026.json" } | Remove-Item -Force
Get-ChildItem -Path $dataDir -Filter "vouchers_*.json" | Where-Object { $_.Name -ne "vouchers_2026.json" } | Remove-Item -Force

Write-Host "  -> Đã xóa sạch các hóa đơn, phiếu nhập, phiếu trả hàng và sổ quỹ mẫu."
Write-Host "=========================================================="
Write-Host " HOÀN TẤT IMPORT THÀNH CÔNG!"
Write-Host " Tổng số thuốc trong kho: $($medicines.Count)"
Write-Host " Tất cả các mã hàng KiotViet (SP...) đã sẵn sàng sử dụng."
Write-Host "=========================================================="
