/**
 * MedicaPharmacy - Barcode Label Printer Module
 * Chuyên in tem mã vạch dán hộp thuốc chuẩn quầy thuốc GPP
 * Hỗ trợ mẫu giấy cuộn 3 nhãn (Khổ giấy in nhãn 104x22mm / 4.2x0.9 Inch) theo đúng yêu cầu thực tế
 */

window.BarcodePrinterModule = {
    // Danh sách mặt hàng đang chuẩn bị in tem
    printQueue: [], // Array: { id, medicineId, name, unit, barcode, price, quantity, batchNo, expiryDate }
    
    // Mẫu giấy in tem (mặc định: cuộn 3 tem 104x22mm theo ảnh thực tế)
    currentTemplate: 'roll_3_104x22',

    // Cấu hình hiển thị trên nhãn tem
    options: {
        showName: true,
        showUnit: true,
        showBarcode: true,
        showCodeText: true,
        showPrice: true,
        showPharmacyName: false,
        pharmacyName: 'MEDICA PHARMACY'
    },

    // Cấu hình các loại khổ giấy tem phổ biến trong nhà thuốc
    templates: {
        'roll_3_104x22': {
            id: 'roll_3_104x22',
            name: 'Mẫu giấy cuộn 3 nhãn (Khổ giấy in nhãn 104×22mm / 4.2×0.9 Inch)',
            description: 'Chuẩn máy in tem mã vạch quầy thuốc (Xprinter, Bixolon, Godex...). 3 tem / hàng.',
            labelsPerRow: 3,
            pageWidthMm: 104,
            pageHeightMm: 22,
            labelWidthMm: 33,
            labelHeightMm: 21,
            barcodeHeight: 24,
            barcodeWidth: 1.15
        },
        'roll_2_72x22': {
            id: 'roll_2_72x22',
            name: 'Mẫu giấy cuộn 2 nhãn (Khổ giấy 72×22mm)',
            description: 'Cuộn 2 tem / hàng (khổ 72mm).',
            labelsPerRow: 2,
            pageWidthMm: 72,
            pageHeightMm: 22,
            labelWidthMm: 34,
            labelHeightMm: 21,
            barcodeHeight: 24,
            barcodeWidth: 1.15
        },
        'roll_1_35x22': {
            id: 'roll_1_35x22',
            name: 'Mẫu giấy cuộn 1 nhãn nhỏ (Khổ 35×22mm)',
            description: 'Máy in tem mini khổ đơn 35mm.',
            labelsPerRow: 1,
            pageWidthMm: 35,
            pageHeightMm: 22,
            labelWidthMm: 33,
            labelHeightMm: 21,
            barcodeHeight: 24,
            barcodeWidth: 1.15
        },
        'roll_1_50x30': {
            id: 'roll_1_50x30',
            name: 'Mẫu giấy cuộn 1 nhãn lớn (Khổ 50×30mm)',
            description: 'Tem nhãn kích thước lớn 50x30mm.',
            labelsPerRow: 1,
            pageWidthMm: 50,
            pageHeightMm: 30,
            labelWidthMm: 48,
            labelHeightMm: 28,
            barcodeHeight: 32,
            barcodeWidth: 1.3
        },
        'sheet_a4_65': {
            id: 'sheet_a4_65',
            name: 'Mẫu giấy Decal A4 (65 tem/tờ - Tommys 145)',
            description: 'Dành cho máy in văn phòng thông thường (5 tem / hàng x 13 hàng).',
            labelsPerRow: 5,
            pageWidthMm: 210,
            pageHeightMm: 297,
            labelWidthMm: 38,
            labelHeightMm: 21,
            barcodeHeight: 24,
            barcodeWidth: 1.15
        }
    },

    currentPromptOrder: null,

    init() {
        console.log('🏷️ Khởi tạo Module In Tem Mã Vạch (104x22mm)...');
        this.bindEvents();
    },

    bindEvents() {
        // Lắng nghe thay đổi mẫu tem
        const tplSelect = document.getElementById('barcode-template-select');
        if (tplSelect) {
            tplSelect.addEventListener('change', (e) => {
                this.currentTemplate = e.target.value;
                this.renderLivePreview();
            });
        }
    },

    // --- SINH MÃ VẠCH SVG (CODE 128 CHUẨN GPP) ---
    generateBarcodeSVG(codeText) {
        codeText = (codeText || 'SP000000').toString().trim().toUpperCase();
        if (!codeText) codeText = 'SP000000';

        if (typeof JsBarcode === 'function') {
            try {
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                const tpl = this.templates[this.currentTemplate] || this.templates['roll_3_104x22'];
                JsBarcode(svg, codeText, {
                    format: "CODE128",
                    width: tpl.barcodeWidth || 1.15,
                    height: tpl.barcodeHeight || 24,
                    displayValue: false, // Tự render text bên dưới để căn chỉnh đẹp tuyệt đối
                    margin: 0,
                    background: "transparent",
                    lineColor: "#000000"
                });
                return svg.outerHTML;
            } catch(e) {
                console.warn('JsBarcode parse error cho mã:', codeText, e);
            }
        }

        // Fallback SVG nếu thư viện chưa sẵn sàng
        return this.renderFallbackBarcodeSVG(codeText);
    },

    renderFallbackBarcodeSVG(codeText) {
        // Mô phỏng mã vạch đen trắng sắc nét
        return `
            <svg viewBox="0 0 100 24" width="100%" height="24" xmlns="http://www.w3.org/2000/svg" style="max-height: 8mm;">
                <rect x="0" y="0" width="3" height="24" fill="#000"/>
                <rect x="5" y="0" width="2" height="24" fill="#000"/>
                <rect x="9" y="0" width="4" height="24" fill="#000"/>
                <rect x="15" y="0" width="1" height="24" fill="#000"/>
                <rect x="18" y="0" width="3" height="24" fill="#000"/>
                <rect x="23" y="0" width="2" height="24" fill="#000"/>
                <rect x="27" y="0" width="5" height="24" fill="#000"/>
                <rect x="34" y="0" width="2" height="24" fill="#000"/>
                <rect x="38" y="0" width="3" height="24" fill="#000"/>
                <rect x="43" y="0" width="1" height="24" fill="#000"/>
                <rect x="46" y="0" width="4" height="24" fill="#000"/>
                <rect x="52" y="0" width="2" height="24" fill="#000"/>
                <rect x="56" y="0" width="3" height="24" fill="#000"/>
                <rect x="61" y="0" width="1" height="24" fill="#000"/>
                <rect x="64" y="0" width="4" height="24" fill="#000"/>
                <rect x="70" y="0" width="2" height="24" fill="#000"/>
                <rect x="74" y="0" width="5" height="24" fill="#000"/>
                <rect x="81" y="0" width="2" height="24" fill="#000"/>
                <rect x="85" y="0" width="3" height="24" fill="#000"/>
                <rect x="90" y="0" width="2" height="24" fill="#000"/>
                <rect x="94" y="0" width="4" height="24" fill="#000"/>
            </svg>
        `;
    },

    // --- HTML RENDER TỪNG TEM ĐƠN LẺ (CHUẨN THEO ẢNH NGƯỜI DÙNG) ---
    renderSingleLabelHTML(item, isPreview = false) {
        const title = item.name || 'Thuốc chưa đặt tên';
        const unitText = item.unit ? `(${item.unit})` : '';
        const barcodeCode = item.barcode || item.medicineId || 'SP000000';
        const priceNum = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
        const priceFormatted = (priceNum).toLocaleString('vi-VN') + ' VNĐ';
        const barcodeSvg = this.generateBarcodeSVG(barcodeCode);

        // Khung viền tem: khi xem preview hiển thị viền bo góc nhẹ như ảnh bóc dán thực tế, khi in thì sạch sẽ
        const borderStyle = isPreview 
            ? 'border border-slate-300 rounded-lg shadow-2xs hover:border-purple-400 bg-white transition hover:shadow-xs' 
            : 'bg-white';

        return `
            <div class="barcode-label-box ${borderStyle}" 
                 style="width: 33mm; height: 21mm; max-height: 21mm; box-sizing: border-box; padding: 0.8mm 1.2mm; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; overflow: hidden; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                
                <!-- Dòng 1: Tên sản phẩm / thuốc -->
                <div class="label-name" style="font-size: 7.5pt; font-weight: 700; color: #0f172a; line-height: 1.15; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${title}">
                    ${title}
                </div>

                <!-- Dòng 2: Đơn vị tính e.g. (Hộp) -->
                ${this.options.showUnit && unitText ? `
                    <div class="label-unit" style="font-size: 6.5pt; font-weight: 600; color: #475569; line-height: 1; margin-top: 0.2mm;">
                        ${unitText}
                    </div>
                ` : ''}

                <!-- Dòng 3: Mã vạch Barcode SVG -->
                <div class="label-barcode-wrapper" style="width: 100%; height: 7.5mm; display: flex; justify-content: center; align-items: center; overflow: hidden; margin-top: 0.3mm;">
                    ${barcodeSvg}
                </div>

                <!-- Dòng 4: Mã SP e.g. SP026915 -->
                <div class="label-code" style="font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 6.5pt; font-weight: 700; color: #000000; letter-spacing: 0.5px; line-height: 1; margin-top: 0.2mm;">
                    ${barcodeCode}
                </div>

                <!-- Dòng 5: Giá bán lẻ in đậm nổi bật e.g. 389,000 VNĐ -->
                ${this.options.showPrice ? `
                    <div class="label-price" style="font-size: 9pt; font-weight: 900; color: #000000; line-height: 1.15; margin-top: 0.3mm; letter-spacing: -0.2px;">
                        ${priceFormatted}
                    </div>
                ` : ''}
            </div>
        `;
    },

    // --- MỞ MODAL IN TEM MÃ VẠCH ---
    openPrintModal(items = [], sourceTitle = 'In Tem Mã Vạch') {
        const modal = document.getElementById('modal-barcode-print');
        if (!modal) return;

        // Chuẩn hóa danh sách in tem
        this.printQueue = items.map((it, idx) => {
            const med = Store.getMedicineById(it.medicineId) || {};
            return {
                id: it.id || `item_${idx}_${Date.now()}`,
                medicineId: it.medicineId || med.id || '',
                name: it.medicineName || it.name || med.name || 'Thuốc chưa đặt tên',
                unit: it.unit || med.packUnit || 'Hộp',
                barcode: it.barcode || med.barcode || med.id || `SP${String(idx + 1).padStart(5, '0')}`,
                price: typeof it.price === 'number' ? it.price : (med.priceBox || med.price || 0),
                quantity: parseInt(it.quantity) || 1
            };
        });

        const titleEl = document.getElementById('barcode-modal-title');
        if (titleEl) titleEl.innerText = sourceTitle;

        // Điền mẫu giấy mặc định
        const tplSelect = document.getElementById('barcode-template-select');
        if (tplSelect) tplSelect.value = this.currentTemplate;

        // Hiển thị modal
        modal.classList.remove('hidden');

        // Nạp bảng danh sách bên trái và bản xem trước bên phải
        this.renderQueueTable();
        this.renderLivePreview();

        if (window.lucide) lucide.createIcons();
    },

    closePrintModal() {
        const modal = document.getElementById('modal-barcode-print');
        if (modal) modal.classList.add('hidden');
    },

    // --- GỢI Ý IN TEM TỰ ĐỘNG SAU KHI NHẬP THUỐC ---
    promptPrintAfterStockIn(stockInOrder) {
        if (!stockInOrder || !stockInOrder.items || stockInOrder.items.length === 0) return;

        this.currentPromptOrder = stockInOrder;

        const modal = document.getElementById('modal-stockin-print-prompt');
        if (!modal) {
            // Nếu chưa có modal prompt thì mở thẳng modal in tem
            this.openForStockInOrder(stockInOrder.id);
            return;
        }

        const idEl = document.getElementById('stockin-prompt-id');
        const typesEl = document.getElementById('stockin-prompt-types');
        const qtyEl = document.getElementById('stockin-prompt-qty');

        if (idEl) idEl.innerText = stockInOrder.id;
        if (typesEl) typesEl.innerText = `${stockInOrder.items.length} loại thuốc`;
        
        const totalQty = stockInOrder.items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
        if (qtyEl) qtyEl.innerText = `${totalQty} hộp / chai`;

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closePromptModal() {
        document.getElementById('modal-stockin-print-prompt')?.classList.add('hidden');
        this.currentPromptOrder = null;
    },

    confirmPromptPrint() {
        const order = this.currentPromptOrder;
        this.closePromptModal();
        if (order) {
            this.openForStockInOrder(order.id);
        }
    },

    // --- CÁC HÀM TIỆN ÍCH MỞ IN TỪ CÁC VỊ TRÍ KHÁC NHAU ---

    // 1. In tem từ Phiếu nhập kho đã lưu
    openForStockInOrder(orderId) {
        const orders = Store.getStockInOrders();
        const o = orders.find(x => x.id === orderId);
        if (!o || !o.items) {
            alert('Không tìm thấy thông tin phiếu nhập kho!');
            return;
        }

        const items = o.items.map(it => {
            const med = Store.getMedicineById(it.medicineId) || {};
            return {
                medicineId: it.medicineId,
                name: it.medicineName || med.name,
                unit: it.unit || med.packUnit || 'Hộp',
                barcode: med.barcode || it.medicineId,
                price: med.priceBox || med.price || 0,
                quantity: it.quantity || 1
            };
        });

        this.openPrintModal(items, `In Tem Mã Vạch Phiếu Nhập ${o.id}`);
    },

    // 2. In tem trực tiếp từ Bản nháp Lập phiếu nhập kho
    openForStockInDraft() {
        if (!window.InventoryModule || !InventoryModule.stockInDraft || !InventoryModule.stockInDraft.items || InventoryModule.stockInDraft.items.length === 0) {
            alert('Chưa có mặt hàng nào trong phiếu nhập kho!');
            return;
        }

        const items = InventoryModule.stockInDraft.items.map(it => {
            const med = Store.getMedicineById(it.medicineId) || {};
            return {
                medicineId: it.medicineId,
                name: it.medicineName || med.name,
                unit: it.unit || med.packUnit || 'Hộp',
                barcode: med.barcode || it.medicineId,
                price: med.priceBox || med.price || 0,
                quantity: it.quantity || 1
            };
        });

        this.openPrintModal(items, 'In Tem Mã Vạch Từ Phiếu Nhập');
    },

    // 3. In tem cho một loại thuốc cụ thể từ Kho thuốc
    openForMedicine(medicineId, defaultQty = 1) {
        const med = Store.getMedicineById(medicineId);
        if (!med) {
            alert('Không tìm thấy thông tin thuốc!');
            return;
        }

        const items = [{
            medicineId: med.id,
            name: med.name,
            unit: med.packUnit || 'Hộp',
            barcode: med.barcode || med.id,
            price: med.priceBox || med.price || 0,
            quantity: defaultQty
        }];

        this.openPrintModal(items, `In Tem Mã Vạch: ${med.name}`);
    },

    // 4. Mở in tem hàng loạt cho kho thuốc
    openBatchInventoryModal() {
        const medicines = Store.getMedicines().slice(0, 5); // Lấy 5 thuốc mẫu
        const items = medicines.map(m => ({
            medicineId: m.id,
            name: m.name,
            unit: m.packUnit || 'Hộp',
            barcode: m.barcode || m.id,
            price: m.priceBox || m.price || 0,
            quantity: 1
        }));
        this.openPrintModal(items, 'In Tem Mã Vạch Kho Thuốc');
    },

    // --- QUẢN LÝ DANH SÁCH HÀNG IN BÊN TRÁI ---
    renderQueueTable() {
        const tbody = document.getElementById('barcode-queue-tbody');
        if (!tbody) return;

        if (this.printQueue.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-slate-400 text-xs">
                        Chưa có mặt hàng nào. Vui lòng thêm thuốc cần in tem.
                    </td>
                </tr>
            `;
            this.updateSummaryText();
            return;
        }

        let html = '';
        this.printQueue.forEach((item, index) => {
            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50/70 text-xs transition">
                    <!-- Tên thuốc & đơn vị -->
                    <td class="p-2.5">
                        <div class="font-bold text-slate-800 line-clamp-1" title="${item.name}">${item.name}</div>
                        <div class="text-[10px] text-slate-400 font-medium">Quy cách: <span class="text-emerald-700 font-bold">${item.unit}</span></div>
                    </td>

                    <!-- Mã vạch / SKU -->
                    <td class="p-2.5">
                        <input type="text" value="${item.barcode}" oninput="BarcodePrinterModule.updateItemBarcode(${index}, this.value)" 
                               class="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                    </td>

                    <!-- Giá bán in trên tem -->
                    <td class="p-2.5 text-right">
                        <input type="number" min="0" step="1000" value="${item.price}" oninput="BarcodePrinterModule.updateItemPrice(${index}, this.value)" 
                               class="w-24 px-2 py-1 bg-white border border-slate-200 rounded text-xs font-bold text-right text-emerald-800 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                    </td>

                    <!-- Số lượng tem cần in -->
                    <td class="p-2.5 text-center">
                        <div class="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                            <button type="button" onclick="BarcodePrinterModule.changeItemQty(${index}, -1)" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs">-</button>
                            <input type="number" min="1" value="${item.quantity}" oninput="BarcodePrinterModule.setItemQty(${index}, this.value)" 
                                   class="w-12 text-center text-xs font-bold text-purple-900 focus:outline-none py-1 border-x border-slate-200" />
                            <button type="button" onclick="BarcodePrinterModule.changeItemQty(${index}, 1)" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs">+</button>
                        </div>
                    </td>

                    <!-- Nút xóa -->
                    <td class="p-2.5 text-center">
                        <button type="button" onclick="BarcodePrinterModule.removeItem(${index})" class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition" title="Xóa khỏi danh sách in">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        this.updateSummaryText();
        if (window.lucide) lucide.createIcons();
    },

    updateItemBarcode(index, val) {
        if (this.printQueue[index]) {
            this.printQueue[index].barcode = val.trim();
            this.renderLivePreview();
        }
    },

    updateItemPrice(index, val) {
        if (this.printQueue[index]) {
            this.printQueue[index].price = parseFloat(val) || 0;
            this.renderLivePreview();
        }
    },

    changeItemQty(index, delta) {
        if (this.printQueue[index]) {
            let cur = parseInt(this.printQueue[index].quantity) || 1;
            cur = Math.max(1, cur + delta);
            this.printQueue[index].quantity = cur;
            this.renderQueueTable();
            this.renderLivePreview();
        }
    },

    setItemQty(index, val) {
        if (this.printQueue[index]) {
            let cur = parseInt(val) || 1;
            this.printQueue[index].quantity = Math.max(1, cur);
            this.updateSummaryText();
            this.renderLivePreview();
        }
    },

    removeItem(index) {
        this.printQueue.splice(index, 1);
        this.renderQueueTable();
        this.renderLivePreview();
    },

    setAllQuantities(val = 1) {
        this.printQueue.forEach(it => it.quantity = val);
        this.renderQueueTable();
        this.renderLivePreview();
    },

    addMedicineToQueue(medicineId) {
        if (!medicineId) return;
        const med = Store.getMedicineById(medicineId);
        if (!med) return;

        const existing = this.printQueue.find(x => x.medicineId === med.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            this.printQueue.push({
                id: `med_${med.id}_${Date.now()}`,
                medicineId: med.id,
                name: med.name,
                unit: med.packUnit || 'Hộp',
                barcode: med.barcode || med.id,
                price: med.priceBox || med.price || 0,
                quantity: 10 // mặc định 10 tem
            });
        }
        this.renderQueueTable();
        this.renderLivePreview();
    },

    updateSummaryText() {
        const totalLabels = this.printQueue.reduce((sum, it) => sum + (parseInt(it.quantity) || 0), 0);
        const tpl = this.templates[this.currentTemplate] || this.templates['roll_3_104x22'];
        const totalRows = Math.ceil(totalLabels / tpl.labelsPerRow);

        const summaryEl = document.getElementById('barcode-summary-badge');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <span>Tổng: <b class="text-purple-800">${totalLabels} tem</b></span>
                <span class="mx-1">•</span>
                <span>Tương đương: <b class="text-slate-800">${totalRows} hàng tem</b> (${tpl.labelsPerRow} tem/hàng)</span>
            `;
        }
    },

    // --- HIỂN THỊ XEM TRƯỚC BẢN IN TRỰC TIẾP (LIVE PREVIEW) ---
    renderLivePreview() {
        const previewContainer = document.getElementById('barcode-live-preview-box');
        if (!previewContainer) return;

        const tpl = this.templates[this.currentTemplate] || this.templates['roll_3_104x22'];

        // Mở rộng toàn bộ tem theo số lượng
        const expandedLabels = [];
        this.printQueue.forEach(item => {
            const qty = parseInt(item.quantity) || 1;
            for (let i = 0; i < qty; i++) {
                expandedLabels.push(item);
            }
        });

        if (expandedLabels.length === 0) {
            previewContainer.innerHTML = `
                <div class="text-center py-16 text-slate-400 text-xs">
                    <i data-lucide="scan" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                    <div>Chưa có tem nào để hiển thị bản in.</div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Nhóm theo số tem trên một hàng của khổ giấy
        const rows = [];
        for (let i = 0; i < expandedLabels.length; i += tpl.labelsPerRow) {
            const rowItems = [];
            for (let c = 0; c < tpl.labelsPerRow; c++) {
                rowItems.push(expandedLabels[i + c] || null);
            }
            rows.push(rowItems);
        }

        // Render từng hàng tem với khoảng cách mô phỏng cuộn giấy thực tế
        let html = '';
        rows.forEach((row, rIdx) => {
            let cellsHtml = '';
            row.forEach(item => {
                if (item) {
                    cellsHtml += this.renderSingleLabelHTML(item, true);
                } else {
                    cellsHtml += `<div class="border border-dashed border-slate-200 rounded-lg bg-slate-50/50" style="width: 33mm; height: 21mm;"></div>`;
                }
            });

            html += `
                <div class="relative bg-white/95 p-1 rounded-xl shadow-xs border border-slate-200/80 mb-2.5 flex items-center justify-between gap-1.5 transition">
                    <div class="absolute -left-6 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-slate-400">#${rIdx + 1}</div>
                    ${cellsHtml}
                </div>
            `;
        });

        previewContainer.innerHTML = html;
        this.updateSummaryText();
        if (window.lucide) lucide.createIcons();
    },

    // --- TẠO MÃ HTML ĐỂ IN TRỰC TIẾP RA MÁY IN NHIỆT ---
    generatePrintDocumentHTML() {
        const tpl = this.templates[this.currentTemplate] || this.templates['roll_3_104x22'];

        const expandedLabels = [];
        this.printQueue.forEach(item => {
            const qty = parseInt(item.quantity) || 1;
            for (let i = 0; i < qty; i++) {
                expandedLabels.push(item);
            }
        });

        const rows = [];
        for (let i = 0; i < expandedLabels.length; i += tpl.labelsPerRow) {
            const rowItems = [];
            for (let c = 0; c < tpl.labelsPerRow; c++) {
                rowItems.push(expandedLabels[i + c] || null);
            }
            rows.push(rowItems);
        }

        let rowsHtml = '';
        rows.forEach((row, rIdx) => {
            let cellsHtml = '';
            row.forEach(item => {
                if (item) {
                    cellsHtml += this.renderSingleLabelHTML(item, false);
                } else {
                    cellsHtml += `<div style="width: 33mm; height: 21mm; visibility: hidden;"></div>`;
                }
            });

            const isLast = (rIdx === rows.length - 1);
            rowsHtml += `
                <div class="label-row" style="width: 104mm; height: 22mm; max-height: 22mm; display: flex; flex-direction: row; justify-content: space-between; align-items: center; ${!isLast ? 'page-break-after: always; break-after: page;' : ''} box-sizing: border-box; overflow: hidden; padding: 0.5mm 1mm;">
                    ${cellsHtml}
                </div>
            `;
        });

        return `
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>In Tem Mã Vạch - MedicaPharmacy</title>
                <style>
                    @page {
                        size: 104mm 22mm;
                        margin: 0mm;
                    }
                    * {
                        box-sizing: border-box;
                        margin: 0;
                        padding: 0;
                    }
                    html, body {
                        width: 104mm;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        color: #000000 !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .label-row {
                        width: 104mm;
                        height: 22mm;
                        max-height: 22mm;
                        display: flex;
                        flex-direction: row;
                        justify-content: space-between;
                        align-items: center;
                        box-sizing: border-box;
                        overflow: hidden;
                        padding: 0.5mm 1mm;
                    }
                    .barcode-label-box {
                        width: 33mm;
                        height: 21mm;
                        max-height: 21mm;
                        box-sizing: border-box;
                        padding: 0.8mm 1.2mm;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        align-items: center;
                        text-align: center;
                        overflow: hidden;
                        background: #ffffff;
                    }
                </style>
            </head>
            <body>
                ${rowsHtml}
            </body>
            </html>
        `;
    },

    // --- NÚT XEM BẢN IN (MỞ TAB / CỬA SỔ PREVIEW) ---
    openPrintWindow() {
        const printHtml = this.generatePrintDocumentHTML();
        const previewWin = window.open('', '_blank', 'width=900,height=700');
        if (previewWin) {
            previewWin.document.open();
            previewWin.document.write(printHtml);
            previewWin.document.close();
        } else {
            alert('Vui lòng cho phép popup trình duyệt để mở bản in!');
        }
    },

    // --- NÚT IN TEM NGAY (THỰC THI LỆNH IN QUA IFRAME) ---
    executePrint() {
        const printHtml = this.generatePrintDocumentHTML();
        
        let iframe = document.getElementById('barcode-print-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'barcode-print-iframe';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            document.body.appendChild(iframe);
        }

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(printHtml);
        iframeDoc.close();

        setTimeout(() => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch(e) {
                console.error('Lỗi in qua iframe, chuyển sang window.open:', e);
                this.openPrintWindow();
            }
        }, 300);
    }
};

