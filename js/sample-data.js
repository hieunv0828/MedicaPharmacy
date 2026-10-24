/**
 * MedicaPharmacy - Dữ liệu mẫu ban đầu (Sample & Initial Data)
 * Chuẩn bị danh mục thuốc GPP, nhà cung cấp và lịch sử đơn hàng phong phú
 */

const DEFAULT_SETTINGS = {
    pharmacyName: 'MedicaPharmacy',
    gppCert: 'Đạt chuẩn Thực hành tốt nhà thuốc GPP - Bộ Y Tế',
    address: '127 Trung Kính, Trung Hòa, Cầu Giấy, Hà Nội',
    phone: '0982149806',
    pharmacist: 'DS. Nguyễn Thanh Dung (CCHN: 014892/HN-CCHN)',
    receiptNote: 'Thuốc đã mua vui lòng không đổi trả sau khi rời quầy theo quy định của Bộ Y Tế. Quý khách vui lòng kiểm tra thuốc và tiền trước khi thanh toán.',
    receiptThankYou: 'Chúc Quý Khách Mau Bình Phục Sức Khỏe!',
    printFormat: 'k80', // 'k80' hoặc 'k58'
    soundEnabled: true,
    // Cấu hình ngân hàng cho VietQR
    bankBin: '970422', // MBBank
    bankCode: 'MB',
    bankName: 'MBBank - Ngân hàng Quân Đội',
    accountNo: '0982149806',
    accountName: 'NGUYEN THANH DUNG'
};

const SAMPLE_SUPPLIERS = [
    { id: 'NCC001', name: 'Công ty Cổ phần Dược Hậu Giang (DHG Pharma)', phone: '0292 3891 433', address: '288 Bis Nguyễn Chí Thanh, P. Trà Nóc, Q. Bình Thủy, Cần Thơ' },
    { id: 'NCC002', name: 'Công ty Traphaco Miền Nam', phone: '028 3971 7890', address: 'Quận Tân Bình, TP. Hồ Chí Minh' },
    { id: 'NCC003', name: 'Công ty TNHH Sanofi-Aventis Việt Nam', phone: '028 3829 8526', address: 'Khu Công Nghệ Cao, TP. Thủ Đức, TP. HCM' },
    { id: 'NCC004', name: 'Công ty Dược phẩm Trung Ương 1 (Pharbaco)', phone: '024 3845 4561', address: '160 Tôn Đức Thắng, Đống Đa, Hà Nội' },
    { id: 'NCC005', name: 'Công ty Cổ phần Dược Boston Pharma', phone: '0274 3769 606', address: 'KCN VSIP 1, Thuận An, Bình Dương' }
];

const SAMPLE_CATEGORIES = [
    'Kháng sinh - Kháng khuẩn',
    'Hạ sốt - Giảm đau - Kháng viêm',
    'Dạ dày - Đường ruột - Tiêu hóa',
    'Hô hấp - Trị ho - Cảm cúm',
    'Tim mạch - Huyết áp',
    'Dị ứng - Kháng Histamin',
    'Vitamin & Thực phẩm chức năng',
    'Nhãn khoa & Tai mũi họng',
    'Da liễu - Bôi ngoài da',
    'Vật tư y tế - Dụng cụ'
];

const SAMPLE_MEDICINES = [
    {
        id: 'MED001',
        barcode: '893456700101',
        name: 'Panadol Extra Đỏ',
        activeIngredient: 'Paracetamol 500mg, Caffeine 65mg',
        category: 'Hạ sốt - Giảm đau - Kháng viêm',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 120, // 1 hộp = 120 viên (12 vỉ x 10 viên)
        subUnit: 'Vỉ',
        subRatio: 10,  // 1 vỉ = 10 viên
        costPrice: 180000, // Giá vốn / hộp (~1500đ/viên)
        priceBox: 230000,
        priceSub: 20000,
        priceBase: 2500,
        stockUnits: 850, // 850 viên
        minStock: 200,
        batchNo: 'L260815',
        expiryDate: '2028-06-30',
        usageDefault: 'Uống 1-2 viên sau ăn khi đau đầu/sốt, cách mỗi 4-6 giờ.',
        supplierId: 'NCC003'
    },
    {
        id: 'MED002',
        barcode: '893456700102',
        name: 'Hapacol 650mg',
        activeIngredient: 'Paracetamol 650mg',
        category: 'Hạ sốt - Giảm đau - Kháng viêm',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 100, // 10 vỉ x 10 viên
        subUnit: 'Vỉ',
        subRatio: 10,
        costPrice: 95000,
        priceBox: 130000,
        priceSub: 14000,
        priceBase: 1500,
        stockUnits: 620,
        minStock: 150,
        batchNo: 'HP2605',
        expiryDate: '2028-04-15',
        usageDefault: 'Người lớn: 1 viên/lần, không quá 4 lần/ngày khi sốt cao > 38.5°C.',
        supplierId: 'NCC001'
    },
    {
        id: 'MED003',
        barcode: '893456700103',
        name: 'Augmentin 1g (Hộp 14 viên)',
        activeIngredient: 'Amoxicillin 875mg, Acid Clavulanic 125mg',
        category: 'Kháng sinh - Kháng khuẩn',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 14,
        subUnit: 'Vỉ',
        subRatio: 7,
        costPrice: 215000,
        priceBox: 265000,
        priceSub: 135000,
        priceBase: 20000,
        stockUnits: 140, // 10 hộp
        minStock: 42,
        batchNo: 'AG2610A',
        expiryDate: '2027-11-20',
        usageDefault: 'Uống 1 viên vào đầu bữa ăn, ngày 2 lần (sáng - chiều cách 12h). Uống đủ 5-7 ngày.',
        supplierId: 'NCC003'
    },
    {
        id: 'MED004',
        barcode: '893456700104',
        name: 'Cephalexin 500mg Mekophar',
        activeIngredient: 'Cephalexin 500mg',
        category: 'Kháng sinh - Kháng khuẩn',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 100,
        subUnit: 'Vỉ',
        subRatio: 10,
        costPrice: 90000,
        priceBox: 125000,
        priceSub: 13000,
        priceBase: 1500,
        stockUnits: 450,
        minStock: 100,
        batchNo: 'CP26019',
        expiryDate: '2027-09-10',
        usageDefault: 'Uống 1 viên x 3 lần/ngày, sau khi ăn.',
        supplierId: 'NCC004'
    },
    {
        id: 'MED005',
        barcode: '893456700105',
        name: 'Nexium 40mg (Esomeprazole)',
        activeIngredient: 'Esomeprazole 40mg',
        category: 'Dạ dày - Đường ruột - Tiêu hóa',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 28, // 4 vỉ x 7 viên
        subUnit: 'Vỉ',
        subRatio: 7,
        costPrice: 380000,
        priceBox: 460000,
        priceSub: 120000,
        priceBase: 18000,
        stockUnits: 84, // 3 hộp
        minStock: 28,
        batchNo: 'NX2604',
        expiryDate: '2027-12-31',
        usageDefault: 'Uống 1 viên vào buổi sáng trước bữa ăn 30-60 phút. Nuốt nguyên viên.',
        supplierId: 'NCC003'
    },
    {
        id: 'MED006',
        barcode: '893456700106',
        name: 'Phosphalugel (Thuốc dạ dày chữ P)',
        activeIngredient: 'Aluminium phosphate gel 20%',
        category: 'Dạ dày - Đường ruột - Tiêu hóa',
        baseUnit: 'Gói',
        packUnit: 'Hộp',
        packRatio: 26,
        subUnit: '',
        subRatio: 1,
        costPrice: 98000,
        priceBox: 125000,
        priceSub: 0,
        priceBase: 5000,
        stockUnits: 130, // 5 hộp
        minStock: 50,
        batchNo: 'PH2603',
        expiryDate: '2028-03-25',
        usageDefault: 'Uống 1-2 gói khi có cơn đau thượng vị hoặc sau ăn 2 giờ.',
        supplierId: 'NCC003'
    },
    {
        id: 'MED007',
        barcode: '893456700107',
        name: 'Berberin Dược Hà Tĩnh (Lọ 100 viên)',
        activeIngredient: 'Berberin clorid 50mg',
        category: 'Dạ dày - Đường ruột - Tiêu hóa',
        baseUnit: 'Viên',
        packUnit: 'Lọ',
        packRatio: 100,
        subUnit: '',
        subRatio: 1,
        costPrice: 16000,
        priceBox: 25000,
        priceSub: 0,
        priceBase: 300,
        stockUnits: 500, // 5 lọ
        minStock: 200,
        batchNo: 'BB2607',
        expiryDate: '2028-10-10',
        usageDefault: 'Uống 4-6 viên/lần x 2 lần/ngày khi bị tiêu chảy, rối loạn tiêu hóa.',
        supplierId: 'NCC001'
    },
    {
        id: 'MED008',
        barcode: '893456700108',
        name: 'Decolgen Forte (Vỉ đỏ)',
        activeIngredient: 'Paracetamol 500mg, Phenylephrine 10mg, Chlorpheniramine 2mg',
        category: 'Hô hấp - Trị ho - Cảm cúm',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 100, // 25 vỉ x 4 viên
        subUnit: 'Vỉ',
        subRatio: 4,
        costPrice: 92000,
        priceBox: 125000,
        priceSub: 6000,
        priceBase: 1500,
        stockUnits: 280,
        minStock: 80,
        batchNo: 'DC2606',
        expiryDate: '2028-02-18',
        usageDefault: 'Uống 1-2 viên x 3-4 lần/ngày khi cảm cúm, sổ mũi, nghẹt mũi.',
        supplierId: 'NCC002'
    },
    {
        id: 'MED009',
        barcode: '893456700109',
        name: 'Alpha Choay Kháng Viêm Giảm Phù Nề',
        activeIngredient: 'Chymotrypsin 4200 UI',
        category: 'Hạ sốt - Giảm đau - Kháng viêm',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 30, // 2 vỉ x 15 viên
        subUnit: 'Vỉ',
        subRatio: 15,
        costPrice: 58000,
        priceBox: 75000,
        priceSub: 39000,
        priceBase: 2800,
        stockUnits: 150, // 5 hộp
        minStock: 45,
        batchNo: 'AC2609',
        expiryDate: '2027-10-05',
        usageDefault: 'Ngậm dưới lưỡi 2 viên x 2-3 lần/ngày hoặc uống với nhiều nước.',
        supplierId: 'NCC003'
    },
    {
        id: 'MED010',
        barcode: '893456700110',
        name: 'Cetirizin 10mg Stada',
        activeIngredient: 'Cetirizin dihydroclorid 10mg',
        category: 'Dị ứng - Kháng Histamin',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 100,
        subUnit: 'Vỉ',
        subRatio: 10,
        costPrice: 45000,
        priceBox: 68000,
        priceSub: 8000,
        priceBase: 900,
        stockUnits: 320,
        minStock: 100,
        batchNo: 'CT2602',
        expiryDate: '2028-05-12',
        usageDefault: 'Uống 1 viên vào buổi tối trước khi ngủ khi bị dị ứng, mề đay, viêm mũi.',
        supplierId: 'NCC005'
    },
    {
        id: 'MED011',
        barcode: '893456700111',
        name: 'Oresol 245 Bột Bù Nước Điện Giải',
        activeIngredient: 'Glucose, Natri clorid, Kali clorid, Natri citrat',
        category: 'Dạ dày - Đường ruột - Tiêu hóa',
        baseUnit: 'Gói',
        packUnit: 'Hộp',
        packRatio: 20,
        subUnit: '',
        subRatio: 1,
        costPrice: 28000,
        priceBox: 40000,
        priceSub: 0,
        priceBase: 2500,
        stockUnits: 160,
        minStock: 40,
        batchNo: 'OR2601',
        expiryDate: '2028-01-20',
        usageDefault: 'Pha 1 gói vào chính xác 200ml nước đun sôi để nguội. Uống rải rác trong ngày.',
        supplierId: 'NCC001'
    },
    {
        id: 'MED012',
        barcode: '893456700112',
        name: 'Vitamin C 500mg Dược Hậu Giang',
        activeIngredient: 'Acid ascorbic 500mg',
        category: 'Vitamin & Thực phẩm chức năng',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 100,
        subUnit: 'Vỉ',
        subRatio: 10,
        costPrice: 42000,
        priceBox: 65000,
        priceSub: 7000,
        priceBase: 800,
        stockUnits: 410,
        minStock: 100,
        batchNo: 'VC2608',
        expiryDate: '2028-08-30',
        usageDefault: 'Uống 1 viên/ngày sau bữa ăn sáng.',
        supplierId: 'NCC001'
    },
    {
        id: 'MED013',
        barcode: '893456700113',
        name: 'Nước Muối Sinh Lý Natri Clorid 0.9% 500ml',
        activeIngredient: 'Natri Clorid 0.9%',
        category: 'Nhãn khoa & Tai mũi họng',
        baseUnit: 'Chai',
        packUnit: 'Thùng',
        packRatio: 20,
        subUnit: '',
        subRatio: 1,
        costPrice: 85000, // 20 chai / thùng
        priceBox: 140000,
        priceSub: 0,
        priceBase: 8000,
        stockUnits: 55, // 55 chai
        minStock: 30,
        batchNo: 'NC2606',
        expiryDate: '2028-06-15',
        usageDefault: 'Dùng súc họng, rửa vết thương hoặc rửa mũi hàng ngày.',
        supplierId: 'NCC004'
    },
    {
        id: 'MED014',
        barcode: '893456700114',
        name: 'Dầu Gió Xanh Con Ó (Eagle Brand 24ml)',
        activeIngredient: 'Menthol, Methyl Salicylate, Eucalyptus Oil',
        category: 'Hạ sốt - Giảm đau - Kháng viêm',
        baseUnit: 'Chai',
        packUnit: 'Lốc',
        packRatio: 12,
        subUnit: '',
        subRatio: 1,
        costPrice: 1250000,
        priceBox: 1560000,
        priceSub: 0,
        priceBase: 135000,
        stockUnits: 18,
        minStock: 6,
        batchNo: 'EB2603',
        expiryDate: '2029-01-01',
        usageDefault: 'Xoa bóp ngoài da vùng đau nhức, xoa thái dương khi chóng mặt.',
        supplierId: 'NCC003'
    },
    {
        id: 'MED015',
        barcode: '893456700115',
        name: 'Cao Dán Salonpas (Hộp 20 miếng)',
        activeIngredient: 'Methyl Salicylate 10%, Menthol 3%',
        category: 'Hạ sốt - Giảm đau - Kháng viêm',
        baseUnit: 'Gói',
        packUnit: 'Hộp',
        packRatio: 10, // 10 gói x 2 miếng
        subUnit: '',
        subRatio: 1,
        costPrice: 135000,
        priceBox: 175000,
        priceSub: 0,
        priceBase: 19000,
        stockUnits: 42,
        minStock: 20,
        batchNo: 'SL2605',
        expiryDate: '2028-09-20',
        usageDefault: 'Dán trực tiếp lên vùng đau cơ bắp, đau lưng không quá 8 giờ/ngày.',
        supplierId: 'NCC002'
    },
    {
        id: 'MED016',
        barcode: '893456700116',
        name: 'Amlodipin 5mg Dược Hà Tây (Cảnh báo sắp hết hạn)',
        activeIngredient: 'Amlodipin besylat 5mg',
        category: 'Tim mạch - Huyết áp',
        baseUnit: 'Viên',
        packUnit: 'Hộp',
        packRatio: 100,
        subUnit: 'Vỉ',
        subRatio: 10,
        costPrice: 55000,
        priceBox: 80000,
        priceSub: 9000,
        priceBase: 1000,
        stockUnits: 80,
        minStock: 100,
        batchNo: 'AM2511',
        expiryDate: '2026-11-28', // Gần hết hạn (trong vòng 35 ngày)
        usageDefault: 'Uống 1 viên vào 1 giờ cố định mỗi sáng (theo chỉ định bác sĩ tim mạch).',
        supplierId: 'NCC004'
    },
    {
        id: 'MED017',
        barcode: '893456700117',
        name: 'Băng Cá Nhân Vô Trùng Urgo Waterproof',
        activeIngredient: 'Băng dán film PU chống thấm nước',
        category: 'Vật tư y tế - Dụng cụ',
        baseUnit: 'Miếng',
        packUnit: 'Hộp',
        packRatio: 100,
        subUnit: '',
        subRatio: 1,
        costPrice: 65000,
        priceBox: 95000,
        priceSub: 0,
        priceBase: 1200,
        stockUnits: 15, // Sắp hết hàng
        minStock: 50,
        batchNo: 'UG2602',
        expiryDate: '2029-05-10',
        usageDefault: 'Rửa sạch vết thương, dán băng che kín miệng vết xước/trầy.',
        supplierId: 'NCC003'
    }
];

// Sinh dữ liệu các đơn hàng bán lẻ mẫu cho tháng 10/2026
// Có sự phân chia tách bạch giữa TIỀN MẶT (cash) và CHUYỂN KHOẢN (transfer)
function generateSampleOrders() {
    const orders = [
        {
            id: 'HD261001-001',
            createdAt: '2026-10-01T08:30:00+07:00',
            customerName: 'Chị Mai Lan',
            customerPhone: '0912 345 678',
            paymentMethod: 'cash', // TIỀN MẶT
            items: [
                { medicineId: 'MED001', medicineName: 'Panadol Extra Đỏ', unit: 'Vỉ', quantity: 2, price: 20000, costPrice: 15000, usage: 'Uống 1 viên khi đau đầu sau ăn.' },
                { medicineId: 'MED012', medicineName: 'Vitamin C 500mg Dược Hậu Giang', unit: 'Vỉ', quantity: 2, price: 7000, costPrice: 4200, usage: 'Uống 1 viên sau ăn sáng.' }
            ],
            subTotal: 54000,
            discount: 0,
            totalAmount: 54000,
            customerCash: 100000,
            changeAmount: 46000,
            transferCode: '',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Khách đau đầu do thời tiết'
        },
        {
            id: 'HD261001-002',
            createdAt: '2026-10-01T14:15:00+07:00',
            customerName: 'Anh Quốc Bảo',
            customerPhone: '0988 776 554',
            paymentMethod: 'transfer', // CHUYỂN KHOẢN
            items: [
                { medicineId: 'MED003', medicineName: 'Augmentin 1g (Hộp 14 viên)', unit: 'Hộp', quantity: 1, price: 265000, costPrice: 215000, usage: 'Uống 1 viên x 2 lần/ngày sau ăn.' },
                { medicineId: 'MED009', medicineName: 'Alpha Choay Kháng Viêm', unit: 'Hộp', quantity: 1, price: 75000, costPrice: 58000, usage: 'Ngậm dưới lưỡi 2 viên x 2 lần/ngày.' }
            ],
            subTotal: 340000,
            discount: 10000,
            totalAmount: 330000,
            customerCash: 0,
            changeAmount: 0,
            transferCode: 'MB-TXN-984321',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Viêm họng cấp, đã quét VietQR thành công'
        },
        {
            id: 'HD261005-001',
            createdAt: '2026-10-05T09:40:00+07:00',
            customerName: 'Cô Bích Thủy',
            customerPhone: '0903 881 229',
            paymentMethod: 'cash', // TIỀN MẶT
            items: [
                { medicineId: 'MED005', medicineName: 'Nexium 40mg (Esomeprazole)', unit: 'Hộp', quantity: 1, price: 460000, costPrice: 380000, usage: 'Uống 1 viên trước ăn sáng 30p.' },
                { medicineId: 'MED006', medicineName: 'Phosphalugel (Chữ P)', unit: 'Gói', quantity: 10, price: 5000, costPrice: 3800, usage: 'Uống 1 gói khi đau rát dạ dày.' }
            ],
            subTotal: 510000,
            discount: 0,
            totalAmount: 510000,
            customerCash: 510000,
            changeAmount: 0,
            transferCode: '',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Đau dạ dày mạn'
        },
        {
            id: 'HD261008-001',
            createdAt: '2026-10-08T11:20:00+07:00',
            customerName: 'Anh Tuấn Hưng',
            customerPhone: '0937 112 334',
            paymentMethod: 'transfer', // CHUYỂN KHOẢN
            items: [
                { medicineId: 'MED014', medicineName: 'Dầu Gió Xanh Con Ó', unit: 'Chai', quantity: 2, price: 135000, costPrice: 104000, usage: 'Thoa ngoài da' },
                { medicineId: 'MED015', medicineName: 'Cao Dán Salonpas', unit: 'Hộp', quantity: 1, price: 175000, costPrice: 135000, usage: 'Dán đau lưng' }
            ],
            subTotal: 445000,
            discount: 15000,
            totalAmount: 430000,
            customerCash: 0,
            changeAmount: 0,
            transferCode: 'MB-TXN-110293',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Chuyển khoản VietQR'
        },
        {
            id: 'HD261012-001',
            createdAt: '2026-10-12T16:50:00+07:00',
            customerName: 'Bác Trần Văn Nam',
            customerPhone: '0908 998 776',
            paymentMethod: 'cash', // TIỀN MẶT
            items: [
                { medicineId: 'MED002', medicineName: 'Hapacol 650mg', unit: 'Vỉ', quantity: 3, price: 14000, costPrice: 9500, usage: 'Uống 1 viên khi sốt trên 38.5' },
                { medicineId: 'MED008', medicineName: 'Decolgen Forte', unit: 'Vỉ', quantity: 4, price: 6000, costPrice: 3700, usage: 'Uống 1 viên sáng - chiều' }
            ],
            subTotal: 66000,
            discount: 0,
            totalAmount: 66000,
            customerCash: 70000,
            changeAmount: 4000,
            transferCode: '',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Cảm cúm sổ mũi'
        },
        {
            id: 'HD261015-001',
            createdAt: '2026-10-15T10:05:00+07:00',
            customerName: 'Chị Thu Hà',
            customerPhone: '0979 554 433',
            paymentMethod: 'transfer', // CHUYỂN KHOẢN
            items: [
                { medicineId: 'MED001', medicineName: 'Panadol Extra Đỏ', unit: 'Hộp', quantity: 1, price: 230000, costPrice: 180000, usage: 'Dự phòng gia đình' },
                { medicineId: 'MED013', medicineName: 'Nước Muối Sinh Lý 500ml', unit: 'Chai', quantity: 5, price: 8000, costPrice: 4250, usage: 'Súc miệng hàng ngày' },
                { medicineId: 'MED017', medicineName: 'Băng Cá Nhân Urgo', unit: 'Hộp', quantity: 1, price: 95000, costPrice: 65000, usage: 'Tủ thuốc gia đình' }
            ],
            subTotal: 365000,
            discount: 15000,
            totalAmount: 350000,
            customerCash: 0,
            changeAmount: 0,
            transferCode: 'MB-TXN-448201',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Khách mua tủ thuốc gia đình'
        },
        {
            id: 'HD261018-001',
            createdAt: '2026-10-18T15:30:00+07:00',
            customerName: 'Anh Lê Minh Trí',
            customerPhone: '0918 332 211',
            paymentMethod: 'cash', // TIỀN MẶT
            items: [
                { medicineId: 'MED007', medicineName: 'Berberin Lọ 100 viên', unit: 'Lọ', quantity: 2, price: 25000, costPrice: 16000, usage: 'Uống 5 viên x 2 lần/ngày' },
                { medicineId: 'MED011', medicineName: 'Oresol 245', unit: 'Gói', quantity: 6, price: 2500, costPrice: 1400, usage: 'Pha 1 gói với 200ml nước' }
            ],
            subTotal: 65000,
            discount: 0,
            totalAmount: 65000,
            customerCash: 100000,
            changeAmount: 35000,
            transferCode: '',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Tiêu chảy do ăn đồ lạ'
        },
        {
            id: 'HD261021-001',
            createdAt: '2026-10-21T18:25:00+07:00',
            customerName: 'Chị Đặng Kim Oanh',
            customerPhone: '0945 667 889',
            paymentMethod: 'transfer', // CHUYỂN KHOẢN
            items: [
                { medicineId: 'MED003', medicineName: 'Augmentin 1g', unit: 'Hộp', quantity: 1, price: 265000, costPrice: 215000, usage: 'Uống 1 viên x 2 lần sau ăn' },
                { medicineId: 'MED010', medicineName: 'Cetirizin 10mg', unit: 'Hộp', quantity: 1, price: 68000, costPrice: 45000, usage: 'Uống 1 viên tối trước ngủ' },
                { medicineId: 'MED009', medicineName: 'Alpha Choay', unit: 'Vỉ', quantity: 1, price: 39000, costPrice: 29000, usage: 'Ngậm dưới lưỡi 2 viên x 2 lần' }
            ],
            subTotal: 372000,
            discount: 12000,
            totalAmount: 360000,
            customerCash: 0,
            changeAmount: 0,
            transferCode: 'MB-TXN-661902',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Viêm mũi xoang cấp'
        },
        {
            id: 'HD261023-001',
            createdAt: '2026-10-23T09:10:00+07:00',
            customerName: 'Bác Hoàng Văn Phúc',
            customerPhone: '0903 114 477',
            paymentMethod: 'cash', // TIỀN MẶT
            items: [
                { medicineId: 'MED001', medicineName: 'Panadol Extra Đỏ', unit: 'Vỉ', quantity: 3, price: 20000, costPrice: 15000, usage: 'Uống 1 viên khi sốt' },
                { medicineId: 'MED008', medicineName: 'Decolgen Forte', unit: 'Vỉ', quantity: 5, price: 6000, costPrice: 3700, usage: 'Uống 1 viên sáng - trưa' }
            ],
            subTotal: 90000,
            discount: 0,
            totalAmount: 90000,
            customerCash: 100000,
            changeAmount: 10000,
            transferCode: '',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Cảm cúm mùa mưa'
        },
        {
            id: 'HD261023-002',
            createdAt: '2026-10-23T14:45:00+07:00',
            customerName: 'Anh Vũ Đình Trọng',
            customerPhone: '0982 991 334',
            paymentMethod: 'transfer', // CHUYỂN KHOẢN
            items: [
                { medicineId: 'MED005', medicineName: 'Nexium 40mg', unit: 'Hộp', quantity: 1, price: 460000, costPrice: 380000, usage: '1 viên sáng trước ăn' },
                { medicineId: 'MED006', medicineName: 'Phosphalugel', unit: 'Hộp', quantity: 1, price: 125000, costPrice: 98000, usage: 'Uống khi đau dạ dày' }
            ],
            subTotal: 585000,
            discount: 25000,
            totalAmount: 560000,
            customerCash: 0,
            changeAmount: 0,
            transferCode: 'MB-TXN-882194',
            pharmacist: 'DS. Nguyễn Thanh Dung',
            note: 'Khách quen mua thuốc dạ dày'
        }
    ];

    return orders.map(o => ({
        ...o,
        pointsEarned: Math.floor((o.totalAmount || 0) / 100000)
    }));
}

const SAMPLE_CUSTOMERS = [
    { id: 'KH0001', name: 'Anh Vũ Đình Trọng', phone: '0982 991 334', points: 5, totalSpent: 560000, ordersCount: 1, createdAt: '2026-10-23T14:45:00+07:00', lastVisit: '2026-10-23T14:45:00+07:00', note: 'Khách quen mua thuốc dạ dày' },
    { id: 'KH0002', name: 'Bác Trần Văn Nam', phone: '0908 998 776', points: 4, totalSpent: 420000, ordersCount: 1, createdAt: '2026-10-12T16:50:00+07:00', lastVisit: '2026-10-12T16:50:00+07:00', note: 'Bác cao tuổi' },
    { id: 'KH0003', name: 'Anh Quốc Bảo', phone: '0988 776 554', points: 3, totalSpent: 330000, ordersCount: 1, createdAt: '2026-10-01T14:15:00+07:00', lastVisit: '2026-10-01T14:15:00+07:00', note: '' },
    { id: 'KH0004', name: 'Cô Bích Thủy', phone: '0903 881 229', points: 3, totalSpent: 300000, ordersCount: 1, createdAt: '2026-10-05T09:40:00+07:00', lastVisit: '2026-10-05T09:40:00+07:00', note: '' },
    { id: 'KH0005', name: 'Chị Thu Hà', phone: '0979 554 433', points: 3, totalSpent: 350000, ordersCount: 1, createdAt: '2026-10-15T10:05:00+07:00', lastVisit: '2026-10-15T10:05:00+07:00', note: '' },
    { id: 'KH0006', name: 'Chị Đặng Kim Oanh', phone: '0945 667 889', points: 3, totalSpent: 360000, ordersCount: 1, createdAt: '2026-10-21T18:25:00+07:00', lastVisit: '2026-10-21T18:25:00+07:00', note: 'Viêm xoang tái phát' },
    { id: 'KH0007', name: 'Chị Mai Lan', phone: '0912 345 678', points: 0, totalSpent: 54000, ordersCount: 1, createdAt: '2026-10-01T08:30:00+07:00', lastVisit: '2026-10-01T08:30:00+07:00', note: '' },
    { id: 'KH0008', name: 'Anh Tuấn Hưng', phone: '0937 112 334', points: 0, totalSpent: 95000, ordersCount: 1, createdAt: '2026-10-08T11:20:00+07:00', lastVisit: '2026-10-08T11:20:00+07:00', note: '' },
    { id: 'KH0009', name: 'Anh Lê Minh Trí', phone: '0918 332 211', points: 0, totalSpent: 65000, ordersCount: 1, createdAt: '2026-10-18T15:30:00+07:00', lastVisit: '2026-10-18T15:30:00+07:00', note: '' },
    { id: 'KH0010', name: 'Bác Hoàng Văn Phúc', phone: '0903 114 477', points: 0, totalSpent: 90000, ordersCount: 1, createdAt: '2026-10-23T09:10:00+07:00', lastVisit: '2026-10-23T09:10:00+07:00', note: '' }
];

const SAMPLE_STOCK_IN_ORDERS = [
    {
        id: 'PN261001-01',
        createdAt: '2026-10-01T08:00:00+07:00',
        supplierId: 'NCC001',
        supplierName: 'Công ty Cổ phần Dược Hậu Giang (DHG Pharma)',
        paymentMethod: 'cash', // TIỀN MẶT
        items: [
            { medicineId: 'MED002', medicineName: 'Hapacol 650mg', batchNo: 'HP2605', expiryDate: '2028-04-15', unit: 'Hộp', quantity: 10, costPrice: 95000, total: 950000 },
            { medicineId: 'MED007', medicineName: 'Berberin Dược Hà Tĩnh', batchNo: 'BB2607', expiryDate: '2028-10-10', unit: 'Lọ', quantity: 10, costPrice: 16000, total: 160000 },
            { medicineId: 'MED012', medicineName: 'Vitamin C 500mg', batchNo: 'VC2608', expiryDate: '2028-08-30', unit: 'Hộp', quantity: 5, costPrice: 42000, total: 210000 }
        ],
        totalAmount: 1320000,
        pharmacist: 'DS. Nguyễn Thanh Dung',
        note: 'Nhập lô hàng định kỳ đầu tháng'
    },
    {
        id: 'PN261010-01',
        createdAt: '2026-10-10T09:30:00+07:00',
        supplierId: 'NCC003',
        supplierName: 'Công ty TNHH Sanofi-Aventis Việt Nam',
        paymentMethod: 'transfer', // CHUYỂN KHOẢN
        items: [
            { medicineId: 'MED001', medicineName: 'Panadol Extra Đỏ', batchNo: 'L260815', expiryDate: '2028-06-30', unit: 'Hộp', quantity: 15, costPrice: 180000, total: 2700000 },
            { medicineId: 'MED003', medicineName: 'Augmentin 1g', batchNo: 'AG2610A', expiryDate: '2027-11-20', unit: 'Hộp', quantity: 10, costPrice: 215000, total: 2150000 },
            { medicineId: 'MED005', medicineName: 'Nexium 40mg', batchNo: 'NX2604', expiryDate: '2027-12-31', unit: 'Hộp', quantity: 5, costPrice: 380000, total: 1900000 }
        ],
        totalAmount: 6750000,
        pharmacist: 'DS. Nguyễn Thanh Dung',
        note: 'Nhập thuốc đặc trị Sanofi'
    },
    {
        id: 'PN261020-01',
        createdAt: '2026-10-20T14:15:00+07:00',
        supplierId: 'NCC002',
        supplierName: 'Công ty Cổ phần Traphaco',
        paymentMethod: 'cash', // TIỀN MẶT
        items: [
            { medicineId: 'MED008', medicineName: 'Decolgen Forte', batchNo: 'DC2610', expiryDate: '2028-09-15', unit: 'Hộp', quantity: 10, costPrice: 60000, total: 600000 },
            { medicineId: 'MED009', medicineName: 'Alpha Choay Kháng Viêm', batchNo: 'AC2609', expiryDate: '2028-05-20', unit: 'Hộp', quantity: 8, costPrice: 58000, total: 464000 }
        ],
        totalAmount: 1064000,
        pharmacist: 'DS. Nguyễn Thanh Dung',
        note: 'Bổ sung thuốc cảm cúm, kháng viêm'
    }
];

const SAMPLE_VOUCHERS = [
    {
        id: 'PC261001-001',
        type: 'payment', // Phiếu Chi
        paymentMethod: 'cash', // Tiền mặt
        category: 'Chi tiền hàng Nhà Cung Cấp',
        targetType: 'supplier',
        targetName: 'Công ty Cổ phần Dược Hậu Giang (DHG Pharma)',
        amount: 1320000,
        note: 'Thanh toán tiền mặt phiếu nhập PN261001-01',
        isAccounting: true,
        pharmacist: 'DS. Nguyễn Thanh Dung',
        createdAt: '2026-10-01T08:30:00+07:00'
    },
    {
        id: 'PC261005-001',
        type: 'payment', // Phiếu Chi
        paymentMethod: 'transfer', // Chuyển khoản
        category: 'Chi trả tiền thuê mặt bằng',
        targetType: 'other',
        targetName: 'Bác Nguyễn Văn Chủ Nhà',
        amount: 12000000,
        note: 'Tiền thuê mặt bằng số 127 Trung Kính tháng 10/2026',
        isAccounting: true,
        pharmacist: 'DS. Nguyễn Thanh Dung',
        createdAt: '2026-10-05T10:00:00+07:00'
    },
    {
        id: 'PC261010-001',
        type: 'payment', // Phiếu Chi
        paymentMethod: 'transfer', // Chuyển khoản
        category: 'Chi tiền hàng Nhà Cung Cấp',
        targetType: 'supplier',
        targetName: 'Công ty TNHH Sanofi-Aventis Việt Nam',
        amount: 6750000,
        note: 'Chuyển khoản thanh toán phiếu nhập PN261010-01',
        isAccounting: true,
        pharmacist: 'DS. Nguyễn Thanh Dung',
        createdAt: '2026-10-10T10:15:00+07:00'
    },
    {
        id: 'PC261015-001',
        type: 'payment', // Phiếu Chi
        paymentMethod: 'cash', // Tiền mặt
        category: 'Chi điện nước & internet',
        targetType: 'other',
        targetName: 'Công ty Điện Lực Cầu Giấy (EVN)',
        amount: 1450000,
        note: 'Tiền điện thắp sáng và tủ lạnh bảo quản vắc-xin, thuốc GPP',
        isAccounting: true,
        pharmacist: 'admin',
        createdAt: '2026-10-15T09:40:00+07:00'
    },
    {
        id: 'PT261018-001',
        type: 'receipt', // Phiếu Thu
        paymentMethod: 'cash', // Tiền mặt
        category: 'Thu thanh lý vỏ hộp & bao bì',
        targetType: 'other',
        targetName: 'Đại lý thu mua phế liệu',
        amount: 350000,
        note: 'Thanh lý vỏ thùng carton nhập hàng',
        isAccounting: true,
        pharmacist: 'DS. Nguyễn Thanh Dung',
        createdAt: '2026-10-18T16:30:00+07:00'
    },
    {
        id: 'PC261020-001',
        type: 'payment', // Phiếu Chi
        paymentMethod: 'cash', // Tiền mặt
        category: 'Chi tiền hàng Nhà Cung Cấp',
        targetType: 'supplier',
        targetName: 'Công ty Cổ phần Traphaco',
        amount: 1064000,
        note: 'Tiền mặt thanh toán phiếu nhập PN261020-01',
        isAccounting: true,
        pharmacist: 'DS. Nguyễn Thanh Dung',
        createdAt: '2026-10-20T14:45:00+07:00'
    },
    {
        id: 'PC261022-001',
        type: 'payment', // Phiếu Chi
        paymentMethod: 'cash', // Tiền mặt
        category: 'Chi văn phòng phẩm & túi đựng',
        targetType: 'other',
        targetName: 'Công ty In Ấn Bao Bì Dược Hà Nội',
        amount: 650000,
        note: 'Mua 20 cuộn giấy in nhiệt K80 và 10kg túi zip chia liều',
        isAccounting: true,
        pharmacist: 'admin',
        createdAt: '2026-10-22T11:20:00+07:00'
    }
];

window.SampleData = {
    settings: DEFAULT_SETTINGS,
    suppliers: SAMPLE_SUPPLIERS,
    categories: SAMPLE_CATEGORIES,
    medicines: SAMPLE_MEDICINES,
    orders: generateSampleOrders(),
    stockInOrders: SAMPLE_STOCK_IN_ORDERS,
    customers: SAMPLE_CUSTOMERS,
    vouchers: SAMPLE_VOUCHERS
};

