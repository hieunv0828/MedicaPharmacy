param(
    [string]$xlsxPath = "F:\MedicaPharmacy\imports\DanhSachSanPham_KV08112026-223343-897.xlsx",
    [string]$medJsonPath = "F:\MedicaPharmacy\data\medicines.json"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

Write-Host "=========================================================="
Write-Host " CẬP NHẬT GIÁ VỐN MEDICINES.JSON TỪ FILE EXCEL KIOTVIET"
Write-Host " File Excel: $xlsxPath"
Write-Host " File JSON:  $medJsonPath"
Write-Host "=========================================================="

if (-not (Test-Path $xlsxPath)) { throw "Không tìm thấy file Excel: $xlsxPath" }
if (-not (Test-Path $medJsonPath)) { throw "Không tìm thấy file JSON: $medJsonPath" }

# 1. SAO LƯU FILE MEDICINES.JSON
$bakTimestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$bakPath = "F:\MedicaPharmacy\data\backup_medicines_before_cost_sync_${bakTimestamp}.json"
Copy-Item $medJsonPath $bakPath -Force
Write-Host "[1/4] Đã sao lưu medicines.json sang: $bakPath"

# 2. GIẢI NÉN VÀ ĐỌC FILE EXCEL
Write-Host "[2/4] Đang phân tích file Excel KiotViet..."
$tmp = Join-Path $env:TEMP ('kv_sync_cost_' + (Get-Random))
$tempZip = Join-Path $env:TEMP ('kv_sync_zip_' + (Get-Random) + '.zip')
Copy-Item $xlsxPath $tempZip
[System.IO.Compression.ZipFile]::ExtractToDirectory($tempZip, $tmp)
Remove-Item $tempZip

$ssFile = Join-Path $tmp 'xl\sharedStrings.xml'
[xml]$ssXml = Get-Content $ssFile -Encoding UTF8
$strArr = @($ssXml.sst.si | ForEach-Object {
    if ($_.t) { $_.t } elseif ($_.r) { ($_.r | ForEach-Object { $_.t }) -join '' } else { '' }
})

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

$excelItems = @{}
$excelSubUnits = @{}

for ($i = 1; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    $cells = @{}
    foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

    $code = Get-Val $cells['C']
    if ([string]::IsNullOrWhiteSpace($code) -or $code -eq 'Mã hàng') { continue }

    $baseCode = Get-Val $cells['P']
    $name     = Get-Val $cells['E']
    $unit     = Get-Val $cells['O']
    $ratio = 1.0; try { $val = Get-Val $cells['Q']; if ($val) { $ratio = [double]$val } } catch {}
    $cost  = 0.0; try { $val = Get-Val $cells['I']; if ($val) { $cost  = [double]$val } } catch {}

    if ([string]::IsNullOrWhiteSpace($baseCode)) {
        $excelItems[$code] = @{
            code = $code
            name = $name
            unit = $unit
            cost = $cost
        }
    } else {
        if (-not $excelSubUnits.ContainsKey($baseCode)) {
            $excelSubUnits[$baseCode] = [System.Collections.Generic.List[hashtable]]::new()
        }
        $excelSubUnits[$baseCode].Add(@{
            code = $code
            baseCode = $baseCode
            name = $name
            unit = $unit
            ratio = $ratio
            cost = $cost
        })
    }
}
Remove-Item $tmp -Recurse -Force
Write-Host "  -> Đã đọc $($excelItems.Count) mặt hàng cơ bản và $($excelSubUnits.Count) mặt hàng có ĐVT phụ."

# 3. CẬP NHẬT GIÁ VỐN VÀO MEDICINES
Write-Host "[3/4] Đang cập nhật giá vốn chính xác (giữ nguyên số lẻ thập phân)..."
$medicines = Get-Content $medJsonPath -Raw | ConvertFrom-Json
$updatedCount = 0
$totalInventoryVal = 0.0

foreach ($m in $medicines) {
    $code = $m.id
    if (-not $excelItems.ContainsKey($code)) {
        # Thuốc tạo thủ công (ví dụ MED753066, MED534735) -> Giữ nguyên
        $packRatio = if ($m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
        $totalInventoryVal += ([double]$m.stockUnits * ([double]$m.costPrice / $packRatio))
        continue
    }

    $b = $excelItems[$code]
    $newCost = [double]$b.cost

    if ($excelSubUnits.ContainsKey($code)) {
        $subs = $excelSubUnits[$code]
        $packSub = $subs | Where-Object { $_.unit.Trim().ToLower() -eq $m.packUnit.Trim().ToLower() }
        if ($packSub -and $packSub.cost -gt 0) {
            $newCost = [double]$packSub.cost
        } elseif ($b.cost -gt 0 -and $m.packRatio -gt 1) {
            $newCost = [double]$b.cost * [double]$m.packRatio
        }
    }

    # Giữ độ chính xác 2 chữ số thập phân chuẩn KiotViet
    $newCost = [Math]::Round($newCost, 2)

    # Nếu Excel để 0 mà hệ thống đang có giá vốn > 0 thì giữ giá vốn hệ thống
    if ($newCost -eq 0 -and [double]$m.costPrice -gt 0) {
        $newCost = [double]$m.costPrice
    }

    $oldCost = [double]$m.costPrice
    if ([Math]::Abs($oldCost - $newCost) -gt 0.001) {
        $m.costPrice = $newCost
        $updatedCount++
    } else {
        $m.costPrice = $newCost
    }

    $packRatio = if ($m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
    if ($m.stockUnits -gt 0 -and $newCost -gt 0) {
        $totalInventoryVal += ([double]$m.stockUnits * ($newCost / $packRatio))
    }
}

Write-Host "  -> Tổng số mặt hàng được cập nhật giá vốn: $updatedCount"
Write-Host "  -> Giá trị tồn kho ước tính mới: $([Math]::Round($totalInventoryVal, 2).ToString('N2')) đ"

# 4. GHI FILE MEDICINES.JSON
Write-Host "[4/4] Đang ghi dữ liệu vào medicines.json..."
$jsonContent = $medicines | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText($medJsonPath, $jsonContent, [System.Text.Encoding]::UTF8)

Write-Host "=========================================================="
Write-Host " HOÀN TẤT CẬP NHẬT GIÁ VỐN THÀNH CÔNG!"
Write-Host "=========================================================="
