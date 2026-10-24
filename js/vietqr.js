/**
 * MedicaPharmacy - VietQR Module
 * Tích hợp chuẩn mã QR thanh toán ngân hàng Napas 247 / VietQR
 */

const VIETNAMESE_BANKS = [
    { code: 'MB', name: 'MBBank - Ngân hàng Quân Đội', bin: '970422', shortName: 'MBBank' },
    { code: 'VCB', name: 'Vietcombank - Ngân hàng Ngoại Thương', bin: '970436', shortName: 'Vietcombank' },
    { code: 'TCB', name: 'Techcombank - Ngân hàng Kỹ Thương', bin: '970407', shortName: 'Techcombank' },
    { code: 'BIDV', name: 'BIDV - Ngân hàng Đầu tư và Phát triển', bin: '970418', shortName: 'BIDV' },
    { code: 'ICB', name: 'VietinBank - Ngân hàng Công Thương', bin: '970415', shortName: 'VietinBank' },
    { code: 'VPB', name: 'VPBank - Ngân hàng Việt Nam Thịnh Vượng', bin: '970432', shortName: 'VPBank' },
    { code: 'ACB', name: 'ACB - Ngân hàng Á Châu', bin: '970416', shortName: 'ACB' },
    { code: 'TPB', name: 'TPBank - Ngân hàng Tiên Phong', bin: '970458', shortName: 'TPBank' },
    { code: 'VBA', name: 'Agribank - Ngân hàng Nông Nghiệp', bin: '970405', shortName: 'Agribank' },
    { code: 'STB', name: 'Sacombank - Ngân hàng Sài Gòn Thương Tín', bin: '970403', shortName: 'Sacombank' },
    { code: 'HDB', name: 'HDBank - Ngân hàng Phát triển TP.HCM', bin: '970437', shortName: 'HDBank' },
    { code: 'VIB', name: 'VIB - Ngân hàng Quốc Tế', bin: '970441', shortName: 'VIB' },
    { code: 'SHB', name: 'SHB - Ngân hàng Sài Gòn - Hà Nội', bin: '970443', shortName: 'SHB' },
    { code: 'MSB', name: 'MSB - Ngân hàng Hàng Hải', bin: '970426', shortName: 'MSB' },
    { code: 'OCB', name: 'OCB - Ngân hàng Phương Đông', bin: '970448', shortName: 'OCB' },
    { code: 'LPB', name: 'LPBank - Ngân hàng Lộc Phát', bin: '970449', shortName: 'LPBank' },
    { code: 'SEAB', name: 'SeABank - Ngân hàng Đông Nam Á', bin: '970440', shortName: 'SeABank' },
    { code: 'NAB', name: 'Nam A Bank - Ngân hàng Nam Á', bin: '970428', shortName: 'Nam A Bank' },
    { code: 'ABB', name: 'ABBank - Ngân hàng An Bình', bin: '970425', shortName: 'ABBank' },
    { code: 'BAB', name: 'Bac A Bank - Ngân hàng Bắc Á', bin: '970409', shortName: 'Bac A Bank' },
    { code: 'BVB', name: 'BVBank - Ngân hàng Bản Việt', bin: '970454', shortName: 'BVBank' },
    { code: 'VAB', name: 'VietABank - Ngân hàng Việt Á', bin: '970427', shortName: 'VietABank' }
];

const VietQRService = {
    getBanks() {
        return VIETNAMESE_BANKS;
    },

    getBankByBin(bin) {
        return VIETNAMESE_BANKS.find(b => b.bin === bin || b.code === bin);
    },

    /**
     * Tạo URL ảnh VietQR trực tiếp từ VietQR QuickLink API
     * @param {Object} params
     * @param {string} params.bankBin - Mã BIN ngân hàng (ví dụ 970422 cho MB)
     * @param {string} params.accountNo - Số tài khoản
     * @param {string} params.accountName - Tên chủ tài khoản
     * @param {number} params.amount - Số tiền thanh toán
     * @param {string} params.description - Nội dung chuyển khoản (VD: MEDICA HD123)
     * @param {string} [params.template='compact2'] - Mẫu hiển thị (compact2, qr_only, print)
     * @returns {string} Image URL
     */
    generateQuickLinkUrl({ bankBin, accountNo, accountName, amount, description, template = 'compact2' }) {
        if (!bankBin || !accountNo) return '';
        const cleanAccountNo = accountNo.trim();
        const cleanDesc = encodeURIComponent((description || '').trim());
        const cleanName = encodeURIComponent((accountName || '').trim());
        const roundedAmount = Math.round(amount || 0);

        return `https://img.vietqr.io/image/${bankBin}-${cleanAccountNo}-${template}.png?amount=${roundedAmount}&addInfo=${cleanDesc}&accountName=${cleanName}`;
    },

    /**
     * Tạo chuỗi EMVCo Napas 247 chuẩn quốc tế để tạo QR offline bằng qrcodejs
     */
    generateEMVCoPayload({ bankBin, accountNo, amount, description }) {
        if (!bankBin || !accountNo) return '';

        // Hàm format TLV (Tag-Length-Value)
        function tlv(tag, val) {
            val = String(val || '');
            const len = val.length < 10 ? '0' + val.length : String(val.length);
            return tag + len + val;
        }

        // Sub-tags cho Merchant Account Information (Tag 38)
        // 00: GUID "A000000727"
        // 01: Service Code "QRIBFTTA"
        // 02: Consumer Account Information (Bank BIN + Account Number)
        const sub00 = tlv('00', 'A000000727');
        const bankTag = tlv('00', bankBin);
        const accTag = tlv('01', accountNo.trim());
        const sub01 = tlv('01', bankTag + accTag);
        const sub02 = tlv('02', 'QRIBFTTA');
        const tag38 = tlv('38', sub00 + sub01 + sub02);

        let payload = '';
        payload += tlv('00', '01'); // Payload Format Indicator
        payload += tlv('01', '12'); // Point of Initiation: 12 (Dynamic QR with amount)
        payload += tag38;           // Merchant Account
        payload += tlv('53', '704'); // Transaction Currency: 704 (VND)
        
        if (amount && amount > 0) {
            payload += tlv('54', Math.round(amount).toString());
        }

        payload += tlv('58', 'VN'); // Country Code

        if (description) {
            const addInfo = tlv('08', description.substring(0, 25));
            payload += tlv('62', addInfo);
        }

        // Tag 63: Checksum CRC16-CCITT
        payload += '6304';
        const crc = this.computeCRC16(payload);
        return payload + crc;
    },

    computeCRC16(str) {
        let crc = 0xFFFF;
        for (let i = 0; i < str.length; i++) {
            let c = str.charCodeAt(i);
            crc ^= (c << 8);
            for (let j = 0; j < 8; j++) {
                if ((crc & 0x8000) !== 0) {
                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    crc = (crc << 1) & 0xFFFF;
                }
            }
        }
        let hex = (crc & 0xFFFF).toString(16).toUpperCase();
        while (hex.length < 4) hex = '0' + hex;
        return hex;
    },

    /**
     * Render mã QR vào một container DOM (hỗ trợ cả online lẫn offline fallback)
     * @param {HTMLElement} containerEl
     * @param {Object} options
     */
    renderToElement(containerEl, options) {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        const { bankBin, accountNo, accountName, amount, description } = options;
        if (!bankBin || !accountNo) {
            containerEl.innerHTML = `
                <div class="text-center p-4 text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
                    <p class="font-medium text-sm">Chưa cài đặt tài khoản ngân hàng!</p>
                    <p class="text-xs text-slate-500 mt-1">Vui lòng vào tab Cài Đặt để cấu hình tài khoản nhận chuyển khoản.</p>
                </div>
            `;
            return;
        }

        // Tạo container wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center';

        const quickLinkUrl = this.generateQuickLinkUrl({
            bankBin,
            accountNo,
            accountName,
            amount,
            description,
            template: 'compact2'
        });

        // Tạo thẻ img trực tuyến trước, kèm fallback offline bằng QRCode canvas
        const img = document.createElement('img');
        img.src = quickLinkUrl;
        img.alt = 'VietQR Code';
        img.className = 'max-w-full w-64 h-auto rounded-xl shadow-md border border-slate-200 transition-all duration-300';
        img.loading = 'eager';

        // Xử lý khi lỗi mạng hoặc offline
        img.onerror = () => {
            console.warn('Không tải được ảnh VietQR trực tuyến, chuyển sang sinh mã QR nội bộ offline...');
            wrapper.innerHTML = '';
            
            const qrBox = document.createElement('div');
            qrBox.id = 'offline-qr-canvas-' + Date.now();
            qrBox.className = 'p-3 bg-white rounded-xl shadow-md border border-slate-200 flex items-center justify-center';
            wrapper.appendChild(qrBox);

            const payload = this.generateEMVCoPayload({ bankBin, accountNo, amount, description });

            if (typeof QRCode !== 'undefined') {
                new QRCode(qrBox, {
                    text: payload,
                    width: 220,
                    height: 220,
                    colorDark: '#0f172a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                qrBox.innerHTML = `
                    <div class="p-4 text-center text-sm text-slate-600">
                        <p class="font-bold text-emerald-700">${accountNo}</p>
                        <p class="text-xs">${accountName}</p>
                    </div>
                `;
            }

            const note = document.createElement('p');
            note.className = 'text-xs text-slate-500 mt-2 text-center font-medium';
            note.innerText = '⚡ Chế độ quét QR Offline (Napas 247)';
            wrapper.appendChild(note);
        };

        wrapper.appendChild(img);
        containerEl.appendChild(wrapper);
    }
};

window.VietQRService = VietQRService;

