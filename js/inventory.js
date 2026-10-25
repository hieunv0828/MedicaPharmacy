/**
 * MedicaPharmacy - Inventory & Stock-In Management Module
 * Quản lý Kho thuốc, Danh mục thuốc GPP và Nghiệp vụ Nhập thuốc từ NCC
 */

const InventoryModule = {
    currentFilterCategory: 'all',
    currentFilterStatus: 'all',
    searchKeyword: '',
    stockInSearchKeyword: '',
    stockInTimeFilter: 'this_month',
    stockInPaymentFilter: 'all', // 'all', 'cash', 'transfer'
    stockInDateFrom: '',
    stockInDateTo: '',
    currentEditingMedId: null,
    currentHistoryMedId: null,
    currentHistoryTab: 'stockin', // 'stockin', 'sales'

    // Dữ liệu tạm thời cho phiếu nhập kho đang tạo
    stockInDraft: {
        supplierId: '',
        note: '',
        paymentMethod: 'cash',
        items: []
    },
    editingStockInId: null,
    pendingReturnStockInId: null,
    returnStockInPaymentMethod: 'cash',

    init() {
        this.renderCategoryFilter();
        this.renderMedicineTable();
        this.renderSuppliersDropdown();
        this.renderStockInHistory();
        this.renderStockInSummaryCards();
        this.bindEvents();

        // Lắng nghe sự kiện thay đổi dữ liệu từ Store
        Store.on('medicines:changed', () => {
            this.renderMedicineTable();
            this.updateInventoryStats();
        });

        Store.on('stockin:changed', () => {
            this.renderStockInHistory();
            this.renderStockInSummaryCards();
        });

        Store.on('suppliers:changed', () => {
            this.renderSuppliersDropdown();
        });

        this.updateInventoryStats();
    },

    bindEvents() {
        // Tìm kiếm thuốc trong kho
        const searchInput = document.getElementById('inventory-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchKeyword = e.target.value.trim().toLowerCase();
                this.renderMedicineTable();
            });
        }

        // Lọc theo nhóm thuốc
        const catSelect = document.getElementById('inventory-filter-category');
        if (catSelect) {
            catSelect.addEventListener('change', (e) => {
                this.currentFilterCategory = e.target.value;
                this.renderMedicineTable();
            });
        }

        // Lọc theo trạng thái tồn kho / hạn dùng
        const statusSelect = document.getElementById('inventory-filter-status');
        if (statusSelect) {
            statusSelect.addEventListener('change', (e) => {
                this.currentFilterStatus = e.target.value;
                this.renderMedicineTable();
            });
        }

        // --- Tìm kiếm & Lọc thời gian lịch sử Nhập Thuốc ---
        const stockInSearch = document.getElementById('stockin-search-input');
        if (stockInSearch) {
            stockInSearch.addEventListener('input', (e) => {
                this.stockInSearchKeyword = e.target.value.trim().toLowerCase();
                this.renderStockInHistory();
            });
        }

        const stockInTimeSel = document.getElementById('stockin-time-filter');
        if (stockInTimeSel) {
            stockInTimeSel.addEventListener('change', (e) => {
                this.stockInTimeFilter = e.target.value;
                const customDiv = document.getElementById('stockin-custom-dates');
                if (customDiv) {
                    if (e.target.value === 'custom') {
                        customDiv.classList.remove('hidden');
                    } else {
                        customDiv.classList.add('hidden');
                    }
                }
                this.renderStockInHistory();
            });
        }

        const dateFrom = document.getElementById('stockin-date-from');
        if (dateFrom) {
            dateFrom.addEventListener('change', (e) => {
                this.stockInDateFrom = e.target.value;
                this.renderStockInHistory();
            });
        }

        const dateTo = document.getElementById('stockin-date-to');
        if (dateTo) {
            dateTo.addEventListener('change', (e) => {
                this.stockInDateTo = e.target.value;
                this.renderStockInHistory();
            });
        }
    },

    updateInventoryStats() {
        const medicines = Store.getMedicines();
        let totalItems = medicines.length;
        let lowStockCount = 0;
        let nearExpiryCount = 0;
        let totalStockValue = 0;

        medicines.forEach(m => {
            const stockUnits = m.stockUnits || 0;
            const minStock = m.minStock || 0;
            if (stockUnits <= minStock) lowStockCount++;

            const expStatus = AppUtils.checkExpiryStatus(m.expiryDate);
            if (expStatus.status === 'warning' || expStatus.status === 'expired') nearExpiryCount++;

            // Ước tính giá trị tồn kho theo giá vốn
            const packRatio = m.packRatio || 1;
            const costPerUnit = (m.costPrice || 0) / packRatio;
            totalStockValue += Math.round(costPerUnit * stockUnits);
        });

        const elTotalItems = document.getElementById('stat-total-medicines');
        const elLowStock = document.getElementById('stat-low-stock');
        const elNearExpiry = document.getElementById('stat-near-expiry');
        const elTotalValue = document.getElementById('stat-total-stock-value');

        if (elTotalItems) elTotalItems.innerText = AppUtils.formatNumber(totalItems);
        if (elLowStock) elLowStock.innerText = AppUtils.formatNumber(lowStockCount);
        if (elNearExpiry) elNearExpiry.innerText = AppUtils.formatNumber(nearExpiryCount);
        if (elTotalValue) elTotalValue.innerText = AppUtils.formatVND(totalStockValue);
    },

    renderCategoryFilter() {
        const catSelect = document.getElementById('inventory-filter-category');
        if (!catSelect) return;

        const categories = SampleData.categories || [];
        let html = '<option value="all">Tất cả nhóm thuốc</option>';
        categories.forEach(cat => {
            html += `<option value="${cat}">${cat}</option>`;
        });
        catSelect.innerHTML = html;
    },

    renderInventoryTable() {
        this.renderMedicineTable();
    },

    renderMedicineTable() {
        const tbody = document.getElementById('medicine-table-body');
        if (!tbody) return;

        let medicines = Store.getMedicines();

        // Lọc theo từ khóa
        if (this.searchKeyword) {
            medicines = medicines.filter(m => 
                (m.name && m.name.toLowerCase().includes(this.searchKeyword)) ||
                (m.activeIngredient && m.activeIngredient.toLowerCase().includes(this.searchKeyword)) ||
                (m.barcode && m.barcode.toLowerCase().includes(this.searchKeyword)) ||
                (m.batchNo && m.batchNo.toLowerCase().includes(this.searchKeyword))
            );
        }

        // Lọc theo nhóm
        if (this.currentFilterCategory !== 'all') {
            medicines = medicines.filter(m => m.category === this.currentFilterCategory);
        }

        // Lọc theo trạng thái
        if (this.currentFilterStatus === 'low_stock') {
            medicines = medicines.filter(m => (m.stockUnits || 0) <= (m.minStock || 0));
        } else if (this.currentFilterStatus === 'near_expiry') {
            medicines = medicines.filter(m => {
                const s = AppUtils.checkExpiryStatus(m.expiryDate).status;
                return s === 'warning' || s === 'expired';
            });
        } else if (this.currentFilterStatus === 'out_of_stock') {
            medicines = medicines.filter(m => (m.stockUnits || 0) <= 0);
        }

        if (medicines.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-12 text-slate-400">
                        <i data-lucide="package-x" class="w-10 h-10 mx-auto mb-2 opacity-50"></i>
                        Không tìm thấy loại thuốc nào phù hợp điều kiện lọc.
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        let html = '';
        const canViewCost = !window.AuthModule || AuthModule.canViewCostPrice();
        const canEdit = !window.AuthModule || AuthModule.canEditInventory();

        const thCost = document.getElementById('th-cost-price');
        if (thCost) {
            thCost.style.display = canViewCost ? '' : 'none';
        }

        medicines.forEach((m, idx) => {
            const stockStatus = AppUtils.checkStockStatus(m);
            const expiryStatus = AppUtils.checkExpiryStatus(m.expiryDate);

            // Badge trạng thái tồn kho
            let stockBadge = '';
            if (stockStatus.status === 'out_of_stock') {
                stockBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">Hết hàng</span>';
            } else if (stockStatus.status === 'low_stock') {
                stockBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">Sắp hết</span>';
            } else {
                stockBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Còn hàng</span>';
            }

            // Badge hạn sử dụng
            let expiryBadge = '';
            if (expiryStatus.status === 'expired') {
                expiryBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-200 text-rose-900 animate-pulse">Hết hạn: ${AppUtils.formatDate(m.expiryDate)}</span>`;
            } else if (expiryStatus.status === 'warning') {
                expiryBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-200 text-amber-900">${AppUtils.formatDate(m.expiryDate)} (${expiryStatus.daysLeft} ngày)</span>`;
            } else {
                expiryBadge = `<span class="text-xs text-slate-600">${AppUtils.formatDate(m.expiryDate)}</span>`;
            }

            const costPriceCell = canViewCost ? `
                <td class="py-3 px-3">
                    <div class="text-xs text-slate-600 font-medium">${AppUtils.formatVND(m.costPrice)} /${m.packUnit || 'Hộp'}</div>
                </td>
            ` : '';

            const actionButtons = canEdit ? `
                <div class="flex items-center justify-center gap-1.5">
                    <button onclick="BarcodePrinterModule.openForMedicine('${m.id}')" title="In tem mã vạch dán hộp" class="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition cursor-pointer">
                        <i data-lucide="scan" class="w-4 h-4"></i>
                    </button>
                    <button onclick="InventoryModule.openMedicineHistoryModal('${m.id}')" title="Xem lịch sử nhập kho và bán thuốc" class="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition cursor-pointer">
                        <i data-lucide="history" class="w-4 h-4"></i>
                    </button>
                    <button onclick="InventoryModule.openEditModal('${m.id}')" title="Sửa thông tin thuốc" class="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="InventoryModule.deleteMedicine('${m.id}')" title="Xóa thuốc" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            ` : `
                <div class="flex items-center justify-center gap-1.5">
                    <button onclick="BarcodePrinterModule.openForMedicine('${m.id}')" title="In tem mã vạch dán hộp" class="px-2 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition cursor-pointer flex items-center gap-1">
                        <i data-lucide="scan" class="w-3.5 h-3.5"></i>
                        <span>In Tem</span>
                    </button>
                    <button onclick="InventoryModule.openMedicineHistoryModal('${m.id}')" title="Xem lịch sử bán thuốc" class="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition cursor-pointer flex items-center gap-1">
                        <i data-lucide="history" class="w-3.5 h-3.5"></i>
                        <span>Lịch sử</span>
                    </button>
                </div>
            `;

            const nameClickAction = canEdit ? `onclick="InventoryModule.openEditModal('${m.id}')"` : `onclick="InventoryModule.openMedicineHistoryModal('${m.id}')"`;

            html += `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-sm">
                    <td class="py-3 px-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
                    <td class="py-3 px-3">
                        <div class="font-bold text-slate-800 text-sm hover:text-emerald-700 cursor-pointer" ${nameClickAction} title="${canEdit ? 'Nhấn để sửa thông tin thuốc' : 'Nhấn để xem thông tin tồn kho & lịch sử'}">${m.name}</div>
                        <div class="text-xs text-slate-500 line-clamp-1 italic">${m.activeIngredient || 'Chưa cập nhật hoạt chất'}</div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">${m.category || 'Thuốc chung'}</span>
                            ${m.barcode ? `<span class="text-[11px] font-mono text-slate-400"><i data-lucide="scan" class="w-3 h-3 inline"></i> ${m.barcode}</span>` : ''}
                        </div>
                    </td>
                    <td class="py-3 px-3">
                        <div class="font-semibold text-slate-800">${AppUtils.formatStockUnitsDisplay(m)}</div>
                        <div class="mt-1">${stockBadge}</div>
                    </td>
                    <td class="py-3 px-3">
                        <div class="font-bold text-emerald-700">${AppUtils.formatVND(m.priceBox)} <span class="text-xs font-normal text-slate-500">/${m.packUnit || 'Hộp'}</span></div>
                        ${m.priceSub > 0 ? `<div class="text-xs text-slate-600">${AppUtils.formatVND(m.priceSub)} /${m.subUnit}</div>` : ''}
                        <div class="text-[11px] text-slate-400">${AppUtils.formatVND(m.priceBase)} /${m.baseUnit}</div>
                    </td>
                    ${costPriceCell}
                    <td class="py-3 px-3">
                        <div class="font-mono text-xs text-slate-700">${m.batchNo || '---'}</div>
                        <div class="mt-1">${expiryBadge}</div>
                    </td>
                    <td class="py-3 px-3 text-center">
                        ${actionButtons}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    // --- Modal Thêm / Sửa Thuốc ---
    openAddModal() {
        if (window.AuthModule && !AuthModule.canEditInventory()) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền thêm thuốc mới. Chỉ Quản trị viên (Admin) mới có quyền này!', 'warning');
            } else {
                alert('Chỉ Admin mới có quyền thêm thuốc mới!');
            }
            return;
        }

        this.currentEditingMedId = null;
        document.getElementById('modal-medicine-title').innerText = 'Thêm Thuốc Mới Vào Danh Mục';
        document.getElementById('form-medicine').reset();
        document.getElementById('med-id').value = '';

        // Nạp nhóm thuốc vào form
        this.populateCategoryOptions('med-category');
        this.populateSupplierOptions('med-supplier');

        if (window.SearchableSelect) {
            SearchableSelect.init('med-category', { richType: 'category', placeholder: '🔍 Tìm hoặc chọn nhóm dược lý...' });
            SearchableSelect.init('med-supplier', { richType: 'supplier', placeholder: '🔍 Tìm hoặc chọn nhà cung cấp...' });
            SearchableSelect.refresh('med-category');
            SearchableSelect.refresh('med-supplier');
        }

        document.getElementById('modal-medicine').classList.remove('hidden');
        document.getElementById('med-name').focus();
    },

    openEditModal(medId) {
        if (window.AuthModule && !AuthModule.canEditInventory()) {
            this.openMedicineHistoryModal(medId);
            return;
        }

        const med = Store.getMedicineById(medId);
        if (!med) return;

        this.currentEditingMedId = medId;
        document.getElementById('modal-medicine-title').innerText = 'Chỉnh Sửa Thông Tin Thuốc';
        this.populateCategoryOptions('med-category');
        this.populateSupplierOptions('med-supplier');

        document.getElementById('med-id').value = med.id;
        document.getElementById('med-name').value = med.name || '';
        document.getElementById('med-barcode').value = med.barcode || '';
        document.getElementById('med-active-ingredient').value = med.activeIngredient || '';
        document.getElementById('med-category').value = med.category || '';
        document.getElementById('med-supplier').value = med.supplierId || '';

        if (window.SearchableSelect) {
            SearchableSelect.init('med-category', { richType: 'category', placeholder: '🔍 Tìm hoặc chọn nhóm dược lý...' });
            SearchableSelect.init('med-supplier', { richType: 'supplier', placeholder: '🔍 Tìm hoặc chọn nhà cung cấp...' });
            SearchableSelect.refresh('med-category');
            SearchableSelect.refresh('med-supplier');
        }

        document.getElementById('med-base-unit').value = med.baseUnit || 'Viên';
        document.getElementById('med-pack-unit').value = med.packUnit || 'Hộp';
        document.getElementById('med-pack-ratio').value = med.packRatio || 1;
        document.getElementById('med-sub-unit').value = med.subUnit || '';
        document.getElementById('med-sub-ratio').value = med.subRatio || 1;

        document.getElementById('med-cost-price').value = med.costPrice || 0;
        document.getElementById('med-price-box').value = med.priceBox || 0;
        document.getElementById('med-price-sub').value = med.priceSub || 0;
        document.getElementById('med-price-base').value = med.priceBase || 0;

        document.getElementById('med-stock-units').value = med.stockUnits || 0;
        document.getElementById('med-min-stock').value = med.minStock || 50;
        document.getElementById('med-batch-no').value = med.batchNo || '';
        document.getElementById('med-expiry-date').value = med.expiryDate || '';
        document.getElementById('med-usage-default').value = med.usageDefault || '';

        document.getElementById('modal-medicine').classList.remove('hidden');
    },

    closeMedicineModal() {
        document.getElementById('modal-medicine').classList.add('hidden');
    },

    saveMedicineFromForm(e) {
        e.preventDefault();

        const name = document.getElementById('med-name').value.trim();
        if (!name) {
            alert('Vui lòng nhập tên thuốc!');
            return;
        }

        const medData = {
            id: document.getElementById('med-id').value || undefined,
            name: name,
            barcode: document.getElementById('med-barcode').value.trim(),
            activeIngredient: document.getElementById('med-active-ingredient').value.trim(),
            category: document.getElementById('med-category').value,
            supplierId: document.getElementById('med-supplier').value,
            baseUnit: document.getElementById('med-base-unit').value.trim() || 'Viên',
            packUnit: document.getElementById('med-pack-unit').value.trim() || 'Hộp',
            packRatio: parseInt(document.getElementById('med-pack-ratio').value) || 1,
            subUnit: document.getElementById('med-sub-unit').value.trim(),
            subRatio: parseInt(document.getElementById('med-sub-ratio').value) || 1,
            costPrice: parseFloat(document.getElementById('med-cost-price').value) || 0,
            priceBox: parseFloat(document.getElementById('med-price-box').value) || 0,
            priceSub: parseFloat(document.getElementById('med-price-sub').value) || 0,
            priceBase: parseFloat(document.getElementById('med-price-base').value) || 0,
            stockUnits: parseInt(document.getElementById('med-stock-units').value) || 0,
            minStock: parseInt(document.getElementById('med-min-stock').value) || 0,
            batchNo: document.getElementById('med-batch-no').value.trim(),
            expiryDate: document.getElementById('med-expiry-date').value,
            usageDefault: document.getElementById('med-usage-default').value.trim()
        };

        Store.saveMedicine(medData);
        this.closeMedicineModal();
        AppUtils.playBeepSound('beep');
    },

    deleteMedicine(id) {
        if (window.AuthModule && !AuthModule.canEditInventory()) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền xóa thuốc khỏi hệ thống. Chỉ Quản trị viên (Admin) mới có quyền này!', 'warning');
            } else {
                alert('Chỉ Admin mới có quyền xóa thuốc!');
            }
            return;
        }

        const med = Store.getMedicineById(id);
        if (!med) return;
        if (confirm(`Bạn có chắc chắn muốn xóa thuốc "${med.name}" khỏi danh mục không?`)) {
            Store.deleteMedicine(id);
        }
    },

    populateCategoryOptions(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const categories = SampleData.categories || [];
        sel.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
    },

    populateSupplierOptions(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const suppliers = Store.getSuppliers();
        sel.innerHTML = '<option value="">-- Chọn Nhà Cung Cấp --</option>' + 
            suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    },

    // --- NGHIỆP VỤ NHẬP THUỐC (Stock-In) ---
    renderSuppliersDropdown(selectedId = '') {
        const sel = document.getElementById('stockin-supplier');
        if (!sel) return;
        const suppliers = Store.getSuppliers();
        sel.innerHTML = '<option value="">-- Chọn Nhà Cung Cấp --</option>' + 
            suppliers.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${s.name} ${s.phone ? `(${s.phone})` : ''}</option>`).join('');
    },

    openStockInModal() {
        if (window.AuthModule && !AuthModule.canAccessTab('stockin')) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền lập phiếu nhập kho. Chỉ Quản trị viên (Admin) mới được phép!', 'warning');
            } else {
                alert('Chỉ Admin mới có quyền lập phiếu nhập kho!');
            }
            return;
        }

        this.editingStockInId = null;
        const titleEl = document.getElementById('modal-stockin-title');
        if (titleEl) titleEl.innerHTML = `<i data-lucide="truck" class="w-5 h-5 text-emerald-600"></i> Lập Phiếu Nhập Kho Thuốc Mới`;
        const saveBtnText = document.getElementById('stockin-btn-save-text');
        if (saveBtnText) saveBtnText.innerText = 'Hoàn Tất & Lưu Phiếu Nhập';

        this.stockInDraft = {
            supplierId: '',
            note: '',
            paymentMethod: 'cash',
            items: []
        };
        this.setStockInDraftPaymentMethod('cash');
        this.renderStockInDraftTable();
        this.populateStockInMedicineSelector();
        this.renderSuppliersDropdown();
        document.getElementById('stockin-supplier').value = '';
        document.getElementById('stockin-note').value = '';

        if (window.SearchableSelect) {
            SearchableSelect.init('stockin-supplier', { richType: 'supplier', placeholder: '🔍 Tìm nhà cung cấp...' });
            SearchableSelect.init('stockin-medicine-select', { richType: 'medicine', placeholder: '🔍 Tìm tên thuốc cần nhập...' });
            SearchableSelect.refresh('stockin-supplier');
            SearchableSelect.refresh('stockin-medicine-select');
        }

        document.getElementById('modal-stockin').classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    openEditStockInModal(orderId) {
        if (window.AuthModule && !AuthModule.canAccessTab('stockin')) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền chỉnh sửa phiếu nhập kho!', 'warning');
            }
            return;
        }

        const orders = Store.getStockInOrders();
        const o = orders.find(x => x.id === orderId);
        if (!o) return;

        this.editingStockInId = orderId;

        const titleEl = document.getElementById('modal-stockin-title');
        if (titleEl) titleEl.innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-amber-600"></i> Chỉnh Sửa Phiếu Nhập Kho: <span class="font-mono text-amber-700">${orderId}</span>`;
        const saveBtnText = document.getElementById('stockin-btn-save-text');
        if (saveBtnText) saveBtnText.innerText = 'Lưu Thay Đổi Phiếu Nhập';

        this.stockInDraft = {
            supplierId: o.supplierId || '',
            note: o.note || '',
            paymentMethod: o.paymentMethod || 'cash',
            items: JSON.parse(JSON.stringify(o.items || []))
        };

        this.setStockInDraftPaymentMethod(o.paymentMethod || 'cash');
        this.renderSuppliersDropdown();
        this.populateStockInMedicineSelector();
        this.renderStockInDraftTable();

        const selSup = document.getElementById('stockin-supplier');
        if (selSup) selSup.value = o.supplierId || '';
        const txtNote = document.getElementById('stockin-note');
        if (txtNote) txtNote.value = o.note || '';

        if (window.SearchableSelect) {
            SearchableSelect.init('stockin-supplier', { richType: 'supplier', placeholder: '🔍 Tìm nhà cung cấp...' });
            SearchableSelect.init('stockin-medicine-select', { richType: 'medicine', placeholder: '🔍 Tìm tên thuốc cần nhập...' });
            SearchableSelect.refresh('stockin-supplier');
            SearchableSelect.refresh('stockin-medicine-select');
        }

        this.closeStockInDetailModal();
        document.getElementById('modal-stockin')?.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    setStockInDraftPaymentMethod(method) {
        this.stockInDraft.paymentMethod = method;
        const btnCash = document.getElementById('stockin-method-cash-btn');
        const btnTransfer = document.getElementById('stockin-method-transfer-btn');

        if (method === 'cash') {
            btnCash?.classList.add('bg-amber-600', 'text-white', 'shadow-sm');
            btnCash?.classList.remove('bg-slate-100', 'text-slate-600');
            btnTransfer?.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
            btnTransfer?.classList.add('bg-slate-100', 'text-slate-600');
        } else {
            btnTransfer?.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
            btnTransfer?.classList.remove('bg-slate-100', 'text-slate-600');
            btnCash?.classList.remove('bg-amber-600', 'text-white', 'shadow-sm');
            btnCash?.classList.add('bg-slate-100', 'text-slate-600');
        }
    },

    closeStockInModal() {
        this.editingStockInId = null;
        document.getElementById('modal-stockin').classList.add('hidden');
    },

    // --- QUẢN LÝ THÊM NHÀ CUNG CẤP MỚI ---
    openAddSupplierModal() {
        if (window.AuthModule && !AuthModule.canEditInventory()) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền thêm nhà cung cấp mới. Chỉ Admin mới được phép!', 'warning');
            }
            return;
        }

        const modal = document.getElementById('modal-add-supplier');
        if (!modal) return;
        const autoId = 'NCC' + String(Date.now()).slice(-4);
        const inputId = document.getElementById('supplier-input-id');
        if (inputId) inputId.value = autoId;
        document.getElementById('supplier-input-name').value = '';
        document.getElementById('supplier-input-phone').value = '';
        document.getElementById('supplier-input-address').value = '';
        document.getElementById('supplier-input-note').value = '';
        modal.classList.remove('hidden');
    },

    closeAddSupplierModal() {
        document.getElementById('modal-add-supplier')?.classList.add('hidden');
    },

    saveNewSupplier() {
        const name = document.getElementById('supplier-input-name')?.value.trim();
        if (!name) {
            alert('Vui lòng nhập tên Nhà Cung Cấp!');
            return;
        }

        const id = document.getElementById('supplier-input-id')?.value.trim() || ('NCC' + String(Date.now()).slice(-4));
        const phone = document.getElementById('supplier-input-phone')?.value.trim();
        const address = document.getElementById('supplier-input-address')?.value.trim();
        const note = document.getElementById('supplier-input-note')?.value.trim();

        const newSup = { id, name, phone, address, note };
        Store.saveSupplier(newSup);

        this.closeAddSupplierModal();
        this.renderSuppliersDropdown(newSup.id);
        App.showToast(`Đã thêm nhà cung cấp mới: ${newSup.name}`, 'success');
        AppUtils.playBeepSound('success');
    },

    populateStockInMedicineSelector() {
        const sel = document.getElementById('stockin-medicine-select');
        if (!sel) return;
        const medicines = Store.getMedicines();
        sel.innerHTML = '<option value="">-- Chọn thuốc cần nhập --</option>' + 
            medicines.map(m => `<option value="${m.id}">${m.name} [${m.packUnit || 'Hộp'}] (Hiện còn: ${m.stockUnits || 0} ${m.baseUnit})</option>`).join('');
    },

    onStockInMedicineChange() {
        const sel = document.getElementById('stockin-medicine-select');
        const medId = sel.value;
        if (!medId) return;

        const med = Store.getMedicineById(medId);
        if (!med) return;

        document.getElementById('stockin-unit').value = med.packUnit || 'Hộp';
        document.getElementById('stockin-cost-price').value = med.costPrice || 0;
        document.getElementById('stockin-batch-no').value = med.batchNo || '';
        document.getElementById('stockin-expiry-date').value = med.expiryDate || '';
        document.getElementById('stockin-qty').value = 10;
        document.getElementById('stockin-qty').focus();
    },

    addItemToStockInDraft() {
        const sel = document.getElementById('stockin-medicine-select');
        const medId = sel.value;
        if (!medId) {
            alert('Vui lòng chọn thuốc cần nhập!');
            return;
        }

        const med = Store.getMedicineById(medId);
        const qty = parseInt(document.getElementById('stockin-qty').value) || 0;
        const costPrice = parseFloat(document.getElementById('stockin-cost-price').value) || 0;
        const batchNo = document.getElementById('stockin-batch-no').value.trim();
        const expiryDate = document.getElementById('stockin-expiry-date').value;
        const unit = document.getElementById('stockin-unit').value.trim() || med.packUnit;

        if (qty <= 0) {
            alert('Số lượng nhập phải lớn hơn 0!');
            return;
        }

        this.stockInDraft.items.push({
            medicineId: med.id,
            medicineName: med.name,
            unit: unit,
            quantity: qty,
            costPrice: costPrice,
            batchNo: batchNo,
            expiryDate: expiryDate,
            total: qty * costPrice
        });

        this.renderStockInDraftTable();

        // Reset ô chọn thuốc để nhập loại kế tiếp
        sel.value = '';
        document.getElementById('stockin-qty').value = 1;
        document.getElementById('stockin-cost-price').value = 0;
        document.getElementById('stockin-batch-no').value = '';
        document.getElementById('stockin-expiry-date').value = '';
        sel.focus();
    },

    removeDraftStockInItem(index) {
        this.stockInDraft.items.splice(index, 1);
        this.renderStockInDraftTable();
    },

    renderStockInDraftTable() {
        const tbody = document.getElementById('stockin-draft-tbody');
        const elTotal = document.getElementById('stockin-draft-total');
        if (!tbody) return;

        if (this.stockInDraft.items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 text-sm">Chưa có loại thuốc nào trong phiếu nhập. Chọn thuốc ở trên để thêm vào.</td></tr>`;
            if (elTotal) elTotal.innerText = '0 đ';
            return;
        }

        let totalAmount = 0;
        let html = '';
        this.stockInDraft.items.forEach((item, idx) => {
            totalAmount += item.total;
            html += `
                <tr class="border-b border-slate-100 text-sm hover:bg-slate-50">
                    <td class="py-2 px-2 text-center text-slate-400 text-xs">${idx + 1}</td>
                    <td class="py-2 px-2 font-medium text-slate-800">${item.medicineName}</td>
                    <td class="py-2 px-2 font-mono text-xs text-slate-600">${item.batchNo || '---'}</td>
                    <td class="py-2 px-2 text-xs text-slate-600">${AppUtils.formatDate(item.expiryDate) || '---'}</td>
                    <td class="py-2 px-2 text-center font-bold text-slate-700">${item.quantity} ${item.unit}</td>
                    <td class="py-2 px-2 text-right font-medium text-slate-700">${AppUtils.formatVND(item.costPrice)}</td>
                    <td class="py-2 px-2 text-right font-bold text-emerald-700">${AppUtils.formatVND(item.total)}</td>
                    <td class="py-2 px-2 text-center">
                        <button onclick="InventoryModule.removeDraftStockInItem(${idx})" class="text-rose-500 hover:text-rose-700 p-1">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (elTotal) elTotal.innerText = AppUtils.formatVND(totalAmount);
        if (window.lucide) lucide.createIcons();
    },

    saveStockInOrder() {
        if (this.stockInDraft.items.length === 0) {
            alert('Vui lòng thêm ít nhất một mặt hàng thuốc vào phiếu nhập!');
            return;
        }

        const supplierId = document.getElementById('stockin-supplier').value;
        const suppliers = Store.getSuppliers();
        const sup = suppliers.find(s => s.id === supplierId);
        const supplierName = sup ? sup.name : 'Nhà cung cấp tự do';
        const note = document.getElementById('stockin-note').value.trim();
        const settings = Store.getSettings();
        const paymentMethod = this.stockInDraft.paymentMethod || 'cash';

        const totalAmount = this.stockInDraft.items.reduce((sum, item) => sum + item.total, 0);

        if (this.editingStockInId) {
            const updatedRecord = {
                id: this.editingStockInId,
                supplierId: supplierId,
                supplierName: supplierName,
                paymentMethod: paymentMethod,
                items: this.stockInDraft.items,
                totalAmount: totalAmount,
                pharmacist: settings.pharmacist || 'DS. Nguyễn Thanh Dung',
                note: note
            };

            Store.updateStockInOrder(updatedRecord);
            AppUtils.playBeepSound('success');
            this.closeStockInModal();
            App.showToast(`Đã cập nhật thành công phiếu nhập kho ${updatedRecord.id}! Tồn kho và Sổ Quỹ đã được điều chỉnh.`, 'success');
        } else {
            const stockInRecord = {
                supplierId: supplierId,
                supplierName: supplierName,
                paymentMethod: paymentMethod,
                items: this.stockInDraft.items,
                totalAmount: totalAmount,
                pharmacist: settings.pharmacist || 'DS. Nguyễn Thanh Dung',
                note: note
            };

            const saved = Store.addStockInOrder(stockInRecord);
            AppUtils.playBeepSound('success');
            this.closeStockInModal();
            App.showToast(`Đã hoàn tất nhập kho phiếu ${saved.id} (${paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'})! Tồn kho đã tự động cộng dồn.`, 'success');

            // Tự động hỏi / mở in tem mã vạch dán hộp cho các mặt hàng vừa nhập
            if (window.BarcodePrinterModule) {
                setTimeout(() => {
                    BarcodePrinterModule.promptPrintAfterStockIn(saved);
                }, 400);
            }
        }
    },

    // --- TAB LỌC THANH TOÁN TIỀN MẶT / CHUYỂN KHOẢN / ĐÃ TRẢ HÀNG KHI NHẬP HÀNG ---
    setStockInPaymentFilter(method) {
        this.stockInPaymentFilter = method;

        const btnAll = document.getElementById('tab-btn-stockin-all');
        const btnCash = document.getElementById('tab-btn-stockin-cash');
        const btnTransfer = document.getElementById('tab-btn-stockin-transfer');
        const btnReturned = document.getElementById('tab-btn-stockin-returned');

        const activeClass = ['border-emerald-600', 'text-emerald-700', 'font-bold'];
        const activeReturnedClass = ['border-rose-600', 'text-rose-700', 'font-bold'];
        const inactiveClass = ['border-transparent', 'text-slate-500', 'font-medium'];

        [btnAll, btnCash, btnTransfer, btnReturned].forEach(b => {
            b?.classList.remove(...activeClass, ...activeReturnedClass);
            b?.classList.add(...inactiveClass);
        });

        if (method === 'all') btnAll?.classList.add(...activeClass);
        if (method === 'cash') btnCash?.classList.add(...activeClass);
        if (method === 'transfer') btnTransfer?.classList.add(...activeClass);
        if (method === 'returned') btnReturned?.classList.add(...activeReturnedClass);

        this.renderStockInHistory();
    },

    renderStockInSummaryCards() {
        const allOrders = Store.getStockInOrders();
        
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yestStr = yesterday.toISOString().slice(0, 10);
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const monthPrefix = now.toISOString().slice(0, 7);

        let filtered = allOrders;
        if (this.stockInTimeFilter === 'today') {
            filtered = filtered.filter(o => o.createdAt && o.createdAt.startsWith(todayStr));
        } else if (this.stockInTimeFilter === 'yesterday') {
            filtered = filtered.filter(o => o.createdAt && o.createdAt.startsWith(yestStr));
        } else if (this.stockInTimeFilter === 'last_7_days') {
            filtered = filtered.filter(o => new Date(o.createdAt) >= sevenDaysAgo);
        } else if (this.stockInTimeFilter === 'this_month') {
            filtered = filtered.filter(o => o.createdAt && o.createdAt.startsWith(monthPrefix));
        } else if (this.stockInTimeFilter === 'custom') {
            if (this.stockInDateFrom) filtered = filtered.filter(o => o.createdAt && o.createdAt.slice(0, 10) >= this.stockInDateFrom);
            if (this.stockInDateTo) filtered = filtered.filter(o => o.createdAt && o.createdAt.slice(0, 10) <= this.stockInDateTo);
        }

        const cashOrders = filtered.filter(o => (o.paymentMethod || 'cash') === 'cash');
        const transferOrders = filtered.filter(o => o.paymentMethod === 'transfer');
        const returnedOrders = filtered.filter(o => o.returnStatus || (o.returns && o.returns.length > 0));

        const totalAll = filtered.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const totalCash = cashOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const totalTransfer = transferOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        const cardAll = document.getElementById('card-stockin-total-all');
        const cardCash = document.getElementById('card-stockin-total-cash');
        const cardTransfer = document.getElementById('card-stockin-total-transfer');

        if (cardAll) cardAll.innerText = AppUtils.formatVND(totalAll);
        if (cardCash) cardCash.innerText = AppUtils.formatVND(totalCash);
        if (cardTransfer) cardTransfer.innerText = AppUtils.formatVND(totalTransfer);

        const badgeAll = document.getElementById('badge-stockin-all');
        const badgeCash = document.getElementById('badge-stockin-cash');
        const badgeTransfer = document.getElementById('badge-stockin-transfer');
        const badgeReturned = document.getElementById('badge-stockin-returned');

        if (badgeAll) badgeAll.innerText = filtered.length;
        if (badgeCash) badgeCash.innerText = cashOrders.length;
        if (badgeTransfer) badgeTransfer.innerText = transferOrders.length;
        if (badgeReturned) badgeReturned.innerText = returnedOrders.length;
    },

    // --- Lịch sử Phiếu Nhập Hàng & Tra cứu thời gian, tìm kiếm sản phẩm ---
    getFilteredStockInOrders() {
        let orders = Store.getStockInOrders();

        // 0. Lọc theo Tab phương thức thanh toán / Trả hàng
        if (this.stockInPaymentFilter === 'cash') {
            orders = orders.filter(o => (o.paymentMethod || 'cash') === 'cash');
        } else if (this.stockInPaymentFilter === 'transfer') {
            orders = orders.filter(o => o.paymentMethod === 'transfer');
        } else if (this.stockInPaymentFilter === 'returned') {
            orders = orders.filter(o => o.returnStatus || (o.returns && o.returns.length > 0));
        }

        // 1. Lọc theo thời gian
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);

        if (this.stockInTimeFilter === 'today') {
            orders = orders.filter(o => o.createdAt && o.createdAt.startsWith(todayStr));
        } else if (this.stockInTimeFilter === 'yesterday') {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yestStr = yesterday.toISOString().slice(0, 10);
            orders = orders.filter(o => o.createdAt && o.createdAt.startsWith(yestStr));
        } else if (this.stockInTimeFilter === 'last_7_days') {
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            orders = orders.filter(o => new Date(o.createdAt) >= sevenDaysAgo);
        } else if (this.stockInTimeFilter === 'this_month') {
            const yearMonth = now.toISOString().slice(0, 7);
            orders = orders.filter(o => o.createdAt && o.createdAt.startsWith(yearMonth));
        } else if (this.stockInTimeFilter === 'custom') {
            if (this.stockInDateFrom) {
                orders = orders.filter(o => o.createdAt && o.createdAt.slice(0, 10) >= this.stockInDateFrom);
            }
            if (this.stockInDateTo) {
                orders = orders.filter(o => o.createdAt && o.createdAt.slice(0, 10) <= this.stockInDateTo);
            }
        }

        // 2. Tìm kiếm theo: Mã phiếu, Nhà cung cấp, Tên thuốc, Mã hàng/Mã sản phẩm (medicineId), Số lô
        if (this.stockInSearchKeyword) {
            const q = this.stockInSearchKeyword;
            orders = orders.filter(o => {
                const matchOrder = (o.id && o.id.toLowerCase().includes(q)) ||
                                   (o.supplierName && o.supplierName.toLowerCase().includes(q)) ||
                                   (o.supplierId && o.supplierId.toLowerCase().includes(q));
                if (matchOrder) return true;

                return (o.items || []).some(item => 
                    (item.medicineName && item.medicineName.toLowerCase().includes(q)) ||
                    (item.medicineId && item.medicineId.toLowerCase().includes(q)) ||
                    (item.batchNo && item.batchNo.toLowerCase().includes(q))
                );
            });
        }

        return orders;
    },

    renderStockInHistory() {
        const tbody = document.getElementById('stockin-history-tbody');
        if (!tbody) return;

        this.renderStockInSummaryCards();

        const stockInOrders = this.getFilteredStockInOrders();
        if (stockInOrders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 text-sm">Không tìm thấy phiếu nhập kho nào thỏa mãn điều kiện lọc.</td></tr>`;
            return;
        }

        let html = '';
        stockInOrders.forEach((o, idx) => {
            const itemCount = o.items ? o.items.length : 0;
            const itemsText = (o.items || []).map(i => `${i.medicineName} [${i.medicineId || 'Mã'}] (${i.quantity} ${i.unit})`).join(', ');
            const isCash = (o.paymentMethod || 'cash') === 'cash';

            const methodBadge = isCash 
                ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"><i data-lucide="banknote" class="w-3 h-3"></i> Tiền mặt</span>'
                : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"><i data-lucide="qr-code" class="w-3 h-3"></i> Chuyển khoản</span>';

            let returnStatusBadge = '';
            if (o.returnStatus === 'fully_returned') {
                returnStatusBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200"><i data-lucide="rotate-ccw" class="w-3 h-3"></i> Đã trả hết</span>';
            } else if (o.returnStatus === 'partially_returned') {
                returnStatusBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title="Đã nhận lại ${AppUtils.formatVND(o.totalRefunded || 0)}"><i data-lucide="rotate-ccw" class="w-3 h-3"></i> Trả 1 phần</span>`;
            }

            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 text-sm">
                    <td class="py-3 px-3 font-mono font-bold text-emerald-700">
                        <span class="cursor-pointer hover:underline" onclick="InventoryModule.openStockInDetailModal('${o.id}')">${o.id}</span>
                        ${returnStatusBadge ? `<div class="mt-0.5">${returnStatusBadge}</div>` : ''}
                    </td>
                    <td class="py-3 px-3 text-slate-600 text-xs">${AppUtils.formatDateTime(o.createdAt)}</td>
                    <td class="py-3 px-3">${methodBadge}</td>
                    <td class="py-3 px-3 font-medium text-slate-800">${o.supplierName || '---'}</td>
                    <td class="py-3 px-3 text-xs text-slate-600 max-w-xs">
                        <span class="font-bold text-slate-700">${itemCount} loại thuốc:</span> 
                        <span class="line-clamp-1 italic text-slate-500" title="${itemsText}">${itemsText}</span>
                    </td>
                    <td class="py-3 px-3 text-right">
                        <div class="font-bold text-slate-800">${AppUtils.formatVND(o.totalAmount)}</div>
                        ${(o.totalRefunded || 0) > 0 ? `<div class="text-[11px] text-rose-600 font-semibold" title="Đã hoàn tiền từ NCC">Hoàn: -${AppUtils.formatVND(o.totalRefunded)}</div>` : ''}
                    </td>
                    <td class="py-3 px-3 text-center">
                        <div class="flex items-center justify-center gap-1.5 flex-wrap">
                            <button onclick="BarcodePrinterModule.openForStockInOrder('${o.id}')" title="In tem mã vạch dán hộp (104x22mm)" class="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer">
                                <i data-lucide="scan" class="w-3.5 h-3.5"></i>
                                <span>In Tem</span>
                            </button>
                            ${o.returnStatus === 'fully_returned' ? `
                                <button onclick="InventoryModule.openStockInDetailModal('${o.id}')" title="Phiếu nhập đã xuất trả toàn bộ hàng cho NCC" class="text-xs bg-slate-100 text-slate-400 border border-slate-200 font-semibold px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer">
                                    <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                                    <span>Đã trả</span>
                                </button>
                            ` : `
                                <button onclick="InventoryModule.openReturnStockInModal('${o.id}')" title="Xuất trả thuốc cho nhà cung cấp & nhận hoàn tiền" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer">
                                    <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                                    <span>Trả hàng</span>
                                </button>
                            `}
                            <button onclick="InventoryModule.openStockInDetailModal('${o.id}')" title="Xem chi tiết" class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer">
                                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                                <span>Chi tiết</span>
                            </button>
                            <button onclick="InventoryModule.openEditStockInModal('${o.id}')" title="Chỉnh sửa phiếu nhập kho" class="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-semibold px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer">
                                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                                <span>Sửa</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    openStockInDetailModal(orderId) {
        const orders = Store.getStockInOrders();
        const o = orders.find(x => x.id === orderId);
        if (!o) return;

        const modal = document.getElementById('modal-stockin-detail');
        const body = document.getElementById('stockin-detail-body');
        const idText = document.getElementById('stockin-detail-id-text');
        if (!modal || !body) return;

        if (idText) idText.innerText = `Mã phiếu: ${o.id}`;

        const isCash = (o.paymentMethod || 'cash') === 'cash';

        let itemsHtml = '';
        (o.items || []).forEach((item, i) => {
            const med = Store.getMedicineById(item.medicineId) || Store.getMedicines().find(m => m.name === item.medicineName);
            const medId = med ? med.id : item.medicineId;

            const returnedQty = (o.returns || []).reduce((sum, r) => {
                const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                return sum + (ri ? ri.quantity : 0);
            }, 0);

            itemsHtml += `
                <tr class="border-b border-slate-100 text-xs hover:bg-slate-50 transition">
                    <td class="p-2 text-center text-slate-400 font-mono">${i + 1}</td>
                    <td class="p-2 font-mono font-bold text-emerald-800">${item.medicineId || '---'}</td>
                    <td class="p-2">
                        <button type="button" onclick="InventoryModule.openMedicineHistoryModal('${medId}')" class="text-left font-bold text-emerald-700 hover:text-emerald-900 hover:underline inline-flex items-center gap-1 group cursor-pointer" title="Xem chi tiết xuất nhập & tồn kho">
                            <span>${item.medicineName}</span>
                            <i data-lucide="external-link" class="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 text-emerald-600 shrink-0"></i>
                        </button>
                    </td>
                    <td class="p-2 font-mono text-slate-700">${item.batchNo || '---'}</td>
                    <td class="p-2 text-slate-600">${AppUtils.formatDate(item.expiryDate) || '---'}</td>
                    <td class="p-2 text-center font-semibold text-slate-800">
                        ${item.quantity} ${item.unit}
                        ${returnedQty > 0 ? `<div class="text-[10px] text-rose-600 font-bold">(Đã trả: ${returnedQty} ${item.unit})</div>` : ''}
                    </td>
                    <td class="p-2 text-right">${AppUtils.formatVND(item.costPrice)}</td>
                    <td class="p-2 text-right font-bold text-emerald-700">${AppUtils.formatVND(item.total || item.quantity * item.costPrice)}</td>
                </tr>
            `;
        });

        // Bảng lịch sử các lần trả hàng (nếu có)
        let returnsSectionHtml = '';
        if (o.returns && o.returns.length > 0) {
            returnsSectionHtml = `
                <div class="border border-rose-200 rounded-xl overflow-hidden mt-3">
                    <div class="bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900 uppercase flex items-center justify-between">
                        <div class="flex items-center gap-1.5">
                            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5 text-rose-600"></i>
                            <span>Lịch Sử Xuất Trả Hàng Cho NCC (${o.returns.length} lần trả)</span>
                        </div>
                        <span class="text-[11px] font-normal lowercase italic text-rose-700">Tự động trừ kho & lập phiếu thu tiền hoàn</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="bg-rose-50/50 text-[11px] text-rose-800 font-semibold border-b border-rose-200">
                                <tr>
                                    <th class="p-2 w-28">Mã Phiếu Trả</th>
                                    <th class="p-2 w-32">Thời Gian</th>
                                    <th class="p-2 w-24">Hình Thức</th>
                                    <th class="p-2">Lý Do Xuất Trả</th>
                                    <th class="p-2 text-right w-28">Số Tiền Hoàn</th>
                                    <th class="p-2 text-center w-24">Thao Tác</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-rose-100">
                                ${o.returns.map(r => `
                                    <tr class="hover:bg-rose-50/30 transition">
                                        <td class="p-2 font-mono font-bold text-rose-700">${r.id}</td>
                                        <td class="p-2 text-slate-600">${AppUtils.formatDateTime(r.createdAt)}</td>
                                        <td class="p-2 font-medium">
                                            ${r.paymentMethod === 'transfer' ? '<span class="text-blue-700 font-semibold">Chuyển khoản</span>' : '<span class="text-amber-700 font-semibold">Tiền mặt</span>'}
                                        </td>
                                        <td class="p-2 text-slate-700 max-w-xs truncate" title="${r.reason || ''}">${r.reason || '---'}</td>
                                        <td class="p-2 text-right font-bold text-rose-700 font-mono">${AppUtils.formatVND(r.refundTotal)}</td>
                                        <td class="p-2 text-center">
                                            <button type="button" onclick="InventoryModule.printPurchaseReturn('${r.id}')" class="px-2 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded font-bold text-[11px] transition inline-flex items-center gap-1 cursor-pointer">
                                                <i data-lucide="printer" class="w-3 h-3"></i>
                                                <span>In Phiếu</span>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        body.innerHTML = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                    <div>
                        <span class="text-slate-400 block">Thời Gian Nhập:</span>
                        <span class="font-bold text-slate-800">${AppUtils.formatDateTime(o.createdAt)}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block">Hình Thức Thanh Toán:</span>
                        <span class="font-bold ${isCash ? 'text-amber-700' : 'text-blue-700'}">${isCash ? 'TIỀN MẶT' : 'CHUYỂN KHOẢN'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block">Nhà Cung Cấp:</span>
                        <span class="font-bold text-slate-800">${o.supplierName || '---'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block">Tổng Tiền Nhập Gốc:</span>
                        <span class="font-extrabold text-emerald-700 text-sm">${AppUtils.formatVND(o.totalAmount)}</span>
                    </div>
                </div>

                ${(o.returnStatus || (o.totalRefunded || 0) > 0) ? `
                <div class="bg-rose-50 p-3 rounded-xl border border-rose-200 text-xs text-rose-900 flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                        <i data-lucide="rotate-ccw" class="w-4 h-4 text-rose-600"></i>
                        <div>
                            <span class="text-slate-500">Trạng thái hoàn trả:</span>
                            <span class="font-bold uppercase ${o.returnStatus === 'fully_returned' ? 'text-rose-700' : 'text-amber-700'} ml-1">
                                ${o.returnStatus === 'fully_returned' ? 'Đã xuất trả toàn bộ hàng' : 'Đã xuất trả một phần'}
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div>
                            <span class="text-slate-500">Tiền đã hoàn lại:</span>
                            <b class="text-rose-700 font-mono text-sm ml-1">${AppUtils.formatVND(o.totalRefunded || 0)}</b>
                        </div>
                        <div>
                            <span class="text-slate-500">Giá trị thực nhập:</span>
                            <b class="text-emerald-700 font-mono text-sm ml-1">${AppUtils.formatVND((o.totalAmount || 0) - (o.totalRefunded || 0))}</b>
                        </div>
                    </div>
                </div>` : ''}

                ${o.note ? `
                <div class="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-xs text-amber-900">
                    <span class="font-bold">Ghi chú phiếu nhập:</span> ${o.note}
                </div>` : ''}

                <div class="border border-slate-200 rounded-xl overflow-hidden">
                    <div class="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 uppercase">
                        Danh Sách Sản Phẩm Thuốc Nhập Kho (${(o.items || []).length} mục)
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="bg-slate-50 text-[11px] text-slate-500 font-semibold border-b border-slate-200">
                                <tr>
                                    <th class="p-2 text-center w-8">#</th>
                                    <th class="p-2 w-28">Mã Hàng</th>
                                    <th class="p-2">Tên Thuốc</th>
                                    <th class="p-2 w-24">Số Lô</th>
                                    <th class="p-2 w-24">Hạn Dùng</th>
                                    <th class="p-2 text-center w-28">SL Nhập (Đã Trả)</th>
                                    <th class="p-2 text-right w-24">Đơn Giá Vốn</th>
                                    <th class="p-2 text-right w-28">Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>

                ${returnsSectionHtml}

                <div class="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                    <span class="text-slate-500">Tồn kho các loại thuốc trên đã được cộng dồn theo đơn vị cơ bản.</span>
                    <div class="text-right">
                        <span class="text-slate-600 font-bold mr-2">TỔNG CỘNG TIỀN NHẬP:</span>
                        <span class="text-base font-black text-emerald-700">${AppUtils.formatVND(o.totalAmount)}</span>
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');

        const btnEdit = document.getElementById('btn-edit-from-stockin-detail');
        if (btnEdit) {
            btnEdit.onclick = () => this.openEditStockInModal(orderId);
        }

        const btnReturn = document.getElementById('btn-return-from-stockin-detail');
        if (btnReturn) {
            if (o.returnStatus === 'fully_returned') {
                btnReturn.style.display = 'none';
            } else {
                btnReturn.style.display = '';
                btnReturn.onclick = () => {
                    this.closeStockInDetailModal();
                    this.openReturnStockInModal(orderId);
                };
            }
        }

        const btnPrintBarcode = document.getElementById('btn-print-barcode-from-stockin-detail');
        if (btnPrintBarcode) {
            btnPrintBarcode.onclick = () => {
                if (window.BarcodePrinterModule) {
                    BarcodePrinterModule.openForStockInOrder(orderId);
                }
            };
        }
        if (window.lucide) lucide.createIcons();
    },

    closeStockInDetailModal() {
        document.getElementById('modal-stockin-detail')?.classList.add('hidden');
    },

    viewStockInDetails(orderId) {
        this.openStockInDetailModal(orderId);
    },

    // =========================================================
    // NGHIỆP VỤ XUẤT TRẢ HÀNG NHẬP CHO NHÀ CUNG CẤP (PURCHASE RETURN)
    // =========================================================
    openReturnStockInModal(stockInId) {
        const orders = Store.getStockInOrders();
        const o = orders.find(x => x.id === stockInId);
        if (!o) {
            alert('Không tìm thấy thông tin phiếu nhập kho!');
            return;
        }

        this.pendingReturnStockInId = stockInId;
        this.returnStockInPaymentMethod = 'cash'; // Mặc định nhận tiền mặt

        const modal = document.getElementById('modal-return-stockin');
        const refIdText = document.getElementById('return-stockin-ref-id');
        const supplierText = document.getElementById('return-stockin-supplier');
        const noteInput = document.getElementById('return-stockin-note');
        const reasonSelect = document.getElementById('return-stockin-reason-select');
        const reasonCustom = document.getElementById('return-stockin-reason-custom');
        const tbody = document.getElementById('return-stockin-items-tbody');

        if (!modal || !tbody) return;

        if (refIdText) refIdText.innerText = o.id;
        if (supplierText) supplierText.innerText = o.supplierName || 'Nhà cung cấp';
        if (noteInput) noteInput.value = '';
        if (reasonSelect) reasonSelect.value = 'Hàng cận date / Hết hạn sử dụng';
        if (reasonCustom) {
            reasonCustom.value = '';
            reasonCustom.classList.add('hidden');
        }

        this.setReturnStockInPaymentMethod('cash');

        let rowsHtml = '';
        (o.items || []).forEach((item, idx) => {
            const med = Store.getMedicineById(item.medicineId);

            // Tính số lượng đã trả trước đó trong phiếu này
            const alreadyReturned = (o.returns || []).reduce((sum, r) => {
                const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                return sum + (ri ? ri.quantity : 0);
            }, 0);

            const remainingFromInvoice = Math.max(0, item.quantity - alreadyReturned);

            // Tính số lượng tồn kho thực tế quy đổi theo đơn vị phiếu nhập
            let currentStockInUnit = 0;
            if (med) {
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    currentStockInUnit = Math.floor((med.stockUnits || 0) / med.packRatio);
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    currentStockInUnit = Math.floor((med.stockUnits || 0) / med.subRatio);
                } else {
                    currentStockInUnit = med.stockUnits || 0;
                }
            }

            const maxReturnable = Math.min(remainingFromInvoice, Math.max(0, currentStockInUnit));

            let inputColumnHtml = '';
            if (remainingFromInvoice <= 0) {
                inputColumnHtml = `<span class="inline-block text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded">Đã trả hết</span>`;
            } else if (currentStockInUnit <= 0) {
                inputColumnHtml = `<span class="inline-block text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded italic" title="Kho đã xuất hết loại thuốc này">Hết tồn kho</span>`;
            } else {
                inputColumnHtml = `
                    <div class="flex items-center justify-center gap-1">
                        <input type="number" id="return-qty-${idx}" min="0" max="${maxReturnable}" value="0"
                               data-index="${idx}" data-max="${maxReturnable}" data-cost="${item.costPrice}"
                               data-medid="${item.medicineId}" data-name="${item.medicineName}" data-unit="${item.unit}"
                               data-batch="${item.batchNo || ''}" data-expiry="${item.expiryDate || ''}"
                               oninput="InventoryModule.updateReturnStockInCalculations()"
                               class="w-16 px-2 py-1 text-center font-bold border border-rose-300 rounded-lg focus:ring-1 focus:ring-rose-500 text-xs bg-white" />
                        <button type="button" onclick="InventoryModule.setReturnStockInQtyMax(${idx}, ${maxReturnable})"
                                class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold cursor-pointer transition"
                                title="Điền số lượng tối đa có thể trả (${maxReturnable})">Hết</button>
                    </div>
                `;
            }

            rowsHtml += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
                    <td class="p-2.5 text-center text-slate-400 font-mono">${idx + 1}</td>
                    <td class="p-2.5 font-mono font-bold text-emerald-800">${item.medicineId || '---'}</td>
                    <td class="p-2.5 font-bold text-slate-800">${item.medicineName}</td>
                    <td class="p-2.5 text-slate-600 font-mono text-[11px]">
                        ${item.batchNo || '---'} • ${AppUtils.formatDate(item.expiryDate) || '---'}
                    </td>
                    <td class="p-2.5 text-center font-semibold text-slate-700">${item.quantity} ${item.unit}</td>
                    <td class="p-2.5 text-center font-bold text-rose-700">${alreadyReturned} ${item.unit}</td>
                    <td class="p-2.5 text-center">
                        <span class="inline-block px-2 py-0.5 rounded font-mono font-bold ${currentStockInUnit > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-400'}">
                            ${currentStockInUnit} ${item.unit}
                        </span>
                    </td>
                    <td class="p-2.5 text-center bg-rose-50/30">
                        ${inputColumnHtml}
                    </td>
                    <td class="p-2.5 text-right font-medium text-slate-700">${AppUtils.formatVND(item.costPrice)}</td>
                    <td class="p-2.5 text-right font-bold text-rose-700 font-mono">
                        <span id="return-line-subtotal-${idx}">0 đ</span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = rowsHtml;
        this.updateReturnStockInCalculations();

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closeReturnStockInModal() {
        document.getElementById('modal-return-stockin')?.classList.add('hidden');
        this.pendingReturnStockInId = null;
    },

    setReturnStockInPaymentMethod(method) {
        this.returnStockInPaymentMethod = method;

        const btnCash = document.getElementById('btn-return-pay-cash');
        const btnTransfer = document.getElementById('btn-return-pay-transfer');
        const methodText = document.getElementById('return-stockin-payment-method-text');

        if (method === 'cash') {
            btnCash?.classList.add('border-amber-500', 'text-amber-700', 'shadow-xs');
            btnCash?.classList.remove('border-slate-200', 'text-slate-600');
            btnTransfer?.classList.remove('border-blue-500', 'text-blue-700', 'shadow-xs');
            btnTransfer?.classList.add('border-slate-200', 'text-slate-600');
            if (methodText) methodText.innerHTML = '<i data-lucide="banknote" class="w-3.5 h-3.5 inline mr-1"></i>Hình thức: Nhận <b>Tiền Mặt</b> vào quỹ';
        } else {
            btnTransfer?.classList.add('border-blue-500', 'text-blue-700', 'shadow-xs');
            btnTransfer?.classList.remove('border-slate-200', 'text-slate-600');
            btnCash?.classList.remove('border-amber-500', 'text-amber-700', 'shadow-xs');
            btnCash?.classList.add('border-slate-200', 'text-slate-600');
            if (methodText) methodText.innerHTML = '<i data-lucide="qr-code" class="w-3.5 h-3.5 inline mr-1"></i>Hình thức: Nhận <b>Chuyển Khoản</b> vào tài khoản';
        }
        if (window.lucide) lucide.createIcons();
    },

    onReturnReasonChange() {
        const select = document.getElementById('return-stockin-reason-select');
        const customInput = document.getElementById('return-stockin-reason-custom');
        if (!select || !customInput) return;

        if (select.value === 'custom') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    },

    setReturnStockInQtyMax(idx, max) {
        const input = document.getElementById(`return-qty-${idx}`);
        if (input) {
            input.value = max;
            this.updateReturnStockInCalculations();
        }
    },

    setReturnStockInQtyAll(isAll) {
        const inputs = document.querySelectorAll('#return-stockin-items-tbody input[type="number"]');
        inputs.forEach(input => {
            const max = parseInt(input.dataset.max) || 0;
            input.value = isAll ? max : 0;
        });
        this.updateReturnStockInCalculations();
    },

    updateReturnStockInCalculations() {
        const inputs = document.querySelectorAll('#return-stockin-items-tbody input[type="number"]');
        let totalCount = 0;
        let totalRefund = 0;

        inputs.forEach(input => {
            let val = parseInt(input.value) || 0;
            const max = parseInt(input.dataset.max) || 0;
            if (val > max) {
                val = max;
                input.value = max;
            }
            if (val < 0) {
                val = 0;
                input.value = 0;
            }

            const cost = parseFloat(input.dataset.cost) || 0;
            const lineSubtotal = val * cost;

            const subtotalSpan = document.getElementById(`return-line-subtotal-${input.dataset.index}`);
            if (subtotalSpan) {
                subtotalSpan.innerText = AppUtils.formatVND(lineSubtotal);
            }

            if (val > 0) {
                totalCount++;
                totalRefund += lineSubtotal;
            }
        });

        const countEl = document.getElementById('return-stockin-summary-count');
        const amountEl = document.getElementById('return-stockin-summary-amount');

        if (countEl) countEl.innerText = totalCount;
        if (amountEl) amountEl.innerText = AppUtils.formatVND(totalRefund);
    },

    confirmReturnStockIn() {
        if (!this.pendingReturnStockInId) {
            alert('Không có thông tin phiếu nhập cần trả hàng!');
            return;
        }

        const inputs = document.querySelectorAll('#return-stockin-items-tbody input[type="number"]');
        const returnedItems = [];

        inputs.forEach(input => {
            const val = parseInt(input.value) || 0;
            if (val > 0) {
                returnedItems.push({
                    medicineId: input.dataset.medid,
                    medicineName: input.dataset.name,
                    unit: input.dataset.unit,
                    quantity: val,
                    costPrice: parseFloat(input.dataset.cost) || 0,
                    batchNo: input.dataset.batch,
                    expiryDate: input.dataset.expiry
                });
            }
        });

        if (returnedItems.length === 0) {
            alert('Vui lòng chọn số lượng ít nhất một mặt hàng thuốc để xuất trả (lớn hơn 0)!');
            return;
        }

        const reasonSelect = document.getElementById('return-stockin-reason-select');
        const reasonCustom = document.getElementById('return-stockin-reason-custom');
        const noteInput = document.getElementById('return-stockin-note');

        let reason = reasonSelect ? reasonSelect.value : 'Trả hàng cho nhà cung cấp';
        if (reason === 'custom') {
            reason = (reasonCustom && reasonCustom.value.trim()) ? reasonCustom.value.trim() : 'Trả hàng cho nhà cung cấp';
        }
        const note = noteInput ? noteInput.value.trim() : '';

        const returnIdPending = this.pendingReturnStockInId;
        const res = Store.returnStockInItems(
            returnIdPending,
            returnedItems,
            reason,
            this.returnStockInPaymentMethod || 'cash',
            note
        );

        if (!res.success) {
            alert(res.message);
            return;
        }

        this.closeReturnStockInModal();

        if (window.App && App.showToast) {
            App.showToast(`Đã xuất trả ${returnedItems.length} loại thuốc và tạo phiếu thu tiền hoàn từ NCC thành công!`, 'success');
        }

        this.renderStockInHistory();
        this.renderStockInSummaryCards();
        this.renderMedicineTable();

        if (this.currentHistoryMedId) {
            const med = Store.getMedicineById(this.currentHistoryMedId);
            if (med) this.renderMedicineHistoryViews(med);
        }

        // Tự động mở modal xem & in phiếu trả hàng vừa tạo
        setTimeout(() => {
            this.printPurchaseReturn(res.returnRecord.id);
        }, 300);
    },

    // --- XEM TRƯỚC VÀ IN PHIẾU XUẤT TRẢ HÀNG NHẬP (PURCHASE RETURN NOTE) ---
    printPurchaseReturn(returnId) {
        const orders = Store.getStockInOrders();
        let foundRecord = null;
        let parentStockIn = null;

        for (const o of orders) {
            const r = (o.returns || []).find(x => x.id === returnId);
            if (r) {
                foundRecord = r;
                parentStockIn = o;
                break;
            }
        }

        if (!foundRecord || !parentStockIn) {
            alert('Không tìm thấy thông tin phiếu xuất trả hàng này!');
            return;
        }

        const modal = document.getElementById('modal-print-purchase-return');
        const container = document.getElementById('purchase-return-print-content');
        if (!modal || !container) return;

        const settings = Store.getSettings();
        const isCash = (foundRecord.paymentMethod || 'cash') === 'cash';

        let rowsHtml = '';
        (foundRecord.items || []).forEach((it, idx) => {
            rowsHtml += `
                <tr class="border-b border-slate-200 text-xs">
                    <td class="p-2 text-center text-slate-500 font-mono">${idx + 1}</td>
                    <td class="p-2 font-mono font-bold text-slate-700">${it.medicineId || '---'}</td>
                    <td class="p-2 font-bold text-slate-900">${it.medicineName}</td>
                    <td class="p-2 text-center font-semibold text-slate-700">${it.unit}</td>
                    <td class="p-2 text-center font-bold text-slate-900">${it.quantity}</td>
                    <td class="p-2 text-right font-medium text-slate-700">${AppUtils.formatVND(it.costPrice)}</td>
                    <td class="p-2 text-right font-bold text-rose-700 font-mono">${AppUtils.formatVND(it.totalRefund)}</td>
                </tr>
            `;
        });

        container.innerHTML = `
            <div class="receipt-paper bg-white text-slate-900 mx-auto p-4 sm:p-6 shadow-sm font-sans text-xs space-y-4">
                <!-- Header Thông tin Nhà Thuốc -->
                <div class="flex items-start justify-between pb-3 border-b-2 border-slate-800">
                    <div>
                        <h2 class="font-black text-base sm:text-lg uppercase text-slate-900 tracking-tight">${settings.pharmacyName || 'MEDICA PHARMACY'}</h2>
                        <p class="text-[11px] text-slate-600">${settings.address || 'Địa chỉ: 123 Đường Y Dược, Hà Nội'}</p>
                        <p class="text-[11px] text-slate-600">Hotline: <b>${settings.phone || '0988.000.xxx'}</b></p>
                    </div>
                    <div class="text-right">
                        <span class="inline-block px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-300 rounded font-bold text-[11px]">
                            MẪU XUẤT TRẢ NCC
                        </span>
                    </div>
                </div>

                <!-- Tiêu đề Phiếu -->
                <div class="text-center my-2 space-y-1">
                    <h1 class="font-black text-lg uppercase text-slate-900 tracking-wide">PHIẾU XUẤT TRẢ HÀNG NHẬP KHO</h1>
                    <div class="text-xs font-mono font-bold text-slate-700">Số phiếu: <span class="text-rose-700">${foundRecord.id}</span></div>
                    <div class="text-[11px] text-slate-500">Ngày xuất trả: ${AppUtils.formatDateTime(foundRecord.createdAt)}</div>
                </div>

                <!-- Thông tin giao dịch & Nhà cung cấp -->
                <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div>
                        <span class="text-slate-500">Nhà cung cấp:</span>
                        <div class="font-bold text-slate-900">${foundRecord.supplierName || parentStockIn.supplierName || '---'}</div>
                    </div>
                    <div>
                        <span class="text-slate-500">Phiếu nhập gốc:</span>
                        <div class="font-mono font-bold text-emerald-800">${parentStockIn.id}</div>
                    </div>
                    <div>
                        <span class="text-slate-500">Hình thức hoàn tiền:</span>
                        <div class="font-bold ${isCash ? 'text-amber-800' : 'text-blue-800'}">
                            ${isCash ? 'Tiền Mặt (Đã nộp vào quỹ)' : 'Chuyển Khoản (Đã nhận vào TK)'}
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-500">Dược sĩ phụ trách:</span>
                        <div class="font-bold text-slate-800">${foundRecord.pharmacist || 'DS. Nguyễn Thanh Dung'}</div>
                    </div>
                    <div class="col-span-2">
                        <span class="text-slate-500">Lý do xuất trả:</span>
                        <div class="font-medium text-slate-800 italic">${foundRecord.reason || 'Trả hàng cho NCC'}</div>
                    </div>
                    ${foundRecord.note ? `
                    <div class="col-span-2">
                        <span class="text-slate-500">Ghi chú:</span>
                        <div class="text-slate-700">${foundRecord.note}</div>
                    </div>` : ''}
                </div>

                <!-- Bảng danh sách hàng xuất trả -->
                <div class="border border-slate-200 rounded-xl overflow-hidden">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 uppercase text-[11px]">
                            <tr>
                                <th class="p-2 text-center w-8">#</th>
                                <th class="p-2 w-20">Mã Thuốc</th>
                                <th class="p-2">Tên Thuốc</th>
                                <th class="p-2 text-center w-16">ĐVT</th>
                                <th class="p-2 text-center w-16">SL Trả</th>
                                <th class="p-2 text-right w-24">Đơn Giá Vốn</th>
                                <th class="p-2 text-right w-28">Thành Tiền</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>

                <!-- Tổng kết tiền hoàn trả -->
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-bold text-slate-700 uppercase">TỔNG TIỀN HOÀN TRẢ NCC:</span>
                        <span class="text-base font-black text-rose-700 font-mono">${AppUtils.formatVND(foundRecord.refundTotal)}</span>
                    </div>
                    <div class="text-[11px] text-slate-500 italic">
                        (Số lượng thuốc trên đã tự động giảm trừ khỏi kho hàng. Số tiền đã được hạch toán vào Sổ Quỹ Thu Chi).
                    </div>
                </div>

                <!-- Chữ ký 2 bên -->
                <div class="grid grid-cols-2 text-center text-xs text-slate-700 pt-4">
                    <div>
                        <p class="font-bold uppercase">Đại Diện Nhà Cung Cấp</p>
                        <p class="italic text-[10px] text-slate-400">(Ký, ghi rõ họ tên)</p>
                        <div class="h-16"></div>
                        <p class="font-semibold text-slate-800">${foundRecord.supplierName || '---'}</p>
                    </div>
                    <div>
                        <p class="font-bold uppercase">Người Lập Phiếu</p>
                        <p class="italic text-[10px] text-slate-400">(Ký, ghi rõ họ tên)</p>
                        <div class="h-16"></div>
                        <p class="font-semibold text-slate-800">${foundRecord.pharmacist || 'DS. Nguyễn Thanh Dung'}</p>
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closePurchaseReturnPrintModal() {
        document.getElementById('modal-print-purchase-return')?.classList.add('hidden');
    },

    executePrintPurchaseReturn() {
        window.print();
    },

    // --- MODAL XEM LỊCH SỬ NHẬP / BÁN CỦA TỪNG LOẠI THUỐC ---
    openMedicineHistoryModal(medicineId) {
        const med = Store.getMedicineById(medicineId);
        if (!med) return;

        this.currentHistoryMedId = medicineId;

        const modal = document.getElementById('modal-medicine-history');
        if (!modal) return;

        document.getElementById('med-history-name').innerText = med.name;
        document.getElementById('med-history-sub').innerText = `Mã: ${med.id} • Hoạt chất: ${med.activeIngredient || '---'} • Nhóm: ${med.category || 'Thuốc chung'} • Quy cách: 1 ${med.packUnit || 'Hộp'} = ${med.packRatio} ${med.baseUnit}`;
        document.getElementById('med-history-current-stock').innerText = AppUtils.formatStockUnitsDisplay(med);

        const canViewCost = !window.AuthModule || AuthModule.canViewCostPrice();
        const tabBtnStockIn = document.getElementById('med-history-tab-btn-stockin');
        if (tabBtnStockIn) {
            tabBtnStockIn.style.display = canViewCost ? '' : 'none';
        }

        const initialTab = canViewCost ? 'stockin' : 'sales';
        this.currentHistoryTab = initialTab;

        this.renderMedicineHistoryViews(med);
        this.switchMedicineHistoryTab(initialTab);

        modal.classList.remove('hidden');
        const btnJump = document.getElementById('btn-med-history-jump-inventory');
        if (btnJump) {
            btnJump.onclick = () => this.jumpToInventoryMedicine(medicineId);
        }
        if (window.lucide) lucide.createIcons();
    },

    closeMedicineHistoryModal() {
        document.getElementById('modal-medicine-history')?.classList.add('hidden');
        this.currentHistoryMedId = null;
    },

    jumpToInventoryMedicine(medicineId) {
        this.closeMedicineHistoryModal();
        if (window.OrdersModule && OrdersModule.closeOrderDetailsModal) {
            OrdersModule.closeOrderDetailsModal();
        }
        if (window.OrdersModule && OrdersModule.closeReturnModal) {
            OrdersModule.closeReturnModal();
        }
        this.closeStockInDetailModal();
        if (window.App && App.switchTab) {
            App.switchTab('inventory');
        }
        const searchInput = document.getElementById('inventory-search');
        if (searchInput) {
            const med = Store.getMedicineById(medicineId);
            searchInput.value = med ? med.name : medicineId;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.focus();
        }
    },

    switchMedicineHistoryTab(tab) {
        const canViewCost = !window.AuthModule || AuthModule.canViewCostPrice();
        if (tab === 'stockin' && !canViewCost) {
            tab = 'sales';
        }
        this.currentHistoryTab = tab;
        const btnStockIn = document.getElementById('med-history-tab-btn-stockin');
        const btnSales = document.getElementById('med-history-tab-btn-sales');
        const viewStockIn = document.getElementById('med-history-view-stockin');
        const viewSales = document.getElementById('med-history-view-sales');

        const activeClass = ['border-emerald-600', 'text-emerald-700', 'font-bold'];
        const inactiveClass = ['border-transparent', 'text-slate-500', 'font-medium'];

        if (tab === 'stockin') {
            btnStockIn?.classList.add(...activeClass);
            btnStockIn?.classList.remove(...inactiveClass);
            btnSales?.classList.remove(...activeClass);
            btnSales?.classList.add(...inactiveClass);
            viewStockIn?.classList.remove('hidden');
            viewSales?.classList.add('hidden');
        } else {
            btnSales?.classList.add(...activeClass);
            btnSales?.classList.remove(...inactiveClass);
            btnStockIn?.classList.remove(...activeClass);
            btnStockIn?.classList.add(...inactiveClass);
            viewSales?.classList.remove('hidden');
            viewStockIn?.classList.add('hidden');
        }
        if (window.lucide) lucide.createIcons();
    },

    renderMedicineHistoryViews(med) {
        const stockInHistory = Store.getMedicineStockInHistory(med.id);
        const salesHistory = Store.getMedicineSalesHistory(med.id);

        let totalImportedUnits = 0;
        let totalImportCost = 0;
        stockInHistory.forEach(h => {
            let units = h.quantity;
            if (h.unit === med.packUnit && med.packRatio > 1) units = h.quantity * med.packRatio;
            else if (h.unit === med.subUnit && med.subRatio > 1) units = h.quantity * med.subRatio;
            totalImportedUnits += units;
            totalImportCost += h.totalAmount;
        });

        let totalSoldUnits = 0;
        let totalSalesRevenue = 0;
        salesHistory.forEach(s => {
            if (!s.isCancelled) {
                const netQty = Math.max(0, s.quantity - (s.returnedQuantity || 0));
                let units = netQty;
                if (s.unit === med.packUnit && med.packRatio > 1) units = netQty * med.packRatio;
                else if (s.unit === med.subUnit && med.subRatio > 1) units = netQty * med.subRatio;
                totalSoldUnits += units;
                totalSalesRevenue += (netQty * s.price);
            }
        });

        const canViewCost = !window.AuthModule || AuthModule.canViewCostPrice();
        const elTotalImport = document.getElementById('med-history-stat-imported');
        const elTotalSold = document.getElementById('med-history-stat-sold');
        if (elTotalImport) {
            if (canViewCost) {
                elTotalImport.innerText = `${AppUtils.formatNumber(totalImportedUnits)} ${med.baseUnit} (${AppUtils.formatVND(totalImportCost)})`;
            } else {
                elTotalImport.innerText = `${AppUtils.formatNumber(totalImportedUnits)} ${med.baseUnit} (Chỉ Quản trị viên)`;
            }
        }
        if (elTotalSold) elTotalSold.innerText = `${AppUtils.formatNumber(totalSoldUnits)} ${med.baseUnit} (${AppUtils.formatVND(totalSalesRevenue)})`;

        // Render bảng Lịch sử Nhập
        const tbodyStockIn = document.getElementById('med-history-stockin-tbody');
        if (tbodyStockIn) {
            if (!canViewCost) {
                tbodyStockIn.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-400 text-xs">Bạn không có quyền xem thông tin nhập kho và giá vốn. Vui lòng đăng nhập tài khoản Quản trị viên (Admin).</td></tr>';
            } else if (stockInHistory.length === 0) {
                tbodyStockIn.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-400 text-xs">Chưa có lịch sử phiếu nhập nào cho thuốc này.</td></tr>';
            } else {
                let html = '';
                stockInHistory.forEach((h, idx) => {
                    const isCash = h.paymentMethod === 'cash';
                    html += `
                        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
                            <td class="p-2.5 text-center text-slate-400 font-mono">${idx + 1}</td>
                            <td class="p-2.5 font-mono font-bold text-emerald-700">${h.orderId}</td>
                            <td class="p-2.5 text-slate-600">${AppUtils.formatDateTime(h.createdAt)}</td>
                            <td class="p-2.5 font-medium text-slate-800">${h.supplierName}</td>
                            <td class="p-2.5 font-mono text-slate-600">${h.batchNo} • HSD: ${AppUtils.formatDate(h.expiryDate)}</td>
                            <td class="p-2.5 text-center font-bold text-slate-800">${h.quantity} ${h.unit}</td>
                            <td class="p-2.5 text-right font-medium text-slate-700">${AppUtils.formatVND(h.costPrice)}</td>
                            <td class="p-2.5 text-right font-bold text-emerald-700 font-mono">${AppUtils.formatVND(h.totalAmount)}</td>
                        </tr>
                    `;
                });
                tbodyStockIn.innerHTML = html;
            }
        }

        // Render bảng Lịch sử Bán
        const tbodySales = document.getElementById('med-history-sales-tbody');
        if (tbodySales) {
            if (salesHistory.length === 0) {
                tbodySales.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-400 text-xs">Chưa có lịch sử bán nào cho thuốc này.</td></tr>';
            } else {
                let html = '';
                salesHistory.forEach((s, idx) => {
                    let statusBadge = '';
                    if (s.isCancelled) statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">ĐÃ HỦY</span>';
                    else if (s.returnStatus === 'fully_returned') statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">ĐÃ TRẢ HẾT</span>';
                    else if (s.returnStatus === 'partially_returned') statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">TRẢ 1 PHẦN</span>';
                    else statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">Hoàn tất</span>';

                    html += `
                        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs ${s.isCancelled ? 'opacity-50 line-through' : ''}">
                            <td class="p-2.5 text-center text-slate-400 font-mono">${idx + 1}</td>
                            <td class="p-2.5 font-mono font-bold text-slate-800">${s.orderId}</td>
                            <td class="p-2.5 text-slate-600">${AppUtils.formatDateTime(s.createdAt)}</td>
                            <td class="p-2.5 font-medium text-slate-800">${s.customerName}</td>
                            <td class="p-2.5 text-center font-bold text-slate-800">
                                ${s.quantity} ${s.unit}
                                ${s.returnedQuantity > 0 ? `<div class="text-[10px] text-rose-600 font-bold">(Đã trả: ${s.returnedQuantity})</div>` : ''}
                            </td>
                            <td class="p-2.5 text-right font-medium text-slate-700">${AppUtils.formatVND(s.price)}</td>
                            <td class="p-2.5 text-right font-bold text-slate-900 font-mono">${AppUtils.formatVND(s.totalAmount)}</td>
                            <td class="p-2.5 text-center">${statusBadge}</td>
                        </tr>
                    `;
                });
                tbodySales.innerHTML = html;
            }
        }
    }
};

window.InventoryModule = InventoryModule;

