/**
 * MedicaPharmacy - Store & Local Database Layer (Hỗ trợ Máy Chủ & Dữ Liệu Dùng Chung)
 * - Tự động đồng bộ với máy chủ qua REST API: /api/database
 * - Hỗ trợ nhiều máy tính, iPad, điện thoại cùng kết nối http://medica.com
 * - Lưu trữ dự phòng an toàn trên ổ cứng và LocalStorage
 */

const STORAGE_KEYS = {
    SETTINGS: 'medica_settings_v1',
    MEDICINES: 'medica_medicines_v1',
    SUPPLIERS: 'medica_suppliers_v1',
    ORDERS: 'medica_orders_v1',
    STOCK_IN: 'medica_stock_in_v1',
    CUSTOMERS: 'medica_customers_v1',
    SETTINGS_HISTORY: 'medica_settings_history_v1',
    VOUCHERS: 'medica_vouchers_v1',
    PURCHASE_RETURNS: 'medica_purchase_returns_v1'
};

class DataStore {
    constructor() {
        this.listeners = {};
        this.isServerMode = window.location.protocol.startsWith('http');
        this.syncInProgress = false;
        this.lastServerSyncTime = null;
        this.init();
    }

    async init() {
        if (this.isServerMode) {
            console.log('🌐 Đang chạy ở chế độ MÁY CHỦ DÙNG CHUNG (http://medica.com)');
            await this.syncWithServer();
            // Tự động kiểm tra đồng bộ dữ liệu mới từ máy khác mỗi 8 giây
            setInterval(() => this.backgroundCheckServerSync(), 8000);
        } else {
            console.log('💻 Đang chạy ở chế độ CỤC BỘ TRỰC TIẾP (file://)');
            if (!localStorage.getItem(STORAGE_KEYS.MEDICINES)) {
                this.loadInitialSampleData();
            }
        }
        this.syncOrdersAndStockInsToVouchers();
    }

    // --- Đồng bộ với Máy Chủ Server API ---
    async syncWithServer() {
        if (this.syncInProgress) return;
        this.syncInProgress = true;

        try {
            const res = await fetch('/api/database', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                
                // Nếu server chưa có dữ liệu (file mới tinh), nạp dữ liệu mẫu lên server
                if (!data.medicines || data.medicines.length === 0) {
                    console.log('📦 Khởi tạo dữ liệu mẫu lần đầu lên máy chủ...');
                    const initialDb = {
                        settings: SampleData.settings,
                        medicines: SampleData.medicines,
                        suppliers: SampleData.suppliers,
                        orders: SampleData.orders,
                        stockInOrders: SampleData.stockInOrders,
                        lastUpdated: new Date().toISOString()
                    };
                    await this.uploadDatabaseToServer(initialDb);
                    this.saveToLocalCache(initialDb);
                } else {
                    // Cập nhật dữ liệu từ server vào local
                    this.saveToLocalCache(data);
                }
                this.lastServerSyncTime = Date.now();
                this.updateServerStatusBadge(true);
                this.emit('all:changed');
            }
        } catch (e) {
            console.warn('Không thể kết nối máy chủ /api/database, chuyển sang dùng bộ nhớ đệm máy:', e);
            this.updateServerStatusBadge(false);
            if (!localStorage.getItem(STORAGE_KEYS.MEDICINES)) {
                this.loadInitialSampleData();
            }
        } finally {
            this.syncInProgress = false;
        }
    }

    async backgroundCheckServerSync() {
        if (!this.isServerMode || this.syncInProgress) return;
        try {
            const res = await fetch('/api/database', { cache: 'no-store' });
            if (res.ok) {
                const serverData = await res.json();
                if (serverData && serverData.medicines) {
                    const localOrders = this.getOrders();
                    // Nếu số lượng đơn hoặc thuốc có sự khác biệt (do máy khác thao tác)
                    if (serverData.orders && serverData.orders.length !== localOrders.length) {
                        console.log('⚡ Phát hiện dữ liệu mới từ máy khác, đang cập nhật...');
                        this.saveToLocalCache(serverData);
                        this.emit('all:changed');
                    }
                }
                this.updateServerStatusBadge(true);
            }
        } catch (e) {
            this.updateServerStatusBadge(false);
        }
    }

    async uploadDatabaseToServer(fullDb) {
        if (!this.isServerMode) return;
        try {
            await fetch('/api/database', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullDb)
            });
        } catch (e) {
            console.error('Lỗi khi lưu dữ liệu lên máy chủ:', e);
        }
    }

    saveToLocalCache(db) {
        try {
            if (db.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(db.settings));
            if (db.medicines) {
                this._cachedMedicines = db.medicines;
                this._rebuildMedicineMap();
                localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(db.medicines));
            }
            if (db.suppliers) localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(db.suppliers));
            if (db.orders) localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(db.orders));
            if (db.stockInOrders) localStorage.setItem(STORAGE_KEYS.STOCK_IN, JSON.stringify(db.stockInOrders));
            if (db.customers) localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(db.customers));
            if (db.settingsHistory) localStorage.setItem(STORAGE_KEYS.SETTINGS_HISTORY, JSON.stringify(db.settingsHistory));
            if (db.vouchers) localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(db.vouchers));
            if (db.purchaseReturns) localStorage.setItem(STORAGE_KEYS.PURCHASE_RETURNS, JSON.stringify(db.purchaseReturns));
        } catch (e) {
            console.warn('LocalStorage quota limit reached, maintaining state in-memory:', e);
        }
    }

    getCurrentFullDatabase() {
        return {
            settings: this.getSettings(),
            medicines: this.getMedicines(),
            suppliers: this.getSuppliers(),
            orders: this.getOrders(),
            stockInOrders: this.getStockInOrders(),
            customers: this.getCustomers(),
            settingsHistory: this.getSettingsHistory(),
            vouchers: this.getVouchers(),
            purchaseReturns: this.getPurchaseReturns(),
            lastUpdated: new Date().toISOString()
        };
    }

    // Tự động đẩy toàn bộ state lên Server khi có thay đổi
    schedulePersistToServer() {
        if (this.isServerMode) {
            const fullDb = this.getCurrentFullDatabase();
            this.uploadDatabaseToServer(fullDb);
        }
    }

    updateServerStatusBadge(isOnline) {
        const badge = document.getElementById('server-status-pill');
        if (badge) {
            if (isOnline) {
                badge.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-emerald-800/80 text-emerald-200 border border-emerald-600 rounded-full text-xs font-semibold';
                badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span>Máy chủ: Đang đồng bộ</span>';
            } else {
                badge.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-amber-800/80 text-amber-200 border border-amber-600 rounded-full text-xs font-semibold';
                badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span><span>Chế độ Cục Bộ</span>';
            }
        }
    }

    loadInitialSampleData() {
        if (typeof SampleData !== 'undefined') {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(SampleData.settings));
            localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(SampleData.medicines));
            localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(SampleData.suppliers));
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(SampleData.orders));
            localStorage.setItem(STORAGE_KEYS.STOCK_IN, JSON.stringify(SampleData.stockInOrders));
            if (SampleData.customers) localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(SampleData.customers));
            if (SampleData.vouchers) localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(SampleData.vouchers));
            console.log('✅ Đã nạp thành công dữ liệu mẫu MedicaPharmacy');
        }
    }

    resetToSampleData() {
        localStorage.removeItem(STORAGE_KEYS.SETTINGS);
        localStorage.removeItem(STORAGE_KEYS.MEDICINES);
        localStorage.removeItem(STORAGE_KEYS.SUPPLIERS);
        localStorage.removeItem(STORAGE_KEYS.ORDERS);
        localStorage.removeItem(STORAGE_KEYS.STOCK_IN);
        localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
        this.loadInitialSampleData();
        this.schedulePersistToServer();
        this.emit('all:changed');
    }

    clearAllData() {
        localStorage.removeItem(STORAGE_KEYS.SETTINGS);
        localStorage.removeItem(STORAGE_KEYS.MEDICINES);
        localStorage.removeItem(STORAGE_KEYS.SUPPLIERS);
        localStorage.removeItem(STORAGE_KEYS.ORDERS);
        localStorage.removeItem(STORAGE_KEYS.STOCK_IN);
        this.schedulePersistToServer();
        this.emit('all:changed');
    }

    // --- Event Bus ---
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => {
                try { cb(data); } catch(e) { console.error('Lỗi callback event:', e); }
            });
        }
    }

    // --- Settings ---
    getSettings() {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (!raw) return SampleData ? SampleData.settings : {};
        try {
            return JSON.parse(raw);
        } catch(e) {
            return SampleData ? SampleData.settings : {};
        }
    }

    saveSettings(settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        this.schedulePersistToServer();
        this.emit('settings:changed', settings);
    }

    // --- Medicines (Danh mục thuốc & Tồn kho) ---
    _rebuildMedicineMap() {
        this._medicineMap = {};
        if (this._cachedMedicines && Array.isArray(this._cachedMedicines)) {
            for (let i = 0; i < this._cachedMedicines.length; i++) {
                const m = this._cachedMedicines[i];
                if (m && m.id) this._medicineMap[m.id] = m;
            }
        }
    }

    getMedicines() {
        if (this._cachedMedicines) return this._cachedMedicines;
        const raw = localStorage.getItem(STORAGE_KEYS.MEDICINES);
        if (!raw) return [];
        try {
            this._cachedMedicines = JSON.parse(raw);
            this._rebuildMedicineMap();
            return this._cachedMedicines;
        } catch(e) {
            return [];
        }
    }

    getMedicineById(id) {
        if (!id) return null;
        if (!this._medicineMap) {
            this.getMedicines();
        }
        return (this._medicineMap && this._medicineMap[id]) ? this._medicineMap[id] : null;
    }

    getMedicineUnitCost(med, unit) {
        if (!med) return 0;
        const packRatio = (med.packRatio && med.packRatio > 0) ? med.packRatio : 1;
        const subRatio = (med.subRatio && med.subRatio > 0) ? med.subRatio : 1;
        const baseCost = (med.costPrice || 0) / packRatio;

        if (unit && unit === med.packUnit) {
            return med.costPrice || 0;
        }
        if (unit && unit === med.subUnit && med.subUnit !== med.packUnit) {
            return Math.round(baseCost * subRatio);
        }
        if (unit && unit === med.baseUnit) {
            return Math.round(baseCost);
        }
        return Math.round(baseCost);
    }

    saveMedicine(med) {
        const medicines = this.getMedicines();
        const index = medicines.findIndex(m => m.id === med.id);
        if (index >= 0) {
            medicines[index] = { ...medicines[index], ...med };
        } else {
            if (!med.id) {
                med.id = 'MED' + String(Date.now()).slice(-6);
            }
            medicines.unshift(med);
        }
        this._cachedMedicines = medicines;
        this._rebuildMedicineMap();
        try {
            localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(medicines));
        } catch(e) {}
        this.schedulePersistToServer();
        this.emit('medicines:changed', medicines);
        return med;
    }

    deleteMedicine(id) {
        let medicines = this.getMedicines();
        medicines = medicines.filter(m => m.id !== id);
        this._cachedMedicines = medicines;
        this._rebuildMedicineMap();
        try {
            localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(medicines));
        } catch(e) {}
        this.schedulePersistToServer();
        this.emit('medicines:changed', medicines);
    }

    updateStockUnits(medicineId, unitsDelta) {
        const medicines = this.getMedicines();
        const med = this.getMedicineById(medicineId);
        if (med) {
            med.stockUnits = Math.max(0, (med.stockUnits || 0) + unitsDelta);
            try {
                localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(medicines));
            } catch(e) {}
            this.schedulePersistToServer();
            this.emit('medicines:changed', medicines);
            return med;
        }
        return null;
    }

    // --- Suppliers (Nhà cung cấp) ---
    getSuppliers() {
        const raw = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
        if (!raw) return [];
        try {
            return JSON.parse(raw);
        } catch(e) {
            return [];
        }
    }

    saveSupplier(sup) {
        const suppliers = this.getSuppliers();
        const index = suppliers.findIndex(s => s.id === sup.id);
        if (index >= 0) {
            suppliers[index] = { ...suppliers[index], ...sup };
        } else {
            if (!sup.id) sup.id = 'NCC' + String(Date.now()).slice(-4);
            suppliers.push(sup);
        }
        localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
        this.schedulePersistToServer();
        this.emit('suppliers:changed', suppliers);
        return sup;
    }

    addSupplier(sup) {
        return this.saveSupplier(sup);
    }

    // --- Stock-In (Phiếu nhập thuốc) ---
    getStockInOrders() {
        const raw = localStorage.getItem(STORAGE_KEYS.STOCK_IN);
        if (!raw) return [];
        try {
            return JSON.parse(raw);
        } catch(e) {
            return [];
        }
    }

    addStockInOrder(stockIn) {
        const orders = this.getStockInOrders();
        if (!stockIn.id) {
            const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const countToday = orders.filter(o => o.createdAt && o.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length + 1;
            stockIn.id = `PN${dateStr}-${String(countToday).padStart(2, '0')}`;
        }
        if (!stockIn.createdAt) {
            stockIn.createdAt = new Date().toISOString();
        }
        stockIn.paymentMethod = stockIn.paymentMethod || 'cash';

        orders.unshift(stockIn);
        localStorage.setItem(STORAGE_KEYS.STOCK_IN, JSON.stringify(orders));

        // Tự động tăng tồn kho thuốc tương ứng
        if (stockIn.items && Array.isArray(stockIn.items)) {
            stockIn.items.forEach(item => {
                const med = this.getMedicineById(item.medicineId);
                if (med) {
                    let addedUnits = item.quantity;
                    if (item.unit === med.packUnit && med.packRatio > 1) {
                        addedUnits = item.quantity * med.packRatio;
                    } else if (item.unit === med.subUnit && med.subRatio > 1) {
                        addedUnits = item.quantity * med.subRatio;
                    }

                    if (item.batchNo) med.batchNo = item.batchNo;
                    if (item.expiryDate) med.expiryDate = item.expiryDate;
                    if (item.costPrice && item.costPrice > 0) {
                        if (item.unit === med.packUnit) {
                            med.costPrice = item.costPrice;
                        } else {
                            med.costPrice = Math.round(item.costPrice * (med.packRatio / (item.unit === med.subUnit ? med.subRatio : 1)));
                        }
                    }

                    med.stockUnits = (med.stockUnits || 0) + addedUnits;
                    this.saveMedicine(med);
                }
            });
        }

        // Tự động thêm Phiếu Chi vào Sổ Quỹ Thu Chi
        if (stockIn.totalAmount > 0) {
            this.addVoucher({
                type: 'payment',
                paymentMethod: stockIn.paymentMethod || 'cash',
                category: 'Chi tiền hàng Nhà Cung Cấp',
                targetType: 'supplier',
                targetName: stockIn.supplierName || 'Nhà cung cấp',
                amount: stockIn.totalAmount,
                note: `Chi thanh toán phiếu nhập thuốc ${stockIn.id} - ${stockIn.supplierName || ''}`,
                isAccounting: true,
                refId: stockIn.id,
                pharmacist: stockIn.pharmacist || 'DS. Nguyễn Thanh Dung',
                createdAt: stockIn.createdAt
            });
        }

        this.schedulePersistToServer();
        this.emit('stockin:changed', orders);
        return stockIn;
    }

    updateStockInOrder(updatedStockIn) {
        const orders = this.getStockInOrders();
        const index = orders.findIndex(o => o.id === updatedStockIn.id);
        if (index === -1) return null;

        const oldOrder = orders[index];

        // 1. Hoàn nguyên số lượng tồn kho các mặt hàng trong phiếu cũ
        if (oldOrder.items && Array.isArray(oldOrder.items)) {
            oldOrder.items.forEach(oldItem => {
                const med = this.getMedicineById(oldItem.medicineId);
                if (med) {
                    let unitsToDeduct = oldItem.quantity;
                    if (oldItem.unit === med.packUnit && med.packRatio > 1) {
                        unitsToDeduct = oldItem.quantity * med.packRatio;
                    } else if (oldItem.unit === med.subUnit && med.subRatio > 1) {
                        unitsToDeduct = oldItem.quantity * med.subRatio;
                    }
                    med.stockUnits = Math.max(0, (med.stockUnits || 0) - unitsToDeduct);
                    this.saveMedicine(med);
                }
            });
        }

        // 2. Cộng tồn kho mới và cập nhật giá vốn, HSD, lô cho mặt hàng mới
        if (updatedStockIn.items && Array.isArray(updatedStockIn.items)) {
            updatedStockIn.items.forEach(newItem => {
                const med = this.getMedicineById(newItem.medicineId);
                if (med) {
                    let unitsToAdd = newItem.quantity;
                    if (newItem.unit === med.packUnit && med.packRatio > 1) {
                        unitsToAdd = newItem.quantity * med.packRatio;
                    } else if (newItem.unit === med.subUnit && med.subRatio > 1) {
                        unitsToAdd = newItem.quantity * med.subRatio;
                    }

                    if (newItem.batchNo) med.batchNo = newItem.batchNo;
                    if (newItem.expiryDate) med.expiryDate = newItem.expiryDate;
                    if (newItem.costPrice && newItem.costPrice > 0) {
                        if (newItem.unit === med.packUnit) {
                            med.costPrice = newItem.costPrice;
                        } else {
                            med.costPrice = Math.round(newItem.costPrice * (med.packRatio / (newItem.unit === med.subUnit ? med.subRatio : 1)));
                        }
                    }

                    med.stockUnits = (med.stockUnits || 0) + unitsToAdd;
                    this.saveMedicine(med);
                }
            });
        }

        // 3. Cập nhật phiếu nhập trong danh sách
        orders[index] = { ...oldOrder, ...updatedStockIn, updatedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEYS.STOCK_IN, JSON.stringify(orders));

        // 4. Cập nhật phiếu chi tương ứng trong Sổ Thu Chi
        const vouchers = this.getVouchers();
        const vIndex = vouchers.findIndex(v => v.refId === updatedStockIn.id || (v.note && v.note.includes(updatedStockIn.id)));
        if (vIndex !== -1) {
            vouchers[vIndex].amount = updatedStockIn.totalAmount;
            vouchers[vIndex].paymentMethod = updatedStockIn.paymentMethod || 'cash';
            vouchers[vIndex].targetName = updatedStockIn.supplierName || 'Nhà cung cấp';
            vouchers[vIndex].note = `Chi thanh toán phiếu nhập thuốc ${updatedStockIn.id} - ${updatedStockIn.supplierName || ''}`;
            this.saveVouchers(vouchers);
        } else if (updatedStockIn.totalAmount > 0) {
            this.addVoucher({
                type: 'payment',
                paymentMethod: updatedStockIn.paymentMethod || 'cash',
                category: 'Chi tiền hàng Nhà Cung Cấp',
                targetType: 'supplier',
                targetName: updatedStockIn.supplierName || 'Nhà cung cấp',
                amount: updatedStockIn.totalAmount,
                note: `Chi thanh toán phiếu nhập thuốc ${updatedStockIn.id} - ${updatedStockIn.supplierName || ''}`,
                isAccounting: true,
                refId: updatedStockIn.id,
                pharmacist: updatedStockIn.pharmacist || 'DS. Nguyễn Thanh Dung',
                createdAt: updatedStockIn.createdAt || new Date().toISOString()
            });
        }

        this.schedulePersistToServer();
        this.emit('stockin:changed', orders);
        return orders[index];
    }

    // --- TRẢ HÀNG NHẬP CHO NHÀ CUNG CẤP (PURCHASE RETURN) ---
    returnStockInItems(stockInId, returnedItems, returnReason, paymentMethod = 'cash', note = '') {
        const orders = this.getStockInOrders();
        const stockIn = orders.find(o => o.id === stockInId);
        if (!stockIn) return { success: false, message: 'Không tìm thấy phiếu nhập kho!' };

        if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
            return { success: false, message: 'Vui lòng chọn ít nhất một mặt hàng để trả!' };
        }

        // 1. Kiểm tra số lượng tồn kho thực tế trước khi xuất trả
        for (const item of returnedItems) {
            const qtyToReturn = parseInt(item.quantity) || 0;
            if (qtyToReturn <= 0) continue;

            const med = this.getMedicineById(item.medicineId);
            if (!med) {
                return { success: false, message: `Không tìm thấy thông tin thuốc [${item.medicineName}] trong hệ thống!` };
            }

            let unitsToDeduct = qtyToReturn;
            if (item.unit === med.packUnit && med.packRatio > 1) {
                unitsToDeduct = qtyToReturn * med.packRatio;
            } else if (item.unit === med.subUnit && med.subRatio > 1) {
                unitsToDeduct = qtyToReturn * med.subRatio;
            }

            if ((med.stockUnits || 0) < unitsToDeduct) {
                return { 
                    success: false, 
                    message: `Thuốc [${med.name}] hiện tại trong kho chỉ còn ${med.stockUnits || 0} ${med.baseUnit} (đã bán bớt cho khách), không đủ số lượng ${unitsToDeduct} ${med.baseUnit} để xuất trả lại nhà cung cấp!` 
                };
            }
        }

        let totalRefund = 0;

        // 2. Trừ số lượng thuốc trong kho tương ứng
        returnedItems.forEach(item => {
            const qtyToReturn = parseInt(item.quantity) || 0;
            if (qtyToReturn <= 0) return;

            const lineRefund = qtyToReturn * (parseFloat(item.costPrice) || 0);
            totalRefund += lineRefund;

            const med = this.getMedicineById(item.medicineId);
            if (med) {
                let unitsToDeduct = qtyToReturn;
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    unitsToDeduct = qtyToReturn * med.packRatio;
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    unitsToDeduct = qtyToReturn * med.subRatio;
                }

                med.stockUnits = Math.max(0, (med.stockUnits || 0) - unitsToDeduct);
                this.saveMedicine(med);
            }
        });

        if (totalRefund <= 0) {
            return { success: false, message: 'Tổng số tiền hoàn trả phải lớn hơn 0!' };
        }

        // 3. Ghi nhận phiếu trả hàng vào danh sách returns của phiếu nhập gốc
        if (!stockIn.returns) stockIn.returns = [];
        const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        const returnId = `THN${dateStr}-${String(Math.floor(Math.random() * 900) + 100)}`;
        
        const returnRecord = {
            id: returnId,
            stockInId: stockIn.id,
            supplierId: stockIn.supplierId || '',
            supplierName: stockIn.supplierName || 'Nhà cung cấp',
            createdAt: new Date().toISOString(),
            paymentMethod: paymentMethod || 'cash', // 'cash' (tiền mặt) hoặc 'transfer' (chuyển khoản)
            reason: returnReason || 'Trả hàng cho nhà cung cấp',
            note: note || '',
            items: returnedItems.map(i => ({
                medicineId: i.medicineId,
                medicineName: i.medicineName,
                unit: i.unit,
                quantity: parseInt(i.quantity) || 0,
                costPrice: parseFloat(i.costPrice) || 0,
                totalRefund: (parseInt(i.quantity) || 0) * (parseFloat(i.costPrice) || 0)
            })),
            refundTotal: totalRefund,
            pharmacist: this.getSettings().pharmacist || 'DS. Nguyễn Thanh Dung'
        };

        stockIn.returns.push(returnRecord);
        stockIn.totalRefunded = (stockIn.totalRefunded || 0) + totalRefund;

        // Kiểm tra xem đã trả hết toàn bộ số lượng các món trong phiếu nhập chưa
        let allReturned = true;
        (stockIn.items || []).forEach(origItem => {
            const totalReturnedQty = (stockIn.returns || []).reduce((sum, r) => {
                const ri = (r.items || []).find(x => x.medicineId === origItem.medicineId && x.unit === origItem.unit);
                return sum + (ri ? ri.quantity : 0);
            }, 0);
            if (totalReturnedQty < origItem.quantity) {
                allReturned = false;
            }
        });
        stockIn.returnStatus = allReturned ? 'fully_returned' : 'partially_returned';

        // 4. Tự động thêm Phiếu Thu (Thu tiền hoàn trả từ NCC) vào Sổ Quỹ Thu Chi
        // Vì đây là tiền Nhà Cung Cấp hoàn lại cho nhà thuốc -> Loại 'receipt' (Thu tiền vào quỹ hoặc tài khoản)
        const methodText = paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt';
        this.addVoucher({
            type: 'receipt',
            paymentMethod: paymentMethod || 'cash', // 'cash' hoặc 'transfer'
            category: 'Thu tiền hoàn trả hàng Nhà Cung Cấp',
            targetType: 'supplier',
            targetName: stockIn.supplierName || 'Nhà cung cấp',
            amount: totalRefund,
            note: `Thu tiền hoàn trả hàng nhập ${stockIn.id} (${returnRecord.id}) [${methodText}] - ${stockIn.supplierName || ''}: ${returnReason || ''}`,
            isAccounting: true,
            refId: returnRecord.id,
            pharmacist: this.getSettings().pharmacist || 'DS. Nguyễn Thanh Dung',
            createdAt: returnRecord.createdAt
        });

        localStorage.setItem(STORAGE_KEYS.STOCK_IN, JSON.stringify(orders));
        this.schedulePersistToServer();
        this.emit('stockin:changed', orders);

        return { success: true, stockIn, returnRecord };
    }

    // --- XUẤT TRẢ HÀNG CHO NHÀ CUNG CẤP TỔNG HỢP (GENERAL PURCHASE RETURN) ---
    getPurchaseReturns() {
        const raw = localStorage.getItem(STORAGE_KEYS.PURCHASE_RETURNS);
        if (!raw) return [];
        try {
            return JSON.parse(raw);
        } catch (e) {
            return [];
        }
    }

    savePurchaseReturns(returns) {
        localStorage.setItem(STORAGE_KEYS.PURCHASE_RETURNS, JSON.stringify(returns));
        this.schedulePersistToServer();
        this.emit('returns:changed', returns);
    }

    addPurchaseReturn(record) {
        const list = this.getPurchaseReturns();
        list.unshift(record);
        this.savePurchaseReturns(list);
        return record;
    }

    // Lấy toàn bộ phiếu trả hàng (gồm cả trả theo đơn nhập THN và trả tổng hợp PTH)
    getAllPurchaseReturns() {
        const list = [];
        // 1. Trả theo đơn nhập kho (THN)
        const stockIns = this.getStockInOrders();
        stockIns.forEach(s => {
            (s.returns || []).forEach(r => {
                list.push({
                    ...r,
                    returnType: 'stockin_return',
                    stockInId: s.id,
                    supplierId: r.supplierId || s.supplierId || '',
                    supplierName: r.supplierName || s.supplierName || 'Nhà cung cấp'
                });
            });
        });
        // 2. Trả tổng hợp độc lập (PTH)
        const generals = this.getPurchaseReturns();
        generals.forEach(g => {
            list.push({
                ...g,
                returnType: 'general_return'
            });
        });

        // Sắp xếp theo thời gian tạo mới nhất lên đầu
        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        return list;
    }

    getPurchaseReturnById(returnId) {
        return this.getAllPurchaseReturns().find(r => r.id === returnId) || null;
    }

    returnGeneralPurchaseItems({ supplierId = '', supplierName = '', returnedItems = [], returnReason = '', paymentMethod = 'cash', note = '' }) {
        if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
            return { success: false, message: 'Vui lòng chọn ít nhất một mặt hàng thuốc để xuất trả!' };
        }

        // 1. Kiểm tra tồn kho thực tế của từng thuốc
        for (const item of returnedItems) {
            const qtyToReturn = parseInt(item.quantity) || 0;
            if (qtyToReturn <= 0) continue;

            const med = this.getMedicineById(item.medicineId);
            if (!med) {
                return { success: false, message: `Không tìm thấy thuốc [${item.medicineName}] trong hệ thống kho!` };
            }

            let unitsToDeduct = qtyToReturn;
            if (item.unit === med.packUnit && med.packRatio > 1) {
                unitsToDeduct = qtyToReturn * med.packRatio;
            } else if (item.unit === med.subUnit && med.subRatio > 1) {
                unitsToDeduct = qtyToReturn * med.subRatio;
            }

            if ((med.stockUnits || 0) < unitsToDeduct) {
                return {
                    success: false,
                    message: `Thuốc [${med.name}] hiện trong kho chỉ còn ${med.stockUnits || 0} ${med.baseUnit}, không đủ để xuất trả ${unitsToDeduct} ${med.baseUnit}!`
                };
            }
        }

        let totalRefund = 0;

        // 2. Trừ kho thuốc
        returnedItems.forEach(item => {
            const qtyToReturn = parseInt(item.quantity) || 0;
            if (qtyToReturn <= 0) return;

            const lineRefund = qtyToReturn * (parseFloat(item.costPrice) || 0);
            totalRefund += lineRefund;

            const med = this.getMedicineById(item.medicineId);
            if (med) {
                let unitsToDeduct = qtyToReturn;
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    unitsToDeduct = qtyToReturn * med.packRatio;
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    unitsToDeduct = qtyToReturn * med.subRatio;
                }

                med.stockUnits = Math.max(0, (med.stockUnits || 0) - unitsToDeduct);
                this.saveMedicine(med);
            }
        });

        if (totalRefund <= 0) {
            return { success: false, message: 'Tổng số tiền hoàn trả phải lớn hơn 0!' };
        }

        // 3. Tạo mã phiếu trả hàng tổng hợp PTHyymmdd-xxx
        const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        const allReturns = this.getAllPurchaseReturns();
        const countToday = allReturns.filter(r => r.id && r.id.startsWith('PTH' + dateStr)).length + 1;
        const returnId = `PTH${dateStr}-${String(countToday).padStart(3, '0')}`;

        const returnRecord = {
            id: returnId,
            type: 'general_return',
            returnType: 'general_return',
            supplierId: supplierId || '',
            supplierName: supplierName || 'Nhà cung cấp',
            createdAt: new Date().toISOString(),
            paymentMethod: paymentMethod || 'cash',
            reason: returnReason || 'Xuất trả hàng cho nhà cung cấp (tổng hợp)',
            note: note || '',
            items: returnedItems.map(i => ({
                medicineId: i.medicineId,
                medicineName: i.medicineName,
                unit: i.unit,
                quantity: parseInt(i.quantity) || 0,
                costPrice: parseFloat(i.costPrice) || 0,
                batchNo: i.batchNo || '',
                expiryDate: i.expiryDate || '',
                totalRefund: (parseInt(i.quantity) || 0) * (parseFloat(i.costPrice) || 0)
            })),
            refundTotal: totalRefund,
            pharmacist: this.getSettings().pharmacist || 'DS. Nguyễn Thanh Dung'
        };

        this.addPurchaseReturn(returnRecord);

        // 4. Tự động sinh Phiếu Thu trong Sổ Quỹ Thu Chi
        const methodText = paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt';
        this.addVoucher({
            type: 'receipt',
            paymentMethod: paymentMethod || 'cash',
            category: 'Thu tiền hoàn trả hàng Nhà Cung Cấp',
            targetType: 'supplier',
            targetName: returnRecord.supplierName || 'Nhà cung cấp',
            amount: totalRefund,
            note: `Thu tiền xuất trả hàng NCC tổng hợp ${returnRecord.id} [${methodText}] - ${returnRecord.supplierName}: ${returnRecord.reason}`,
            isAccounting: true,
            refId: returnRecord.id,
            pharmacist: this.getSettings().pharmacist || 'DS. Nguyễn Thanh Dung',
            createdAt: returnRecord.createdAt
        });

        return { success: true, returnRecord };
    }

    // --- Orders (Hóa đơn bán thuốc) ---
    getOrders() {
        const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
        if (!raw) return [];
        try {
            return JSON.parse(raw);
        } catch(e) {
            return [];
        }
    }

    getOrderById(id) {
        return this.getOrders().find(o => o.id === id);
    }

    addOrder(order) {
        const orders = this.getOrders();
        if (!order.id) {
            const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const countToday = orders.filter(o => o.createdAt && o.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length + 1;
            order.id = `HD${dateStr}-${String(countToday).padStart(3, '0')}`;
        }
        if (!order.createdAt) {
            order.createdAt = new Date().toISOString();
        }

        // Trừ kho thuốc
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const med = this.getMedicineById(item.medicineId);
                if (med) {
                    let unitsToDeduct = item.quantity;
                    if (item.unit === med.packUnit && med.packRatio > 1) {
                        unitsToDeduct = item.quantity * med.packRatio;
                    } else if (item.unit === med.subUnit && med.subRatio > 1) {
                        unitsToDeduct = item.quantity * med.subRatio;
                    }
                    this.updateStockUnits(item.medicineId, -unitsToDeduct);
                }
            });
        }

        // Xử lý trừ điểm tích lũy đã dùng (1 điểm = 1.000đ)
        const ptsUsed = parseInt(order.pointsUsed) || 0;
        if (order.customerPhone && ptsUsed > 0) {
            this.adjustCustomerPoints(order.customerPhone, -ptsUsed, `Dùng điểm thanh toán đơn ${order.id}`);
        }

        // Tích điểm cho khách hàng: Hóa đơn >= 100.000đ = 1 điểm, >= 200.000đ = 2 điểm...
        const pointsEarned = this.calculatePoints(order.totalAmount);
        order.pointsEarned = pointsEarned;
        if (order.customerPhone) {
            const cust = this.addPointsToCustomer(order.customerPhone, order.customerName, pointsEarned, order.totalAmount);
            order.customerPointsTotal = cust ? cust.points : pointsEarned;
        } else {
            order.customerPointsTotal = 0;
        }

        orders.unshift(order);
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

        // Tự động thêm Phiếu Thu vào Sổ Quỹ Thu Chi
        if (order.totalAmount > 0) {
            this.addVoucher({
                type: 'receipt',
                paymentMethod: order.paymentMethod || 'cash',
                category: 'Thu tiền bán thuốc',
                targetType: 'customer',
                targetName: order.customerName || (order.customerPhone ? `Khách ${order.customerPhone}` : 'Khách lẻ trực tiếp'),
                amount: order.totalAmount,
                note: `Thu tiền bán thuốc hóa đơn ${order.id}`,
                isAccounting: true,
                refId: order.id,
                pharmacist: order.pharmacist || 'DS. Nguyễn Thanh Dung',
                createdAt: order.createdAt
            });
        }

        this.schedulePersistToServer();
        this.emit('orders:changed', orders);
        return order;
    }

    updateOrder(orderId, updateFields) {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === orderId);
        if (!order) return null;

        const oldPaymentMethod = order.paymentMethod;
        const oldCustomerPhone = order.customerPhone;
        const oldCustomerName = order.customerName;

        // Cập nhật các trường được truyền vào
        Object.assign(order, updateFields);
        order.updatedAt = new Date().toISOString();

        // Lưu vào localStorage
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

        // 1. Nếu phương thức thanh toán thay đổi (ví dụ: chuyển khoản -> tiền mặt)
        // Cập nhật phiếu thu tương ứng trong Sổ Quỹ Thu Chi
        if (updateFields.paymentMethod && updateFields.paymentMethod !== oldPaymentMethod) {
            const vouchers = this.getVouchers();
            const voucher = vouchers.find(v => v.refId === order.id && !v.isCancelled && v.type === 'receipt');
            if (voucher) {
                voucher.paymentMethod = updateFields.paymentMethod;
                voucher.note = `Thu tiền bán thuốc hóa đơn ${order.id} (${updateFields.paymentMethod === 'cash' ? 'Đổi sang Tiền mặt' : 'Đổi sang Chuyển khoản'})`;
                localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers));
                this.emit('vouchers:changed', vouchers);
            }
        }

        // 2. Nếu tên khách hàng hoặc SĐT thay đổi
        if (updateFields.customerName && updateFields.customerName !== oldCustomerName) {
            const vouchers = this.getVouchers();
            const voucher = vouchers.find(v => v.refId === order.id && !v.isCancelled);
            if (voucher) {
                voucher.targetName = updateFields.customerName || (updateFields.customerPhone ? `Khách ${updateFields.customerPhone}` : 'Khách lẻ trực tiếp');
                localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers));
                this.emit('vouchers:changed', vouchers);
            }
        }

        // 3. Nếu trước đó chưa có SĐT và giờ bổ sung SĐT mới -> Tích điểm cho khách
        if (!oldCustomerPhone && updateFields.customerPhone && (order.pointsEarned || 0) > 0) {
            this.addPointsToCustomer(updateFields.customerPhone, updateFields.customerName || 'Khách hàng', order.pointsEarned, order.totalAmount);
        }

        this.schedulePersistToServer();
        this.emit('orders:changed', orders);
        return order;
    }

    cancelOrder(orderId, cancelReason = 'Khách trả hàng / Dược sĩ thao tác nhầm') {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === orderId);
        if (!order || order.isCancelled) return null;

        order.isCancelled = true;
        order.cancelledAt = new Date().toISOString();
        order.cancelReason = cancelReason;

        // Hoàn lại số lượng tồn kho
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const med = this.getMedicineById(item.medicineId);
                if (med) {
                    let unitsToReturn = item.quantity;
                    if (item.unit === med.packUnit && med.packRatio > 1) {
                        unitsToReturn = item.quantity * med.packRatio;
                    } else if (item.unit === med.subUnit && med.subRatio > 1) {
                        unitsToReturn = item.quantity * med.subRatio;
                    }
                    this.updateStockUnits(item.medicineId, unitsToReturn);
                }
            });
        }

        // Trừ lại điểm tích lũy của khách hàng nếu đơn này từng được cộng điểm
        if (order.customerPhone && order.pointsEarned > 0) {
            this.deductPointsFromCustomer(order.customerPhone, order.pointsEarned, order.totalAmount);
        }

        // Hoàn lại điểm tích lũy nếu đơn hàng này từng dùng điểm
        if (order.customerPhone && order.pointsUsed > 0) {
            this.adjustCustomerPoints(order.customerPhone, order.pointsUsed, `Hoàn lại điểm do hủy đơn ${order.id}`);
        }

        // Đánh dấu hủy phiếu thu tương ứng trong Sổ Thu Chi
        const vouchers = this.getVouchers();
        const v = vouchers.find(x => x.refId === orderId && x.type === 'receipt');
        if (v) {
            v.isCancelled = true;
            v.cancelReason = cancelReason;
            this.saveVouchers(vouchers);
        }

        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
        this.schedulePersistToServer();
        this.emit('orders:changed', orders);
        return order;
    }

    /**
     * Trả một phần hoặc toàn bộ thuốc trong đơn hàng, hoàn tiền trừ vào quỹ tiền mặt
     * @param {string} orderId
     * @param {Array} returnedItems [{ medicineId, medicineName, quantity, unit, price }]
     * @param {string} returnReason
     * @param {string} refundMethod 'cash'
     */
    returnOrderItems(orderId, returnedItems, returnReason = 'Khách trả hàng', refundMethod = 'cash') {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === orderId);
        if (!order || order.isCancelled) return null;

        if (!Array.isArray(returnedItems) || returnedItems.length === 0) return null;

        let totalRefund = 0;

        // 1. Hoàn lại số lượng từng loại thuốc vào tồn kho
        returnedItems.forEach(item => {
            const qtyToReturn = parseInt(item.quantity) || 0;
            if (qtyToReturn <= 0) return;

            const lineRefund = qtyToReturn * (parseFloat(item.price) || 0);
            totalRefund += lineRefund;

            const med = this.getMedicineById(item.medicineId);
            if (med) {
                let unitsToReturn = qtyToReturn;
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    unitsToReturn = qtyToReturn * med.packRatio;
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    unitsToReturn = qtyToReturn * med.subRatio;
                }
                this.updateStockUnits(item.medicineId, unitsToReturn);
            }
        });

        if (totalRefund <= 0) return null;

        // 2. Ghi nhận phiếu trả hàng vào đơn
        if (!order.returns) order.returns = [];
        const returnId = `TH${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 900) + 100)}`;
        const returnRecord = {
            id: returnId,
            createdAt: new Date().toISOString(),
            items: returnedItems.map(i => ({
                medicineId: i.medicineId,
                medicineName: i.medicineName,
                unit: i.unit,
                quantity: i.quantity,
                price: i.price,
                refundAmount: i.quantity * i.price
            })),
            refundTotal: totalRefund,
            refundMethod: refundMethod, // 'cash' (mặc định trừ vào quỹ tiền mặt)
            reason: returnReason,
            pharmacist: this.getSettings().pharmacist || 'Dược sĩ'
        };
        order.returns.push(returnRecord);
        order.totalRefunded = (order.totalRefunded || 0) + totalRefund;

        // Kiểm tra xem đã trả hết toàn bộ số lượng thuốc trong đơn chưa
        let allReturned = true;
        (order.items || []).forEach(origItem => {
            const totalReturnedQty = (order.returns || []).reduce((sum, r) => {
                const ri = (r.items || []).find(x => x.medicineId === origItem.medicineId && x.unit === origItem.unit);
                return sum + (ri ? ri.quantity : 0);
            }, 0);
            if (totalReturnedQty < origItem.quantity) {
                allReturned = false;
            }
        });
        order.returnStatus = allReturned ? 'fully_returned' : 'partially_returned';

        // 3. Trừ bớt điểm tích lũy tương ứng số tiền hoàn trả nếu có
        const pointsToDeduct = this.calculatePoints(totalRefund);
        if (pointsToDeduct > 0 && order.customerPhone) {
            this.deductPointsFromCustomer(order.customerPhone, pointsToDeduct, totalRefund);
            order.pointsEarned = Math.max(0, (order.pointsEarned || 0) - pointsToDeduct);
        }

        // 4. Tự động thêm Phiếu Chi (Hoàn tiền trả hàng) vào Sổ Quỹ Thu Chi
        if (totalRefund > 0) {
            this.addVoucher({
                type: 'payment',
                paymentMethod: refundMethod || 'cash',
                category: 'Chi trả lại hàng bán lẻ',
                targetType: 'customer',
                targetName: order.customerName || (order.customerPhone ? `Khách ${order.customerPhone}` : 'Khách lẻ trực tiếp'),
                amount: totalRefund,
                note: `Chi hoàn tiền trả hàng đơn ${order.id}: ${returnReason || 'Khách đổi trả thuốc'}`,
                isAccounting: true,
                refId: order.id,
                pharmacist: this.getSettings().pharmacist || 'DS. Nguyễn Thanh Dung',
                createdAt: new Date().toISOString()
            });
        }

        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
        this.schedulePersistToServer();
        this.emit('orders:changed', orders);
        return { order, returnRecord };
    }

    // --- LỊCH SỬ CHỈNH SỬA CÀI ĐẶT (Settings History) ---
    getSettingsHistory() {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS_HISTORY);
        if (!raw) return [];
        try {
            return JSON.parse(raw);
        } catch(e) {
            return [];
        }
    }

    saveSettingsHistory(history) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS_HISTORY, JSON.stringify(history));
        this.schedulePersistToServer();
        this.emit('settings_history:changed', history);
    }

    addSettingsHistoryEntry(entry) {
        const history = this.getSettingsHistory();
        entry.id = 'LOG-' + Date.now();
        if (!entry.timestamp) entry.timestamp = new Date().toISOString();
        history.unshift(entry);
        if (history.length > 50) history.pop();
        this.saveSettingsHistory(history);
        return entry;
    }

    // --- KHÁCH HÀNG & HỆ THỐNG TÍCH ĐIỂM (100.000đ = 1 điểm) ---
    calculatePoints(amount) {
        if (!amount || amount < 100000) return 0;
        return Math.floor(amount / 100000);
    }

    normalizePhone(phone) {
        if (!phone) return '';
        let p = phone.toString().replace(/[\s.-]/g, '');
        if (p.startsWith('+84')) p = '0' + p.substring(3);
        else if (p.startsWith('84') && p.length >= 11) p = '0' + p.substring(2);
        return p;
    }

    getCustomerById(id) {
        if (!id) return null;
        const customers = this.getCustomers();
        return customers.find(c => c.id === id) || null;
    }

    saveCustomer(cust) {
        const customers = this.getCustomers();
        const normPhone = cust.phone ? this.normalizePhone(cust.phone) : '';
        const now = new Date().toISOString();

        let existingIndex = -1;
        if (cust.id) {
            existingIndex = customers.findIndex(c => c.id === cust.id);
        }
        if (existingIndex === -1 && normPhone) {
            existingIndex = customers.findIndex(c => this.normalizePhone(c.phone) === normPhone);
        }

        if (existingIndex >= 0) {
            const existing = customers[existingIndex];
            customers[existingIndex] = {
                ...existing,
                ...cust,
                phone: cust.phone !== undefined ? cust.phone.trim() : existing.phone,
                name: cust.name !== undefined ? cust.name.trim() : existing.name,
                points: cust.points !== undefined ? Number(cust.points) : (existing.points || 0),
                totalSpent: cust.totalSpent !== undefined ? Number(cust.totalSpent) : (existing.totalSpent || 0),
                ordersCount: cust.ordersCount !== undefined ? Number(cust.ordersCount) : (existing.ordersCount || 0),
                note: cust.note !== undefined ? cust.note : (existing.note || ''),
                address: cust.address !== undefined ? cust.address : (existing.address || ''),
                lastVisit: existing.lastVisit || now
            };
            this.saveCustomers(customers);
            return customers[existingIndex];
        } else {
            const newId = cust.id || ('KH' + (customers.length + 1).toString().padStart(4, '0'));
            const newCustomer = {
                id: newId,
                phone: cust.phone ? cust.phone.trim() : '',
                name: (cust.name && cust.name.trim()) || 'Khách hàng',
                points: Number(cust.points || 0),
                totalSpent: Number(cust.totalSpent || 0),
                ordersCount: Number(cust.ordersCount || 0),
                note: cust.note || '',
                address: cust.address || '',
                createdAt: now,
                lastVisit: now
            };
            customers.push(newCustomer);
            this.saveCustomers(customers);
            return newCustomer;
        }
    }

    deleteCustomer(id) {
        let customers = this.getCustomers();
        const initialLen = customers.length;
        customers = customers.filter(c => c.id !== id && c.phone !== id);
        if (customers.length !== initialLen) {
            this.saveCustomers(customers);
            return true;
        }
        return false;
    }

    getOrdersByCustomer(phoneOrId, customerName = '') {
        const orders = this.getOrders();
        const cust = this.getCustomerById(phoneOrId) || this.getCustomerByPhone(phoneOrId);
        const targetPhone = cust ? cust.phone : phoneOrId;
        const targetNorm = targetPhone ? this.normalizePhone(targetPhone) : '';
        const targetName = (cust ? cust.name : customerName || '').trim().toLowerCase();

        return orders.filter(o => {
            if (targetNorm && o.customerPhone) {
                if (this.normalizePhone(o.customerPhone) === targetNorm) return true;
            }
            if (targetName && o.customerName) {
                const oName = o.customerName.trim().toLowerCase();
                if (oName && oName !== 'khách vãng lai' && oName !== 'khách lẻ' && oName !== 'khách hàng' && oName === targetName) {
                    return true;
                }
            }
            return false;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    getCustomerTier(points) {
        const pts = points || 0;
        if (pts >= 50) return { name: 'Kim Cương', badge: 'bg-cyan-100 text-cyan-800 border-cyan-300', icon: '💎' };
        if (pts >= 20) return { name: 'Vàng', badge: 'bg-amber-100 text-amber-800 border-amber-300', icon: '🥇' };
        if (pts >= 5) return { name: 'Bạc', badge: 'bg-slate-200 text-slate-800 border-slate-300', icon: '🥈' };
        return { name: 'Thành Viên', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: '🌱' };
    }

    getCustomers() {
        const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
        if (!raw) {
            const seeded = this.seedCustomersFromOrders();
            if (seeded.length > 0) {
                localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(seeded));
                return seeded;
            }
            return [];
        }
        try {
            return JSON.parse(raw);
        } catch(e) {
            return [];
        }
    }

    saveCustomers(customers) {
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
        this.schedulePersistToServer();
        this.emit('customers:changed', customers);
    }

    getCustomerByPhone(phone) {
        if (!phone) return null;
        const norm = this.normalizePhone(phone);
        if (!norm) return null;
        const customers = this.getCustomers();
        return customers.find(c => this.normalizePhone(c.phone) === norm) || null;
    }

    addPointsToCustomer(phone, name, pointsEarned, orderAmount) {
        if (!phone) return null;
        const customers = this.getCustomers();
        const norm = this.normalizePhone(phone);
        let cust = customers.find(c => this.normalizePhone(c.phone) === norm);
        const now = new Date().toISOString();

        if (cust) {
            cust.points = (cust.points || 0) + (pointsEarned || 0);
            cust.totalSpent = (cust.totalSpent || 0) + (orderAmount || 0);
            cust.ordersCount = (cust.ordersCount || 0) + 1;
            cust.lastVisit = now;
            if (name && (!cust.name || cust.name === 'Khách hàng' || cust.name === 'Khách vãng lai')) {
                cust.name = name.trim();
            }
        } else {
            cust = {
                id: 'KH' + (customers.length + 1).toString().padStart(4, '0'),
                phone: phone.trim(),
                name: (name && name.trim()) || 'Khách hàng',
                points: pointsEarned || 0,
                totalSpent: orderAmount || 0,
                ordersCount: 1,
                createdAt: now,
                lastVisit: now,
                note: ''
            };
            customers.push(cust);
        }

        this.saveCustomers(customers);
        return cust;
    }

    deductPointsFromCustomer(phone, pointsDeducted, orderAmount) {
        if (!phone) return;
        const customers = this.getCustomers();
        const norm = this.normalizePhone(phone);
        const cust = customers.find(c => this.normalizePhone(c.phone) === norm);
        if (cust) {
            cust.points = Math.max(0, (cust.points || 0) - (pointsDeducted || 0));
            cust.totalSpent = Math.max(0, (cust.totalSpent || 0) - (orderAmount || 0));
            cust.ordersCount = Math.max(0, (cust.ordersCount || 1) - 1);
            this.saveCustomers(customers);
        }
    }

    adjustCustomerPoints(phone, deltaPoints, reason = '') {
        const customers = this.getCustomers();
        const norm = this.normalizePhone(phone);
        const cust = customers.find(c => this.normalizePhone(c.phone) === norm);
        if (!cust) return null;

        cust.points = Math.max(0, (cust.points || 0) + deltaPoints);
        this.saveCustomers(customers);
        return cust;
    }

    seedCustomersFromOrders() {
        const orders = this.getOrders();
        if (!orders || orders.length === 0) return [];

        const map = {};
        orders.forEach(o => {
            if (!o.customerPhone || o.isCancelled) return;
            const norm = this.normalizePhone(o.customerPhone);
            const pts = o.pointsEarned !== undefined ? o.pointsEarned : this.calculatePoints(o.totalAmount);
            if (!map[norm]) {
                map[norm] = {
                    id: 'KH' + (Object.keys(map).length + 1).toString().padStart(4, '0'),
                    phone: o.customerPhone,
                    name: o.customerName || 'Khách hàng',
                    points: pts,
                    totalSpent: o.totalAmount || 0,
                    ordersCount: 1,
                    createdAt: o.createdAt || new Date().toISOString(),
                    lastVisit: o.createdAt || new Date().toISOString(),
                    note: ''
                };
            } else {
                map[norm].points += pts;
                map[norm].totalSpent += (o.totalAmount || 0);
                map[norm].ordersCount += 1;
                if (new Date(o.createdAt) > new Date(map[norm].lastVisit)) {
                    map[norm].lastVisit = o.createdAt;
                }
            }
        });
        return Object.values(map);
    }

    // --- Backup & Restore ---
    exportBackupJSON() {
        const backupData = {
            exportDate: new Date().toISOString(),
            version: '2.0',
            app: 'MedicaPharmacy',
            domain: 'http://medica.com',
            settings: this.getSettings(),
            medicines: this.getMedicines(),
            suppliers: this.getSuppliers(),
            orders: this.getOrders(),
            stockInOrders: this.getStockInOrders(),
            customers: this.getCustomers(),
            settingsHistory: this.getSettingsHistory(),
            vouchers: this.getVouchers()
        };
        return JSON.stringify(backupData, null, 2);
    }

    importBackupJSON(jsonStr) {
        try {
            const data = JSON.parse(jsonStr);
            if (!data.medicines || !data.orders) {
                throw new Error('Định dạng file sao lưu không hợp lệ.');
            }
            if (data.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
            if (data.medicines) localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(data.medicines));
            if (data.suppliers) localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(data.suppliers));
            if (data.orders) localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(data.orders));
            if (data.stockInOrders) localStorage.setItem(STORAGE_KEYS.STOCK_IN, JSON.stringify(data.stockInOrders));
            if (data.customers) localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers));
            if (data.settingsHistory) localStorage.setItem(STORAGE_KEYS.SETTINGS_HISTORY, JSON.stringify(data.settingsHistory));
            if (data.vouchers) localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(data.vouchers));
            this.schedulePersistToServer();
            this.emit('all:changed');
            return { success: true };
        } catch(e) {
            return { success: false, message: e.message };
        }
    }

    // --- VOUCHERS (SỔ QUỸ PHIẾU THU & PHIẾU CHI) ---
    getVouchers() {
        const raw = localStorage.getItem(STORAGE_KEYS.VOUCHERS);
        if (!raw) {
            if (typeof SampleData !== 'undefined' && SampleData.vouchers) {
                localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(SampleData.vouchers));
                return SampleData.vouchers;
            }
            return [];
        }
        try {
            return JSON.parse(raw);
        } catch(e) {
            return [];
        }
    }

    saveVouchers(vouchers) {
        localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers));
        this.schedulePersistToServer();
        this.emit('vouchers:changed', vouchers);
    }

    addVoucher(voucher, shouldSchedule = true) {
        const vouchers = this.getVouchers();
        if (!voucher.id) {
            const prefix = voucher.type === 'receipt' ? 'PT' : 'PC';
            const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const countToday = vouchers.filter(v => v.id && v.id.startsWith(prefix + dateStr)).length + 1;
            voucher.id = `${prefix}${dateStr}-${String(countToday).padStart(3, '0')}`;
        }
        if (!voucher.createdAt) {
            voucher.createdAt = new Date().toISOString();
        }
        vouchers.unshift(voucher);
        localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers));
        if (shouldSchedule) {
            this.schedulePersistToServer();
        }
        this.emit('vouchers:changed', vouchers);
        return voucher;
    }

    deleteVoucher(voucherId) {
        let vouchers = this.getVouchers();
        vouchers = vouchers.filter(v => v.id !== voucherId);
        this.saveVouchers(vouchers);
    }

    // --- LỊCH SỬ NHẬP VÀ BÁN CỦA TỪNG LOẠI THUỐC ---
    getMedicineStockInHistory(medicineId) {
        const stockIns = this.getStockInOrders();
        const history = [];
        stockIns.forEach(order => {
            (order.items || []).forEach(item => {
                if (item.medicineId === medicineId) {
                    history.push({
                        orderId: order.id,
                        createdAt: order.createdAt,
                        supplierName: order.supplierName || '---',
                        batchNo: item.batchNo || '---',
                        expiryDate: item.expiryDate || '---',
                        unit: item.unit,
                        quantity: item.quantity,
                        costPrice: item.costPrice || 0,
                        totalAmount: item.total || (item.quantity * item.costPrice),
                        paymentMethod: order.paymentMethod || 'cash',
                        pharmacist: order.pharmacist || '---'
                    });
                }
            });
        });
        return history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    getMedicineSalesHistory(medicineId) {
        const orders = this.getOrders();
        const history = [];
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                if (item.medicineId === medicineId) {
                    const returnedQty = (order.returns || []).reduce((sum, r) => {
                        const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                        return sum + (ri ? ri.quantity : 0);
                    }, 0);

                    history.push({
                        orderId: order.id,
                        createdAt: order.createdAt,
                        customerName: order.customerName || 'Khách vãng lai',
                        customerPhone: order.customerPhone || '---',
                        unit: item.unit,
                        quantity: item.quantity,
                        returnedQuantity: returnedQty,
                        price: item.price || 0,
                        totalAmount: item.quantity * item.price,
                        paymentMethod: order.paymentMethod || 'cash',
                        isCancelled: !!order.isCancelled,
                        returnStatus: order.returnStatus || null,
                        pharmacist: order.pharmacist || '---'
                    });
                }
            });
        });
        return history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // --- TỔNG KẾT DÒNG TIỀN & TỒN QUỸ ---
    getCashFlowSummary(timeFilter = 'all', dateFrom = '', dateTo = '') {
        const vouchers = this.getVouchers();

        const filterFn = (dateStr) => {
            return window.AppUtils ? AppUtils.matchesTimeFilter(dateStr, timeFilter, dateFrom, dateTo) : true;
        };

        // 1. Quỹ tổng thể
        let overallCashIn = 0;
        let overallCashOut = 0;
        let overallTransferIn = 0;
        let overallTransferOut = 0;

        vouchers.forEach(v => {
            if (v.isCancelled) return;
            const amt = v.amount || 0;
            if (v.type === 'receipt') {
                if (v.paymentMethod === 'cash') overallCashIn += amt;
                else overallTransferIn += amt;
            } else if (v.type === 'payment') {
                if (v.paymentMethod === 'cash') overallCashOut += amt;
                else overallTransferOut += amt;
            }
        });

        const cashBalance = overallCashIn - overallCashOut;
        const bankBalance = overallTransferIn - overallTransferOut;

        // 2. Thu / Chi trong kỳ lọc
        let periodIncome = 0;
        let periodExpense = 0;
        let periodCashIncome = 0;
        let periodCashExpense = 0;
        let periodTransferIncome = 0;
        let periodTransferExpense = 0;

        vouchers.filter(v => !v.isCancelled && filterFn(v.createdAt)).forEach(v => {
            const amt = v.amount || 0;
            if (v.type === 'receipt') {
                periodIncome += amt;
                if (v.paymentMethod === 'cash') periodCashIncome += amt;
                else periodTransferIncome += amt;
            } else if (v.type === 'payment') {
                periodExpense += amt;
                if (v.paymentMethod === 'cash') periodCashExpense += amt;
                else periodTransferExpense += amt;
            }
        });

        return {
            cashBalance,
            bankBalance,
            totalBalance: cashBalance + bankBalance,
            periodIncome,
            periodExpense,
            periodNet: periodIncome - periodExpense,
            periodCashIncome,
            periodCashExpense,
            periodTransferIncome,
            periodTransferExpense
        };
    }

    // --- Custom Categories for Vouchers ---
    getCustomCategories() {
        const raw = localStorage.getItem('medica_custom_categories_v1');
        if (!raw) return { receipt: [], payment: [] };
        try { return JSON.parse(raw); } catch(e) { return { receipt: [], payment: [] }; }
    }

    addCustomCategory(type, categoryName) {
        if (!categoryName || !categoryName.trim()) return '';
        const cats = this.getCustomCategories();
        if (!cats[type]) cats[type] = [];
        const trimmed = categoryName.trim();
        if (!cats[type].includes(trimmed)) {
            cats[type].push(trimmed);
            localStorage.setItem('medica_custom_categories_v1', JSON.stringify(cats));
        }
        return trimmed;
    }

    // --- Đồng bộ toàn bộ Hóa đơn & Nhập kho vào Sổ Thu Chi ---
    syncOrdersAndStockInsToVouchers() {
        const vouchers = this.getVouchers();
        const existingRefIds = new Set(vouchers.map(v => v.refId).filter(Boolean));
        let changed = false;

        // 1. Đồng bộ các hóa đơn bán hàng vào Phiếu Thu
        const orders = this.getOrders();
        orders.forEach(o => {
            if (o.totalAmount > 0 && !existingRefIds.has(o.id)) {
                const dateStr = o.createdAt || new Date().toISOString();
                const dCompact = dateStr.slice(2, 10).replace(/-/g, '');
                const vId = 'PT' + dCompact + '-' + String(Math.floor(Math.random() * 900) + 100);
                vouchers.push({
                    id: vId,
                    type: 'receipt',
                    paymentMethod: o.paymentMethod || 'cash',
                    category: 'Thu tiền bán thuốc',
                    targetType: 'customer',
                    targetName: o.customerName || (o.customerPhone ? `Khách ${o.customerPhone}` : 'Khách lẻ trực tiếp'),
                    amount: o.totalAmount,
                    note: `Thu tiền bán thuốc hóa đơn ${o.id}`,
                    isAccounting: true,
                    isCancelled: !!o.isCancelled,
                    cancelReason: o.cancelReason || '',
                    refId: o.id,
                    pharmacist: o.pharmacist || 'DS. Nguyễn Thanh Dung',
                    createdAt: dateStr
                });
                existingRefIds.add(o.id);
                changed = true;
            }

            // Đồng bộ hoàn tiền đơn trả hàng
            if (o.returns && Array.isArray(o.returns)) {
                o.returns.forEach(r => {
                    const returnRefId = `RETURN_${r.id || o.id}`;
                    if (r.refundTotal > 0 && !existingRefIds.has(returnRefId)) {
                        const rDate = r.createdAt || o.createdAt || new Date().toISOString();
                        const vId = 'PC' + rDate.slice(2, 10).replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 900) + 100);
                        vouchers.push({
                            id: vId,
                            type: 'payment',
                            paymentMethod: r.refundMethod || 'cash',
                            category: 'Chi trả lại hàng bán lẻ',
                            targetType: 'customer',
                            targetName: o.customerName || 'Khách lẻ trực tiếp',
                            amount: r.refundTotal,
                            note: `Chi hoàn tiền trả hàng đơn ${o.id}: ${r.reason || 'Khách trả hàng'}`,
                            isAccounting: true,
                            refId: returnRefId,
                            pharmacist: r.pharmacist || 'DS. Nguyễn Thanh Dung',
                            createdAt: rDate
                        });
                        existingRefIds.add(returnRefId);
                        changed = true;
                    }
                });
            }
        });

        // 2. Đồng bộ các phiếu nhập kho vào Phiếu Chi
        const stockIns = this.getStockInOrders();
        stockIns.forEach(s => {
            if (s.totalAmount > 0 && !existingRefIds.has(s.id)) {
                const dateStr = s.createdAt || new Date().toISOString();
                const dCompact = dateStr.slice(2, 10).replace(/-/g, '');
                const vId = 'PC' + dCompact + '-' + String(Math.floor(Math.random() * 900) + 100);
                vouchers.push({
                    id: vId,
                    type: 'payment',
                    paymentMethod: s.paymentMethod || 'cash',
                    category: 'Chi tiền hàng Nhà Cung Cấp',
                    targetType: 'supplier',
                    targetName: s.supplierName || 'Nhà cung cấp',
                    amount: s.totalAmount,
                    note: `Chi thanh toán phiếu nhập thuốc ${s.id} - ${s.supplierName || ''}`,
                    isAccounting: true,
                    refId: s.id,
                    pharmacist: s.pharmacist || 'DS. Nguyễn Thanh Dung',
                    createdAt: dateStr
                });
                existingRefIds.add(s.id);
                changed = true;
            }
        });

        if (changed) {
            vouchers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            this.saveVouchers(vouchers);
        }
    }
}

// Khởi tạo Singleton Store
window.Store = new DataStore();

// --- Utility Helpers ---
window.AppUtils = {
    formatVND(amount) {
        if (isNaN(amount) || amount === null || amount === undefined) return '0 đ';
        return Number(amount).toLocaleString('vi-VN') + ' đ';
    },

    formatNumber(val) {
        if (isNaN(val) || val === null || val === undefined) return '0';
        return Number(val).toLocaleString('vi-VN');
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    },

    formatDateTime(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${mins}`;
    },

    getLocalDateStr(dateInput = new Date()) {
        if (!dateInput) return '';
        const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput).slice(0, 10);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    matchesTimeFilter(dateStr, filterType = 'all', customFrom = '', customTo = '') {
        if (!dateStr) return false;
        if (!filterType || filterType === 'all') return true;

        const recordDate = this.getLocalDateStr(dateStr);
        const now = new Date();
        const todayStr = this.getLocalDateStr(now);

        if (filterType === 'today') {
            return recordDate === todayStr;
        }

        if (filterType === 'yesterday') {
            const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const yestStr = this.getLocalDateStr(yesterday);
            return recordDate === yestStr;
        }

        if (filterType === 'last_7_days') {
            const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            sevenDaysAgo.setHours(0, 0, 0, 0);
            const d = new Date(dateStr);
            return d >= sevenDaysAgo;
        }

        if (filterType === 'this_month') {
            const monthPrefix = todayStr.slice(0, 7);
            return recordDate.startsWith(monthPrefix);
        }

        if (filterType === 'custom') {
            if (customFrom && recordDate < customFrom) return false;
            if (customTo && recordDate > customTo) return false;
            return true;
        }

        return true;
    },

    checkExpiryStatus(expiryDateStr) {
        if (!expiryDateStr) return { status: 'ok', daysLeft: 9999, label: 'Chưa có HSD' };
        const expiry = new Date(expiryDateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = expiry.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) {
            return { status: 'expired', daysLeft, label: 'ĐÃ HẾT HẠN' };
        } else if (daysLeft <= 90) {
            return { status: 'warning', daysLeft, label: `Sắp hết hạn (${daysLeft} ngày)` };
        }
        return { status: 'ok', daysLeft, label: 'Bình thường' };
    },

    checkStockStatus(medicine) {
        const units = medicine.stockUnits || 0;
        const min = medicine.minStock || 0;
        if (units <= 0) {
            return { status: 'out_of_stock', label: 'Hết hàng' };
        } else if (units <= min) {
            return { status: 'low_stock', label: 'Sắp hết' };
        }
        return { status: 'in_stock', label: 'Còn hàng' };
    },

    formatStockUnitsDisplay(medicine) {
        const total = medicine.stockUnits || 0;
        const base = medicine.baseUnit || 'Viên';
        const pack = medicine.packUnit || 'Hộp';
        const packRatio = medicine.packRatio || 1;
        const sub = medicine.subUnit;
        const subRatio = medicine.subRatio;

        if (packRatio > 1 && total >= packRatio) {
            const boxes = Math.floor(total / packRatio);
            const rem = total % packRatio;
            let text = `${boxes} ${pack}`;
            if (rem > 0) {
                if (sub && subRatio > 1) {
                    const subs = Math.floor(rem / subRatio);
                    const bases = rem % subRatio;
                    if (subs > 0) text += ` + ${subs} ${sub}`;
                    if (bases > 0) text += ` + ${bases} ${base}`;
                } else {
                    text += ` + ${rem} ${base}`;
                }
            }
            text += ` (${total} ${base})`;
            return text;
        }

        if (sub && subRatio > 1 && total >= subRatio) {
            const subs = Math.floor(total / subRatio);
            const rem = total % subRatio;
            let text = `${subs} ${sub}`;
            if (rem > 0) text += ` + ${rem} ${base}`;
            text += ` (${total} ${base})`;
            return text;
        }

        return `${total} ${base}`;
    },

    playBeepSound(type = 'beep') {
        const settings = Store.getSettings();
        if (settings.soundEnabled === false) return;
        
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'beep') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
                osc.start();
                osc.stop(ctx.currentTime + 0.12);
            } else if (type === 'success') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, ctx.currentTime);
                osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08);
                osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
            }
        } catch(e) { }
    }
};
