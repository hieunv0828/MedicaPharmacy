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
    PURCHASE_RETURNS: 'medica_purchase_returns_v1',
    AUDIT_LOG: 'medica_audit_log_v1',
    PENDING_QUEUE: 'medica_pending_queue_v1'
};

class DataStore {
    constructor() {
        this.listeners = {};
        this.isServerMode = window.location.protocol.startsWith('http');
        this.syncInProgress = false;
        this.isSaving = false;
        this.lastDatabaseVersion = 1;
        this.lastDatabaseTimestamp = null;
        this.lastServerSyncTime = null;
        this._cachedMedicines = null;
        this._medicineMap = null;
        this._cachedOrders = null;
        this._cachedSuppliers = null;
        this._cachedCustomers = null;
        this._cachedVouchers = null;
        this._cachedStockIns = null;
        this._cachedReturns = null;
        this._cachedAuditLog = null;
        this._pendingLocalOrderIds = new Set(); // Tập hợp mã đơn hàng cục bộ đang chờ commit máy chủ
        this._pendingLocalStockInIds = new Set(); // Tập hợp mã phiếu nhập kho cục bộ đang chờ commit máy chủ
        this._pendingLocalReturnIds = new Set(); // Tập hợp mã trả hàng lẻ cục bộ đang chờ commit máy chủ
        this._activeUploadPromise = null;

        // Phục hồi hàng đợi chờ từ LocalStorage nếu có
        try {
            const queue = this._getPendingQueue();
            if (Array.isArray(queue) && queue.length > 0) {
                queue.forEach(q => {
                    if (q.type === 'order' && q.id) this._pendingLocalOrderIds.add(q.id);
                    if (q.type === 'stockin' && q.id) this._pendingLocalStockInIds.add(q.id);
                    if (q.type === 'order_return' && q.id) this._pendingLocalReturnIds.add(q.id);
                });
            }
        } catch(e) {}

        // --- Cờ an toàn: chỉ cho phép ghi lên server sau khi đã nạp xong dữ liệu máy chủ ---
        this.ready = false;
        this._loadedFromServer = false;   // đã từng GET /api/database thành công chưa
        this._serverCounts = null;        // số bản ghi của snapshot máy chủ gần nhất (để chặn ghi đè làm giảm dữ liệu)
        this._shrinkWarned = false;

        this.initPromise = this.init();
    }

    async init() {
        try {
            if (this.isServerMode) {
                console.log('🌐 Đang chạy ở chế độ MÁY CHỦ DÙNG CHUNG (http://medica.com)');
                await this.syncWithServer();
                // Tự động kiểm tra đồng bộ dữ liệu mới từ máy khác mỗi 8 giây (qua endpoint siêu nhẹ)
                setInterval(() => this.backgroundCheckServerSync(), 8000);

                // Đảm bảo khi đóng tab thì lưu dứt điểm dữ liệu chưa kịp hết hạn debounce
                window.addEventListener('beforeunload', () => {
                    if (this._persistTimer) {
                        this.persistImmediately();
                    }
                });
            } else {
                console.log('💻 Đang chạy ở chế độ CỤC BỘ TRỰC TIẾP (file://)');
                if (!localStorage.getItem(STORAGE_KEYS.MEDICINES)) {
                    this.loadInitialSampleData();
                }
            }
            const settings = this.getSettings() || {};
            let settingsUpdated = false;
            // Chỉ chạy migration khi chưa đánh dấu đã migrate, và khi đã có dữ liệu hợp lệ từ server
            if (!settings.vouchersMigrated && (!this.isServerMode || this._loadedFromServer)) {
                this.syncOrdersAndStockInsToVouchers();
                settings.vouchersMigrated = true;
                settingsUpdated = true;
            }
            if (!settings.customerStatsMigrated && (!this.isServerMode || this._loadedFromServer)) {
                this.syncCustomerOrdersStats();
                settings.customerStatsMigrated = true;
                settingsUpdated = true;
            }
            if (settingsUpdated) {
                this.saveSettings(settings, false);
            }
        } catch (e) {
            console.error('Lỗi khởi tạo dữ liệu:', e);
        } finally {
            // Kể cả khi lỗi, đánh dấu ready để không khoá cứng thao tác của người dùng.
            // Việc chống ghi đè vẫn do guard số bản ghi đảm nhiệm.
            this.ready = true;
        }
    }

    // Chờ dữ liệu máy chủ nạp xong (tối đa ~15s) trước khi ghi để tránh ghi đè bản rút gọn
    async _ensureReadyForWrite() {
        if (this.ready || !this.isServerMode) return true;
        if (this.initPromise) {
            try {
                await Promise.race([
                    this.initPromise,
                    new Promise(resolve => setTimeout(resolve, 15000))
                ]);
            } catch (e) { /* bỏ qua, sẽ kiểm tra guard bên dưới */ }
        }
        return this.ready || !this.isServerMode;
    }

    _countSnapshot(db) {
        if (!db) return null;
        const len = (v) => (Array.isArray(v) ? v.length : 0);
        return {
            medicines: len(db.medicines),
            orders: len(db.orders),
            vouchers: len(db.vouchers),
            stockIns: len(db.stockInOrders),
            customers: len(db.customers)
        };
    }

    // Trả về mô tả collection bị giảm bất thường, hoặc null nếu hợp lệ
    _findAbnormalShrink(fullDb) {
        if (!fullDb) return null;
        const known = this._serverCounts;
        if (!known) return null;
        const checks = [
            ['medicines', known.medicines, fullDb.medicines],
            ['orders', known.orders, fullDb.orders],
            ['vouchers', known.vouchers, fullDb.vouchers],
            ['stockIns', known.stockIns, fullDb.stockInOrders],
            ['customers', known.customers, fullDb.customers]
        ];
        for (const [field, knownCount, arr] of checks) {
            if (!knownCount || knownCount <= 0 || !Array.isArray(arr)) continue;
            const incoming = arr.length;
            if (incoming >= knownCount) continue;
            const dropped = knownCount - incoming;
            if (dropped > 20 && incoming < knownCount * 0.8) {
                return { field, known: knownCount, incoming };
            }
        }
        return null;
    }

    _getPendingQueue() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.PENDING_QUEUE);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    _addToPendingQueue(item) {
        if (!item || !item.id) return;
        try {
            const queue = this._getPendingQueue();
            const exists = queue.some(q => {
                // Khi cả hai bên có clientTxId: CHỈ đối chiếu theo clientTxId trước (không chặn nhầm giao dịch mới khi trùng mã)
                if (item.clientTxId && q.clientTxId) {
                    return q.clientTxId === item.clientTxId;
                }
                // Chỉ dùng id cho bản ghi cũ thiếu clientTxId
                return q.id === item.id;
            });
            if (!exists) {
                queue.push(item);
                localStorage.setItem(STORAGE_KEYS.PENDING_QUEUE, JSON.stringify(queue));
            }
        } catch (e) {
            console.warn('Could not save item to pending queue in localStorage:', e);
        }
    }

    _removeFromPendingQueue(id, clientTxId) {
        try {
            let queue = this._getPendingQueue();
            queue = queue.filter(q => {
                // Khi item có clientTxId: CHỈ đối chiếu chính xác bằng clientTxId (Batch 9: Issue 4)
                if (q.clientTxId) {
                    if (clientTxId) return q.clientTxId !== clientTxId;
                    return true; // Không có clientTxId để đối chiếu -> không xóa giao dịch này!
                }
                // Chỉ đối chiếu bằng id khi bản ghi trong hàng đợi không có clientTxId
                if (id) return q.id !== id;
                return true;
            });
            localStorage.setItem(STORAGE_KEYS.PENDING_QUEUE, JSON.stringify(queue));
        } catch (e) { }
    }

    _bulkRemoveFromPendingQueue(orderTxIds, stockInTxIds, orderIds, stockInIds) {
        try {
            let queue = this._getPendingQueue();
            if (!queue || queue.length === 0) return;
            const txSet = new Set();
            if (orderTxIds) orderTxIds.forEach(id => txSet.add(id));
            if (stockInTxIds) stockInTxIds.forEach(id => txSet.add(id));

            const idSet = new Set();
            if (orderIds) orderIds.forEach(id => idSet.add(id));
            if (stockInIds) stockInIds.forEach(id => idSet.add(id));

            const initialLen = queue.length;
            queue = queue.filter(q => {
                // Khi có clientTxId: CHỈ đối chiếu chính xác bằng clientTxId (Batch 9: Issue 4)
                if (q.clientTxId) {
                    return !txSet.has(q.clientTxId);
                }
                // Chỉ đối chiếu bằng id khi bản ghi cũ trong quá khứ không có clientTxId
                if (q.id) {
                    return !idSet.has(q.id);
                }
                return true;
            });
            if (queue.length !== initialLen) {
                localStorage.setItem(STORAGE_KEYS.PENDING_QUEUE, JSON.stringify(queue));
            }
        } catch (e) { }
    }

    /**
     * Hoàn nguyên an toàn một đơn trả hàng tổng hợp cục bộ khi người dùng hủy bỏ giao dịch (Issue 5, 6 & Batch 8: Issue 2 & Batch 9: Issue 1)
     */
    async rollbackPendingReturnOrder(returnData) {
        if (!returnData || !returnData.id) return { success: false, message: 'Dữ liệu không hợp lệ' };
        const returnId = returnData.id;

        // 1. Đánh dấu hủy đơn trả (thay vì xóa trắng, để nếu server đã nhận được thì cũng được hủy thực sự trên server)
        const orders = this.getOrders();
        const order = orders.find(o => (returnData.clientTxId && o.clientTxId === returnData.clientTxId) || o.id === returnId);
        if (order) {
            order.isCancelled = true;
            order.cancelReason = 'Hủy giao dịch trả hàng chưa hoàn tất';
            order.cancelledAt = this.formatLocalISO();
            this._cachedOrders = orders;
            try { localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders)); } catch(e){}
        }

        // 2. Hoàn nguyên kho: trừ lại số lượng đã cộng nếu shouldRestock !== false (Idempotent - Batch 9: Issue 1)
        const applyStockRollback = () => {
            if (returnData.shouldRestock !== false && Array.isArray(returnData.items)) {
                returnData.items.forEach(it => {
                    const med = this.getMedicineById(it.medicineId);
                    if (med) {
                        let unitsToDeduct = parseFloat(it.quantity) || 0;
                        if (it.unit === med.packUnit && med.packRatio > 1) unitsToDeduct *= med.packRatio;
                        else if (it.unit === med.subUnit && med.subRatio > 1) unitsToDeduct *= med.subRatio;
                        this.updateStockUnits(it.medicineId, -unitsToDeduct);
                    }
                });
            }
        };

        if (order) {
            if (!order._stockRollbacked) {
                applyStockRollback();
                order._stockRollbacked = true;
            }
        } else if (!returnData._stockRollbacked) {
            applyStockRollback();
            returnData._stockRollbacked = true;
        }

        // 3. Hủy phiếu chi tương ứng trong vouchers
        const voucherId = `TT${returnId}`;
        const vouchers = this.getVouchers();
        const v = vouchers.find(v => v.id === voucherId || v.refId === returnId || (returnData.clientTxId && v.clientTxId === returnData.clientTxId));
        if (v) {
            v.isCancelled = true;
            v.cancelReason = `Hủy theo giao dịch trả hàng ${returnId}`;
            this._cachedVouchers = vouchers;
            try { localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers)); } catch(e){}
            this.emit('vouchers:changed', vouchers);
        }

        // 4. Lưu trạng thái hủy lên máy chủ và xác nhận thành công (Batch 8: Issue 2 & Batch 9: Issue 1 & Batch 10: Issue 1)
        if (this.isServerMode) {
            let saved = false;
            try {
                saved = await this.persistImmediately();
                if (!saved) {
                    // Nếu gặp xung đột hoặc 409, thử đồng bộ lại DB từ server
                    const syncSuccess = await this.syncWithServer();
                    if (syncSuccess) {
                        // CHỈ KHI ĐỒNG BỘ THÀNH CÔNG TỪ SERVER MỚI KIỂM TRA TRẠNG THÁI SERVER (Batch 10: Issue 1):
                        // Nếu server ĐÃ TỪNG NHẬN ĐƯỢC đơn trả này, server mới có tồn kho của đơn trả
                        // Khi đó ta mới áp dụng trừ lại tồn kho trên dữ liệu vừa sync về từ server!
                        const reOrders = this.getOrders();
                        const ro = reOrders.find(o => (returnData.clientTxId && o.clientTxId === returnData.clientTxId) || o.id === returnId);
                        if (ro) {
                            ro.isCancelled = true;
                            ro.cancelReason = 'Hủy giao dịch trả hàng chưa hoàn tất';
                            ro.cancelledAt = this.formatLocalISO();
                            // Server có đơn này -> server đã cộng tồn -> cần hoàn nguyên kho
                            applyStockRollback();
                            ro._stockRollbacked = true;
                        }
                        // Nếu server CHƯA TỪNG CÓ đơn này: server chưa từng cộng tồn, dữ liệu server vừa tải về đã là tồn gốc đúng -> TUYỆT ĐỐI KHÔNG trừ tiếp!
                        
                        const reVouchers = this.getVouchers();
                        const rv = reVouchers.find(v => v.id === voucherId || v.refId === returnId || (returnData.clientTxId && v.clientTxId === returnData.clientTxId));
                        if (rv) {
                            rv.isCancelled = true;
                            rv.cancelReason = `Hủy theo giao dịch trả hàng ${returnId}`;
                        }
                        saved = await this.persistImmediately();
                    }
                    // Nếu syncSuccess = false (mất mạng/lỗi): Bộ nhớ máy vẫn giữ nguyên việc đã trừ kho ở bước 2, KHÔNG trừ thêm lần nào nữa!
                }
            } catch (e) {
                saved = false;
            }

            if (!saved) {
                // Không xóa khỏi pendingQueue nếu chưa lưu thành công máy chủ để tiếp tục giữ trạng thái
                return { success: false, message: 'Chưa thể lưu trạng thái hủy lên máy chủ' };
            }
        }

        // 5. Khi máy chủ đã xác nhận lưu thành công mới xóa khỏi pending queue
        if (this._pendingLocalOrderIds) this._pendingLocalOrderIds.delete(returnId);
        this._removeFromPendingQueue(returnId, returnData.clientTxId);

        this.emit('orders:changed', orders);
        return { success: true };
    }

    // --- Đồng bộ với Máy Chủ Server API ---
    async syncWithServer() {
        if (this.syncInProgress) return false;
        this.syncInProgress = true;

        try {
            const res = await fetch('/api/database', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data.version) this.lastDatabaseVersion = data.version;
                if (data.lastUpdated) this.lastDatabaseTimestamp = data.lastUpdated;

                // Ghi nhận snapshot máy chủ (kể cả khi rỗng) để guard chống ghi đè có mốc so sánh
                this._loadedFromServer = true;
                this._serverCounts = this._countSnapshot(data);

                // Chỉ nạp vào Local Cache khi server có dữ liệu hợp lệ
                // TUYỆT ĐỐI KHÔNG tự ý tải SampleData lên ghi đè máy chủ nếu server trả về mảng rỗng!
                if (!data || !data.medicines || !Array.isArray(data.medicines) || data.medicines.length === 0) {
                    console.warn('⚠️ Server trả về danh mục thuốc rỗng hoặc chưa sẵn sàng. Bảo vệ dữ liệu hiện tại không bị ghi đè!');
                    this.updateServerStatusBadge(false);
                    return false;
                }

                this.saveToLocalCache(data);

                // Migration chỉ chạy một lần duy nhất nếu chưa migrate
                const s = this.getSettings() || {};
                let sChanged = false;
                if (!s.customerStatsMigrated) {
                    this.syncCustomerOrdersStats();
                    s.customerStatsMigrated = true;
                    sChanged = true;
                }
                if (!s.vouchersMigrated) {
                    this.syncOrdersAndStockInsToVouchers();
                    s.vouchersMigrated = true;
                    sChanged = true;
                }
                if (sChanged) {
                    this.saveSettings(s, false);
                }

                this.lastServerSyncTime = Date.now();
                this.updateServerStatusBadge(true);
                this.emit('all:changed');
                return true;
            }
            return false;
        } catch (e) {
            console.warn('Không thể kết nối máy chủ /api/database, duy trì dữ liệu hiện tại:', e);
            this.updateServerStatusBadge(false);
            return false;
        } finally {
            this.syncInProgress = false;
        }
    }

    async backgroundCheckServerSync() {
        // TUYỆT ĐỐI KHÔNG sync ngầm khi:
        // 1. Đang có sync khác chạy
        // 2. Đang có thao tác lưu lên server (this.isSaving)
        // 3. Đang có timer chờ lưu debounce (this._persistTimer) -> để tránh ghi đè dữ liệu người dùng vừa tạo
        if (!this.isServerMode || this.syncInProgress || this.isSaving || this._persistTimer) return;
        try {
            // Bước 1: Kiểm tra trạng thái siêu nhẹ qua endpoint /api/database/status (chỉ ~70 bytes thay vì 17MB)
            let serverNeedsSync = false;
            try {
                const statusRes = await fetch('/api/database/status', { cache: 'no-store' });
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    this.updateServerStatusBadge(true);
                    if (this._loadedFromServer) {
                        // Nếu version của server trùng khớp với phiên bản máy đang giữ -> Không có gì mới, DỪNG NGAY!
                        if (statusData && statusData.version && this.lastDatabaseVersion && statusData.version === this.lastDatabaseVersion) {
                            return; // Tiết kiệm 99.9% lưu lượng và giải phóng CPU!
                        }
                        // Hoặc nếu mốc thời gian hoàn toàn trùng khớp -> DỪNG NGAY!
                        if (statusData && statusData.lastUpdated && this.lastDatabaseTimestamp && statusData.lastUpdated === this.lastDatabaseTimestamp) {
                            return;
                        }
                    }
                    // Chưa từng nạp được dữ liệu (server vừa bật lại, version reset về 1) -> buộc tải lại
                    serverNeedsSync = true;
                }
            } catch(eStatus) {
                return;
            }

            if (!serverNeedsSync) return;
            // Kiểm tra lại lần nữa: nếu người dùng vừa bấm thao tác gì đó trong khi fetch status
            if (this.isSaving || this._persistTimer) return;

            // Bước 2: Chỉ khi phát hiện mốc phiên bản/thời gian thay đổi, mới tải lại database
            const versionBeforeFetch = this.lastDatabaseVersion;
            const res = await fetch('/api/database', { cache: 'no-store' });
            if (res.ok) {
                if (this.isSaving || this._persistTimer) return;
                const serverData = await res.json();
                if (serverData && serverData.medicines) {
                    // Áp dụng dữ liệu mới khi VERSION khác với bản đang giữ
                    // (trước đây chỉ áp dụng khi độ dài mảng đổi -> sửa giá/tồn/huỷ đơn không lan sang máy khác)
                    const changed = serverData.version
                        ? serverData.version !== versionBeforeFetch
                        : true;

                    this._loadedFromServer = true;
                    this._serverCounts = this._countSnapshot(serverData);

                    if (changed) {
                        console.log('⚡ Phát hiện dữ liệu mới từ máy khác (version ' + versionBeforeFetch + ' → ' + serverData.version + '), đang cập nhật...');
                        this.saveToLocalCache(serverData);
                        this.emit('all:changed');
                    }

                    if (serverData.version) this.lastDatabaseVersion = serverData.version;
                    if (serverData.lastUpdated) this.lastDatabaseTimestamp = serverData.lastUpdated;
                }
                this.updateServerStatusBadge(true);
            }
        } catch (e) {
            this.updateServerStatusBadge(false);
        }
    }

    async uploadDatabaseToServer(fullDb) {
        if (!this.isServerMode) return false;
        // Tuần tự hóa các yêu cầu upload bằng chuỗi Promise FIFO (Batch 8: Issue 5 & Batch 9: Issue 5 & Batch 10: Issue 5)
        const prevChain = this._uploadChain || Promise.resolve();
        let release;
        const currentTask = new Promise(resolve => { release = resolve; });
        this._uploadChain = currentTask;
        this._activeUploadPromise = currentTask;

        try {
            // Chờ tất cả các upload trước đó kết thúc an toàn, kể cả khi lần trước bị lỗi/throw
            try { await prevChain; } catch (e) {}

            // KHI ĐÃ ĐẾN LƯỢT: Luôn tạo snapshot dữ liệu mới nhất tại thời điểm vào lượt (Batch 10: Issue 5)
            // Tuyệt đối không dùng snapshot cũ từ trước khi chờ để tránh lỗi 409 phiên bản cũ
            const safeDb = this.getCurrentFullDatabase();

            return await this._doUploadDatabaseToServer(safeDb);
        } finally {
            release();
            if (this._uploadChain === currentTask) {
                this._uploadChain = null;
            }
            if (this._activeUploadPromise === currentTask) {
                this._activeUploadPromise = null;
            }
        }
    }

    async _doUploadDatabaseToServer(fullDb) {
        if (!this.isServerMode) return false;
        // BẢO VỆ TUYỆT ĐỐI: Không bao giờ cho phép gửi danh mục rỗng đè lên máy chủ
        if (!fullDb || !Array.isArray(fullDb.medicines) || fullDb.medicines.length === 0) {
            console.warn('⚠️ Chặn thao tác lưu: Danh mục thuốc rỗng, từ chối ghi đè lên máy chủ để bảo vệ dữ liệu!');
            return false;
        }
        // BẢO VỆ 2: Chưa từng nạp được dữ liệu máy chủ -> tuyệt đối không ghi
        if (!this._loadedFromServer) {
            console.warn('⚠️ Chặn thao tác lưu: chưa nạp được dữ liệu từ máy chủ, không ghi đè để tránh mất dữ liệu.');
            this.updateServerStatusBadge(false);
            return false;
        }
        // BẢO VỆ 3: Số bản ghi giảm bất thường (localStorage bị cắt, cache rút gọn...) -> chặn
        const shrink = this._findAbnormalShrink(fullDb);
        if (shrink) {
            console.error(`⛔ Chặn ghi đè: ${shrink.field} giảm bất thường ${shrink.known} → ${shrink.incoming}`);
            if (!this._shrinkWarned) {
                this._shrinkWarned = true;
                if (window.App && typeof App.showToast === 'function') {
                    App.showToast(`Đã chặn ghi đè dữ liệu (${shrink.field}: ${shrink.known} → ${shrink.incoming}). Đang tải lại từ máy chủ...`, 'error');
                }
            }
            this.syncWithServer();
            return false;
        }
        this.isSaving = true;
        try {
            // CHỤP SNAPSHOT BẤT BIẾN VÀ LẤY CHÍNH XÁC CÁC TXID TRƯỚC KHI GỬI (Issue 2)
            const sentOrderTxIds = new Set();
            const sentOrderIds = new Set();
            (fullDb.orders || []).forEach(o => {
                if (o.clientTxId) sentOrderTxIds.add(o.clientTxId);
                if (o.id) sentOrderIds.add(o.id);
            });

            const sentStockInTxIds = new Set();
            const sentStockInIds = new Set();
            (fullDb.stockInOrders || []).forEach(s => {
                if (s.clientTxId) sentStockInTxIds.add(s.clientTxId);
                if (s.id) sentStockInIds.add(s.id);
            });

            const requestBody = JSON.stringify(fullDb);
            const baseVer = this.lastDatabaseVersion || 1;
            const res = await fetch('/api/database', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Base-Version': String(baseVer)
                },
                body: requestBody
            });
            if (res.ok) {
                try {
                    const resData = await res.json();
                    if (resData && resData.version) {
                        this.lastDatabaseVersion = resData.version;
                    }
                    if (resData && resData.lastUpdated) {
                        this.lastDatabaseTimestamp = resData.lastUpdated;
                    } else if (fullDb && fullDb.lastUpdated) {
                        this.lastDatabaseTimestamp = fullDb.lastUpdated;
                    }
                    // Cập nhật lại mốc đếm sau khi ghi thành công
                    this._serverCounts = this._countSnapshot(fullDb);
                    this._shrinkWarned = false;

                    // CHỈ XÁC NHẬN CÁC GIAO DỊCH THỰC SỰ NẰM TRONG SNAPSHOT BẤT BIẾN ĐÃ GỬI (Issue 2 & Batch 9: Issue 4)
                    if (this._pendingLocalOrderIds) {
                        for (const sentId of sentOrderIds) {
                            const pendingMatch = (this._cachedOrders || []).find(o => o.id === sentId);
                            if (!pendingMatch || !pendingMatch.clientTxId || sentOrderTxIds.has(pendingMatch.clientTxId)) {
                                this._pendingLocalOrderIds.delete(sentId);
                            }
                        }
                    }
                    if (this._cachedOrders && Array.isArray(this._cachedOrders)) {
                        this._cachedOrders.forEach(o => {
                            const isConfirmed = o.clientTxId ? sentOrderTxIds.has(o.clientTxId) : sentOrderIds.has(o.id);
                            if (isConfirmed && o._isLocalPending) delete o._isLocalPending;
                        });
                    }

                    // Xử lý xác nhận cho phiếu nhập kho (Issue 2 & 4 & Batch 9: Issue 4)
                    if (this._pendingLocalStockInIds) {
                        for (const sentSiId of sentStockInIds) {
                            const pendingMatch = (this._cachedStockIns || []).find(s => s.id === sentSiId);
                            if (!pendingMatch || !pendingMatch.clientTxId || sentStockInTxIds.has(pendingMatch.clientTxId)) {
                                this._pendingLocalStockInIds.delete(sentSiId);
                            }
                        }
                    }
                    if (this._cachedStockIns && Array.isArray(this._cachedStockIns)) {
                        this._cachedStockIns.forEach(s => {
                            const isConfirmed = s.clientTxId ? sentStockInTxIds.has(s.clientTxId) : sentStockInIds.has(s.id);
                            if (isConfirmed && s._isLocalPending) delete s._isLocalPending;
                        });
                    }

                    // TỐI ƯU HIỆU NĂNG: Chỉ cập nhật hàng đợi 1 lần duy nhất thay vì lặp 16.354 lần (Issue 9)
                    this._bulkRemoveFromPendingQueue(sentOrderTxIds, sentStockInTxIds, sentOrderIds, sentStockInIds);
                } catch(eJson) {
                    if (fullDb && fullDb.lastUpdated) {
                        this.lastDatabaseTimestamp = fullDb.lastUpdated;
                    }
                }
                return true;
            } else if (res.status === 409) {
                // Xung đột phiên bản (version_conflict) hoặc giảm số bản ghi (data_shrink_blocked)
                let msg = 'Máy chủ từ chối ghi đè dữ liệu. Đang tải lại...';
                try {
                    const errData = await res.json();
                    if (errData && errData.message) msg = errData.message;
                    console.warn('Server guard 409:', errData);
                } catch (e) { }
                if (window.App && typeof App.showToast === 'function') {
                    App.showToast(msg, 'error');
                } else {
                    alert(msg);
                }
                await this.syncWithServer();
                return false;
            } else {
                // Xử lý các mã lỗi HTTP khác (500, 400,...)
                let errMsg = `Máy chủ phản hồi lỗi (${res.status}). Dữ liệu chưa được lưu!`;
                try {
                    const errObj = await res.json();
                    if (errObj && (errObj.error || errObj.message)) {
                        errMsg = `Lỗi máy chủ (${res.status}): ${errObj.error || errObj.message}`;
                    }
                } catch (_) {}
                console.error('Server save error:', res.status, errMsg);
                if (window.App && typeof App.showToast === 'function') {
                    App.showToast(errMsg, 'error');
                }
                return false;
            }
        } catch (e) {
            console.error('Lỗi khi lưu dữ liệu lên máy chủ:', e);
            if (window.App && typeof App.showToast === 'function') {
                App.showToast('Không thể kết nối đến máy chủ để lưu dữ liệu! Vui lòng kiểm tra lại.', 'error');
            }
            return false;
        } finally {
            this.isSaving = false;
        }
    }

    saveToLocalCache(db) {
        // Helper lưu an toàn có giới hạn kích thước chống tràn hạn mức 5MB của LocalStorage
        const safeSet = (key, data, maxSlice = 0) => {
            try {
                if (data === undefined || data === null) return;
                let payload = data;
                if (maxSlice > 0 && Array.isArray(data) && data.length > maxSlice) {
                    payload = data.slice(0, maxSlice);
                }
                localStorage.setItem(key, JSON.stringify(payload));
            } catch (e) {
                // Vượt hạn mức LocalStorage thì bỏ qua mượt mà, dữ liệu toàn vẹn luôn lưu trên RAM & Server
            }
        };

        try {
            if (db.settings) {
                safeSet(STORAGE_KEYS.SETTINGS, db.settings);
            }

            // 1. Xác định các giao dịch cục bộ chưa đồng bộ lên server (giữ nguyên đơn chờ và đơn mới)
            this._stockInHistoryCache = null;
            this._salesHistoryCache = null;
            const pendingQueue = this._getPendingQueue();
            let pendingOrders = [];
            const renamedOrderMap = new Map();
            const renamedStockInMap = new Map();
            if (db.orders) {
                const localOrders = (this._cachedOrders && Array.isArray(this._cachedOrders)) ? this._cachedOrders : this.getOrders();
                const queueOrders = pendingQueue.filter(q => q.type === 'order' && q.data).map(q => q.data);

                // localOrders (có trạng thái mới nhất bao gồm isCancelled) phải được ưu tiên hàng đầu! (Issue 1)
                const candidateOrdersMap = new Map();
                localOrders.forEach(o => { if (o && o.id) candidateOrdersMap.set(o.id, o); });
                queueOrders.forEach(o => {
                    if (o && o.id && !candidateOrdersMap.has(o.id) && !o.isCancelled) {
                        candidateOrdersMap.set(o.id, o);
                    }
                });
                const candidateOrders = Array.from(candidateOrdersMap.values());

                const serverOrdersById = new Map();
                const serverTxIds = new Set();
                db.orders.forEach(o => {
                    if (o.id) serverOrdersById.set(o.id, o);
                    if (o.clientTxId) serverTxIds.add(o.clientTxId);
                });

                // Kiểm tra xem đơn chờ cục bộ đã được server xử lý / ghi nhận thành công chưa (trường hợp mất phản hồi mạng)
                const isAlreadyCommittedOnServer = (po) => {
                    // 1. Nếu đơn có clientTxId: CHỈ đối chiếu chính xác bằng clientTxId! Tuyệt đối không tự gộp khi clientTxId khác nhau
                    if (po.clientTxId) {
                        return serverTxIds.has(po.clientTxId);
                    }
                    // 2. Chỉ khi đơn cũ từ quá khứ thiếu clientTxId: mới kiểm tra trùng ID và nội dung
                    const matchingServerOrder = serverOrdersById.get(po.id);
                    if (matchingServerOrder && !matchingServerOrder.clientTxId) {
                        if (matchingServerOrder.createdAt === po.createdAt) return true;
                        if (Math.abs((matchingServerOrder.totalAmount || 0) - (po.totalAmount || 0)) < 0.01 &&
                            (matchingServerOrder.items || []).length === (po.items || []).length) {
                            return true;
                        }
                    }
                    return false;
                };

                pendingOrders = candidateOrders.filter(o => {
                    if (o.isCancelled) {
                        // Đồng bộ trạng thái hủy với hàng đợi: loại bỏ hoàn toàn khỏi hàng đợi (Issue 1)
                        if (this._pendingLocalOrderIds) this._pendingLocalOrderIds.delete(o.id);
                        this._removeFromPendingQueue(o.id, o.clientTxId);
                        return false;
                    }

                    // Nếu server đã lưu đơn này thành công:
                    if (isAlreadyCommittedOnServer(o)) {
                        if (this._pendingLocalOrderIds) this._pendingLocalOrderIds.delete(o.id);
                        this._removeFromPendingQueue(o.id, o.clientTxId);
                        delete o._isLocalPending;
                        return false;
                    }

                    // Nếu là đơn chờ cục bộ hoặc trong hàng đợi: LUÔN GIỮ LẠI (Issue 3 - không tự động loại bỏ nếu chưa có trên server)
                    const isPending = (this._pendingLocalOrderIds && this._pendingLocalOrderIds.has(o.id)) ||
                                      pendingQueue.some(q => q.type === 'order' && (q.id === o.id || (o.clientTxId && q.clientTxId === o.clientTxId))) ||
                                      o._isLocalPending;
                    if (isPending) return true;
                    if (serverOrdersById.has(o.id)) return false;
                    const ageMs = Date.now() - new Date(o.createdAt || o.date || 0).getTime();
                    return ageMs < 1800000;
                });

                if (pendingOrders.length > 0) {
                    // Tránh đè mã đơn: nếu trùng ID với server của máy khác, cấp thêm hậu tố để bảo toàn giao dịch chờ
                    pendingOrders.forEach(po => {
                        const isPending = (this._pendingLocalOrderIds && this._pendingLocalOrderIds.has(po.id)) ||
                                          pendingQueue.some(q => q.type === 'order' && (q.id === po.id || (po.clientTxId && q.clientTxId === po.clientTxId))) ||
                                          po._isLocalPending;
                        if (serverOrdersById.has(po.id) && isPending) {
                            const oldId = po.id;
                            const newId = `${oldId}_P${Math.floor(Math.random() * 900 + 100)}`;
                            po.id = newId;
                            renamedOrderMap.set(oldId, newId);
                            if (this._pendingLocalOrderIds) {
                                this._pendingLocalOrderIds.delete(oldId);
                                this._pendingLocalOrderIds.add(newId);
                            }
                            // Bảo toàn và cập nhật voucher liên kết khi đổi mã (Batch 9: Issue 3)
                            const oldQItem = pendingQueue.find(q => (po.clientTxId && q.clientTxId === po.clientTxId) || q.id === oldId);
                            let associatedVoucher = oldQItem ? oldQItem.voucher : null;
                            if (associatedVoucher) {
                                associatedVoucher.refId = newId;
                                if (associatedVoucher.note && associatedVoucher.note.includes(oldId)) {
                                    associatedVoucher.note = associatedVoucher.note.replace(oldId, newId);
                                }
                            }
                            this._removeFromPendingQueue(oldId, po.clientTxId);
                            this._addToPendingQueue({ type: 'order', id: newId, clientTxId: po.clientTxId, data: po, voucher: associatedVoucher, createdAt: Date.now() });
                        }
                    });
                    db.orders = [...pendingOrders, ...db.orders];
                }

                // Tái hợp nhất các lần trả hàng lẻ (order_return) còn đang chờ lưu (Batch P1: Issue 5)
                const pendingOrderReturns = pendingQueue.filter(q => q.type === 'order_return' && q.data);
                if (pendingOrderReturns.length > 0) {
                    const currentOrdersMap = new Map();
                    db.orders.forEach(o => { if (o && o.id) currentOrdersMap.set(o.id, o); });

                    pendingOrderReturns.forEach(pr => {
                        const targetOrder = currentOrdersMap.get(pr.orderId);
                        if (targetOrder) {
                            if (!targetOrder.returns) targetOrder.returns = [];
                            const isCommitted = targetOrder.returns.some(r =>
                                r.id === pr.id || (pr.clientTxId && r.clientTxId === pr.clientTxId)
                            );
                            if (isCommitted) {
                                if (this._pendingLocalReturnIds) this._pendingLocalReturnIds.delete(pr.id);
                                this._removeFromPendingQueue(pr.id, pr.clientTxId);
                            } else {
                                targetOrder.returns.push(pr.data);
                                targetOrder.totalRefunded = (targetOrder.totalRefunded || 0) + (pr.data.refundTotal || 0);
                                const allReturned = (targetOrder.items || []).every(it => {
                                    const retQty = targetOrder.returns.reduce((sum, r) => {
                                        const matched = (r.items || []).filter(ri => ri.medicineId === it.medicineId && ri.unit === it.unit);
                                        return sum + matched.reduce((mSum, mi) => mSum + (Number(mi.quantity) || 0), 0);
                                    }, 0);
                                    return retQty >= (Number(it.quantity) || 0);
                                });
                                targetOrder.returnStatus = allReturned ? 'fully_returned' : 'partially_returned';
                            }
                        }
                    });
                }
                this._cachedOrders = db.orders;
                safeSet(STORAGE_KEYS.ORDERS, db.orders, 100);
            }

            let pendingStockIns = [];
            if (db.stockInOrders) {
                const localStockIns = (this._cachedStockIns && Array.isArray(this._cachedStockIns)) ? this._cachedStockIns : this.getStockInOrders();
                const queueStockIns = pendingQueue.filter(q => q.type === 'stockin' && q.data).map(q => q.data);

                // localStockIns phải được ưu tiên trước; gộp theo clientTxId để không bị mất phiếu mới khi trùng mã (Batch 8: Issue 1)
                const candidateStockInsMap = new Map();
                const getStockInKey = (s) => (s && s.clientTxId) ? `tx_${s.clientTxId}` : `id_${s ? s.id : ''}`;
                localStockIns.forEach(s => {
                    if (s && (s.clientTxId || s.id)) candidateStockInsMap.set(getStockInKey(s), s);
                });
                queueStockIns.forEach(s => {
                    if (s && (s.clientTxId || s.id)) {
                        const k = getStockInKey(s);
                        if (!candidateStockInsMap.has(k)) {
                            candidateStockInsMap.set(k, s);
                        }
                    }
                });
                const candidateStockIns = Array.from(candidateStockInsMap.values());

                const serverStockInsById = new Map();
                const serverStockInTxIds = new Set();
                db.stockInOrders.forEach(s => {
                    if (s.id) serverStockInsById.set(s.id, s);
                    if (s.clientTxId) serverStockInTxIds.add(s.clientTxId);
                });

                const isStockInAlreadyCommitted = (psi) => {
                    if (psi.clientTxId) return serverStockInTxIds.has(psi.clientTxId);
                    const match = serverStockInsById.get(psi.id);
                    if (match && !match.clientTxId) {
                        if (match.createdAt === psi.createdAt) return true;
                        if (Math.abs((match.totalAmount || 0) - (psi.totalAmount || 0)) < 0.01 &&
                            (match.items || []).length === (psi.items || []).length) {
                            return true;
                        }
                    }
                    return false;
                };

                pendingStockIns = candidateStockIns.filter(s => {
                    if (s.isCancelled) {
                        // Đồng bộ trạng thái hủy với hàng đợi: loại bỏ hoàn toàn khỏi hàng đợi (Batch 11: Issue 1)
                        if (this._pendingLocalStockInIds) this._pendingLocalStockInIds.delete(s.id);
                        this._removeFromPendingQueue(s.id, s.clientTxId);
                        delete s._isLocalPending;
                        return false;
                    }
                    if (isStockInAlreadyCommitted(s)) {
                        if (this._pendingLocalStockInIds) this._pendingLocalStockInIds.delete(s.id);
                        this._removeFromPendingQueue(s.id, s.clientTxId);
                        delete s._isLocalPending;
                        return false;
                    }
                    const isPending = (this._pendingLocalStockInIds && this._pendingLocalStockInIds.has(s.id)) ||
                                      pendingQueue.some(q => q.type === 'stockin' && (q.id === s.id || (s.clientTxId && q.clientTxId === s.clientTxId))) ||
                                      s._isLocalPending;
                    if (isPending) return true;
                    if (serverStockInsById.has(s.id)) return false;
                    return true;
                });

                if (pendingStockIns.length > 0) {
                    pendingStockIns.forEach(psi => {
                        const isPending = (this._pendingLocalStockInIds && this._pendingLocalStockInIds.has(psi.id)) ||
                                          pendingQueue.some(q => q.type === 'stockin' && (q.id === psi.id || (psi.clientTxId && q.clientTxId === psi.clientTxId))) ||
                                          psi._isLocalPending;
                        if (serverStockInsById.has(psi.id) && isPending) {
                            const oldId = psi.id;
                            const newId = `${oldId}_P${Math.floor(Math.random() * 900 + 100)}`;
                            psi.id = newId;
                            renamedStockInMap.set(oldId, newId); // Ghi nhận mã mới để cập nhật phiếu chi liên kết (Issue 4)
                            if (this._pendingLocalStockInIds) {
                                this._pendingLocalStockInIds.delete(oldId);
                                this._pendingLocalStockInIds.add(newId);
                            }
                            // Bảo toàn và cập nhật voucher liên kết khi đổi mã (Batch 9: Issue 3)
                            const oldQItem = pendingQueue.find(q => (psi.clientTxId && q.clientTxId === psi.clientTxId) || q.id === oldId);
                            let associatedVoucher = oldQItem ? oldQItem.voucher : null;
                            if (associatedVoucher) {
                                associatedVoucher.refId = newId;
                                if (associatedVoucher.note && associatedVoucher.note.includes(oldId)) {
                                    associatedVoucher.note = associatedVoucher.note.replace(oldId, newId);
                                }
                            }
                            this._removeFromPendingQueue(oldId, psi.clientTxId);
                            this._addToPendingQueue({ type: 'stockin', id: newId, clientTxId: psi.clientTxId, data: psi, voucher: associatedVoucher, createdAt: Date.now() });
                        }
                    });
                    db.stockInOrders = [...pendingStockIns, ...db.stockInOrders];
                }
                this._cachedStockIns = db.stockInOrders;
                safeSet(STORAGE_KEYS.STOCK_IN, db.stockInOrders, 100);
            }

            // 2. Cập nhật medicines và tái áp dụng (reconcile) các giao dịch chưa đồng bộ để không mất thay đổi tồn kho
            if (db.medicines) {
                const medMap = {};
                db.medicines.forEach(m => { medMap[m.id] = m; });

                // Tái áp dụng thay đổi tồn kho cho các đơn hàng cục bộ chưa đồng bộ (phân biệt đơn bán và đơn trả tổng hợp)
                pendingOrders.forEach(o => {
                    const isReturnOrder = (o.isReturn === true || o.orderType === 'return' || (o.id && o.id.startsWith('TH')));
                    const shouldRestock = o.shouldRestock !== false;

                    (o.items || []).forEach(it => {
                        const m = medMap[it.medicineId];
                        if (m) {
                            let units = parseFloat(it.quantity) || 0;
                            if (it.unit === m.packUnit && m.packRatio > 1) units *= m.packRatio;
                            else if (it.unit === m.subUnit && m.subRatio > 1) units *= m.subRatio;

                            if (isReturnOrder) {
                                // Đơn trả hàng tổng hợp: CỘNG VÀO KHO (nếu shouldRestock)
                                if (shouldRestock) {
                                    m.stockUnits = Math.round(((m.stockUnits || 0) + units) * 1000) / 1000;
                                }
                            } else {
                                // Đơn bán hàng bình thường: TRỪ KHỎI KHO
                                m.stockUnits = Math.round(((m.stockUnits || 0) - units) * 1000) / 1000;
                            }
                        }
                    });
                });

                // Tái áp dụng thay đổi tồn kho cho các lần trả hàng lẻ (order_return) chưa đồng bộ (Batch P1: Issue 5)
                const pendingReturnsForStock = pendingQueue.filter(q => q.type === 'order_return' && q.data);
                pendingReturnsForStock.forEach(pr => {
                    const r = pr.data;
                    (r.items || []).forEach(it => {
                        const m = medMap[it.medicineId];
                        if (m) {
                            let units = parseFloat(it.quantity) || 0;
                            if (it.unit === m.packUnit && m.packRatio > 1) units *= m.packRatio;
                            else if (it.unit === m.subUnit && m.subRatio > 1) units *= m.subRatio;
                            m.stockUnits = Math.round(((m.stockUnits || 0) + units) * 1000) / 1000;
                        }
                    });
                });

                // Tái áp dụng đầy đủ nghiệp vụ nhập kho: cộng tồn, cập nhật lô/hạn dùng và tính lại giá vốn bình quân di động (Issue 4)
                pendingStockIns.forEach(s => {
                    (s.items || []).forEach(it => {
                        const m = medMap[it.medicineId];
                        if (m) {
                            let units = parseFloat(it.quantity) || 0;
                            const packRatio = (m.packRatio && m.packRatio > 0) ? m.packRatio : 1;
                            const subRatio = (m.subRatio && m.subRatio > 0) ? m.subRatio : 1;
                            const u = (it.unit || '').trim().toLowerCase();
                            const packU = (m.packUnit || '').trim().toLowerCase();
                            const subU = (m.subUnit || '').trim().toLowerCase();
                            const baseU = (m.baseUnit || '').trim().toLowerCase();

                            if (u && packU && u === packU && packRatio > 1) {
                                units = (Number(it.quantity) || 0) * packRatio;
                            } else if (u && subU && u === subU && subRatio > 1) {
                                units = (Number(it.quantity) || 0) * subRatio;
                            }

                            if (it.batchNo) m.batchNo = it.batchNo;
                            if (it.expiryDate) m.expiryDate = it.expiryDate;

                            if (it.costPrice && it.costPrice > 0) {
                                let inCostPack = it.costPrice;
                                if (u !== packU && packRatio > 1) {
                                    if (u === baseU) inCostPack = it.costPrice * packRatio;
                                    else if (u === subU && subRatio > 0) inCostPack = it.costPrice * (packRatio / subRatio);
                                }
                                const prevStockUnits = Math.max(0, m.stockUnits || 0);
                                const prevCostPack = m.costPrice || 0;
                                if (prevStockUnits <= 0 || prevCostPack <= 0) {
                                    m.costPrice = Math.round(inCostPack * 100) / 100;
                                } else {
                                    const prevPackStock = prevStockUnits / packRatio;
                                    const inPackQty = units / packRatio;
                                    const avgCost = ((prevPackStock * prevCostPack) + (inPackQty * inCostPack)) / (prevPackStock + inPackQty);
                                    m.costPrice = Math.round(avgCost * 100) / 100;
                                }
                            }

                            m.stockUnits = Math.round(((m.stockUnits || 0) + units) * 1000) / 1000;
                        }
                    });
                });

                this._cachedMedicines = db.medicines;
                this._rebuildMedicineMap();
                safeSet(STORAGE_KEYS.MEDICINES, db.medicines, 2000);
            }

            if (db.suppliers) {
                this._cachedSuppliers = db.suppliers;
                safeSet(STORAGE_KEYS.SUPPLIERS, db.suppliers);
            }
            if (db.customers) {
                // Issue 7: Đồng bộ toàn vẹn - Khôi phục điểm tích lũy và chi tiêu khách hàng cho các đơn chờ cục bộ
                if (pendingOrders && pendingOrders.length > 0) {
                    const custMap = {};
                    db.customers.forEach(c => {
                        if (c.id) custMap[c.id] = c;
                        if (c.phone) custMap[c.phone] = c;
                    });

                    pendingOrders.forEach(po => {
                        const targetCust = (po.customerId && custMap[po.customerId]) || (po.customerPhone && custMap[po.customerPhone]);
                        if (targetCust) {
                            if (po.pointsUsed > 0) {
                                targetCust.points = Math.max(0, (targetCust.points || 0) - po.pointsUsed);
                            }
                            if (po.pointsEarned > 0) {
                                targetCust.points = (targetCust.points || 0) + po.pointsEarned;
                            }
                            targetCust.totalSpent = (targetCust.totalSpent || 0) + (po.totalAmount || 0);
                            targetCust.ordersCount = (targetCust.ordersCount || 0) + 1;
                        }
                    });
                }
                this._cachedCustomers = db.customers;
                safeSet(STORAGE_KEYS.CUSTOMERS, db.customers);
            }
            if (db.settingsHistory) {
                safeSet(STORAGE_KEYS.SETTINGS_HISTORY, db.settingsHistory);
            }
            if (db.vouchers) {
                // Bảo vệ và khôi phục toàn bộ phiếu chi/thu liên quan đến đơn chờ hoặc nhập kho (Issue 3 & 4)
                const localVouchers = (this._cachedVouchers && Array.isArray(this._cachedVouchers)) ? this._cachedVouchers : this.getVouchers();
                const queueVouchers = pendingQueue.map(q => q.voucher).filter(Boolean);

                const candidateVouchersMap = new Map();
                localVouchers.forEach(v => { if (v && v.id) candidateVouchersMap.set(v.id, v); });
                queueVouchers.forEach(v => { if (v && v.id && !candidateVouchersMap.has(v.id)) candidateVouchersMap.set(v.id, v); });
                const candidateVouchers = Array.from(candidateVouchersMap.values());

                // Cập nhật refId cho các phiếu thu của đơn hàng chờ vừa được đổi mã
                if (renamedOrderMap.size > 0) {
                    candidateVouchers.forEach(v => {
                        if (v.refId && renamedOrderMap.has(v.refId)) {
                            const newOrderId = renamedOrderMap.get(v.refId);
                            v.refId = newOrderId;
                            if (v.id && v.id.startsWith('TTHD')) {
                                v.id = 'TTHD' + newOrderId.replace(/^HD/, '');
                            }
                        }
                    });
                }

                // Cập nhật refId cho các phiếu chi của phiếu nhập chờ vừa được đổi mã (Issue 4)
                if (renamedStockInMap.size > 0) {
                    candidateVouchers.forEach(v => {
                        if (v.refId && renamedStockInMap.has(v.refId)) {
                            const newSiId = renamedStockInMap.get(v.refId);
                            v.refId = newSiId;
                            if (v.note) v.note = v.note.replace(new RegExp(v.refId, 'g'), newSiId);
                        }
                    });
                }

                const serverVouchersById = new Map();
                db.vouchers.forEach(v => { if (v.id) serverVouchersById.set(v.id, v); });
                const pendingOrderIds = new Set(pendingOrders.map(o => o.id));
                const pendingStockInIds = new Set(pendingStockIns.map(s => s.id));

                const pendingVouchers = [];
                for (const v of candidateVouchers) {
                    const isAttachedToPendingTx = v.refId && (pendingOrderIds.has(v.refId) || pendingStockInIds.has(v.refId));
                    const ageMs = Date.now() - new Date(v.createdAt || v.date || 0).getTime();
                    const isRecent = ageMs < 1800000;

                    // Bỏ qua phiếu chi hoàn tiền mồ côi
                    if (v.type === 'payment' && (v.category === 'Chi trả lại hàng bán lẻ' || v.category === 'Tiền trả khách' || (v.refId && v.refId.startsWith('TH')))) {
                        const retId = v.returnId || (v.refId && v.refId.startsWith('TH') ? v.refId : null);
                        if (retId) {
                            const returnExistsInAnyOrder = db.orders.some(o => (o.id === retId && !o.isCancelled) || (o.returns || []).some(r => r.id === retId)) ||
                                                           pendingOrders.some(o => (o.id === retId && !o.isCancelled) || (o.returns || []).some(r => r.id === retId));
                            if (!returnExistsInAnyOrder) {
                                continue;
                            }
                        }
                    }

                    if (!isAttachedToPendingTx && !isRecent) {
                        continue;
                    }

                    // Xử lý trùng mã phiếu với server
                    if (serverVouchersById.has(v.id)) {
                        const sv = serverVouchersById.get(v.id);
                        if (sv.refId === v.refId && Math.abs((sv.amount || 0) - (v.amount || 0)) < 0.01) {
                            continue;
                        }
                        v.id = `${v.id}_P${Math.floor(Math.random() * 900 + 100)}`;
                    }

                    pendingVouchers.push(v);
                }

                if (pendingVouchers.length > 0) {
                    db.vouchers = [...pendingVouchers, ...db.vouchers];
                }
                this._cachedVouchers = db.vouchers;
                safeSet(STORAGE_KEYS.VOUCHERS, db.vouchers, 100);
            }
            if (db.purchaseReturns) {
                this._cachedReturns = db.purchaseReturns;
                safeSet(STORAGE_KEYS.PURCHASE_RETURNS, db.purchaseReturns, 100);
            }
            if (db.auditLog && Array.isArray(db.auditLog)) {
                this._cachedAuditLog = db.auditLog;
                safeSet(STORAGE_KEYS.AUDIT_LOG, db.auditLog, 100);
            }
            if (db.version) {
                this.lastDatabaseVersion = db.version;
            }
            if (db.lastUpdated) {
                this.lastDatabaseTimestamp = db.lastUpdated;
            }
        } catch (e) {
            console.error('Lỗi trong saveToLocalCache:', e);
        }
    }

    getCurrentFullDatabase() {
        const rawOrders = this.getOrders() || [];
        const cleanOrders = rawOrders.map(o => {
            if (o && o._isLocalPending !== undefined) {
                const copy = { ...o };
                delete copy._isLocalPending;
                return copy;
            }
            return o;
        });

        return {
            baseVersion: this.lastDatabaseVersion || 1,
            version: this.lastDatabaseVersion || 1,
            settings: this.getSettings(),
            medicines: this.getMedicines(),
            suppliers: this.getSuppliers(),
            orders: cleanOrders,
            stockInOrders: this.getStockInOrders(),
            customers: this.getCustomers(),
            settingsHistory: this.getSettingsHistory(),
            auditLog: this.getAuditLog(),
            vouchers: this.getVouchers(),
            purchaseReturns: this.getPurchaseReturns(),
            lastUpdated: new Date().toISOString()
        };
    }

    // Tự động đẩy toàn bộ state lên Server khi có thay đổi (Debounce 500ms chống nghẽn CPU và I/O mạng)
    schedulePersistToServer(delayMs = 500) {
        if (!this.isServerMode) return;
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
        }
        this._persistTimer = setTimeout(() => {
            this._persistTimer = null;
            this._persistNow();
        }, delayMs);
    }

    async _persistNow() {
        await this._ensureReadyForWrite();
        // Tuần tự hóa thực sự: Chờ yêu cầu lưu đang chạy hoàn tất trước khi chụp dữ liệu (Batch 8: Issue 5)
        if (this._activeUploadPromise) {
            try { await this._activeUploadPromise; } catch(e) {}
        }
        const fullDb = this.getCurrentFullDatabase();
        if (!fullDb || !Array.isArray(fullDb.medicines) || fullDb.medicines.length === 0) {
            console.warn('⚠️ Chặn persist: Dữ liệu thuốc rỗng, không lưu lên server.');
            return;
        }
        return await this.uploadDatabaseToServer(fullDb);
    }

    // Lưu ngay lập tức (không chờ debounce), dùng khi thanh toán xong hóa đơn hoặc đóng tab
    async persistImmediately() {
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
            this._persistTimer = null;
        }
        if (this.isServerMode) {
            await this._ensureReadyForWrite();
            // Tuần tự hóa thực sự: Chờ yêu cầu lưu đang chạy hoàn tất trước khi chụp dữ liệu (Batch 8: Issue 5)
            if (this._activeUploadPromise) {
                try { await this._activeUploadPromise; } catch(e) {}
            }
            const fullDb = this.getCurrentFullDatabase();
            if (!fullDb || !Array.isArray(fullDb.medicines) || fullDb.medicines.length === 0) {
                return false;
            }
            return await this.uploadDatabaseToServer(fullDb);
        }
        return true;
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

    saveSettings(settings, persist = true) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        if (persist) {
            this.schedulePersistToServer();
        }
        this.emit('settings:changed', settings);
    }

    // --- Medicines (Danh mục thuốc & Tồn kho) ---
    _rebuildMedicineMap() {
        this._medicineMap = {};
        this._medicineNameMap = {};
        if (this._cachedMedicines && Array.isArray(this._cachedMedicines)) {
            for (let i = 0; i < this._cachedMedicines.length; i++) {
                const m = this._cachedMedicines[i];
                if (!m) continue;
                if (m.id) this._medicineMap[m.id] = m;
                if (m.name && typeof m.name === 'string') {
                    const normName = m.name.trim().toLowerCase();
                    if (normName && !this._medicineNameMap[normName]) {
                        this._medicineNameMap[normName] = m;
                    }
                }
                if (m.barcode) {
                    const parts = m.barcode.split(/[,;\s]+/);
                    for (let j = 0; j < parts.length; j++) {
                        const code = parts[j].trim();
                        if (code && !this._medicineMap[code]) {
                            this._medicineMap[code] = m;
                        }
                    }
                }
            }
        }
    }

    getMedicineByName(name) {
        if (!name || typeof name !== 'string') return null;
        if (!this._medicineNameMap) {
            this.getMedicines();
        }
        const norm = name.trim().toLowerCase();
        return (this._medicineNameMap && this._medicineNameMap[norm]) ? this._medicineNameMap[norm] : null;
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

    // Lấy danh sách Nhóm Hàng thực tế từ danh mục thuốc
    getCategories() {
        const medicines = this.getMedicines();
        const catSet = new Set();
        medicines.forEach(m => {
            if (m.category && typeof m.category === 'string') {
                const c = m.category.trim();
                if (c) catSet.add(c);
            }
        });
        if (catSet.size === 0 && typeof SampleData !== 'undefined' && SampleData.categories) {
            return [...SampleData.categories];
        }
        const cats = Array.from(catSet);
        cats.sort((a, b) => {
            const isNumA = /^\d+$/.test(a);
            const isNumB = /^\d+$/.test(b);
            if (isNumA && !isNumB) return -1;
            if (!isNumA && isNumB) return 1;
            if (isNumA && isNumB) return parseInt(a, 10) - parseInt(b, 10);
            return a.localeCompare(b, 'vi', { sensitivity: 'base' });
        });
        return cats;
    }

    getMedicineUnitCost(med, unit) {
        if (!med) return 0;
        const packRatio = (med.packRatio && med.packRatio > 0) ? med.packRatio : 1;
        const subRatio = (med.subRatio && med.subRatio > 0) ? med.subRatio : 1;
        const costPrice = (typeof med.costPrice === 'number') ? med.costPrice : (parseFloat(med.costPrice) || 0);
        const baseCost = costPrice / packRatio;

        const u = (unit || '').trim().toLowerCase();
        const pack = (med.packUnit || '').trim().toLowerCase();
        const sub = (med.subUnit || '').trim().toLowerCase();
        const base = (med.baseUnit || '').trim().toLowerCase();

        if (u && pack && u === pack) {
            return costPrice;
        }
        if (u && sub && u === sub && sub !== pack) {
            return Math.round(baseCost * subRatio);
        }
        if (u && base && u === base) {
            return Math.round(baseCost);
        }
        return Math.round(baseCost);
    }

    formatLocalISO(d = new Date()) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+07:00`;
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
            med.stockUnits = Math.round(((med.stockUnits || 0) + unitsDelta) * 1000) / 1000;
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
        if (this._cachedSuppliers) return this._cachedSuppliers;
        const raw = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
        if (!raw) return [];
        try {
            this._cachedSuppliers = JSON.parse(raw);
            return this._cachedSuppliers;
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
        this._cachedSuppliers = suppliers;
        try { localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers)); } catch(e){}
        this.schedulePersistToServer();
        this.emit('suppliers:changed', suppliers);
        return sup;
    }

    addSupplier(sup) {
        return this.saveSupplier(sup);
    }

    // --- Stock-In (Phiếu nhập thuốc) ---
    getStockInOrders() {
        if (this._cachedStockIns && Array.isArray(this._cachedStockIns)) {
            return this._cachedStockIns;
        }
        const raw = localStorage.getItem(STORAGE_KEYS.STOCK_IN);
        if (!raw) return [];
        try {
            this._cachedStockIns = JSON.parse(raw);
            return this._cachedStockIns;
        } catch(e) {
            return [];
        }
    }

    saveStockInOrders(orders) {
        this._cachedStockIns = orders;
        this._stockInHistoryCache = null;
        try {
            localStorage.setItem(STORAGE_KEYS.STOCK_IN, JSON.stringify(orders));
        } catch(e) {
            console.warn('Could not save stockInOrders to localStorage quota, using memory cache:', e);
        }
        this.schedulePersistToServer();
        this.emit('stockin:changed', orders);
    }

    addStockInOrder(stockIn) {
        const orders = this.getStockInOrders();
        const localNow = this.formatLocalISO();
        if (!stockIn.id) {
            const dateStr = localNow.slice(2, 10).replace(/-/g, '');
            const prefix = `PN${dateStr}-`;
            let maxSuffix = 0;
            orders.forEach(o => {
                if (o.id && o.id.startsWith(prefix)) {
                    const num = parseInt(o.id.slice(prefix.length), 10);
                    if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
                }
            });
            let nextNum = maxSuffix + 1;
            let candidateId = `${prefix}${String(nextNum).padStart(2, '0')}`;
            const existingIds = new Set(orders.map(o => o.id));
            while (existingIds.has(candidateId)) {
                nextNum++;
                candidateId = `${prefix}${String(nextNum).padStart(2, '0')}`;
            }
            stockIn.id = candidateId;
        }
        if (!stockIn.createdAt) {
            stockIn.createdAt = localNow;
        }
        if (!stockIn.clientTxId) {
            stockIn.clientTxId = 'tx_si_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        }
        stockIn.paymentMethod = stockIn.paymentMethod || 'cash';

        // Tự động thêm Phiếu Chi vào Sổ Quỹ Thu Chi
        let voucher = null;
        if (stockIn.totalAmount > 0) {
            voucher = this.addVoucher({
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

        // 1. Tự động tăng tồn kho thuốc tương ứng và lưu lại trạng thái trước giao dịch (Batch 10: Issue 2)
        if (stockIn.items && Array.isArray(stockIn.items)) {
            stockIn.items.forEach(item => {
                const med = this.getMedicineById(item.medicineId);
                if (med) {
                    const u = (item.unit || '').trim().toLowerCase();
                    const packU = (med.packUnit || '').trim().toLowerCase();
                    const subU = (med.subUnit || '').trim().toLowerCase();
                    const baseU = (med.baseUnit || '').trim().toLowerCase();
                    const packRatio = (med.packRatio && Number(med.packRatio) > 0) ? Number(med.packRatio) : 1;
                    const subRatio = (med.subRatio && Number(med.subRatio) > 0) ? Number(med.subRatio) : 1;

                    let addedUnits = Number(item.quantity) || 0;
                    if (u && packU && u === packU && packRatio > 1) {
                        addedUnits = (Number(item.quantity) || 0) * packRatio;
                    } else if (u && subU && u === subU && subRatio > 1) {
                        addedUnits = (Number(item.quantity) || 0) * subRatio;
                    }

                    // Lưu lại trạng thái trước khi thay đổi TRƯỚC KHI lưu vào hàng đợi và cache (Batch 10: Issue 2 & Batch 12)
                    item.addedUnits = addedUnits;
                    item.prevBatchNo = med.batchNo || '';
                    item.prevExpiryDate = med.expiryDate || '';
                    item.prevCostPrice = med.costPrice || 0;
                    item.prevStockUnits = med.stockUnits || 0;

                    if (!stockIn.snapshots) stockIn.snapshots = {};
                    stockIn.snapshots[item.medicineId] = {
                        prevStockUnits: med.stockUnits || 0,
                        addedUnits: addedUnits,
                        prevCostPrice: med.costPrice || 0,
                        prevBatchNo: med.batchNo || '',
                        prevExpiryDate: med.expiryDate || '',
                        postStockUnits: Math.round(((med.stockUnits || 0) + addedUnits) * 1000) / 1000
                    };

                    if (item.batchNo) med.batchNo = item.batchNo;
                    if (item.expiryDate) med.expiryDate = item.expiryDate;
                    if (item.costPrice && item.costPrice > 0) {
                        // Quy đổi giá nhập hiện tại về đơn vị hộp (packUnit)
                        let inCostPack = item.costPrice;
                        if (u !== packU && packRatio > 1) {
                            if (u === baseU) inCostPack = item.costPrice * packRatio;
                            else if (u === subU && subRatio > 0) inCostPack = item.costPrice * (packRatio / subRatio);
                        }

                        // Bình quân gia quyền di động: (giá nhập hiện tại * số lượng nhập + giá nhập TB trước đó * số lượng tồn) / (số lượng nhập + số lượng tồn)
                        const prevStockUnits = Math.max(0, med.stockUnits || 0);
                        const prevCostPack = med.costPrice || 0;

                        if (prevStockUnits <= 0 || prevCostPack <= 0) {
                            med.costPrice = Math.round(inCostPack * 100) / 100;
                        } else {
                            const prevPackStock = prevStockUnits / packRatio;
                            const inPackQty = addedUnits / packRatio;
                            const avgCost = ((prevPackStock * prevCostPack) + (inPackQty * inCostPack)) / (prevPackStock + inPackQty);
                            med.costPrice = Math.round(avgCost * 100) / 100;
                        }
                    }

                    med.stockUnits = Math.round(((med.stockUnits || 0) + addedUnits) * 1000) / 1000;
                    this.saveMedicine(med);
                }
            });
        }

        // 2. LƯU BỀN VỮNG VÀO HÀNG ĐỢI VÀ DANH SÁCH PHIẾU NHẬP SAU KHI ĐÃ CÓ ĐẦY ĐỦ TRẠNG THÁI GỐC (Batch 10: Issue 2)
        if (!this._pendingLocalStockInIds) this._pendingLocalStockInIds = new Set();
        this._pendingLocalStockInIds.add(stockIn.id);
        this._addToPendingQueue({ type: 'stockin', id: stockIn.id, clientTxId: stockIn.clientTxId, data: stockIn, voucher: voucher, createdAt: Date.now() });

        orders.unshift(stockIn);
        this.saveStockInOrders(orders);

        this.schedulePersistToServer();
        this.emit('stockin:changed', orders);
        return stockIn;
    }

    updateStockInOrder(updatedStockIn) {
        const orders = this.getStockInOrders();
        const index = orders.findIndex(o => o.id === updatedStockIn.id);
        if (index === -1) return null;

        const oldOrder = orders[index];

        // 1. Hoàn nguyên số lượng tồn kho và giá vốn/lô/HSD cũ của phiếu cũ (Batch P1: Issue 4)
        if (oldOrder.items && Array.isArray(oldOrder.items)) {
            oldOrder.items.forEach(oldItem => {
                const med = this.getMedicineById(oldItem.medicineId);
                if (med) {
                    // Hoàn nguyên giá vốn cũ nếu có ghi nhận snapshot
                    if (typeof oldItem.prevCostPrice === 'number' && oldItem.prevCostPrice > 0) {
                        med.costPrice = oldItem.prevCostPrice;
                    }
                    if (oldItem.prevBatchNo) med.batchNo = oldItem.prevBatchNo;
                    if (oldItem.prevExpiryDate) med.expiryDate = oldItem.prevExpiryDate;

                    const u = (oldItem.unit || '').trim().toLowerCase();
                    const packU = (med.packUnit || '').trim().toLowerCase();
                    const subU = (med.subUnit || '').trim().toLowerCase();
                    const packRatio = (med.packRatio && Number(med.packRatio) > 0) ? Number(med.packRatio) : 1;
                    const subRatio = (med.subRatio && Number(med.subRatio) > 0) ? Number(med.subRatio) : 1;

                    let unitsToDeduct = Number(oldItem.quantity) || 0;
                    if (u && packU && u === packU && packRatio > 1) {
                        unitsToDeduct = (Number(oldItem.quantity) || 0) * packRatio;
                    } else if (u && subU && u === subU && subRatio > 1) {
                        unitsToDeduct = (Number(oldItem.quantity) || 0) * subRatio;
                    }
                    // Trừ tồn kho an toàn: không làm âm kho nếu hàng đã bán một phần trong lúc chờ sửa
                    const safeUnitsToDeduct = Math.min(unitsToDeduct, Math.max(0, med.stockUnits || 0));
                    med.stockUnits = Math.round(((med.stockUnits || 0) - safeUnitsToDeduct) * 1000) / 1000;
                    this.saveMedicine(med);
                }
            });
        }

        // 2. Cộng tồn kho mới và cập nhật giá vốn, HSD, lô cho mặt hàng mới
        if (updatedStockIn.items && Array.isArray(updatedStockIn.items)) {
            if (!updatedStockIn.snapshots) updatedStockIn.snapshots = {};
            updatedStockIn.items.forEach(newItem => {
                const med = this.getMedicineById(newItem.medicineId);
                if (med) {
                    const u = (newItem.unit || '').trim().toLowerCase();
                    const packU = (med.packUnit || '').trim().toLowerCase();
                    const subU = (med.subUnit || '').trim().toLowerCase();
                    const baseU = (med.baseUnit || '').trim().toLowerCase();
                    const packRatio = (med.packRatio && Number(med.packRatio) > 0) ? Number(med.packRatio) : 1;
                    const subRatio = (med.subRatio && Number(med.subRatio) > 0) ? Number(med.subRatio) : 1;

                    let unitsToAdd = Number(newItem.quantity) || 0;
                    if (u && packU && u === packU && packRatio > 1) {
                        unitsToAdd = (Number(newItem.quantity) || 0) * packRatio;
                    } else if (u && subU && u === subU && subRatio > 1) {
                        unitsToAdd = (Number(newItem.quantity) || 0) * subRatio;
                    }

                    // Lưu snapshot trước khi cập nhật mới
                    newItem.addedUnits = unitsToAdd;
                    newItem.prevBatchNo = med.batchNo || '';
                    newItem.prevExpiryDate = med.expiryDate || '';
                    newItem.prevCostPrice = med.costPrice || 0;
                    newItem.prevStockUnits = med.stockUnits || 0;

                    updatedStockIn.snapshots[newItem.medicineId] = {
                        prevStockUnits: med.stockUnits || 0,
                        addedUnits: unitsToAdd,
                        prevCostPrice: med.costPrice || 0,
                        prevBatchNo: med.batchNo || '',
                        prevExpiryDate: med.expiryDate || '',
                        postStockUnits: Math.round(((med.stockUnits || 0) + unitsToAdd) * 1000) / 1000
                    };

                    if (newItem.batchNo) med.batchNo = newItem.batchNo;
                    if (newItem.expiryDate) med.expiryDate = newItem.expiryDate;
                    if (newItem.costPrice && newItem.costPrice > 0) {
                        // Quy đổi giá nhập hiện tại về đơn vị hộp (packUnit)
                        let inCostPack = newItem.costPrice;
                        if (u !== packU && packRatio > 1) {
                            if (u === baseU) inCostPack = newItem.costPrice * packRatio;
                            else if (u === subU && subRatio > 0) inCostPack = newItem.costPrice * (packRatio / subRatio);
                        }

                        // Bình quân gia quyền di động với giá vốn đã được hoàn nguyên
                        const prevStockUnits = Math.max(0, med.stockUnits || 0);
                        const prevCostPack = med.costPrice || 0;

                        if (prevStockUnits <= 0 || prevCostPack <= 0) {
                            med.costPrice = Math.round(inCostPack * 100) / 100;
                        } else {
                            const prevPackStock = prevStockUnits / packRatio;
                            const inPackQty = unitsToAdd / packRatio;
                            const avgCost = ((prevPackStock * prevCostPack) + (inPackQty * inCostPack)) / (prevPackStock + inPackQty);
                            med.costPrice = Math.round(avgCost * 100) / 100;
                        }
                    }

                    med.stockUnits = Math.round(((med.stockUnits || 0) + unitsToAdd) * 1000) / 1000;
                    this.saveMedicine(med);
                }
            });
        }

        // 3. Cập nhật phiếu nhập trong danh sách
        orders[index] = { ...oldOrder, ...updatedStockIn, updatedAt: this.formatLocalISO() };
        this.saveStockInOrders(orders);

        // 4. Cập nhật phiếu chi tương ứng trong Sổ Thu Chi (chỉ match phiếu chi, tránh đè phiếu thu hoàn trả)
        const vouchers = this.getVouchers();
        const vIndex = vouchers.findIndex(v => (v.refId === updatedStockIn.id || (v.note && v.note.includes(updatedStockIn.id))) && v.type === 'payment' && !v.isCancelled);
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
                createdAt: updatedStockIn.createdAt || this.formatLocalISO()
            });
        }

        this.schedulePersistToServer();
        this.emit('stockin:changed', orders);
        return orders[index];
    }

    /**
     * Hoàn nguyên an toàn một phiếu nhập kho cục bộ khi người dùng hủy bỏ giao dịch chờ (Batch 8: Issue 4 & Batch 9: Issue 2)
     */
    async rollbackPendingStockInOrder(stockIn) {
        if (!stockIn || !stockIn.id) return { success: false, message: 'Dữ liệu không hợp lệ' };
        const orders = this.getStockInOrders();
        const target = orders.find(o => (stockIn.clientTxId && o.clientTxId === stockIn.clientTxId) || o.id === stockIn.id);

        const applyStockInRollback = () => {
            const items = (target && target.items) ? target.items : stockIn.items;
            const snapshots = (target && target.snapshots) ? target.snapshots : (stockIn.snapshots || {});
            let hasDiscrepancy = false;
            const discrepancyNotes = [];

            if (items && Array.isArray(items)) {
                items.forEach(item => {
                    const med = this.getMedicineById(item.medicineId);
                    if (med) {
                        const snap = snapshots[item.medicineId];
                        const u = (item.unit || '').trim().toLowerCase();
                        const packU = (med.packUnit || '').trim().toLowerCase();
                        const subU = (med.subUnit || '').trim().toLowerCase();
                        const packRatio = (med.packRatio && Number(med.packRatio) > 0) ? Number(med.packRatio) : 1;
                        const subRatio = (med.subRatio && Number(med.subRatio) > 0) ? Number(med.subRatio) : 1;

                        let addedUnits = item.addedUnits;
                        if (addedUnits === undefined || addedUnits === null) {
                            addedUnits = Number(item.quantity) || 0;
                            if (u && packU && u === packU && packRatio > 1) {
                                addedUnits = (Number(item.quantity) || 0) * packRatio;
                            } else if (u && subU && u === subU && subRatio > 1) {
                                addedUnits = (Number(item.quantity) || 0) * subRatio;
                            }
                        }

                        const currentStock = med.stockUnits || 0;
                        const prevStock = (snap && snap.prevStockUnits !== undefined) ? snap.prevStockUnits : item.prevStockUnits;
                        const expectedStockAfterStockIn = (snap && snap.postStockUnits !== undefined)
                            ? snap.postStockUnits
                            : ((prevStock !== undefined ? prevStock : currentStock) + addedUnits);

                        // 1. Tính toán delta trừ tồn an toàn - Tuyệt đối không cho tồn âm (Batch 12)
                        // Tối đa chỉ có thể trừ phần tồn hiện có, không được vượt quá số lượng đã nhập hoặc làm âm kho
                        const safeUnitsToDeduct = Math.min(addedUnits, Math.max(0, currentStock));
                        med.stockUnits = Math.max(0, Math.round((currentStock - safeUnitsToDeduct) * 1000) / 1000);

                        // 2. Kiểm tra xem kho đã có biến động sau khi nhập không (bán hàng, xuất hủy...)
                        const stockChangedAfter = (currentStock !== expectedStockAfterStockIn);
                        const deficit = addedUnits - safeUnitsToDeduct;

                        if (stockChangedAfter || deficit > 0) {
                            hasDiscrepancy = true;
                            discrepancyNotes.push(
                                `Thuốc [${med.name}]: Tồn hiện tại (${currentStock}) khác kỳ vọng sau nhập (${expectedStockAfterStockIn}). ` +
                                `Đã trừ an toàn ${safeUnitsToDeduct} đơn vị (thay vì ${addedUnits}). ` +
                                (deficit > 0 ? `Thiếu hụt ${deficit} đơn vị đã xuất bán, cần kiểm kê reconciliation.` : `Kho có biến động sau nhập.`)
                            );
                        }

                        // 3. Hoàn nguyên giá vốn, số lô, hạn dùng nếu không có phiếu nhập nào mới hơn đè lên
                        const subsequentStockIns = orders.filter(o =>
                            !o.isCancelled && o.id !== (target ? target.id : stockIn.id) &&
                            new Date(o.createdAt || 0) > new Date((target ? target.createdAt : stockIn.createdAt) || 0) &&
                            (o.items || []).some(it => it.medicineId === item.medicineId)
                        );

                        // Chỉ hoàn nguyên giá vốn/lô nếu không có phiếu nhập mới hơn sau đó đã thiết lập lô/giá mới
                        if (subsequentStockIns.length === 0) {
                            const prevCost = (snap && snap.prevCostPrice !== undefined) ? snap.prevCostPrice : item.prevCostPrice;
                            const prevBatch = (snap && snap.prevBatchNo !== undefined) ? snap.prevBatchNo : item.prevBatchNo;
                            const prevExp = (snap && snap.prevExpiryDate !== undefined) ? snap.prevExpiryDate : item.prevExpiryDate;

                            if (prevCost !== undefined && prevCost !== null) {
                                med.costPrice = prevCost;
                            }
                            if (prevBatch !== undefined && prevBatch !== null) {
                                med.batchNo = prevBatch;
                            }
                            if (prevExp !== undefined && prevExp !== null) {
                                med.expiryDate = prevExp;
                            }
                        }

                        this.saveMedicine(med);
                    }
                });
            }

            // Ghi audit log nếu phát hiện chênh lệch tồn kho hoặc kho đã thay đổi sau nhập (Batch 12)
            if (hasDiscrepancy) {
                this.logAction(
                    'Kho hàng',
                    `Cảnh báo hoàn nguyên phiếu nhập [${stockIn.id}]: ${discrepancyNotes.join('; ')}`,
                    null,
                    'rollback_reconciliation_warning'
                );
            }
        };

        if (target) {
            target.isCancelled = true;
            target.cancelReason = 'Hủy phiếu nhập kho chưa hoàn tất';
            target.cancelledAt = this.formatLocalISO();

            // 1. Hoàn nguyên tồn kho, giá vốn và lô (Idempotent - Batch 9: Issue 2)
            if (!target._stockInRollbacked) {
                applyStockInRollback();
                target._stockInRollbacked = true;
            }

            // 2. Hủy phiếu chi tương ứng trong Sổ Quỹ
            const vouchers = this.getVouchers();
            let vChanged = false;
            vouchers.forEach(v => {
                if ((v.refId === target.id || (v.note && v.note.includes(target.id))) && v.type === 'payment' && !v.isCancelled) {
                    v.isCancelled = true;
                    v.cancelReason = `Hủy theo phiếu nhập kho ${target.id}`;
                    vChanged = true;
                }
            });
            if (vChanged) {
                this.saveVouchers(vouchers);
            }
            this.saveStockInOrders(orders);
        } else if (!stockIn._stockInRollbacked) {
            applyStockInRollback();
            stockIn._stockInRollbacked = true;
        }

        // 3. Nếu ở server mode, phải chờ server xác nhận thành công!
        if (this.isServerMode) {
            let saved = false;
            try {
                saved = await this.persistImmediately();
                if (!saved) {
                    const syncSuccess = await this.syncWithServer();
                    if (syncSuccess) {
                        const reOrders = this.getStockInOrders();
                        const retarget = reOrders.find(o => (stockIn.clientTxId && o.clientTxId === stockIn.clientTxId) || o.id === stockIn.id);
                        if (retarget) {
                            retarget.isCancelled = true;
                            retarget.cancelReason = 'Hủy phiếu nhập kho chưa hoàn tất';
                            retarget.cancelledAt = this.formatLocalISO();
                            applyStockInRollback();
                            retarget._stockInRollbacked = true;
                        }
                        // Nếu server chưa từng có phiếu nhập này, server chưa từng cộng tồn kho, không trừ tiếp (Batch 10: Issue 1)

                        const reVouchers = this.getVouchers();
                        let reVChanged = false;
                        reVouchers.forEach(v => {
                            if ((v.refId === stockIn.id || (v.note && v.note.includes(stockIn.id))) && v.type === 'payment' && !v.isCancelled) {
                                v.isCancelled = true;
                                v.cancelReason = `Hủy theo phiếu nhập kho ${stockIn.id}`;
                                reVChanged = true;
                            }
                        });
                        if (reVChanged) this.saveVouchers(reVouchers);
                        saved = await this.persistImmediately();
                    }
                }
            } catch (e) {
                saved = false;
            }

            if (!saved) {
                // Không xóa khỏi pendingQueue nếu chưa lưu thành công máy chủ để giữ trạng thái chờ
                return { success: false, message: 'Chưa thể lưu trạng thái hủy phiếu nhập lên máy chủ' };
            }
        }

        // 4. Khi máy chủ đã xác nhận thành công mới xóa khỏi pendingLocalStockInIds và hàng đợi
        if (this._pendingLocalStockInIds) this._pendingLocalStockInIds.delete(stockIn.id);
        this._removeFromPendingQueue(stockIn.id, stockIn.clientTxId);
        this.emit('stockin:changed', orders);
        return { success: true };
    }

    // --- TRẢ HÀNG NHẬP CHO NHÀ CUNG CẤP (PURCHASE RETURN) ---
    returnStockInItems(stockInId, returnedItems, returnReason, paymentMethod = 'transfer', note = '') {
        const orders = this.getStockInOrders();
        const stockIn = orders.find(o => o.id === stockInId);
        if (!stockIn) return { success: false, message: 'Không tìm thấy phiếu nhập kho!' };

        if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
            return { success: false, message: 'Vui lòng chọn ít nhất một mặt hàng để trả!' };
        }

        // 1. Kiểm tra số lượng tồn kho thực tế trước khi xuất trả (cộng dồn theo từng loại thuốc)
        const requiredUnitsByMed = new Map();
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
            requiredUnitsByMed.set(med.id, (requiredUnitsByMed.get(med.id) || 0) + unitsToDeduct);
        }

        for (const [medId, neededUnits] of requiredUnitsByMed.entries()) {
            const med = this.getMedicineById(medId);
            if ((med.stockUnits || 0) < neededUnits) {
                return { 
                    success: false, 
                    message: `Thuốc [${med.name}] hiện tại trong kho chỉ còn ${med.stockUnits || 0} ${med.baseUnit}, không đủ số lượng ${neededUnits} ${med.baseUnit} để xuất trả lại nhà cung cấp!` 
                };
            }
        }

        // Validate tổng số tiền hoàn trả trước khi trừ kho
        let totalRefund = 0;
        returnedItems.forEach(item => {
            const qtyToReturn = parseInt(item.quantity) || 0;
            if (qtyToReturn > 0) {
                totalRefund += qtyToReturn * (parseFloat(item.costPrice) || 0);
            }
        });

        if (totalRefund <= 0) {
            return { success: false, message: 'Tổng số tiền hoàn trả phải lớn hơn 0!' };
        }

        // 2. Trừ số lượng thuốc trong kho tương ứng sau khi kiểm tra hợp lệ
        returnedItems.forEach(item => {
            const qtyToReturn = parseInt(item.quantity) || 0;
            if (qtyToReturn <= 0) return;

            const med = this.getMedicineById(item.medicineId);
            if (med) {
                let unitsToDeduct = qtyToReturn;
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    unitsToDeduct = qtyToReturn * med.packRatio;
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    unitsToDeduct = qtyToReturn * med.subRatio;
                }

                med.stockUnits = Math.round(((med.stockUnits || 0) - unitsToDeduct) * 1000) / 1000;
                this.saveMedicine(med);
            }
        });

        // 3. Ghi nhận phiếu trả hàng vào danh sách returns của phiếu nhập gốc
        if (!stockIn.returns) stockIn.returns = [];
        const localNow = this.formatLocalISO();
        const dateStr = localNow.slice(2, 10).replace(/-/g, '');
        const allReturns = this.getAllPurchaseReturns();
        const existingReturnIds = new Set(allReturns.map(r => r.id));
        let retSuffix = 1;
        let returnId = `THN${dateStr}-${String(retSuffix).padStart(3, '0')}`;
        while (existingReturnIds.has(returnId)) {
            retSuffix++;
            returnId = `THN${dateStr}-${String(retSuffix).padStart(3, '0')}`;
        }
        
        const returnRecord = {
            id: returnId,
            stockInId: stockIn.id,
            supplierId: stockIn.supplierId || '',
            supplierName: stockIn.supplierName || 'Nhà cung cấp',
            createdAt: localNow,
            paymentMethod: paymentMethod || 'cash', // 'cash' (tiền mặt) hoặc 'transfer' (chuyển khoản)
            reason: returnReason || 'Trả hàng cho nhà cung cấp',
            note: note || '',
            stockAdjusted: true,
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

        this.saveStockInOrders(orders);
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

    updatePurchaseReturn(returnId, updateFields) {
        if (!returnId || !updateFields) return null;

        let returnRecord = null;
        let isStockInReturn = false;

        // 1. Kiểm tra trong danh sách phiếu trả tổng hợp (returns_*.json)
        const generals = this.getPurchaseReturns();
        const genIdx = generals.findIndex(r => r.id === returnId);
        if (genIdx !== -1) {
            returnRecord = generals[genIdx];

            // Điều chỉnh tồn kho tương ứng nếu phiếu có điều chỉnh kho và sửa đổi items
            const shouldAdjustStock = returnRecord && (returnRecord.stockAdjusted === true || returnRecord.type === 'general_return' || returnRecord.returnType === 'general_return');
            if (shouldAdjustStock && Array.isArray(updateFields.items)) {
                const oldUnitsByMed = new Map();
                (returnRecord.items || []).forEach(it => {
                    const med = this.getMedicineById(it.medicineId);
                    let u = Number(it.quantity) || 0;
                    if (med && it.unit === med.packUnit && med.packRatio > 1) u *= med.packRatio;
                    else if (med && it.unit === med.subUnit && med.subRatio > 1) u *= med.subRatio;
                    oldUnitsByMed.set(it.medicineId, (oldUnitsByMed.get(it.medicineId) || 0) + u);
                });

                const newUnitsByMed = new Map();
                (updateFields.items || []).forEach(it => {
                    const med = this.getMedicineById(it.medicineId);
                    let u = Number(it.quantity) || 0;
                    if (med && it.unit === med.packUnit && med.packRatio > 1) u *= med.packRatio;
                    else if (med && it.unit === med.subUnit && med.subRatio > 1) u *= med.subRatio;
                    newUnitsByMed.set(it.medicineId, (newUnitsByMed.get(it.medicineId) || 0) + u);
                });

                const allMeds = new Set([...oldUnitsByMed.keys(), ...newUnitsByMed.keys()]);
                allMeds.forEach(medId => {
                    const oldU = oldUnitsByMed.get(medId) || 0;
                    const newU = newUnitsByMed.get(medId) || 0;
                    const delta = newU - oldU;
                    if (delta !== 0) {
                        this.updateStockUnits(medId, -delta);
                    }
                });
            }

            Object.assign(returnRecord, updateFields);
            returnRecord.updatedAt = this.formatLocalISO();
            generals[genIdx] = returnRecord;
            this.savePurchaseReturns(generals);
        } else {
            // 2. Kiểm tra trong phiếu trả hàng theo đơn nhập kho (stockIn.returns)
            const stockIns = this.getStockInOrders();
            for (const s of stockIns) {
                if (s.returns && Array.isArray(s.returns)) {
                    const rIdx = s.returns.findIndex(r => r.id === returnId);
                    if (rIdx !== -1) {
                        returnRecord = s.returns[rIdx];
                        isStockInReturn = true;

                        const shouldAdjustStockIn = returnRecord && (returnRecord.stockAdjusted === true || returnRecord.type === 'stockin_return' || returnRecord.returnType === 'stockin_return');
                        if (shouldAdjustStockIn && Array.isArray(updateFields.items)) {
                            const oldUnitsByMed = new Map();
                            (returnRecord.items || []).forEach(it => {
                                const med = this.getMedicineById(it.medicineId);
                                let u = Number(it.quantity) || 0;
                                if (med && it.unit === med.packUnit && med.packRatio > 1) u *= med.packRatio;
                                else if (med && it.unit === med.subUnit && med.subRatio > 1) u *= med.subRatio;
                                oldUnitsByMed.set(it.medicineId, (oldUnitsByMed.get(it.medicineId) || 0) + u);
                            });

                            const newUnitsByMed = new Map();
                            (updateFields.items || []).forEach(it => {
                                const med = this.getMedicineById(it.medicineId);
                                let u = Number(it.quantity) || 0;
                                if (med && it.unit === med.packUnit && med.packRatio > 1) u *= med.packRatio;
                                else if (med && it.unit === med.subUnit && med.subRatio > 1) u *= med.subRatio;
                                newUnitsByMed.set(it.medicineId, (newUnitsByMed.get(it.medicineId) || 0) + u);
                            });

                            const allMeds = new Set([...oldUnitsByMed.keys(), ...newUnitsByMed.keys()]);
                            allMeds.forEach(medId => {
                                const oldU = oldUnitsByMed.get(medId) || 0;
                                const newU = newUnitsByMed.get(medId) || 0;
                                const delta = newU - oldU;
                                if (delta !== 0) {
                                    this.updateStockUnits(medId, -delta);
                                }
                            });
                        }

                        Object.assign(returnRecord, updateFields);
                        returnRecord.updatedAt = this.formatLocalISO();
                        s.returns[rIdx] = returnRecord;

                        // Cập nhật lại tổng tiền hoàn trả của phiếu nhập gốc
                        s.totalRefunded = (s.returns || []).reduce((sum, r) => sum + (r.refundTotal || 0), 0);
                        this.saveStockInOrders(stockIns);
                        break;
                    }
                }
            }
        }

        if (!returnRecord) return null;

        // 3. Cập nhật phiếu thu tương ứng trong Sổ Quỹ Thu Chi (vouchers)
        const vouchers = this.getVouchers();
        const voucher = vouchers.find(v => (v.refId === returnId || v.id === `PT${returnId}`) && !v.isCancelled);
        if (voucher) {
            let voucherChanged = false;
            if (updateFields.paymentMethod && updateFields.paymentMethod !== voucher.paymentMethod) {
                voucher.paymentMethod = updateFields.paymentMethod;
                voucherChanged = true;
            }
            if (typeof updateFields.refundTotal !== 'undefined' && updateFields.refundTotal !== voucher.amount) {
                voucher.amount = updateFields.refundTotal;
                voucherChanged = true;
            }
            if (updateFields.supplierName && updateFields.supplierName !== voucher.targetName) {
                voucher.targetName = updateFields.supplierName;
                voucher.recipientName = updateFields.supplierName;
                voucherChanged = true;
            }
            if (updateFields.createdAt && updateFields.createdAt !== voucher.createdAt) {
                voucher.createdAt = updateFields.createdAt;
                voucherChanged = true;
            }
            if (voucherChanged) {
                this.saveVouchers(vouchers);
            }
        }

        this.schedulePersistToServer();
        this.emit('returns:changed', returnRecord);
        return returnRecord;
    }

    deletePurchaseReturn(returnId) {
        if (!returnId) return false;

        let deleted = false;
        let returnRecord = null;

        // 1. Kiểm tra trong danh sách trả tổng hợp
        const generals = this.getPurchaseReturns();
        const genIdx = generals.findIndex(r => r.id === returnId);
        if (genIdx !== -1) {
            returnRecord = generals[genIdx];
            generals.splice(genIdx, 1);
            this.savePurchaseReturns(generals);
            deleted = true;
        } else {
            // 2. Kiểm tra trong stockIn.returns
            const stockIns = this.getStockInOrders();
            for (const s of stockIns) {
                if (s.returns && Array.isArray(s.returns)) {
                    const rIdx = s.returns.findIndex(r => r.id === returnId);
                    if (rIdx !== -1) {
                        returnRecord = s.returns[rIdx];
                        s.returns.splice(rIdx, 1);
                        s.totalRefunded = (s.returns || []).reduce((sum, r) => sum + (r.refundTotal || 0), 0);

                        // Cập nhật lại returnStatus của phiếu nhập
                        if (!s.returns || s.returns.length === 0) {
                            s.returnStatus = null;
                        } else {
                            let allReturned = true;
                            let anyReturned = false;
                            (s.items || []).forEach(origItem => {
                                const totalReturnedQty = s.returns.reduce((sum, r) => {
                                    const ri = (r.items || []).find(x => x.medicineId === origItem.medicineId && x.unit === origItem.unit);
                                    return sum + (ri ? ri.quantity : 0);
                                }, 0);
                                if (totalReturnedQty > 0) anyReturned = true;
                                if (totalReturnedQty < origItem.quantity) allReturned = false;
                            });
                            s.returnStatus = allReturned ? 'fully_returned' : (anyReturned ? 'partially_returned' : null);
                        }

                        this.saveStockInOrders(stockIns);
                        deleted = true;
                        break;
                    }
                }
            }
        }

        if (deleted) {
            // Hoàn lại tồn kho cho các mặt hàng trong phiếu trả vừa bị xoá (hoàn nếu phiếu có điều chỉnh kho hoặc là phiếu trả tổng hợp)
            const wasStockAdjusted = returnRecord && (returnRecord.stockAdjusted === true || returnRecord.type === 'general_return' || returnRecord.returnType === 'general_return');
            if (wasStockAdjusted && Array.isArray(returnRecord.items)) {
                returnRecord.items.forEach(item => {
                    const med = this.getMedicineById(item.medicineId);
                    if (med) {
                        const u = (item.unit || '').trim().toLowerCase();
                        const packU = (med.packUnit || '').trim().toLowerCase();
                        const subU = (med.subUnit || '').trim().toLowerCase();
                        const packRatio = (med.packRatio && Number(med.packRatio) > 0) ? Number(med.packRatio) : 1;
                        const subRatio = (med.subRatio && Number(med.subRatio) > 0) ? Number(med.subRatio) : 1;

                        let unitsToAdd = Number(item.quantity) || 0;
                        if (u && packU && u === packU && packRatio > 1) {
                            unitsToAdd = (Number(item.quantity) || 0) * packRatio;
                        } else if (u && subU && u === subU && subRatio > 1) {
                            unitsToAdd = (Number(item.quantity) || 0) * subRatio;
                        }
                        this.updateStockUnits(item.medicineId, unitsToAdd);
                    }
                });
            }

            // Huỷ hoặc xoá voucher tương ứng trong sổ quỹ
            const vouchers = this.getVouchers();
            const vIdx = vouchers.findIndex(v => (v.refId === returnId || v.id === `PT${returnId}`) && !v.isCancelled);
            if (vIdx !== -1) {
                vouchers[vIdx].isCancelled = true;
                vouchers[vIdx].cancelReason = `Huỷ theo phiếu trả hàng ${returnId}`;
                this.saveVouchers(vouchers);
            }

            this.schedulePersistToServer();
            this.emit('returns:changed', null);
        }
        return deleted;
    }

    returnGeneralPurchaseItems({ supplierId = '', supplierName = '', returnedItems = [], returnReason = '', paymentMethod = 'transfer', note = '' }) {
        if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
            return { success: false, message: 'Vui lòng chọn ít nhất một mặt hàng thuốc để xuất trả!' };
        }

        // 1. Kiểm tra tồn kho thực tế của từng thuốc (cộng dồn theo từng loại thuốc - Batch P1: Issue 1)
        const requiredUnitsByMed = new Map();
        for (const item of returnedItems) {
            const qtyToReturn = parseFloat(item.quantity) || 0;
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
            requiredUnitsByMed.set(med.id, (requiredUnitsByMed.get(med.id) || 0) + unitsToDeduct);
        }

        for (const [medId, neededUnits] of requiredUnitsByMed.entries()) {
            const med = this.getMedicineById(medId);
            if ((med.stockUnits || 0) < neededUnits) {
                return {
                    success: false,
                    message: `Thuốc [${med.name}] hiện trong kho chỉ còn ${med.stockUnits || 0} ${med.baseUnit}, không đủ để xuất trả ${neededUnits} ${med.baseUnit}!`
                };
            }
        }

        // Validate tổng tiền hoàn trả TRƯỚC KHI trừ kho
        let totalRefund = 0;
        returnedItems.forEach(item => {
            const qtyToReturn = parseFloat(item.quantity) || 0;
            if (qtyToReturn > 0) {
                totalRefund += qtyToReturn * (parseFloat(item.costPrice) || 0);
            }
        });

        if (totalRefund <= 0) {
            return { success: false, message: 'Tổng số tiền hoàn trả phải lớn hơn 0!' };
        }

        // 2. Trừ kho thuốc sau khi đã kiểm tra hợp lệ toàn bộ
        const adjustedItems = [];
        returnedItems.forEach(item => {
            const qtyToReturn = parseFloat(item.quantity) || 0;
            if (qtyToReturn <= 0) return;

            const med = this.getMedicineById(item.medicineId);
            if (med) {
                let unitsToDeduct = qtyToReturn;
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    unitsToDeduct = qtyToReturn * med.packRatio;
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    unitsToDeduct = qtyToReturn * med.subRatio;
                }

                med.stockUnits = Math.round(((med.stockUnits || 0) - unitsToDeduct) * 1000) / 1000;
                this.saveMedicine(med);
                adjustedItems.push({ medicineId: med.id, unitsDeducted: unitsToDeduct });
            }
        });

        // 3. Tạo mã phiếu trả hàng tổng hợp PTHyymmdd-xxx (dùng maxSeq+1)
        const localNow = this.formatLocalISO();
        const dateStr = localNow.slice(2, 10).replace(/-/g, '');
        const prefix = `PTH${dateStr}-`;
        const allReturns = this.getAllPurchaseReturns();
        const existingIds = new Set(allReturns.map(r => r.id));
        let maxSeq = 0;
        allReturns.forEach(r => {
            if (r.id && r.id.startsWith(prefix)) {
                const num = parseInt(r.id.slice(prefix.length), 10);
                if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
        });
        let nextSeq = maxSeq + 1;
        let returnId = `${prefix}${String(nextSeq).padStart(3, '0')}`;
        while (existingIds.has(returnId)) {
            nextSeq++;
            returnId = `${prefix}${String(nextSeq).padStart(3, '0')}`;
        }

        const returnRecord = {
            id: returnId,
            type: 'general_return',
            returnType: 'general_return',
            supplierId: supplierId || '',
            supplierName: supplierName || 'Nhà cung cấp',
            createdAt: localNow,
            paymentMethod: paymentMethod || 'cash',
            reason: returnReason || 'Xuất trả hàng cho nhà cung cấp (tổng hợp)',
            note: note || '',
            stockAdjusted: true,
            stockAdjustedAt: localNow,
            adjustedItems: adjustedItems,
            items: returnedItems.map(i => ({
                medicineId: i.medicineId,
                medicineName: i.medicineName,
                unit: i.unit,
                quantity: parseFloat(i.quantity) || 0,
                costPrice: parseFloat(i.costPrice) || 0,
                batchNo: i.batchNo || '',
                expiryDate: i.expiryDate || '',
                totalRefund: (parseFloat(i.quantity) || 0) * (parseFloat(i.costPrice) || 0)
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

    // --- Lập Phiếu Xuất Hủy Thuốc (Quá Hạn / Hư Hỏng) ---
    createDisposalOrder({ items = [], reason = '', note = '', paymentMethod = 'cash' }) {
        if (!Array.isArray(items) || items.length === 0) {
            return { success: false, message: 'Vui lòng chọn ít nhất một mặt hàng thuốc để xuất hủy!' };
        }

        // 1. Kiểm tra tồn kho thực tế của từng thuốc (cộng dồn theo mã thuốc) - KHÔNG CHO PHÉP XUẤT ÂM!
        const requiredUnitsByMed = new Map();
        for (const item of items) {
            const qtyToDispose = parseFloat(item.quantity) || 0;
            if (qtyToDispose <= 0) {
                return { success: false, message: `Số lượng xuất hủy của [${item.medicineName}] phải lớn hơn 0!` };
            }

            const med = this.getMedicineById(item.medicineId);
            if (!med) {
                return { success: false, message: `Không tìm thấy thuốc [${item.medicineName}] trong hệ thống kho!` };
            }

            let unitsToDeduct = qtyToDispose;
            if (item.unit === med.packUnit && med.packRatio > 1) {
                unitsToDeduct = qtyToDispose * med.packRatio;
            } else if (item.unit === med.subUnit && med.subRatio > 1) {
                unitsToDeduct = qtyToDispose * med.subRatio;
            }
            requiredUnitsByMed.set(med.id, (requiredUnitsByMed.get(med.id) || 0) + unitsToDeduct);
        }

        for (const [medId, neededUnits] of requiredUnitsByMed.entries()) {
            const med = this.getMedicineById(medId);
            const availableUnits = med.stockUnits || 0;
            if (availableUnits < neededUnits) {
                return {
                    success: false,
                    message: `Thuốc [${med.name}] hiện trong kho chỉ còn ${availableUnits} ${med.baseUnit || 'đơn vị'}, không đủ số lượng ${neededUnits} ${med.baseUnit} để xuất hủy!`
                };
            }
        }

        // Validate tổng tiền trước khi trừ kho
        let totalDisposalAmount = 0;
        items.forEach(item => {
            const qtyToDispose = parseFloat(item.quantity) || 0;
            if (qtyToDispose > 0) {
                const costPrice = parseFloat(item.costPrice) || 0;
                totalDisposalAmount += Math.round(qtyToDispose * costPrice);
            }
        });

        if (totalDisposalAmount <= 0) {
            return { success: false, message: 'Tổng giá trị hàng xuất hủy phải lớn hơn 0!' };
        }

        // 2. Trừ kho thuốc tương ứng sau khi kiểm tra hợp lệ
        items.forEach(item => {
            const qtyToDispose = parseFloat(item.quantity) || 0;
            if (qtyToDispose <= 0) return;

            const med = this.getMedicineById(item.medicineId);
            if (med) {
                let unitsToDeduct = qtyToDispose;
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    unitsToDeduct = qtyToDispose * med.packRatio;
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    unitsToDeduct = qtyToDispose * med.subRatio;
                }

                med.stockUnits = Math.round(((med.stockUnits || 0) - unitsToDeduct) * 1000) / 1000;
                this.saveMedicine(med);
            }
        });

        // 3. Tạo mã phiếu xuất hủy PXHyymmdd-xxx (chống trùng ID)
        const localNow = this.formatLocalISO();
        const dateStr = localNow.slice(2, 10).replace(/-/g, '');
        const prefix = `PXH${dateStr}-`;
        const allReturns = this.getAllPurchaseReturns();
        const existingIds = new Set(allReturns.map(r => r.id));
        let maxSuffix = 0;
        allReturns.forEach(r => {
            if (r.id && r.id.startsWith(prefix)) {
                const num = parseInt(r.id.slice(prefix.length), 10);
                if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
            }
        });
        let pxhSuffix = maxSuffix + 1;
        let disposalId = `${prefix}${String(pxhSuffix).padStart(3, '0')}`;
        while (existingIds.has(disposalId)) {
            pxhSuffix++;
            disposalId = `${prefix}${String(pxhSuffix).padStart(3, '0')}`;
        }
        const settings = this.getSettings();

        const disposalRecord = {
            id: disposalId,
            type: 'disposal',
            returnType: 'disposal',
            supplierId: '',
            supplierName: 'Xuất Hủy Kho Nội Bộ',
            reason: reason || 'Hết hạn sử dụng (quá date)',
            note: note || '',
            stockAdjusted: true,
            createdAt: localNow,
            date: localNow,
            paymentMethod: paymentMethod || 'cash',
            items: items.map(i => {
                const q = parseFloat(i.quantity) || 0;
                const c = parseFloat(i.costPrice) || 0;
                return {
                    medicineId: i.medicineId,
                    medicineName: i.medicineName,
                    unit: i.unit,
                    quantity: q,
                    costPrice: c,
                    batchNo: i.batchNo || '',
                    expiryDate: i.expiryDate || '',
                    totalRefund: Math.round(q * c),
                    lineTotal: Math.round(q * c)
                };
            }),
            totalItems: items.length,
            totalQuantity: items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0),
            totalAmount: totalDisposalAmount,
            refundTotal: totalDisposalAmount,
            pharmacist: settings.pharmacist || 'DS. Nguyễn Thanh Dung'
        };

        this.addPurchaseReturn(disposalRecord);

        // 4. Tự động sinh Phiếu Chi trong Sổ Quỹ Thu Chi để hạch toán chi phí phát sinh
        this.addVoucher({
            type: 'payment',
            paymentMethod: paymentMethod || 'cash',
            category: 'Chi phí xuất hủy hàng hư hỏng, quá hạn',
            targetType: 'other',
            targetName: 'Hủy hàng quá hạn / hư hỏng',
            amount: totalDisposalAmount,
            note: `Chi phí xuất hủy ${items.length} loại thuốc quá hạn/hư hỏng theo phiếu ${disposalRecord.id} - Lý do: ${disposalRecord.reason}`,
            isAccounting: true,
            refId: disposalRecord.id,
            pharmacist: disposalRecord.pharmacist,
            createdAt: disposalRecord.createdAt
        });

        this.logAction('Kho Hàng & Xuất Hủy', `Lập phiếu xuất hủy: ${disposalRecord.id}, tổng vốn hủy: ${AppUtils.formatVND(totalDisposalAmount)}, lý do: ${disposalRecord.reason}`, disposalRecord.pharmacist, 'create');

        return { success: true, disposalRecord };
    }

    // --- Xóa phiếu xuất hủy (Hoàn lại kho và hủy phiếu chi tương ứng) ---
    deleteDisposalOrder(disposalId) {
        const returns = this.getPurchaseReturns();
        const idx = returns.findIndex(r => r.id === disposalId);
        if (idx === -1) {
            return { success: false, message: 'Không tìm thấy phiếu xuất hủy này!' };
        }

        const record = returns[idx];

        // 1. Hoàn lại số lượng tồn kho cho các thuốc trong phiếu (chỉ hoàn nếu phiếu đó đã từng trừ kho)
        if (record.stockAdjusted === true) {
            (record.items || []).forEach(item => {
                const med = this.getMedicineById(item.medicineId);
                if (med) {
                    const qty = parseFloat(item.quantity) || 0;
                    let unitsToRestore = qty;
                    if (item.unit === med.packUnit && med.packRatio > 1) {
                        unitsToRestore = qty * med.packRatio;
                    } else if (item.unit === med.subUnit && med.subRatio > 1) {
                        unitsToRestore = qty * med.subRatio;
                    }
                    med.stockUnits = Math.round(((med.stockUnits || 0) + unitsToRestore) * 1000) / 1000;
                    this.saveMedicine(med);
                }
            });
        }

        // 2. Hủy phiếu chi tương ứng trong Sổ Quỹ (giữ lịch sử kế toán)
        const vouchers = this.getVouchers();
        const vIdx = vouchers.findIndex(v => v.refId === disposalId && !v.isCancelled);
        if (vIdx !== -1) {
            vouchers[vIdx].isCancelled = true;
            vouchers[vIdx].cancelReason = `Hủy theo phiếu xuất hủy ${disposalId} đã xóa`;
            this.saveVouchers(vouchers);
        }

        // 3. Xóa phiếu xuất hủy khỏi danh sách
        returns.splice(idx, 1);
        this.savePurchaseReturns(returns);

        this.logAction('Kho Hàng & Xuất Hủy', `Xóa phiếu xuất hủy: ${record.id}, đã hoàn lại tồn kho và hủy phiếu chi`, this.getSettings().pharmacist || 'ADMIN', 'delete');

        return { success: true };
    }

    // --- Orders (Hóa đơn bán thuốc) ---
    getOrders() {
        if (this._cachedOrders) return this._cachedOrders;
        const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
        if (!raw) return [];
        try {
            this._cachedOrders = JSON.parse(raw);
            if (Array.isArray(this._cachedOrders)) {
                this._cachedOrders.forEach(o => {
                    (o.items || []).forEach(it => {
                        if ((it.quantity === 0 || !it.quantity) && it.lineTotal > 0 && it.price > 0) {
                            it.quantity = Math.round((it.lineTotal / it.price) * 1000) / 1000;
                        }
                    });
                });
            }
            return this._cachedOrders;
        } catch(e) {
            return [];
        }
    }

    getOrderById(id) {
        return this.getOrders().find(o => o.id === id);
    }

    saveOrders(orders) {
        this._cachedOrders = orders;
        this._salesHistoryCache = null;
        try {
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
        } catch(e) {
            console.warn('Could not save orders to localStorage quota, using memory cache:', e);
        }
        this.schedulePersistToServer();
        this.emit('orders:changed', orders);
    }

    addOrder(order) {
        const orders = this.getOrders();
        const localNow = this.formatLocalISO();
        if (!order.id) {
            const dateStr = localNow.slice(2, 10).replace(/-/g, '');
            const prefix = `HD${dateStr}-`;
            let maxSuffix = 0;
            orders.forEach(o => {
                if (o.id && o.id.startsWith(prefix)) {
                    const num = parseInt(o.id.slice(prefix.length), 10);
                    if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
                }
            });
            let nextNum = maxSuffix + 1;
            let nextId = `${prefix}${String(nextNum).padStart(3, '0')}`;
            const existingIds = new Set(orders.map(o => o.id));
            while (existingIds.has(nextId)) {
                nextNum++;
                nextId = `${prefix}${String(nextNum).padStart(3, '0')}`;
            }
            order.id = nextId;
        }
        if (!order.createdAt) {
            order.createdAt = localNow;
        }
        if (!order.clientTxId) {
            order.clientTxId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
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

        // Tự động thêm Phiếu Thu vào Sổ Quỹ Thu Chi
        let voucher = null;
        if (order.totalAmount > 0) {
            voucher = this.addVoucher({
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

        if (!this._pendingLocalOrderIds) this._pendingLocalOrderIds = new Set();
        this._pendingLocalOrderIds.add(order.id);
        this._addToPendingQueue({ type: 'order', id: order.id, clientTxId: order.clientTxId, data: order, voucher: voucher, createdAt: Date.now() });
        delete order._isLocalPending;
        orders.unshift(order);
        this._cachedOrders = orders;
        try { localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders)); } catch(e){}

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
        order.updatedAt = this.formatLocalISO();

        // Lưu vào localStorage
        this._cachedOrders = orders;
        try { localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders)); } catch(e){}

        // 1. Nếu phương thức thanh toán thay đổi (ví dụ: chuyển khoản -> tiền mặt)
        // Cập nhật phiếu thu tương ứng trong Sổ Quỹ Thu Chi
        if (updateFields.paymentMethod && updateFields.paymentMethod !== oldPaymentMethod) {
            const vouchers = this.getVouchers();
            const voucher = vouchers.find(v => (v.refId === order.id || v.id === `TT${order.id}`) && !v.isCancelled && v.type === 'receipt');
            if (voucher) {
                voucher.paymentMethod = updateFields.paymentMethod;
                voucher.note = `Thu tiền bán thuốc hóa đơn ${order.id} (${updateFields.paymentMethod === 'cash' ? 'Đổi sang Tiền mặt' : 'Đổi sang Chuyển khoản'})`;
                this.saveVouchers(vouchers);
            }
        }

        // 2. Nếu tên khách hàng hoặc SĐT thay đổi
        if (updateFields.customerName && updateFields.customerName !== oldCustomerName) {
            const vouchers = this.getVouchers();
            const voucher = vouchers.find(v => (v.refId === order.id || v.id === `TT${order.id}`) && !v.isCancelled);
            if (voucher) {
                voucher.targetName = updateFields.customerName || (updateFields.customerPhone ? `Khách ${updateFields.customerPhone}` : 'Khách lẻ trực tiếp');
                this.saveVouchers(vouchers);
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
        order.cancelledAt = this.formatLocalISO();
        order.cancelReason = cancelReason;

        // Hoàn lại số lượng tồn kho (TRỪ ĐI số lượng đã hoàn trả trước đó trong order.returns để tránh cộng 2 lần)
        if (order.items && Array.isArray(order.items)) {
            // Xây dựng bảng theo dõi số lượng đã trả theo lineIndex hoặc theo medicineId + unit
            const lineReturnedMap = {};
            const legacyReturnedTracker = {};

            (order.returns || []).forEach(r => {
                (r.items || []).forEach(ri => {
                    if (typeof ri.lineIndex === 'number' && ri.lineIndex >= 0) {
                        lineReturnedMap[ri.lineIndex] = (lineReturnedMap[ri.lineIndex] || 0) + (parseFloat(ri.quantity) || 0);
                    } else {
                        const key = `${ri.medicineId}_${ri.unit}`;
                        legacyReturnedTracker[key] = (legacyReturnedTracker[key] || 0) + (parseFloat(ri.quantity) || 0);
                    }
                });
            });

            order.items.forEach((item, idx) => {
                const itemQty = parseFloat(item.quantity) || 0;
                // 1. Lấy số lượng đã trả có định danh theo lineIndex
                let alreadyReturnedQty = lineReturnedMap[idx] || 0;

                // 2. Nếu dòng chưa trả hết và có phiếu trả cũ (không có lineIndex), lấy bù từ legacy tracker
                const key = `${item.medicineId}_${item.unit}`;
                const legacyAvail = legacyReturnedTracker[key] || 0;
                if (legacyAvail > 0 && alreadyReturnedQty < itemQty) {
                    const need = Math.max(0, itemQty - alreadyReturnedQty);
                    const take = Math.min(need, legacyAvail);
                    alreadyReturnedQty += take;
                    legacyReturnedTracker[key] = Math.max(0, legacyAvail - take);
                }

                const remainingQty = Math.max(0, Math.round(((parseFloat(item.quantity) || 0) - alreadyReturnedQty) * 1000) / 1000);
                if (remainingQty <= 0) return;

                const med = this.getMedicineById(item.medicineId);
                if (med) {
                    let unitsToReturn = remainingQty;
                    if (item.unit === med.packUnit && med.packRatio > 1) {
                        unitsToReturn = remainingQty * med.packRatio;
                    } else if (item.unit === med.subUnit && med.subRatio > 1) {
                        unitsToReturn = remainingQty * med.subRatio;
                    }
                    this.updateStockUnits(item.medicineId, Math.round(unitsToReturn * 1000) / 1000);
                }
            });
        }

        // Cập nhật thống kê khách hàng khi huỷ toàn bộ đơn hàng
        if (order.customerPhone) {
            // Số tiền chưa hoàn của đơn hàng (đã trừ phần trả hàng trước đó nếu có)
            const netRemainingSpent = Math.max(0, (order.totalAmount || 0) - (order.totalRefunded || 0));
            const pointsToDeduct = Math.max(0, order.pointsEarned || 0);
            
            // Chỉ giảm ordersCount nếu đơn hàng này CHƯA từng bị đánh dấu trả hết toàn bộ (tránh trừ 2 lần)
            const shouldDecrementOrderCount = (order.returnStatus !== 'fully_returned');
            this.deductPointsFromCustomer(order.customerPhone, pointsToDeduct, netRemainingSpent, shouldDecrementOrderCount);
            order.pointsEarned = 0;
        }

        // Hoàn lại điểm tích lũy nếu đơn hàng này từng dùng điểm
        if (order.customerPhone && order.pointsUsed > 0) {
            this.adjustCustomerPoints(order.customerPhone, order.pointsUsed, `Hoàn lại điểm do hủy đơn ${order.id}`);
        }

        // Đánh dấu hủy toàn bộ phiếu thu và phiếu chi hoàn tiền liên quan đến đơn hàng (tránh âm quỹ)
        const vouchers = this.getVouchers();
        const returnIds = (order.returns || []).map(r => r.id);
        let voucherChanged = false;
        vouchers.forEach(v => {
            const isRelated = v.refId === orderId ||
                              returnIds.includes(v.refId) ||
                              (v.refId && v.refId.startsWith('RETURN_') && returnIds.some(rid => v.refId.includes(rid)));
            if (isRelated && !v.isCancelled) {
                v.isCancelled = true;
                v.cancelReason = `Huỷ theo hoá đơn ${orderId}: ${cancelReason}`;
                voucherChanged = true;
            }
        });
        if (voucherChanged) {
            this.saveVouchers(vouchers);
        }

        this._cachedOrders = orders;
        try { localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders)); } catch(e){}

        // Xóa hoàn toàn khỏi danh sách chờ cục bộ và hàng đợi để không bị phát lại đơn cũ (Issue 1)
        if (this._pendingLocalOrderIds) this._pendingLocalOrderIds.delete(orderId);
        this._removeFromPendingQueue(orderId, order.clientTxId);

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
    returnOrderItems(orderId, returnedItems, returnReason = 'Khách trả hàng', refundMethod = 'cash', customReturnId = null) {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === orderId);
        if (!order || order.isCancelled) return null;

        if (!Array.isArray(returnedItems) || returnedItems.length === 0) return null;

        // Tính tỷ lệ chiết khấu thực tế của hoá đơn (bao gồm cả discount và pointsDiscount)
        const orderSubTotal = order.subTotal || (order.items || []).reduce((sum, it) => sum + ((it.quantity || 0) * (it.price || 0)), 0);
        const orderDiscount = (order.discount || 0) + (order.pointsDiscount || 0);
        const discountRatio = (orderSubTotal > 0 && orderDiscount > 0) ? Math.min(1, orderDiscount / orderSubTotal) : 0;

        // Bảng theo dõi số lượng đã trả trước đó: phân biệt lineIndex và phân bổ legacy tracker
        const lineReturnedMap = {};
        const legacyReturnedTracker = {};

        (order.returns || []).forEach(r => {
            (r.items || []).forEach(ri => {
                if (typeof ri.lineIndex === 'number' && ri.lineIndex >= 0) {
                    lineReturnedMap[ri.lineIndex] = (lineReturnedMap[ri.lineIndex] || 0) + (parseFloat(ri.quantity) || 0);
                } else {
                    const key = `${ri.medicineId || ri.medicineCode}_${ri.unit}`;
                    legacyReturnedTracker[key] = (legacyReturnedTracker[key] || 0) + (parseFloat(ri.quantity) || 0);
                }
            });
        });

        // Bảng theo dõi số lượng còn lại có thể trả của từng dòng hàng gốc trong order.items
        const lineRemaining = (order.items || []).map((it, idx) => {
            const itemQty = parseFloat(it.quantity) || 0;
            let alreadyReturned = lineReturnedMap[idx] || 0;

            const key = `${it.medicineId || it.medicineCode}_${it.unit}`;
            const legacyAvail = legacyReturnedTracker[key] || 0;
            if (legacyAvail > 0 && alreadyReturned < itemQty) {
                const need = Math.max(0, itemQty - alreadyReturned);
                const take = Math.min(need, legacyAvail);
                alreadyReturned += take;
                legacyReturnedTracker[key] = Math.max(0, legacyAvail - take);
            }

            return {
                origItem: it,
                lineIndex: idx,
                remainingQty: Math.max(0, Math.round((itemQty - alreadyReturned) * 1000) / 1000)
            };
        });

        // GIAI ĐOẠN 1: Kiểm tra tính hợp lệ và tính toán số tiền hoàn (CHƯA ĐỔI TỒN KHO)
        const validItems = [];
        let totalRefund = 0;
        let totalReturnCost = 0;

        returnedItems.forEach(item => {
            const requestedQty = parseFloat(item.quantity) || 0;
            if (requestedQty <= 0) return;

            // Tìm dòng hàng gốc phù hợp: ưu tiên theo lineIndex, nếu không có thì tìm dòng cùng thuốc còn số lượng có thể trả
            let targetLine = null;
            if (typeof item.lineIndex === 'number' && lineRemaining[item.lineIndex] && lineRemaining[item.lineIndex].remainingQty > 0) {
                targetLine = lineRemaining[item.lineIndex];
            } else {
                targetLine = lineRemaining.find(l => 
                    (l.origItem.medicineId === item.medicineId || l.origItem.medicineCode === item.medicineId) && 
                    l.origItem.unit === item.unit && 
                    l.remainingQty > 0
                );
            }
            if (!targetLine) return;

            const qtyToReturn = Math.round(Math.min(requestedQty, targetLine.remainingQty) * 1000) / 1000;
            if (qtyToReturn <= 0) return;

            // Giảm trừ trực tiếp số lượng còn lại của dòng này để các item tiếp theo không bị tính trùng
            targetLine.remainingQty = Math.max(0, Math.round((targetLine.remainingQty - qtyToReturn) * 1000) / 1000);

            const origItem = targetLine.origItem;
            const linePrice = parseFloat(item.price) || (parseFloat(origItem.price) || 0);
            const listLine = qtyToReturn * linePrice;
            const lineRefund = Math.round(listLine * (1 - discountRatio));
            totalRefund += lineRefund;

            const med = this.getMedicineById(item.medicineId) || this.getMedicineById(origItem.medicineId);
            let unitsToReturn = qtyToReturn;
            if (med) {
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    unitsToReturn = qtyToReturn * med.packRatio;
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    unitsToReturn = qtyToReturn * med.subRatio;
                }
            }
            unitsToReturn = Math.round(unitsToReturn * 1000) / 1000;

            // Xử lý giá vốn lúc bán: chấp nhận cả giá vốn = 0 hợp lệ (hàng khuyến mại / tặng)
            let unitCost = null;
            if (typeof item.costPrice === 'number' && !isNaN(item.costPrice)) {
                unitCost = item.costPrice;
            } else if (origItem && typeof origItem.costPrice === 'number' && !isNaN(origItem.costPrice)) {
                unitCost = origItem.costPrice;
            } else if (med) {
                unitCost = this.getMedicineUnitCost(med, item.unit);
            } else {
                unitCost = 0;
            }
            totalReturnCost += qtyToReturn * unitCost;

            validItems.push({
                lineIndex: targetLine.lineIndex,
                medicineId: item.medicineId || origItem.medicineId,
                medicineName: item.medicineName || origItem.medicineName,
                unit: item.unit,
                quantity: qtyToReturn,
                price: linePrice,
                costPrice: unitCost,
                unitsToReturn: unitsToReturn,
                _calculatedRefund: lineRefund
            });
        });

        if (validItems.length === 0) return null;

        // Không bao giờ hoàn vượt quá số tiền thực thu còn lại của đơn hàng
        const maxRefundAllowed = Math.max(0, (order.totalAmount || 0) - (order.totalRefunded || 0));
        let finalRefundTotal = totalRefund;
        let scale = 1;
        if (totalRefund > maxRefundAllowed) {
            finalRefundTotal = maxRefundAllowed;
            scale = totalRefund > 0 ? (maxRefundAllowed / totalRefund) : 0;
        }

        // Nếu số tiền hoàn <= 0 thì hủy bỏ ngay, TUYỆT ĐỐI không thay đổi kho
        if (finalRefundTotal <= 0) return null;

        // GIAI ĐOẠN 2: Đã kiểm tra hợp lệ toàn bộ, thực hiện thay đổi tồn kho và ghi nhận phiếu trả
        validItems.forEach(it => {
            if (it.unitsToReturn > 0) {
                this.updateStockUnits(it.medicineId, it.unitsToReturn);
            }
        });

        // Tạo mã phiếu trả hàng duy nhất
        if (!order.returns) order.returns = [];
        let returnId = customReturnId;
        if (!returnId) {
            const dateStr = this.formatLocalISO().slice(2, 10).replace(/-/g, '');
            let retSuffix = 1;
            returnId = `TH${dateStr}-${String(retSuffix).padStart(3, '0')}`;
            const existingReturnIds = new Set();
            orders.forEach(o => (o.returns || []).forEach(r => { if (r && r.id) existingReturnIds.add(r.id); }));
            while (existingReturnIds.has(returnId)) {
                retSuffix++;
                returnId = `TH${dateStr}-${String(retSuffix).padStart(3, '0')}`;
            }
        }

        let allocatedSum = 0;
        const mappedItems = validItems.map((i, idx) => {
            let lineRefund = Math.round(i._calculatedRefund * scale);
            if (idx === validItems.length - 1) {
                lineRefund = Math.max(0, finalRefundTotal - allocatedSum);
            } else {
                allocatedSum += lineRefund;
            }
            return {
                lineIndex: i.lineIndex,
                medicineId: i.medicineId,
                medicineName: i.medicineName,
                unit: i.unit,
                quantity: i.quantity,
                price: i.price,
                costPrice: i.costPrice,
                refundAmount: lineRefund
            };
        });

        const clientTxId = 'tx_ret_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const returnRecord = {
            id: returnId,
            clientTxId: clientTxId,
            createdAt: this.formatLocalISO(),
            items: mappedItems,
            refundTotal: finalRefundTotal,
            refundMethod: refundMethod, // 'cash' hoặc 'transfer'
            reason: returnReason,
            returnCost: Math.round(totalReturnCost),
            pharmacist: this.getSettings().pharmacist || 'Dược sĩ'
        };
        order.returns.push(returnRecord);
        order.totalRefunded = (order.totalRefunded || 0) + finalRefundTotal;

        // Kiểm tra xem đã trả hết toàn bộ số lượng thuốc trong đơn chưa dựa trên lineRemaining đã trừ dồn
        const allReturned = lineRemaining.every(l => l.remainingQty <= 0);
        order.returnStatus = allReturned ? 'fully_returned' : 'partially_returned';

        // Cập nhật thống kê khách hàng:
        // Tính điểm cần trừ dựa trên tổng tiền còn lại của đơn hàng sau khi hoàn trả (chống lọt điểm khi trả nhiều lần < 100k)
        const isFullReturn = (order.returnStatus === 'fully_returned');
        const netOrderAmount = isFullReturn ? 0 : Math.max(0, (order.totalAmount || 0) - (order.totalRefunded || 0));
        const targetRemainingPoints = this.calculatePoints(netOrderAmount);
        const pointsToDeduct = Math.max(0, (order.pointsEarned || 0) - targetRemainingPoints);

        if (order.customerPhone) {
            this.deductPointsFromCustomer(order.customerPhone, pointsToDeduct, finalRefundTotal, isFullReturn);
            order.pointsEarned = Math.max(0, (order.pointsEarned || 0) - pointsToDeduct);
        }

        // Tự động thêm Phiếu Chi (Hoàn tiền trả hàng) vào Sổ Quỹ Thu Chi
        let refundVoucher = null;
        if (finalRefundTotal > 0) {
            const vouchers = this.getVouchers();
            const existingRefundVoucher = vouchers.find(v => 
                (v.returnId && v.returnId === returnId) || 
                v.refId === `RETURN_${returnId}` || 
                (v.refId === order.id && v.returnId === returnId)
            );

            if (existingRefundVoucher) {
                // Đã có phiếu chi cho lần trả hàng này: cập nhật số tiền và thông tin, không tạo trùng
                existingRefundVoucher.amount = finalRefundTotal;
                existingRefundVoucher.paymentMethod = refundMethod || 'cash';
                existingRefundVoucher.isCancelled = false;
                existingRefundVoucher.returnCost = Math.round(totalReturnCost);
                existingRefundVoucher.returnedItems = returnRecord.items;
                this.saveVouchers(vouchers);
                refundVoucher = existingRefundVoucher;
            } else {
                refundVoucher = this.addVoucher({
                    type: 'payment',
                    paymentMethod: refundMethod || 'cash',
                    category: 'Chi trả lại hàng bán lẻ',
                    targetType: 'customer',
                    targetName: order.customerName || (order.customerPhone ? `Khách ${order.customerPhone}` : 'Khách lẻ trực tiếp'),
                    amount: finalRefundTotal,
                    note: `Chi hoàn tiền trả hàng đơn ${order.id}: ${returnReason || 'Khách đổi trả thuốc'}`,
                    isAccounting: true,
                    refId: order.id,
                    returnCost: Math.round(totalReturnCost),
                    returnedItems: returnRecord.items,
                    returnId: returnId,
                    pharmacist: this.getSettings().pharmacist || 'DS. Nguyễn Thanh Dung',
                    createdAt: this.formatLocalISO()
                });
            }
        }

        // Đưa trả hàng lẻ vào PENDING_QUEUE để đảm bảo tính nguyên tử qua crash/reload (Batch P1: Issue 5)
        if (!this._pendingLocalReturnIds) this._pendingLocalReturnIds = new Set();
        this._pendingLocalReturnIds.add(returnId);
        this._addToPendingQueue({
            type: 'order_return',
            id: returnId,
            orderId: order.id,
            clientTxId: clientTxId,
            data: returnRecord,
            voucher: refundVoucher,
            createdAt: Date.now()
        });

        this._cachedOrders = orders;
        try { localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders)); } catch(e){}
        this.schedulePersistToServer();
        this.emit('orders:changed', orders);
        return { order, returnRecord };
    }

    /**
     * Tạo phiếu trả hàng tổng hợp (Aggregate Customer Return)
     * Cho phép nhận trả hàng tự do từ kho hoặc gom từ nhiều hóa đơn
     * @param {Object} data 
     */
    createAggregateReturn(data) {
        if (!data || !Array.isArray(data.items) || data.items.length === 0) {
            return { success: false, message: 'Danh sách mặt hàng trả lại trống!' };
        }

        const now = data.createdAt ? new Date(data.createdAt) : new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const datePrefix = `TH${String(year).slice(-2)}${month}${day}`;

        // Sinh mã phiếu trả hàng duy nhất
        const existingReturns = (this.getOrders() || []).filter(o => o.id && o.id.startsWith(datePrefix));
        let returnId = data.id;
        if (!returnId) {
            let seqNum = existingReturns.length + 1;
            const existingOrderIds = new Set((this.getOrders() || []).map(o => o.id));
            returnId = `${datePrefix}-${String(seqNum).padStart(3, '0')}_${Date.now().toString(36).slice(-4)}`;
            while (existingOrderIds.has(returnId)) {
                seqNum++;
                returnId = `${datePrefix}-${String(seqNum).padStart(3, '0')}_${Date.now().toString(36).slice(-4)}`;
            }
        }

        let totalRefund = 0;
        let totalReturnCost = 0;

        const processedItems = data.items.map(item => {
            const qty = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.price) || 0;
            const lineTotal = (item.lineTotal !== undefined) ? parseFloat(item.lineTotal) : Math.round(qty * price);
            totalRefund += lineTotal;

            const med = this.getMedicineById(item.medicineId) || (this._medicineMap ? this._medicineMap[item.medicineId] : null);
            let costPrice = 0;
            if (med) {
                costPrice = this.getMedicineUnitCost(med, item.unit);
            }
            if (costPrice <= 0) {
                costPrice = parseFloat(item.costPrice) || 0;
            }
            const lineCost = Math.round(qty * costPrice);
            totalReturnCost += lineCost;

            // 1. Hoàn kho nếu shouldRestock = true
            if (data.shouldRestock !== false && med && qty > 0) {
                let unitsToReturn = qty;
                if (item.unit === med.packUnit && med.packRatio > 1) {
                    unitsToReturn = qty * med.packRatio;
                } else if (item.unit === med.subUnit && med.subRatio > 1) {
                    unitsToReturn = qty * med.subRatio;
                }
                this.updateStockUnits(item.medicineId, unitsToReturn);
            }

            return {
                medicineId: item.medicineId,
                medicineCode: item.medicineCode || (med ? med.barcode || med.id : item.medicineId),
                medicineName: item.medicineName || (med ? med.name : 'Thuốc'),
                unit: item.unit || (med ? med.baseUnit : 'Đơn vị'),
                quantity: qty,
                price: price,
                costPrice: costPrice,
                lineTotal: lineTotal,
                totalCost: lineCost,
                orderId: item.orderId || ''
            };
        });

        // 2. Tạo Phiếu Chi trong Sổ Quỹ nếu shouldCreateVoucher = true
        let voucher = null;
        if (data.shouldCreateVoucher !== false && totalRefund > 0) {
            const voucherId = `TT${returnId}`;
            const targetName = (data.customerName || '').trim() || 'Khách lẻ';
            voucher = this.addVoucher({
                id: voucherId,
                type: 'payment',
                paymentMethod: data.paymentMethod || 'cash',
                category: 'Tiền trả khách',
                targetType: 'customer',
                targetName: targetName,
                person: targetName,
                amount: totalRefund,
                reason: `Phiếu chi Tiền trả khách: ${data.reason || 'Khách trả hàng tổng hợp'}`,
                note: data.note ? `Trả hàng ${returnId}: ${data.note}` : `Phiếu chi hoàn tiền trả hàng ${returnId}`,
                isAccounting: true,
                refId: returnId,
                returnId: returnId,
                returnCost: totalReturnCost,
                returnedItems: processedItems.map(it => ({
                    medicineId: it.medicineId,
                    medicineCode: it.medicineCode,
                    medicineName: it.medicineName,
                    unit: it.unit,
                    quantity: it.quantity,
                    price: it.price,
                    costPrice: it.costPrice,
                    total: it.lineTotal,
                    totalCost: it.totalCost
                })),
                pharmacist: data.pharmacist || this.getSettings().pharmacist || 'DS. Nguyễn Thanh Dung',
                createdAt: this.formatLocalISO(now)
            });
        }

        // 3. Tạo bản ghi Phiếu Trả Hàng trong danh sách orders
        const clientTxId = data.clientTxId || ('tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9));
        const returnOrder = {
            id: returnId,
            clientTxId: clientTxId,
            isReturn: true,
            orderType: 'return',
            createdAt: this.formatLocalISO(now),
            customerId: data.customerId || '',
            customerName: (data.customerName || '').trim() || 'Khách lẻ',
            customerPhone: (data.customerPhone || '').trim(),
            paymentMethod: data.paymentMethod || 'cash',
            items: processedItems,
            subTotal: totalRefund,
            totalAmount: totalRefund,
            totalRefund: totalRefund,
            totalCost: totalReturnCost,
            reason: data.reason || 'Khách trả hàng',
            note: data.note || '',
            pharmacist: data.pharmacist || this.getSettings().pharmacist || 'admin',
            status: 'completed',
            returnStatus: 'aggregate_returned',
            voucherId: voucher ? voucher.id : null,
            shouldRestock: data.shouldRestock !== false,
            shouldCreateVoucher: data.shouldCreateVoucher !== false
        };

        if (!this._pendingLocalOrderIds) this._pendingLocalOrderIds = new Set();
        this._pendingLocalOrderIds.add(returnId);
        this._addToPendingQueue({ type: 'order', id: returnId, clientTxId: clientTxId, data: returnOrder, voucher: voucher, createdAt: Date.now() });

        const orders = this.getOrders();
        orders.unshift(returnOrder);
        this._cachedOrders = orders;
        try { localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders)); } catch(e){}
        this.schedulePersistToServer();

        // 4. Ghi Audit Log
        if (typeof this.logAction === 'function') {
            const currentStaff = (window.AuthModule ? AuthModule.getCurrentUser()?.fullName : null) || 'ADMIN';
            this.logAction(
                'Trả hàng',
                `Tạo phiếu trả hàng tổng hợp: ${returnId}, cho khách: ${returnOrder.customerName}, với giá trị hoàn: ${AppUtils.formatVND(totalRefund)}`,
                currentStaff,
                'create'
            );
        }

        this.emit('orders:changed', orders);
        return { success: true, returnOrder, voucher };
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

    // --- LỊCH SỬ THAO TÁC TOÀN DIỆN (Audit Log - KiotViet Style) ---
    getAuditLog() {
        if (this._cachedAuditLog && Array.isArray(this._cachedAuditLog) && this._cachedAuditLog.length > 0) {
            return this._cachedAuditLog;
        }
        const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOG);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this._cachedAuditLog = parsed;
                    return parsed;
                }
            } catch(e) {}
        }
        const seeds = this.generateSeedAuditLog();
        this._cachedAuditLog = seeds;
        return seeds;
    }

    saveAuditLog(logs) {
        this._cachedAuditLog = logs;
        try {
            localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(logs));
        } catch(e){}
        this.schedulePersistToServer();
        this.emit('audit_log:changed', logs);
    }

    logAction(feature, details, staff, actionType = 'action') {
        const logs = this.getAuditLog();
        const currentStaff = staff || (window.AuthModule ? AuthModule.getCurrentUser()?.fullName : null) || 'ADMIN';
        const newEntry = {
            id: 'AUDIT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            staff: currentStaff,
            feature: feature,
            timestamp: new Date().toISOString(),
            details: details,
            actionType: actionType
        };
        logs.unshift(newEntry);
        if (logs.length > 500) logs.pop();
        this.saveAuditLog(logs);
        return newEntry;
    }

    generateSeedAuditLog() {
        const logs = [];
        // Lịch sử xuất file & import gần đây của nhà thuốc (trùng khớp ảnh KiotViet)
        logs.push({
            id: 'AUDIT-seed-1',
            staff: 'ADMIN',
            feature: 'Danh mục hàng hóa',
            timestamp: '2026-11-08T15:40:02.000Z',
            details: 'Cập nhật danh mục thuốc KiotViet (5.833 mặt hàng) vào hệ thống',
            actionType: 'import'
        });
        logs.push({
            id: 'AUDIT-seed-2',
            staff: 'ADMIN',
            feature: 'Danh mục hàng hóa',
            timestamp: '2026-11-08T15:33:48.000Z',
            details: 'Xuất file Danh sách hàng hóa (kể cả hàng ngừng kinh doanh)',
            actionType: 'export'
        });
        logs.push({
            id: 'AUDIT-seed-3',
            staff: 'ADMIN',
            feature: 'Danh mục hàng hóa',
            timestamp: '2026-11-08T15:21:21.000Z',
            details: 'Xuất file Danh sách hàng hóa',
            actionType: 'export'
        });
        logs.push({
            id: 'AUDIT-seed-4',
            staff: 'ADMIN',
            feature: 'Danh mục hàng hóa',
            timestamp: '2026-11-08T14:48:52.000Z',
            details: 'Xuất file Danh sách hàng hóa',
            actionType: 'export'
        });
        logs.push({
            id: 'AUDIT-seed-5',
            staff: 'ADMIN',
            feature: 'Sổ quỹ',
            timestamp: '2026-11-08T14:42:54.000Z',
            details: 'Xuất file Danh sách sổ quỹ',
            actionType: 'export'
        });
        logs.push({
            id: 'AUDIT-seed-6',
            staff: 'ADMIN',
            feature: 'Hóa đơn',
            timestamp: '2026-11-08T14:41:48.000Z',
            details: 'Xuất file Chi tiết danh sách hóa đơn',
            actionType: 'export'
        });

        // Tự động sinh lịch sử thao tác từ các hóa đơn thực tế ngày 08/11/2026
        const orders = this.getOrders();
        const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith('2026-11-08')).slice(0, 33);
        todayOrders.forEach(o => {
            const timeStr = o.createdAt;
            const amtStr = Number(o.totalAmount || 0).toLocaleString('vi-VN') + ' đ';
            logs.push({
                id: 'AUDIT-seed-pt-' + o.id,
                staff: o.pharmacist || 'ADMIN',
                feature: 'Phiếu thu',
                timestamp: timeStr,
                details: `Tạo phiếu thu: TTHD${o.id.replace('HD','')}, cho hóa đơn: ${o.id}, với giá trị: ${amtStr}`,
                actionType: 'create'
            });
            logs.push({
                id: 'AUDIT-seed-hd-' + o.id,
                staff: o.pharmacist || 'ADMIN',
                feature: 'Hóa đơn',
                timestamp: timeStr,
                details: `Tạo hóa đơn: ${o.id}, bảng giá: Bảng giá chung, Thuế: Tắt thuế, giá trị: ${amtStr}`,
                actionType: 'create'
            });
        });

        // Sắp xếp giảm dần theo thời gian mới nhất lên trước
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        try { localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(logs)); } catch(e){}
        return logs;
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

    _generateNextCustomerId(customers = this.getCustomers()) {
        const existingIds = new Set(customers.map(c => c.id).filter(Boolean));
        let maxSeq = 0;
        customers.forEach(c => {
            if (c.id && /^KH\d+$/i.test(c.id)) {
                const num = parseInt(c.id.slice(2), 10);
                if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
        });
        let nextNum = maxSeq + 1;
        let candidateId = 'KH' + String(nextNum).padStart(4, '0');
        while (existingIds.has(candidateId)) {
            nextNum++;
            candidateId = 'KH' + String(nextNum).padStart(4, '0');
        }
        return candidateId;
    }

    saveCustomer(cust) {
        const customers = this.getCustomers();
        const normPhone = cust.phone ? this.normalizePhone(cust.phone) : '';
        const now = this.formatLocalISO();

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
            const newId = cust.id || this._generateNextCustomerId(customers);
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

    deleteCustomer(id, phone = null) {
        if (!id) return false;
        let customers = this.getCustomers();
        const initialLen = customers.length;
        if (id === 'Cá nhân') {
            // Bảo vệ danh bạ: Chặn xóa hàng loạt khi ID là "Cá nhân" (dùng chung cho các bản ghi import cũ)
            if (!phone) {
                console.warn('Từ chối xóa khách hàng: Không thể xóa với ID chung "Cá nhân" mà không có số điện thoại xác thực!');
                return false;
            }
            const normPhone = this.normalizePhone(phone);
            customers = customers.filter(c => !(c.id === id && this.normalizePhone(c.phone) === normPhone));
        } else {
            const matches = customers.filter(c => c.id === id);
            if (matches.length > 1 && phone) {
                const normPhone = this.normalizePhone(phone);
                customers = customers.filter(c => !(c.id === id && this.normalizePhone(c.phone) === normPhone));
            } else {
                customers = customers.filter(c => c.id !== id && c.phone !== id);
            }
        }
        if (customers.length !== initialLen) {
            this.saveCustomers(customers);
            return true;
        }
        return false;
    }

    getOrdersByCustomer(phoneOrId, customerName = '', includeReturns = false) {
        const orders = this.getOrders();
        const cust = this.getCustomerById(phoneOrId) || this.getCustomerByPhone(phoneOrId);
        const targetId = cust ? cust.id : (phoneOrId && phoneOrId.startsWith('KH') ? phoneOrId : '');
        const targetPhone = cust ? cust.phone : phoneOrId;
        const targetNorm = targetPhone ? this.normalizePhone(targetPhone) : '';
        const targetName = (cust ? cust.name : customerName || '').trim().toLowerCase();

        return orders.filter(o => {
            if (!includeReturns && o.isReturn) return false;
            if (targetId && o.customerId && o.customerId === targetId) return true;
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
        if (pts >= 50) return { name: 'Kim Cương', badge: 'bg-sky-50 text-sky-700 border border-sky-200/70', icon: '💎' };
        if (pts >= 20) return { name: 'Vàng', badge: 'bg-amber-50 text-amber-700 border border-amber-200/70', icon: '🥇' };
        if (pts >= 5) return { name: 'Bạc', badge: 'bg-slate-100 text-slate-600 border border-slate-200/70', icon: '🥈' };
        return { name: 'Thành Viên', badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200/70', icon: '🌱' };
    }

    getCustomers() {
        if (this._cachedCustomers) return this._cachedCustomers;
        const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
        if (!raw) {
            const seeded = this.seedCustomersFromOrders();
            if (seeded.length > 0) {
                this._cachedCustomers = seeded;
                try { localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(seeded)); } catch(e){}
                return seeded;
            }
            return [];
        }
        try {
            this._cachedCustomers = JSON.parse(raw);
            return this._cachedCustomers;
        } catch(e) {
            return [];
        }
    }

    saveCustomers(customers) {
        this._cachedCustomers = customers;
        try { localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers)); } catch(e){}
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
        const now = this.formatLocalISO();

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
                id: this._generateNextCustomerId(customers),
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

    deductPointsFromCustomer(phone, pointsDeducted, refundAmount = 0, isFullReturn = false) {
        if (!phone) return;
        const customers = this.getCustomers();
        const norm = this.normalizePhone(phone);
        const cust = customers.find(c => this.normalizePhone(c.phone) === norm);
        if (cust) {
            if (pointsDeducted > 0) {
                cust.points = Math.max(0, (cust.points || 0) - pointsDeducted);
            }
            if (refundAmount > 0) {
                cust.totalSpent = Math.max(0, (cust.totalSpent || 0) - refundAmount);
            }
            if (isFullReturn) {
                cust.ordersCount = Math.max(0, (cust.ordersCount || 1) - 1);
            }
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
            if (!o.customerPhone || o.isCancelled || o.isReturn) return;
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
                    createdAt: o.createdAt || this.formatLocalISO(),
                    lastVisit: o.createdAt || this.formatLocalISO(),
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

    // --- Đồng bộ lượt mua & chi tiêu của Khách Hàng từ Hóa Đơn ---
    syncCustomerOrdersStats() {
        const customers = this.getCustomers();
        const orders = this.getOrders();
        if (!customers || customers.length === 0 || !orders || orders.length === 0) return;

        const custById = {};
        const custByPhone = {};
        const custByName = {};

        customers.forEach(c => {
            if (c.id) custById[c.id] = c;
            if (c.phone) {
                const norm = this.normalizePhone(c.phone);
                if (norm) custByPhone[norm] = c;
            }
            if (c.name) {
                const normName = c.name.trim().toLowerCase();
                if (normName && normName !== 'khách lẻ' && normName !== 'khách vãng lai' && normName !== 'khách hàng') {
                    custByName[normName] = c;
                }
            }
        });

        const custStats = new Map();
        customers.forEach(c => {
            custStats.set(c, { count: 0, spent: 0, lastVisit: '' });
        });

        orders.forEach(o => {
            if (o.isCancelled) return;
            let matched = null;
            if (o.customerId && custById[o.customerId]) {
                matched = custById[o.customerId];
            } else if (o.customerPhone) {
                const norm = this.normalizePhone(o.customerPhone);
                if (norm && custByPhone[norm]) {
                    matched = custByPhone[norm];
                }
            } else if (o.customerName) {
                const normName = o.customerName.trim().toLowerCase();
                if (normName && custByName[normName]) {
                    matched = custByName[normName];
                }
            }

            if (matched) {
                const st = custStats.get(matched);
                if (st) {
                    if (o.isReturn) {
                        st.spent -= (Number(o.totalAmount) || 0);
                    } else {
                        st.count++;
                        const netSpent = Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.totalRefunded) || 0));
                        st.spent += netSpent;
                    }
                    if (!st.lastVisit || (o.createdAt && o.createdAt > st.lastVisit)) {
                        st.lastVisit = o.createdAt;
                    }
                }
            }
        });

        let changed = false;
        customers.forEach(c => {
            const st = custStats.get(c);
            const realCount = st ? st.count : 0;
            if (c.ordersCount !== realCount) {
                c.ordersCount = realCount;
                changed = true;
            }
            const finalSpent = Math.max(0, Math.round(st ? st.spent : 0));
            if (c.totalSpent !== finalSpent) {
                c.totalSpent = finalSpent;
                changed = true;
            }
            if (st && st.lastVisit && (!c.lastVisit || st.lastVisit > c.lastVisit)) {
                c.lastVisit = st.lastVisit;
                changed = true;
            }
        });

        if (changed) {
            this.saveCustomers(customers);
        }
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
        if (this._cachedVouchers) return this._cachedVouchers;
        const raw = localStorage.getItem(STORAGE_KEYS.VOUCHERS);
        if (!raw) {
            if (typeof SampleData !== 'undefined' && SampleData.vouchers) {
                this._cachedVouchers = SampleData.vouchers;
                try { localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(SampleData.vouchers)); } catch(e){}
                return SampleData.vouchers;
            }
            return [];
        }
        try {
            this._cachedVouchers = JSON.parse(raw);
            return this._cachedVouchers;
        } catch(e) {
            return [];
        }
    }

    saveVouchers(vouchers) {
        this._cachedVouchers = vouchers;
        try {
            localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers));
        } catch(e) {
            console.warn('Could not save full vouchers to localStorage quota, keeping recent slice in storage:', e);
            if (Array.isArray(vouchers) && vouchers.length > 100) {
                try {
                    localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers.slice(0, 100)));
                } catch(e2) {}
            }
        }
        this.schedulePersistToServer();
        this.emit('vouchers:changed', vouchers);
    }

    addVoucher(voucher, shouldSchedule = true) {
        const vouchers = this.getVouchers();
        const localNow = this.formatLocalISO();
        if (!voucher.id) {
            const typePre = voucher.type === 'receipt' ? 'PT' : 'PC';
            const dateStr = localNow.slice(2, 10).replace(/-/g, '');
            const prefix = `${typePre}${dateStr}-`;
            let maxSuffix = 0;
            vouchers.forEach(v => {
                if (v.id && v.id.startsWith(prefix)) {
                    const num = parseInt(v.id.slice(prefix.length), 10);
                    if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
                }
            });
            let nextNum = maxSuffix + 1;
            let nextId = `${prefix}${String(nextNum).padStart(3, '0')}`;
            const existingIds = new Set(vouchers.map(v => v.id));
            while (existingIds.has(nextId)) {
                nextNum++;
                nextId = `${prefix}${String(nextNum).padStart(3, '0')}`;
            }
            voucher.id = nextId;
        }
        if (!voucher.createdAt) {
            voucher.createdAt = localNow;
        }
        voucher.amount = Math.abs(Number(voucher.amount) || 0);
        vouchers.unshift(voucher);
        this._cachedVouchers = vouchers;
        try { localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers)); } catch(e){}
        if (shouldSchedule) {
            this.schedulePersistToServer();
        }
        this.emit('vouchers:changed', vouchers);
        return voucher;
    }

    updateVoucher(voucherId, updatedFields, refId = null) {
        const vouchers = this.getVouchers();
        const index = vouchers.findIndex(v => v.id === voucherId && (!refId || v.refId === refId));
        if (index === -1) return null;

        const oldVoucher = vouchers[index];
        const updated = Object.assign({}, oldVoucher, updatedFields);
        if (typeof updated.amount !== 'undefined') {
            updated.amount = Math.abs(Number(updated.amount) || 0);
        }
        updated.updatedAt = this.formatLocalISO();
        vouchers[index] = updated;

        this.saveVouchers(vouchers);
        return updated;
    }

    deleteVoucher(voucherId) {
        let vouchers = this.getVouchers();
        const target = vouchers.find(v => v.id === voucherId);
        if (target && target.refId) {
            const refId = String(target.refId);
            // Đánh dấu đơn hàng hoặc phiếu nhập liên kết là đã xóa voucher để sync không tự tạo lại
            if (target.type === 'receipt' && refId.startsWith('HD')) {
                const orders = this.getOrders();
                const ord = orders.find(o => o.id === refId);
                if (ord) {
                    ord.voucherDeleted = true;
                    this.saveOrders(orders);
                }
            } else if (target.type === 'payment' && (refId.startsWith('HD') || refId.startsWith('RETURN_') || target.id.startsWith('TTTH'))) {
                const orders = this.getOrders();
                orders.forEach(o => {
                    if (o.id === refId) o.refundVoucherDeleted = true;
                    (o.returns || []).forEach(r => {
                        if (r.id === refId || `RETURN_${r.id}` === refId || `TT${r.id}` === target.id) {
                            r.voucherDeleted = true;
                            o.refundVoucherDeleted = true;
                        }
                    });
                });
                this.saveOrders(orders);
            } else if (target.type === 'payment' && refId.startsWith('PN')) {
                const stockins = this.getStockInOrders();
                const st = stockins.find(s => s.id === refId);
                if (st) {
                    st.voucherDeleted = true;
                    this.saveStockInOrders(stockins);
                }
            }
        }
        const targetIdx = vouchers.findIndex(v => v.id === voucherId && (!target || v.refId === target.refId));
        if (targetIdx !== -1) {
            vouchers.splice(targetIdx, 1);
        } else {
            vouchers = vouchers.filter(v => v.id !== voucherId);
        }
        this.saveVouchers(vouchers);
    }

    // --- LỊCH SỬ NHẬP VÀ BÁN CỦA TỪNG LOẠI THUỐC ---
    getMedicineStockInHistory(medicineId) {
        if (!medicineId) return [];
        if (!this._stockInHistoryCache) {
            this._stockInHistoryCache = new Map();
        }
        if (this._stockInHistoryCache.has(medicineId)) {
            return this._stockInHistoryCache.get(medicineId);
        }

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
        history.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        this._stockInHistoryCache.set(medicineId, history);
        return history;
    }

    getMedicineSalesHistory(medicineId) {
        if (!medicineId) return [];
        if (!this._salesHistoryCache) {
            this._salesHistoryCache = new Map();
        }
        if (this._salesHistoryCache.has(medicineId)) {
            return this._salesHistoryCache.get(medicineId);
        }

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
        history.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        this._salesHistoryCache.set(medicineId, history);
        return history;
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
            const amt = Math.abs(Number(v.amount) || 0);
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
            const amt = Math.abs(Number(v.amount) || 0);
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
    // Giá vốn của danh sách hàng trả (dùng cho báo cáo)
    _calcReturnCost(returnItems) {
        let total = 0;
        (returnItems || []).forEach(i => {
            const med = this.getMedicineById(i.medicineId);
            let unitCost = (parseFloat(i.costPrice) > 0) ? parseFloat(i.costPrice) : 0;
            if (unitCost <= 0 && med) {
                unitCost = this.getMedicineUnitCost(med, i.unit);
            }
            total += (parseFloat(i.quantity) || 0) * unitCost;
        });
        return Math.round(total);
    }

    // Có phải phiếu chi hoàn tiền cho khách trả hàng không?
    _isRefundPaymentVoucher(v) {
        if (!v || v.isCancelled) return false;
        if (v.type !== 'payment') return false;
        if (v.id && String(v.id).startsWith('TTTH')) return true;
        const cat = v.category || '';
        if (cat.includes('trả khách') || cat.includes('trả lại hàng')) return true;
        const note = v.note || '';
        return note.includes('hoàn tiền trả hàng') || note.includes('Chi hoàn tiền');
    }

    syncOrdersAndStockInsToVouchers() {
        if (this.isServerMode && !this._loadedFromServer) return false;

        const vouchers = this.getVouchers();
        const existingRefIds = new Set(vouchers.map(v => v.refId).filter(Boolean));
        const existingVoucherIds = new Set(vouchers.map(v => v.id).filter(Boolean));
        let changed = false;

        const generateVoucherId = (prefix) => {
            let maxSuffix = 0;
            vouchers.forEach(v => {
                if (v.id && v.id.startsWith(prefix)) {
                    const num = parseInt(v.id.slice(prefix.length), 10);
                    if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
                }
            });
            let nextSeq = maxSuffix + 1;
            let candidateId = `${prefix}${String(nextSeq).padStart(3, '0')}`;
            while (existingVoucherIds.has(candidateId)) {
                nextSeq++;
                candidateId = `${prefix}${String(nextSeq).padStart(3, '0')}`;
            }
            existingVoucherIds.add(candidateId);
            return candidateId;
        };

        // Đếm số phiếu chi hoàn tiền đã có cho từng ĐƠN (không phụ thuộc tên category/ID)
        const ordersForRefundCount = this.getOrders();
        const returnIdToOrderId = new Map();
        ordersForRefundCount.forEach(o => {
            (o.returns || []).forEach(r => { if (r && r.id) returnIdToOrderId.set(r.id, o.id); });
        });

        const refundVoucherCountByOrder = new Map();
        vouchers.forEach(v => {
            if (!this._isRefundPaymentVoucher(v)) return;
            const refId = String(v.refId || '');
            if (!refId) return;
            const orderId = refId.startsWith('RETURN_')
                ? (returnIdToOrderId.get(refId.slice('RETURN_'.length)) || null)
                : refId;
            if (!orderId) return;
            refundVoucherCountByOrder.set(orderId, (refundVoucherCountByOrder.get(orderId) || 0) + 1);
        });

        // 1. Đồng bộ các hóa đơn bán hàng vào Phiếu Thu (bỏ qua đơn trả hàng và đơn đã xóa voucher)
        const orders = this.getOrders();
        orders.forEach(o => {
            if (o.totalAmount > 0 && !o.isReturn && !o.voucherDeleted && !existingRefIds.has(o.id)) {
                const dateStr = o.createdAt || this.formatLocalISO();
                const dCompact = dateStr.slice(2, 10).replace(/-/g, '');
                const vId = generateVoucherId('PT' + dCompact + '-');
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
                // Số phiếu chi hoàn tiền đã tồn tại cho đơn này (do returnOrderItems tạo, refId = order.id)
                let alreadyCovered = refundVoucherCountByOrder.get(o.id) || 0;

                o.returns.forEach(r => {
                    if (!(r.refundTotal > 0)) return;
                    if (o.refundVoucherDeleted || r.voucherDeleted) return; // Đã chủ động xóa phiếu hoàn tiền, không tự tạo lại
                    const returnRefId = `RETURN_${r.id || o.id}`;
                    if (existingRefIds.has(returnRefId)) return; // đã có phiếu kiểu cũ
                    if (alreadyCovered > 0) {
                        // Lần trả này đã được returnOrderItems tạo phiếu chi -> KHÔNG tạo thêm (tránh chi 2 lần)
                        alreadyCovered--;
                        return;
                    }

                    const rDate = r.createdAt || o.createdAt || this.formatLocalISO();
                    const vId = generateVoucherId('PC' + rDate.slice(2, 10).replace(/-/g, '') + '-');
                    const returnCost = (typeof r.returnCost === 'number') ? r.returnCost : this._calcReturnCost(r.items);
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
                        returnCost: returnCost,
                        returnedItems: r.items || [],
                        returnId: r.id || '',
                        pharmacist: r.pharmacist || 'DS. Nguyễn Thanh Dung',
                        createdAt: rDate
                    });
                    existingRefIds.add(returnRefId);
                    changed = true;
                });
            }
        });

        // 2. Đồng bộ các phiếu nhập kho vào Phiếu Chi (bỏ qua phiếu nhập đã hủy hoặc đã xóa voucher) (Batch 10: Issue 4)
        const stockIns = this.getStockInOrders();
        stockIns.forEach(s => {
            if (!s.isCancelled && s.totalAmount > 0 && !s.voucherDeleted && !existingRefIds.has(s.id)) {
                const dateStr = s.createdAt || this.formatLocalISO();
                const dCompact = dateStr.slice(2, 10).replace(/-/g, '');
                const vId = generateVoucherId('PC' + dCompact + '-');
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
        return true;
    }
}

// Khởi tạo Singleton Store
window.Store = new DataStore();

// --- Utility Helpers ---
window.AppUtils = {
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    formatVND(amount) {
        if (isNaN(amount) || amount === null || amount === undefined) return '0 đ';
        const num = Number(amount);
        return num.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' đ';
    },

    formatNumber(val) {
        if (isNaN(val) || val === null || val === undefined) return '0';
        const num = Number(val);
        return num.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
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
