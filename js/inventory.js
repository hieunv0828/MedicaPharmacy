/**
 * MedicaPharmacy - Inventory & Stock-In Management Module
 * Quản lý Kho thuốc, Danh mục thuốc GPP và Nghiệp vụ Nhập thuốc từ NCC
 */

const InventoryModule = {
    currentFilterCategory: 'all',
    currentFilterStatus: 'all',
    searchKeyword: '',
    currentPage: 1,
    pageSize: 25,
    stockInSearchKeyword: '',
    stockInTimeFilter: 'this_month',
    stockInPaymentFilter: 'all', // 'all', 'cash', 'transfer'
    stockInDateFrom: '',
    stockInDateTo: '',
    stockInCurrentPage: 1,
    stockInPageSize: 25,
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
    addingMedicineFromStockIn: false,

    // Quản lý Trả Hàng Nhà Cung Cấp (Phương án A)
    stockInSubTab: 'orders', // 'orders' hoặc 'returns'
    returnsFilterType: 'all', // 'all', 'stockin', 'general'
    returnsTimeFilter: 'this_month',
    returnsDateFrom: '',
    returnsDateTo: '',
    returnsSearchKeyword: '',
    returnsCurrentPage: 1,
    returnsPageSize: 25,
    generalReturnDraft: {
        supplierId: '',
        supplierName: '',
        paymentMethod: 'cash',
        reason: 'Hàng cận date / Hết hạn sử dụng',
        note: '',
        items: []
    },

    init() {
        this.renderCategoryFilter();
        this.renderMedicineTable();
        this.renderSuppliersDropdown();
        this.renderStockInHistory();
        this.renderStockInSummaryCards();
        this.renderStockInSubTabs();
        this.renderReturnsHistory();
        this.renderReturnsSummaryCards();
        this.bindEvents();

        // Lắng nghe sự kiện thay đổi dữ liệu từ Store
        Store.on('medicines:changed', () => {
            this.renderMedicineTable();
            this.updateInventoryStats();
        });

        Store.on('stockin:changed', () => {
            this.renderStockInHistory();
            this.renderStockInSummaryCards();
            this.renderStockInSubTabs();
            this.renderReturnsHistory();
            this.renderReturnsSummaryCards();
        });

        Store.on('returns:changed', () => {
            this.renderReturnsHistory();
            this.renderReturnsSummaryCards();
            this.renderStockInSubTabs();
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
                this.currentPage = 1;
                this.renderMedicineTable();
            });
        }

        // Lọc theo nhóm thuốc
        const catSelect = document.getElementById('inventory-filter-category');
        if (catSelect) {
            catSelect.addEventListener('change', (e) => {
                this.currentFilterCategory = e.target.value;
                this.currentPage = 1;
                this.renderMedicineTable();
            });
        }

        // Lọc theo trạng thái tồn kho / hạn dùng
        const statusSelect = document.getElementById('inventory-filter-status');
        if (statusSelect) {
            statusSelect.addEventListener('change', (e) => {
                this.currentFilterStatus = e.target.value;
                this.currentPage = 1;
                this.renderMedicineTable();
            });
        }

        // --- Tìm kiếm & Lọc thời gian lịch sử Nhập Thuốc ---
        const stockInSearch = document.getElementById('stockin-search-input');
        if (stockInSearch) {
            stockInSearch.addEventListener('input', (e) => {
                this.stockInSearchKeyword = e.target.value.trim().toLowerCase();
                this.stockInCurrentPage = 1;
                this.renderStockInHistory();
            });
        }

        const stockInTimeSel = document.getElementById('stockin-time-filter');
        if (stockInTimeSel) {
            stockInTimeSel.addEventListener('change', (e) => {
                this.stockInTimeFilter = e.target.value;
                this.stockInCurrentPage = 1;
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
                this.stockInCurrentPage = 1;
                this.renderStockInHistory();
            });
        }

        const dateTo = document.getElementById('stockin-date-to');
        if (dateTo) {
            dateTo.addEventListener('change', (e) => {
                this.stockInDateTo = e.target.value;
                this.stockInCurrentPage = 1;
                this.renderStockInHistory();
            });
        }

        // --- Tìm kiếm & Lọc thời gian lịch sử Trả Hàng NCC ---
        const returnsSearch = document.getElementById('returns-search-input');
        if (returnsSearch) {
            returnsSearch.addEventListener('input', (e) => {
                this.returnsSearchKeyword = e.target.value.trim().toLowerCase();
                this.returnsCurrentPage = 1;
                this.renderReturnsHistory();
            });
        }

        const returnsTimeSel = document.getElementById('returns-time-filter');
        if (returnsTimeSel) {
            returnsTimeSel.addEventListener('change', (e) => {
                this.returnsTimeFilter = e.target.value;
                this.returnsCurrentPage = 1;
                const customDiv = document.getElementById('returns-custom-dates');
                if (customDiv) {
                    if (e.target.value === 'custom') {
                        customDiv.classList.remove('hidden');
                    } else {
                        customDiv.classList.add('hidden');
                    }
                }
                this.renderReturnsHistory();
            });
        }

        const retDateFrom = document.getElementById('returns-date-from');
        if (retDateFrom) {
            retDateFrom.addEventListener('change', (e) => {
                this.returnsDateFrom = e.target.value;
                this.returnsCurrentPage = 1;
                this.renderReturnsHistory();
            });
        }

        const retDateTo = document.getElementById('returns-date-to');
        if (retDateTo) {
            retDateTo.addEventListener('change', (e) => {
                this.returnsDateTo = e.target.value;
                this.returnsCurrentPage = 1;
                this.renderReturnsHistory();
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

    // --- PHÂN TRANG KHO THUỐC ---
    changePageSize(newSize) {
        this.pageSize = (newSize === 'all') ? 'all' : parseInt(newSize, 10);
        this.currentPage = 1;
        this.renderMedicineTable();
    },

    goToPage(page) {
        this.currentPage = page;
        this.renderMedicineTable();
    },

    renderPaginationControls(total, totalPages, startIdx, count) {
        const pageInfoEl = document.getElementById('inventory-page-info');
        const badgeTotal = document.getElementById('inventory-count-badge');
        const btnsEl = document.getElementById('inventory-pagination-buttons');
        
        if (badgeTotal) badgeTotal.innerText = total;

        if (pageInfoEl) {
            if (total === 0) {
                pageInfoEl.innerText = "0";
            } else {
                pageInfoEl.innerText = `${startIdx + 1} - ${startIdx + count}`;
            }
        }

        if (!btnsEl) return;

        if (this.pageSize === 'all' || totalPages <= 1) {
            btnsEl.innerHTML = '';
            return;
        }

        const cur = this.currentPage;
        let html = '';

        html += `
            <button onclick="InventoryModule.goToPage(1)" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Về trang đầu">
                «
            </button>
        `;

        html += `
            <button onclick="InventoryModule.goToPage(${cur - 1})" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang trước">
                ‹
            </button>
        `;

        let startPage = Math.max(1, cur - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let p = startPage; p <= endPage; p++) {
            if (p === cur) {
                html += `
                    <button class="p-1 px-2.5 rounded bg-emerald-600 text-white text-xs font-black shadow-xs cursor-default">
                        ${p}
                    </button>
                `;
            } else {
                html += `
                    <button onclick="InventoryModule.goToPage(${p})" 
                            class="p-1 px-2.5 rounded bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 text-xs font-bold transition cursor-pointer">
                        ${p}
                    </button>
                `;
            }
        }

        html += `
            <button onclick="InventoryModule.goToPage(${cur + 1})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang sau">
                ›
            </button>
        `;

        html += `
            <button onclick="InventoryModule.goToPage(${totalPages})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Đến trang cuối">
                »
            </button>
        `;

        btnsEl.innerHTML = html;
    },

    renderMedicineTable() {
        const tbody = document.getElementById('medicine-table-body');
        if (!tbody) return;

        let medicines = Store.getMedicines();

        // Lọc theo từ khóa
        if (this.searchKeyword) {
            medicines = medicines.filter(m => 
                (m.id && m.id.toLowerCase().includes(this.searchKeyword)) ||
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

        const total = medicines.length;

        if (total === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-12 text-slate-400">
                        <i data-lucide="package-x" class="w-10 h-10 mx-auto mb-2 opacity-50"></i>
                        Không tìm thấy loại thuốc nào phù hợp điều kiện lọc.
                    </td>
                </tr>
            `;
            this.renderPaginationControls(0, 1, 0, 0);
            if (window.lucide) lucide.createIcons();
            return;
        }

        const totalPages = (this.pageSize === 'all') ? 1 : Math.max(1, Math.ceil(total / this.pageSize));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        let displayedMedicines = medicines;
        let startIdx = 0;
        if (this.pageSize !== 'all') {
            startIdx = (this.currentPage - 1) * this.pageSize;
            displayedMedicines = medicines.slice(startIdx, startIdx + this.pageSize);
        }

        this.renderPaginationControls(total, totalPages, startIdx, displayedMedicines.length);

        let html = '';
        const canViewCost = !window.AuthModule || AuthModule.canViewCostPrice();
        const canEdit = !window.AuthModule || AuthModule.canEditInventory();

        const thCost = document.getElementById('th-cost-price');
        if (thCost) {
            thCost.style.display = canViewCost ? '' : 'none';
        }

        displayedMedicines.forEach((m, idx) => {
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
                    <td class="py-3 px-3 whitespace-nowrap">
                        <span class="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block hover:bg-emerald-100 transition cursor-pointer" ${nameClickAction} title="Mã thuốc: ${m.id} (nhấn để mở)">${m.id || '---'}</span>
                    </td>
                    <td class="py-3 px-3">
                        <div>
                            <span class="font-bold text-slate-800 text-sm hover:text-emerald-700 cursor-pointer" ${nameClickAction} title="${canEdit ? 'Nhấn để sửa thông tin thuốc' : 'Nhấn để xem thông tin tồn kho & lịch sử'}">${m.name}</span>
                        </div>
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
        const medIdInput = document.getElementById('med-id');
        if (medIdInput) {
            medIdInput.value = '';
            medIdInput.readOnly = false;
        }

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

        const medIdInput = document.getElementById('med-id');
        if (medIdInput) {
            medIdInput.value = med.id;
            medIdInput.readOnly = true;
        }
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

    // Mở modal Thêm Thuốc Mới nhanh từ Phiếu Nhập Kho
    openMedicineModalFromStockIn(initialKeyword = '') {
        if (window.AuthModule && !AuthModule.canEditInventory()) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền thêm thuốc mới. Chỉ Quản trị viên (Admin) mới có quyền này!', 'warning');
            } else {
                alert('Chỉ Admin mới có quyền thêm thuốc mới!');
            }
            return;
        }

        this.addingMedicineFromStockIn = true;
        this.currentEditingMedId = null;

        const modal = document.getElementById('modal-medicine');
        if (!modal) return;
        // Đặt z-index cao hơn modal phiếu nhập kho để hiển thị trọn vẹn ở trên
        modal.style.zIndex = '70';

        document.getElementById('modal-medicine-title').innerText = 'Thêm Thuốc Mới Vào Kho (Cho Phiếu Nhập)';
        document.getElementById('form-medicine').reset();
        const medIdInput = document.getElementById('med-id');
        if (medIdInput) {
            medIdInput.value = '';
            medIdInput.readOnly = false;
        }

        // Nạp nhóm thuốc & nhà cung cấp
        this.populateCategoryOptions('med-category');
        this.populateSupplierOptions('med-supplier');

        if (window.SearchableSelect) {
            SearchableSelect.init('med-category', { richType: 'category', placeholder: '🔍 Tìm hoặc chọn nhóm dược lý...' });
            SearchableSelect.init('med-supplier', { richType: 'supplier', placeholder: '🔍 Tìm hoặc chọn nhà cung cấp...' });
            SearchableSelect.refresh('med-category');
            SearchableSelect.refresh('med-supplier');
        }

        // Tự động điền NCC đang chọn ở phiếu nhập kho nếu có
        const stockInSupId = document.getElementById('stockin-supplier')?.value;
        if (stockInSupId) {
            const medSup = document.getElementById('med-supplier');
            if (medSup) {
                medSup.value = stockInSupId;
                if (window.SearchableSelect) SearchableSelect.refresh('med-supplier');
            }
        }

        // Nếu người dùng có từ khóa đang gõ dở, điền vào tên thuốc
        if (initialKeyword && typeof initialKeyword === 'string') {
            document.getElementById('med-name').value = initialKeyword.trim();
        }

        modal.classList.remove('hidden');
        document.getElementById('med-name').focus();
    },

    closeMedicineModal() {
        const modal = document.getElementById('modal-medicine');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.zIndex = '';
        }
        this.addingMedicineFromStockIn = false;
    },

    saveMedicineFromForm(e) {
        e.preventDefault();

        const name = document.getElementById('med-name').value.trim();
        if (!name) {
            alert('Vui lòng nhập tên thuốc!');
            return;
        }

        const rawId = document.getElementById('med-id')?.value.trim();
        if (!this.currentEditingMedId && rawId) {
            const existing = Store.getMedicineById(rawId);
            if (existing) {
                alert(`Mã thuốc "${rawId}" đã tồn tại trong hệ thống (${existing.name})! Vui lòng nhập mã khác hoặc để trống.`);
                return;
            }
        }

        const medData = {
            id: rawId || (this.currentEditingMedId ? this.currentEditingMedId : undefined),
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

        const savedMed = Store.saveMedicine(medData);
        const wasAddingFromStockIn = this.addingMedicineFromStockIn;
        this.closeMedicineModal();
        AppUtils.playBeepSound('beep');

        // Nếu đang thêm từ phiếu nhập kho, tự động chọn thuốc vừa thêm vào phiếu nhập
        if (wasAddingFromStockIn && savedMed) {
            this.populateStockInMedicineSelector();
            if (window.SearchableSelect) {
                SearchableSelect.refresh('stockin-medicine-select');
            }
            const sel = document.getElementById('stockin-medicine-select');
            if (sel) {
                sel.value = savedMed.id;
                this.onStockInMedicineChange();
            }
            if (window.App && typeof App.showToast === 'function') {
                App.showToast(`Đã thêm thuốc "${savedMed.name}" vào danh mục và chọn vào phiếu nhập!`, 'success');
            }
        }
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
    openAddSupplierModal(initialName = '') {
        if (window.AuthModule && !AuthModule.canEditInventory()) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền thêm nhà cung cấp mới. Chỉ Admin mới được phép!', 'warning');
            }
            return;
        }

        const modal = document.getElementById('modal-add-supplier');
        if (!modal) return;
        modal.style.zIndex = '70';
        const autoId = 'NCC' + String(Date.now()).slice(-4);
        const inputId = document.getElementById('supplier-input-id');
        if (inputId) inputId.value = autoId;
        document.getElementById('supplier-input-name').value = initialName || '';
        document.getElementById('supplier-input-phone').value = '';
        document.getElementById('supplier-input-address').value = '';
        document.getElementById('supplier-input-note').value = '';
        modal.classList.remove('hidden');
        document.getElementById('supplier-input-name')?.focus();
    },

    closeAddSupplierModal() {
        const modal = document.getElementById('modal-add-supplier');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.zIndex = '';
        }
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
            medicines.map(m => `<option value="${m.id}">[${m.id}] ${m.name} [${m.packUnit || 'Hộp'}] (Hiện còn: ${m.stockUnits || 0} ${m.baseUnit})</option>`).join('');
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

    // --- CHUYỂN ĐỔI SUB-TAB: PHIẾU NHẬP HÀNG VS QUẢN LÝ TRẢ HÀNG NCC (PHƯƠNG ÁN A) ---
    switchStockInSubTab(tab) {
        this.stockInSubTab = tab;
        const viewOrders = document.getElementById('subtab-view-stockin-orders');
        const viewReturns = document.getElementById('subtab-view-stockin-returns');
        const btnOrders = document.getElementById('subtab-btn-stockin-orders');
        const btnReturns = document.getElementById('subtab-btn-stockin-returns');

        const activeOrdersClass = ['bg-emerald-600', 'text-white', 'shadow-sm'];
        const inactiveOrdersClass = ['bg-white', 'text-slate-600', 'hover:bg-slate-100', 'border', 'border-slate-200'];

        const activeReturnsClass = ['bg-rose-600', 'text-white', 'shadow-sm'];
        const inactiveReturnsClass = ['bg-white', 'text-slate-600', 'hover:bg-slate-100', 'border', 'border-slate-200'];

        if (tab === 'orders') {
            viewOrders?.classList.remove('hidden');
            viewReturns?.classList.add('hidden');

            btnOrders?.classList.remove(...inactiveOrdersClass);
            btnOrders?.classList.add(...activeOrdersClass);

            btnReturns?.classList.remove(...activeReturnsClass);
            btnReturns?.classList.add(...inactiveReturnsClass);

            this.renderStockInHistory();
            this.renderStockInSummaryCards();
        } else {
            viewOrders?.classList.add('hidden');
            viewReturns?.classList.remove('hidden');

            btnOrders?.classList.remove(...activeOrdersClass);
            btnOrders?.classList.add(...inactiveOrdersClass);

            btnReturns?.classList.remove(...inactiveReturnsClass);
            btnReturns?.classList.add(...activeReturnsClass);

            this.renderReturnsHistory();
            this.renderReturnsSummaryCards();
        }

        this.renderStockInSubTabs();
        if (window.lucide) lucide.createIcons();
    },

    renderStockInSubTabs() {
        const badgeOrders = document.getElementById('badge-subtab-stockin-orders');
        const badgeReturns = document.getElementById('badge-subtab-stockin-returns');

        const totalOrders = (Store.getStockInOrders() || []).length;
        const totalReturns = (Store.getAllPurchaseReturns ? Store.getAllPurchaseReturns() : []).length;

        if (badgeOrders) badgeOrders.innerText = totalOrders;
        if (badgeReturns) badgeReturns.innerText = totalReturns;
    },

    // --- QUẢN LÝ TRẢ HÀNG NHÀ CUNG CẤP (BẢNG, LỌC, PHÂN TRANG) ---
    setReturnsFilterType(type) {
        this.returnsFilterType = type;
        this.returnsCurrentPage = 1;

        const btnAll = document.getElementById('tab-btn-returns-all');
        const btnStockIn = document.getElementById('tab-btn-returns-stockin');
        const btnGeneral = document.getElementById('tab-btn-returns-general');

        if (btnAll) btnAll.className = 'tab-filter-btn' + (type === 'all' ? ' active-rose' : '');
        if (btnStockIn) btnStockIn.className = 'tab-filter-btn' + (type === 'stockin' ? ' active-blue' : '');
        if (btnGeneral) btnGeneral.className = 'tab-filter-btn' + (type === 'general' ? ' active-amber' : '');

        this.renderReturnsHistory();
    },

    getFilteredReturns() {
        let returns = Store.getAllPurchaseReturns ? Store.getAllPurchaseReturns() : [];

        // 1. Phân loại: Theo đơn nhập kho (THN) vs Trả tổng hợp (PTH)
        if (this.returnsFilterType === 'stockin') {
            returns = returns.filter(r => r.returnType === 'stockin_return' || r.stockInId);
        } else if (this.returnsFilterType === 'general') {
            returns = returns.filter(r => r.returnType === 'general_return' || !r.stockInId);
        }

        // 2. Lọc thời gian
        returns = returns.filter(r =>
            AppUtils.matchesTimeFilter(r.createdAt, this.returnsTimeFilter, this.returnsDateFrom, this.returnsDateTo)
        );

        // 3. Tìm kiếm
        if (this.returnsSearchKeyword) {
            const q = this.returnsSearchKeyword;
            returns = returns.filter(r => {
                const matchHeader = (r.id && r.id.toLowerCase().includes(q)) ||
                                    (r.supplierName && r.supplierName.toLowerCase().includes(q)) ||
                                    (r.reason && r.reason.toLowerCase().includes(q)) ||
                                    (r.stockInId && r.stockInId.toLowerCase().includes(q));
                if (matchHeader) return true;

                return (r.items || []).some(item =>
                    (item.medicineName && item.medicineName.toLowerCase().includes(q)) ||
                    (item.medicineId && item.medicineId.toLowerCase().includes(q)) ||
                    (item.batchNo && item.batchNo.toLowerCase().includes(q))
                );
            });
        }

        return returns;
    },

    renderReturnsSummaryCards() {
        const allReturns = Store.getAllPurchaseReturns ? Store.getAllPurchaseReturns() : [];
        
        // Lọc theo mốc thời gian đang chọn
        let periodReturns = allReturns.filter(r =>
            AppUtils.matchesTimeFilter(r.createdAt, this.returnsTimeFilter, this.returnsDateFrom, this.returnsDateTo)
        );

        // Lọc theo từ khóa tìm kiếm (nếu có)
        if (this.returnsSearchKeyword) {
            const q = this.returnsSearchKeyword;
            periodReturns = periodReturns.filter(r => {
                const matchHeader = (r.id && r.id.toLowerCase().includes(q)) ||
                                    (r.supplierName && r.supplierName.toLowerCase().includes(q)) ||
                                    (r.reason && r.reason.toLowerCase().includes(q)) ||
                                    (r.stockInId && r.stockInId.toLowerCase().includes(q));
                if (matchHeader) return true;

                return (r.items || []).some(item =>
                    (item.medicineName && item.medicineName.toLowerCase().includes(q)) ||
                    (item.medicineId && item.medicineId.toLowerCase().includes(q)) ||
                    (item.batchNo && item.batchNo.toLowerCase().includes(q))
                );
            });
        }

        const totalRefund = periodReturns.reduce((sum, r) => sum + (r.refundTotal || 0), 0);
        const cashRefund = periodReturns.filter(r => (r.paymentMethod || 'cash') === 'cash').reduce((sum, r) => sum + (r.refundTotal || 0), 0);
        const transferRefund = periodReturns.filter(r => r.paymentMethod === 'transfer').reduce((sum, r) => sum + (r.refundTotal || 0), 0);

        const cardRefund = document.getElementById('card-return-total-refund');
        const cardCash = document.getElementById('card-return-total-cash');
        const cardTransfer = document.getElementById('card-return-total-transfer');

        if (cardRefund) cardRefund.innerText = AppUtils.formatVND(totalRefund);
        if (cardCash) cardCash.innerText = AppUtils.formatVND(cashRefund);
        if (cardTransfer) cardTransfer.innerText = AppUtils.formatVND(transferRefund);

        // Cập nhật badges bộ lọc theo kỳ lọc
        const badgeAll = document.getElementById('badge-returns-filter-all');
        const badgeStockIn = document.getElementById('badge-returns-filter-stockin');
        const badgeGeneral = document.getElementById('badge-returns-filter-general');

        if (badgeAll) badgeAll.innerText = periodReturns.length;
        if (badgeStockIn) badgeStockIn.innerText = periodReturns.filter(r => r.returnType === 'stockin_return' || r.stockInId).length;
        if (badgeGeneral) badgeGeneral.innerText = periodReturns.filter(r => r.returnType === 'general_return' || !r.stockInId).length;

        this.renderStockInSubTabs();
    },

    changeReturnsPageSize(newSize) {
        this.returnsPageSize = (newSize === 'all') ? 'all' : parseInt(newSize, 10);
        this.returnsCurrentPage = 1;
        this.renderReturnsHistory();
    },

    goToReturnsPage(page) {
        this.returnsCurrentPage = page;
        this.renderReturnsHistory();
    },

    renderReturnsPaginationControls(total, totalPages, startIdx, count) {
        const pageInfoEl = document.getElementById('returns-page-info');
        const badgeTotal = document.getElementById('returns-count-badge');
        const btnsEl = document.getElementById('returns-pagination-buttons');

        if (badgeTotal) badgeTotal.innerText = total;

        if (total === 0) {
            if (pageInfoEl) pageInfoEl.innerText = '0 - 0';
            if (btnsEl) btnsEl.innerHTML = '';
            return;
        }

        const endIdx = startIdx + count;
        if (pageInfoEl) {
            pageInfoEl.innerText = `${startIdx + 1} - ${endIdx}`;
        }

        if (!btnsEl) return;
        if (totalPages <= 1) {
            btnsEl.innerHTML = '';
            return;
        }

        const cur = this.returnsCurrentPage;
        let html = '';

        html += `
            <button onclick="InventoryModule.goToReturnsPage(1)" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 cursor-pointer'} transition" 
                    title="Về trang đầu">«</button>
            <button onclick="InventoryModule.goToReturnsPage(${cur - 1})" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 cursor-pointer'} transition" 
                    title="Trang trước">‹</button>
        `;

        let startPage = Math.max(1, cur - 2);
        let endPage = Math.min(totalPages, cur + 2);
        if (startPage > 1) {
            html += `<button onclick="InventoryModule.goToReturnsPage(1)" class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold bg-white text-slate-700 hover:bg-rose-50 cursor-pointer transition">1</button>`;
            if (startPage > 2) html += `<span class="px-1 text-slate-400 text-xs">...</span>`;
        }

        for (let p = startPage; p <= endPage; p++) {
            if (p === cur) {
                html += `<button class="p-1 px-2.5 rounded border border-rose-600 bg-rose-600 text-white text-xs font-bold shadow-xs">${p}</button>`;
            } else {
                html += `<button onclick="InventoryModule.goToReturnsPage(${p})" class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold bg-white text-slate-700 hover:bg-rose-50 cursor-pointer transition">${p}</button>`;
            }
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span class="px-1 text-slate-400 text-xs">...</span>`;
            html += `<button onclick="InventoryModule.goToReturnsPage(${totalPages})" class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold bg-white text-slate-700 hover:bg-rose-50 cursor-pointer transition">${totalPages}</button>`;
        }

        html += `
            <button onclick="InventoryModule.goToReturnsPage(${cur + 1})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 cursor-pointer'} transition" 
                    title="Trang kế">›</button>
            <button onclick="InventoryModule.goToReturnsPage(${totalPages})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 cursor-pointer'} transition" 
                    title="Đến trang cuối">»</button>
        `;

        btnsEl.innerHTML = html;
    },

    renderReturnsHistory() {
        const tbody = document.getElementById('returns-history-tbody');
        if (!tbody) return;

        this.renderReturnsSummaryCards();

        const returns = this.getFilteredReturns();
        const total = returns.length;

        const totalPages = (this.returnsPageSize === 'all') ? 1 : Math.max(1, Math.ceil(total / this.returnsPageSize));
        if (this.returnsCurrentPage > totalPages) this.returnsCurrentPage = totalPages;
        if (this.returnsCurrentPage < 1) this.returnsCurrentPage = 1;

        let displayed = returns;
        let startIdx = 0;
        if (this.returnsPageSize !== 'all') {
            startIdx = (this.returnsCurrentPage - 1) * this.returnsPageSize;
            displayed = returns.slice(startIdx, startIdx + this.returnsPageSize);
        }

        this.renderReturnsPaginationControls(total, totalPages, startIdx, displayed.length);

        if (displayed.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-10 text-slate-400 text-xs">
                        <i data-lucide="rotate-ccw" class="w-8 h-8 mx-auto mb-2 opacity-30"></i>
                        Chưa có phiếu xuất trả hàng nào cho Nhà Cung Cấp.
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        let html = '';
        displayed.forEach(r => {
            const isCash = (r.paymentMethod || 'cash') === 'cash';
            const methodBadge = isCash
                ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"><i data-lucide="banknote" class="w-3 h-3"></i> Tiền mặt</span>'
                : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"><i data-lucide="qr-code" class="w-3 h-3"></i> Chuyển khoản</span>';

            const isStockIn = (r.returnType === 'stockin_return' || r.stockInId);
            const typeBadge = isStockIn
                ? `<button onclick="InventoryModule.openStockInDetailModal('${r.stockInId}')" class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 transition cursor-pointer" title="Bấm để xem phiếu nhập gốc ${r.stockInId}"><i data-lucide="package" class="w-3 h-3"></i> Đơn ${r.stockInId}</button>`
                : `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200"><i data-lucide="layers" class="w-3 h-3"></i> Trả tổng hợp</span>`;

            const itemCount = r.items ? r.items.length : 0;
            const itemsSummary = (r.items || []).map(i => `${i.medicineName} (${i.quantity} ${i.unit})`).join(', ');

            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 text-sm">
                    <td class="py-3 px-3 font-mono font-bold text-rose-700">
                        <span class="cursor-pointer hover:underline" onclick="InventoryModule.openPurchaseReturnDetailModal('${r.id}')">${r.id}</span>
                    </td>
                    <td class="py-3 px-3">${typeBadge}</td>
                    <td class="py-3 px-3 text-slate-600 text-xs">${AppUtils.formatDateTime(r.createdAt)}</td>
                    <td class="py-3 px-3">${methodBadge}</td>
                    <td class="py-3 px-3 font-medium text-slate-800">${r.supplierName || '---'}</td>
                    <td class="py-3 px-3 text-xs text-slate-600 max-w-xs">
                        <span class="font-bold text-slate-700">${itemCount} loại thuốc:</span>
                        <span class="line-clamp-1 italic text-slate-500" title="${itemsSummary}">${itemsSummary}</span>
                        ${r.reason ? `<div class="text-[11px] text-rose-700/80 mt-0.5 truncate" title="${r.reason}">Lý do: ${r.reason}</div>` : ''}
                    </td>
                    <td class="py-3 px-3 text-right font-black font-mono text-rose-700">
                        ${AppUtils.formatVND(r.refundTotal || 0)}
                    </td>
                    <td class="py-3 px-3 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="InventoryModule.printPurchaseReturn('${r.id}')" title="In phiếu xuất trả hàng" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer">
                                <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                                <span>In</span>
                            </button>
                            <button onclick="InventoryModule.openPurchaseReturnDetailModal('${r.id}')" title="Xem chi tiết phiếu trả hàng" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer">
                                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                                <span>Xem</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    // --- TAB LỌC THANH TOÁN TIỀN MẶT / CHUYỂN KHOẢN / ĐÃ TRẢ HÀNG KHI NHẬP HÀNG ---
    setStockInPaymentFilter(method) {
        this.stockInPaymentFilter = method;
        this.stockInCurrentPage = 1;

        const btnAll = document.getElementById('tab-btn-stockin-all');
        const btnCash = document.getElementById('tab-btn-stockin-cash');
        const btnTransfer = document.getElementById('tab-btn-stockin-transfer');
        const btnReturned = document.getElementById('tab-btn-stockin-returned');

        if (btnAll) btnAll.className = 'tab-filter-btn' + (method === 'all' ? ' active-emerald' : '');
        if (btnCash) btnCash.className = 'tab-filter-btn' + (method === 'cash' ? ' active-amber' : '');
        if (btnTransfer) btnTransfer.className = 'tab-filter-btn' + (method === 'transfer' ? ' active-blue' : '');
        if (btnReturned) btnReturned.className = 'tab-filter-btn' + (method === 'returned' ? ' active-rose' : '');

        this.renderStockInHistory();
    },

    renderStockInSummaryCards() {
        const allOrders = Store.getStockInOrders();
        
        let filtered = allOrders.filter(o =>
            AppUtils.matchesTimeFilter(o.createdAt, this.stockInTimeFilter, this.stockInDateFrom, this.stockInDateTo)
        );

        if (this.stockInSearchKeyword) {
            const q = this.stockInSearchKeyword;
            filtered = filtered.filter(o => {
                const matchOrder = (o.id && o.id.toLowerCase().includes(q)) ||
                                   (o.supplierName && o.supplierName.toLowerCase().includes(q)) ||
                                   (o.supplierId && o.supplierId.toLowerCase().includes(q)) ||
                                   (o.note && o.note.toLowerCase().includes(q));
                if (matchOrder) return true;

                return (o.items || []).some(item =>
                    (item.medicineName && item.medicineName.toLowerCase().includes(q)) ||
                    (item.medicineId && item.medicineId.toLowerCase().includes(q)) ||
                    (item.batchNo && item.batchNo.toLowerCase().includes(q))
                );
            });
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
        orders = orders.filter(o =>
            AppUtils.matchesTimeFilter(o.createdAt, this.stockInTimeFilter, this.stockInDateFrom, this.stockInDateTo)
        );

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

    // --- PHÂN TRANG LỊCH SỬ NHẬP KHO ---
    changeStockInPageSize(newSize) {
        this.stockInPageSize = (newSize === 'all') ? 'all' : parseInt(newSize, 10);
        this.stockInCurrentPage = 1;
        this.renderStockInHistory();
    },

    goToStockInPage(page) {
        this.stockInCurrentPage = page;
        this.renderStockInHistory();
    },

    renderStockInPaginationControls(total, totalPages, startIdx, count) {
        const pageInfoEl = document.getElementById('stockin-page-info');
        const badgeTotal = document.getElementById('stockin-count-badge');
        const btnsEl = document.getElementById('stockin-pagination-buttons');
        
        if (badgeTotal) badgeTotal.innerText = total;

        if (pageInfoEl) {
            if (total === 0) {
                pageInfoEl.innerText = "0";
            } else {
                pageInfoEl.innerText = `${startIdx + 1} - ${startIdx + count}`;
            }
        }

        if (!btnsEl) return;

        if (this.stockInPageSize === 'all' || totalPages <= 1) {
            btnsEl.innerHTML = '';
            return;
        }

        const cur = this.stockInCurrentPage;
        let html = '';

        html += `
            <button onclick="InventoryModule.goToStockInPage(1)" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Về trang đầu">
                «
            </button>
        `;

        html += `
            <button onclick="InventoryModule.goToStockInPage(${cur - 1})" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang trước">
                ‹
            </button>
        `;

        let startPage = Math.max(1, cur - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let p = startPage; p <= endPage; p++) {
            if (p === cur) {
                html += `
                    <button class="p-1 px-2.5 rounded bg-emerald-600 text-white text-xs font-black shadow-xs cursor-default">
                        ${p}
                    </button>
                `;
            } else {
                html += `
                    <button onclick="InventoryModule.goToStockInPage(${p})" 
                            class="p-1 px-2.5 rounded bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 text-xs font-bold transition cursor-pointer">
                        ${p}
                    </button>
                `;
            }
        }

        html += `
            <button onclick="InventoryModule.goToStockInPage(${cur + 1})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang sau">
                ›
            </button>
        `;

        html += `
            <button onclick="InventoryModule.goToStockInPage(${totalPages})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Đến trang cuối">
                »
            </button>
        `;

        btnsEl.innerHTML = html;
    },

    renderStockInHistory() {
        const tbody = document.getElementById('stockin-history-tbody');
        if (!tbody) return;

        this.renderStockInSummaryCards();

        const stockInOrders = this.getFilteredStockInOrders();
        const total = stockInOrders.length;

        if (total === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 text-sm">Không tìm thấy phiếu nhập kho nào thỏa mãn điều kiện lọc.</td></tr>`;
            this.renderStockInPaginationControls(0, 1, 0, 0);
            return;
        }

        const totalPages = (this.stockInPageSize === 'all') ? 1 : Math.max(1, Math.ceil(total / this.stockInPageSize));
        if (this.stockInCurrentPage > totalPages) this.stockInCurrentPage = totalPages;
        if (this.stockInCurrentPage < 1) this.stockInCurrentPage = 1;

        let displayedOrders = stockInOrders;
        let startIdx = 0;
        if (this.stockInPageSize !== 'all') {
            startIdx = (this.stockInCurrentPage - 1) * this.stockInPageSize;
            displayedOrders = stockInOrders.slice(startIdx, startIdx + this.stockInPageSize);
        }

        this.renderStockInPaginationControls(total, totalPages, startIdx, displayedOrders.length);

        let html = '';
        displayedOrders.forEach((o, idx) => {
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
        let foundRecord = Store.getPurchaseReturnById ? Store.getPurchaseReturnById(returnId) : null;
        let parentStockIn = null;

        if (!foundRecord) {
            const orders = Store.getStockInOrders();
            for (const o of orders) {
                const r = (o.returns || []).find(x => x.id === returnId);
                if (r) {
                    foundRecord = r;
                    parentStockIn = o;
                    break;
                }
            }
        } else if (foundRecord.stockInId) {
            parentStockIn = Store.getStockInOrders().find(o => o.id === foundRecord.stockInId);
        }

        if (!foundRecord) {
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
                    <td class="p-2 text-right font-bold text-rose-700 font-mono">${AppUtils.formatVND(it.totalRefund || (it.quantity * it.costPrice))}</td>
                </tr>
            `;
        });

        const isStockIn = (foundRecord.returnType === 'stockin_return' || foundRecord.stockInId);

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
                            ${isStockIn ? 'TRẢ THEO ĐƠN NHẬP' : 'TRẢ TỔNG HỢP'}
                        </span>
                    </div>
                </div>

                <!-- Tiêu đề Phiếu -->
                <div class="text-center my-2 space-y-1">
                    <h1 class="font-black text-lg uppercase text-slate-900 tracking-wide">PHIẾU XUẤT TRẢ HÀNG CHO NHÀ CUNG CẤP</h1>
                    <div class="text-xs font-mono font-bold text-slate-700">Số phiếu: <span class="text-rose-700">${foundRecord.id}</span></div>
                    <div class="text-[11px] text-slate-500">Ngày xuất trả: ${AppUtils.formatDateTime(foundRecord.createdAt)}</div>
                </div>

                <!-- Thông tin giao dịch & Nhà cung cấp -->
                <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div>
                        <span class="text-slate-500">Nhà cung cấp:</span>
                        <div class="font-bold text-slate-900">${foundRecord.supplierName || (parentStockIn ? parentStockIn.supplierName : '---')}</div>
                    </div>
                    <div>
                        <span class="text-slate-500">Phân loại xuất trả:</span>
                        <div class="font-mono font-bold ${parentStockIn ? 'text-blue-800' : 'text-rose-800'}">
                            ${parentStockIn ? ('Theo đơn nhập ' + parentStockIn.id) : 'Xuất trả hàng tổng hợp'}
                        </div>
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
                                <th class="p-2 text-right w-24">Đơn Giá Hoàn</th>
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

    // --- MODAL LẬP PHIẾU XUẤT TRẢ HÀNG TỔNG HỢP CHO NCC (GENERAL PURCHASE RETURN) ---
    openGeneralPurchaseReturnModal() {
        this.generalReturnDraft = {
            supplierId: '',
            supplierName: '',
            paymentMethod: 'cash',
            reason: 'Hàng cận date / Hết hạn sử dụng',
            note: '',
            items: []
        };

        this.setGeneralReturnPaymentMethod('cash');
        this.populateGeneralReturnSelectors();

        const reasonSelect = document.getElementById('general-return-reason-select');
        const reasonCustom = document.getElementById('general-return-reason-custom');
        const noteInput = document.getElementById('general-return-note');
        if (reasonSelect) reasonSelect.value = 'Hàng cận date / Hết hạn sử dụng';
        if (reasonCustom) {
            reasonCustom.value = '';
            reasonCustom.classList.add('hidden');
        }
        if (noteInput) noteInput.value = '';

        this.renderGeneralReturnDraftItems();

        if (window.SearchableSelect) {
            SearchableSelect.init('general-return-supplier', { richType: 'supplier', placeholder: '🔍 Tìm nhà cung cấp...' });
            SearchableSelect.init('general-return-medicine-select', { richType: 'medicine', placeholder: '🔍 Tìm tên thuốc cần trả...' });
            SearchableSelect.refresh('general-return-supplier');
            SearchableSelect.refresh('general-return-medicine-select');
        }

        document.getElementById('modal-general-purchase-return')?.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closeGeneralPurchaseReturnModal() {
        document.getElementById('modal-general-purchase-return')?.classList.add('hidden');
    },

    setGeneralReturnPaymentMethod(method) {
        this.generalReturnDraft.paymentMethod = method;
        const btnCash = document.getElementById('btn-gen-return-cash');
        const btnTransfer = document.getElementById('btn-gen-return-transfer');

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

    onGeneralReturnReasonChange() {
        const select = document.getElementById('general-return-reason-select');
        const customInput = document.getElementById('general-return-reason-custom');
        if (!select || !customInput) return;

        if (select.value === 'custom') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    },

    populateGeneralReturnSelectors() {
        // NCC
        const supSel = document.getElementById('general-return-supplier');
        if (supSel) {
            const suppliers = Store.getSuppliers();
            supSel.innerHTML = '<option value="">-- Chọn Nhà Cung Cấp nhận hàng --</option>' +
                suppliers.map(s => `<option value="${s.id}">${s.name} (${s.phone || 'Chưa có SĐT'})</option>`).join('');
        }

        // Thuốc trong kho
        const medSel = document.getElementById('general-return-medicine-select');
        if (medSel) {
            const medicines = Store.getMedicines();
            medSel.innerHTML = '<option value="">-- Chọn thuốc trong kho cần xuất trả --</option>' +
                medicines.map(m => `<option value="${m.id}">[${m.id}] ${m.name} [${m.packUnit || 'Hộp'}] (Kho còn: ${m.stockUnits || 0} ${m.baseUnit})</option>`).join('');
        }

        // Reset inputs
        const unitSel = document.getElementById('general-return-unit-select');
        if (unitSel) unitSel.innerHTML = '<option value="Hộp">Hộp</option>';
        const qtyInput = document.getElementById('general-return-qty');
        if (qtyInput) qtyInput.value = 1;
        const priceInput = document.getElementById('general-return-cost-price');
        if (priceInput) priceInput.value = 0;
        const hintEl = document.getElementById('gen-return-med-stock-hint');
        if (hintEl) hintEl.innerText = 'Tồn kho khả dụng: ---';
    },

    onGeneralReturnMedicineChange() {
        const medSel = document.getElementById('general-return-medicine-select');
        const medId = medSel ? medSel.value : '';
        if (!medId) return;

        const med = Store.getMedicineById(medId);
        if (!med) return;

        // Populate unit select
        const unitSel = document.getElementById('general-return-unit-select');
        if (unitSel) {
            let unitOptions = '';
            if (med.packUnit) unitOptions += `<option value="${med.packUnit}">${med.packUnit} (Quy cách 1=${med.packRatio || 1} ${med.baseUnit})</option>`;
            if (med.subUnit && med.subRatio > 1 && med.subUnit !== med.packUnit) {
                unitOptions += `<option value="${med.subUnit}">${med.subUnit} (Quy cách 1=${med.subRatio || 1} ${med.baseUnit})</option>`;
            }
            if (med.baseUnit && med.baseUnit !== med.packUnit && med.baseUnit !== med.subUnit) {
                unitOptions += `<option value="${med.baseUnit}">${med.baseUnit} (Đơn vị cơ bản)</option>`;
            }
            unitSel.innerHTML = unitOptions;
        }

        // Batch & Expiry
        const batchInput = document.getElementById('general-return-batch');
        const expiryInput = document.getElementById('general-return-expiry');
        if (batchInput) batchInput.value = med.batchNo || '';
        if (expiryInput) expiryInput.value = med.expiryDate || '';

        this.onGeneralReturnUnitChange();
    },

    onGeneralReturnUnitChange() {
        const medSel = document.getElementById('general-return-medicine-select');
        const medId = medSel ? medSel.value : '';
        const med = Store.getMedicineById(medId);
        if (!med) return;

        const unitSel = document.getElementById('general-return-unit-select');
        const selectedUnit = unitSel ? unitSel.value : med.packUnit;

        // Calculate available stock in unit
        let maxInUnit = 0;
        let defaultCost = med.costPrice || 0;

        if (selectedUnit === med.packUnit && (med.packRatio || 1) > 1) {
            maxInUnit = Math.floor((med.stockUnits || 0) / med.packRatio);
            defaultCost = med.costPrice || 0;
        } else if (selectedUnit === med.subUnit && (med.subRatio || 1) > 1) {
            maxInUnit = Math.floor((med.stockUnits || 0) / med.subRatio);
            defaultCost = Math.round((med.costPrice || 0) * (med.subRatio / (med.packRatio || 1)));
        } else {
            maxInUnit = med.stockUnits || 0;
            defaultCost = Math.round((med.costPrice || 0) / (med.packRatio || 1));
        }

        const hintEl = document.getElementById('gen-return-med-stock-hint');
        if (hintEl) {
            hintEl.innerHTML = `Tồn kho khả dụng: <b class="text-rose-700">${maxInUnit} ${selectedUnit}</b> (Tổng ${med.stockUnits || 0} ${med.baseUnit})`;
        }

        const qtyInput = document.getElementById('general-return-qty');
        if (qtyInput) {
            qtyInput.max = maxInUnit;
            qtyInput.value = maxInUnit > 0 ? 1 : 0;
        }

        const priceInput = document.getElementById('general-return-cost-price');
        if (priceInput) priceInput.value = defaultCost;
    },

    validateGeneralReturnQtyInput() {
        const qtyInput = document.getElementById('general-return-qty');
        if (!qtyInput) return;
        const max = parseInt(qtyInput.max, 10) || 0;
        let val = parseInt(qtyInput.value, 10) || 0;
        if (val > max) qtyInput.value = max;
        if (val < 0) qtyInput.value = 0;
    },

    addItemToGeneralReturnDraft() {
        const medSel = document.getElementById('general-return-medicine-select');
        const medId = medSel ? medSel.value : '';
        if (!medId) {
            alert('Vui lòng chọn thuốc trong kho để xuất trả!');
            return;
        }

        const med = Store.getMedicineById(medId);
        if (!med) return;

        const unitSel = document.getElementById('general-return-unit-select');
        const unit = unitSel ? unitSel.value : med.packUnit;

        const qtyInput = document.getElementById('general-return-qty');
        const qty = parseInt(qtyInput ? qtyInput.value : 0, 10) || 0;

        const priceInput = document.getElementById('general-return-cost-price');
        const costPrice = parseFloat(priceInput ? priceInput.value : 0) || 0;

        const batch = document.getElementById('general-return-batch')?.value.trim() || med.batchNo || '';
        const expiry = document.getElementById('general-return-expiry')?.value || med.expiryDate || '';

        if (qty <= 0) {
            alert('Số lượng thuốc xuất trả phải lớn hơn 0!');
            return;
        }

        // Check stock availability
        let unitsToDeduct = qty;
        if (unit === med.packUnit && (med.packRatio || 1) > 1) {
            unitsToDeduct = qty * med.packRatio;
        } else if (unit === med.subUnit && (med.subRatio || 1) > 1) {
            unitsToDeduct = qty * med.subRatio;
        }

        const alreadyInDraftUnits = (this.generalReturnDraft.items || []).filter(i => i.medicineId === med.id).reduce((sum, i) => {
            let u = i.quantity;
            if (i.unit === med.packUnit && (med.packRatio || 1) > 1) u = i.quantity * med.packRatio;
            else if (i.unit === med.subUnit && (med.subRatio || 1) > 1) u = i.quantity * med.subRatio;
            return sum + u;
        }, 0);

        if ((med.stockUnits || 0) < (alreadyInDraftUnits + unitsToDeduct)) {
            alert(`Tồn kho không đủ! Thuốc [${med.name}] hiện chỉ còn ${med.stockUnits || 0} ${med.baseUnit}, đã thêm ${alreadyInDraftUnits} ${med.baseUnit} vào danh sách trả.`);
            return;
        }

        this.generalReturnDraft.items.push({
            medicineId: med.id,
            medicineName: med.name,
            unit: unit,
            quantity: qty,
            costPrice: costPrice,
            batchNo: batch,
            expiryDate: expiry
        });

        this.renderGeneralReturnDraftItems();

        // Reset medicine selector
        if (medSel) medSel.value = '';
        if (window.SearchableSelect) SearchableSelect.refresh('general-return-medicine-select');
        const hintEl = document.getElementById('gen-return-med-stock-hint');
        if (hintEl) hintEl.innerText = 'Tồn kho khả dụng: ---';
        if (qtyInput) qtyInput.value = 1;
        if (priceInput) priceInput.value = 0;
    },

    removeItemFromGeneralReturnDraft(idx) {
        this.generalReturnDraft.items.splice(idx, 1);
        this.renderGeneralReturnDraftItems();
    },

    renderGeneralReturnDraftItems() {
        const tbody = document.getElementById('general-return-items-tbody');
        if (!tbody) return;

        const items = this.generalReturnDraft.items || [];
        const countEl = document.getElementById('gen-return-draft-count');
        const summaryCountEl = document.getElementById('gen-return-summary-items-count');
        const summaryAmountEl = document.getElementById('gen-return-summary-total-amount');

        if (countEl) countEl.innerText = items.length;
        if (summaryCountEl) summaryCountEl.innerText = items.length;

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-6 text-slate-400 italic">
                        Chưa có mặt hàng nào. Hãy chọn thuốc ở trên và bấm "Thêm Thuốc".
                    </td>
                </tr>
            `;
            if (summaryAmountEl) summaryAmountEl.innerText = '0 đ';
            return;
        }

        let totalRefund = 0;
        let html = '';
        items.forEach((it, idx) => {
            const lineTotal = it.quantity * it.costPrice;
            totalRefund += lineTotal;

            html += `
                <tr class="hover:bg-slate-50 text-xs border-b border-slate-100">
                    <td class="p-2 text-center text-slate-400 font-mono">${idx + 1}</td>
                    <td class="p-2 font-mono font-bold text-rose-700">${it.medicineId}</td>
                    <td class="p-2 font-bold text-slate-800">${it.medicineName}</td>
                    <td class="p-2 text-slate-600 font-mono text-[11px]">
                        ${it.batchNo || '---'} • ${AppUtils.formatDate(it.expiryDate) || '---'}
                    </td>
                    <td class="p-2 text-center font-bold text-slate-800">
                        ${it.quantity} ${it.unit}
                    </td>
                    <td class="p-2 text-right font-medium text-slate-700 font-mono">
                        ${AppUtils.formatVND(it.costPrice)}
                    </td>
                    <td class="p-2 text-right font-bold text-rose-700 font-mono">
                        ${AppUtils.formatVND(lineTotal)}
                    </td>
                    <td class="p-2 text-center">
                        <button type="button" onclick="InventoryModule.removeItemFromGeneralReturnDraft(${idx})" class="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer" title="Xóa mặt hàng này">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (summaryAmountEl) summaryAmountEl.innerText = AppUtils.formatVND(totalRefund);
        if (window.lucide) lucide.createIcons();
    },

    confirmGeneralPurchaseReturn() {
        const items = this.generalReturnDraft.items || [];
        if (items.length === 0) {
            alert('Vui lòng thêm ít nhất một mặt hàng thuốc vào danh sách xuất trả!');
            return;
        }

        const supSel = document.getElementById('general-return-supplier');
        const supplierId = supSel ? supSel.value : '';
        let supplierName = '';
        if (supSel && supSel.selectedIndex >= 0) {
            supplierName = supSel.options[supSel.selectedIndex].text.split('(')[0].trim();
        }

        if (!supplierId && !supplierName) {
            alert('Vui lòng chọn Nhà Cung Cấp nhận lại hàng!');
            return;
        }

        const reasonSelect = document.getElementById('general-return-reason-select');
        const reasonCustom = document.getElementById('general-return-reason-custom');
        let reason = reasonSelect ? reasonSelect.value : 'Xuất trả hàng cho nhà cung cấp';
        if (reason === 'custom') {
            reason = (reasonCustom && reasonCustom.value.trim()) ? reasonCustom.value.trim() : 'Xuất trả hàng cho nhà cung cấp';
        }

        const note = document.getElementById('general-return-note')?.value.trim() || '';

        const res = Store.returnGeneralPurchaseItems({
            supplierId: supplierId,
            supplierName: supplierName,
            returnedItems: items,
            returnReason: reason,
            paymentMethod: this.generalReturnDraft.paymentMethod || 'cash',
            note: note
        });

        if (!res.success) {
            alert(res.message);
            return;
        }

        this.closeGeneralPurchaseReturnModal();

        if (window.App && App.showToast) {
            App.showToast(`Đã xuất trả ${items.length} loại thuốc (Mã phiếu: ${res.returnRecord.id}) và tạo Phiếu Thu tiền hoàn thành công!`, 'success');
        }

        // Tự động chuyển sang subtab Quản lý trả hàng để người dùng thấy ngay phiếu vừa tạo
        this.switchStockInSubTab('returns');
        this.renderMedicineTable();

        // Mở in phiếu trả hàng vừa tạo
        setTimeout(() => {
            this.printPurchaseReturn(res.returnRecord.id);
        }, 300);
    },

    // --- MODAL XEM CHI TIẾT PHIẾU XUẤT TRẢ HÀNG CHO NCC ---
    openPurchaseReturnDetailModal(returnId) {
        const r = Store.getPurchaseReturnById ? Store.getPurchaseReturnById(returnId) : null;
        if (!r) {
            alert('Không tìm thấy thông tin phiếu trả hàng này!');
            return;
        }

        const idEl = document.getElementById('return-detail-id');
        const badgeEl = document.getElementById('return-detail-type-badge');
        const subEl = document.getElementById('return-detail-sub');
        const contentEl = document.getElementById('return-detail-content');
        const btnPrint = document.getElementById('btn-print-from-return-detail');

        if (idEl) idEl.innerText = r.id;
        if (subEl) subEl.innerText = `Thời gian xuất trả: ${AppUtils.formatDateTime(r.createdAt)} • Người lập: ${r.pharmacist || 'DS. Nguyễn Thanh Dung'}`;

        const isStockIn = (r.returnType === 'stockin_return' || r.stockInId);
        if (badgeEl) {
            badgeEl.className = isStockIn
                ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800'
                : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800';
            badgeEl.innerText = isStockIn ? `Theo đơn nhập ${r.stockInId}` : 'Trả tổng hợp';
        }

        const isCash = (r.paymentMethod || 'cash') === 'cash';

        let rowsHtml = '';
        (r.items || []).forEach((it, idx) => {
            const lineTotal = it.totalRefund || (it.quantity * it.costPrice);
            rowsHtml += `
                <tr class="hover:bg-slate-50 text-xs border-b border-slate-100">
                    <td class="p-2 text-center text-slate-400 font-mono">${idx + 1}</td>
                    <td class="p-2 font-mono font-bold text-slate-700">${it.medicineId || '---'}</td>
                    <td class="p-2 font-bold text-slate-900">${it.medicineName}</td>
                    <td class="p-2 text-slate-600 font-mono text-[11px]">${it.batchNo || '---'} • ${AppUtils.formatDate(it.expiryDate) || '---'}</td>
                    <td class="p-2 text-center font-bold text-slate-800">${it.quantity} ${it.unit}</td>
                    <td class="p-2 text-right font-medium text-slate-700 font-mono">${AppUtils.formatVND(it.costPrice)}</td>
                    <td class="p-2 text-right font-bold text-rose-700 font-mono">${AppUtils.formatVND(lineTotal)}</td>
                </tr>
            `;
        });

        if (contentEl) {
            contentEl.innerHTML = `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                        <span class="text-slate-400 block text-[11px]">Nhà Cung Cấp:</span>
                        <span class="font-bold text-slate-800">${r.supplierName || '---'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[11px]">Hình Thức Nhận Tiền:</span>
                        <span class="font-bold ${isCash ? 'text-amber-700' : 'text-blue-700'}">${isCash ? 'Tiền Mặt (Đã vào quỹ)' : 'Chuyển Khoản (Đã vào TK)'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[11px]">Phân Loại:</span>
                        <span class="font-semibold text-slate-800">${isStockIn ? `Theo phiếu nhập ${r.stockInId}` : 'Xuất trả tổng hợp'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[11px]">Tổng Tiền Hoàn:</span>
                        <span class="font-black text-rose-700 text-sm font-mono">${AppUtils.formatVND(r.refundTotal)}</span>
                    </div>
                    <div class="col-span-2 sm:col-span-4">
                        <span class="text-slate-400 block text-[11px]">Lý Do Trả Hàng:</span>
                        <span class="font-medium text-slate-800 italic">${r.reason || 'Trả hàng cho NCC'}</span>
                    </div>
                    ${r.note ? `
                    <div class="col-span-2 sm:col-span-4">
                        <span class="text-slate-400 block text-[11px]">Ghi Chú:</span>
                        <span class="text-slate-700">${r.note}</span>
                    </div>` : ''}
                </div>

                <div class="border border-slate-200 rounded-xl overflow-hidden mt-3">
                    <div class="bg-slate-100 px-3 py-2 font-bold text-slate-800 text-xs uppercase">
                        Danh Sách Thuốc Đã Xuất Trả (${(r.items || []).length} loại)
                    </div>
                    <div class="overflow-x-auto max-h-60">
                        <table class="w-full text-left border-collapse">
                            <thead class="bg-slate-50 font-bold text-slate-500 uppercase text-[11px] border-b border-slate-200">
                                <tr>
                                    <th class="p-2 text-center w-8">#</th>
                                    <th class="p-2 w-20">Mã Thuốc</th>
                                    <th class="p-2">Tên Thuốc</th>
                                    <th class="p-2 w-36">Số Lô & Hạn Dùng</th>
                                    <th class="p-2 text-center w-24">SL & ĐVT</th>
                                    <th class="p-2 text-right w-24">Đơn Giá</th>
                                    <th class="p-2 text-right w-28">Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        if (btnPrint) {
            btnPrint.onclick = () => {
                this.closePurchaseReturnDetailModal();
                this.printPurchaseReturn(r.id);
            };
        }

        document.getElementById('modal-purchase-return-detail')?.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closePurchaseReturnDetailModal() {
        document.getElementById('modal-purchase-return-detail')?.classList.add('hidden');
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

        if (btnStockIn) btnStockIn.className = 'tab-filter-btn' + (tab === 'stockin' ? ' active-emerald' : '');
        if (btnSales) btnSales.className = 'tab-filter-btn' + (tab === 'sales' ? ' active-emerald' : '');

        if (tab === 'stockin') {
            viewStockIn?.classList.remove('hidden');
            viewSales?.classList.add('hidden');
        } else {
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
                            <td class="p-2.5">
                                <button type="button" 
                                        onclick="InventoryModule.openStockInDetailModal('${h.orderId}')" 
                                        class="font-mono font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer transition inline-flex items-center gap-1 group/btn text-left"
                                        title="Bấm để xem toàn bộ chi tiết phiếu nhập kho ${h.orderId}">
                                    <span>${h.orderId}</span>
                                    <i data-lucide="external-link" class="w-3 h-3 opacity-60 group-hover/btn:opacity-100"></i>
                                </button>
                            </td>
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
                            <td class="p-2.5">
                                <button type="button" 
                                        onclick="OrdersModule.openOrderDetails('${s.orderId}')" 
                                        class="font-mono font-bold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer transition inline-flex items-center gap-1 group/btn text-left"
                                        title="Bấm để xem toàn bộ chi tiết hóa đơn ${s.orderId}">
                                    <span>${s.orderId}</span>
                                    <i data-lucide="external-link" class="w-3 h-3 opacity-60 group-hover/btn:opacity-100"></i>
                                </button>
                            </td>
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

        if (window.lucide) lucide.createIcons();
    }
};

window.InventoryModule = InventoryModule;

