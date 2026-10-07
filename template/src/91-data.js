/* Shared demo catalogue (v3). Every new screen reads from here so data stays consistent. */
window.FS_DATA = {
  company: { name: 'Al-Noor Enterprises (Pvt) Ltd', short: 'Al-Noor Enterprises', code: 'ALNOOR', ntn: '4271839-6', strn: '32-77-8761-234-55', address: '42-B Industrial Estate, Kot Lakhpat, Lahore', phone: '+92 42 3512 8800', email: 'accounts@alnoor.com.pk' },
  branches: ['Lahore HQ', 'Karachi', 'Islamabad', 'Faisalabad'],
  warehouses: ['Lahore HQ Warehouse', 'Karachi Depot', 'Islamabad Store', 'Faisalabad Depot'],
  items: [
    { sku: 'PK-1001', upc: '8964001100011', name: 'Corrugated Carton 5-Ply 18×12×12', cat: 'Packaging', unit: 'Pcs', pack: 'Bundle 25', cost: 85, price: 112, stock: 4800, gst: 18, brand: 'Habib Packaging' },
    { sku: 'PK-1003', upc: '8964001100035', name: 'BOPP Tape 2" Clear 100 yd', cat: 'Packaging', unit: 'Roll', pack: 'Carton 36', cost: 95, price: 135, stock: 2350, gst: 18, brand: 'Habib Packaging' },
    { sku: 'PK-1004', upc: '8964001100042', name: 'Stretch Wrap Film 23µ × 500mm', cat: 'Packaging', unit: 'Roll', pack: 'Box 6', cost: 850, price: 1150, stock: 410, gst: 18, brand: 'Habib Packaging' },
    { sku: 'PK-1005', upc: '8964001100059', name: 'Bubble Wrap Roll 1m × 100m', cat: 'Packaging', unit: 'Roll', pack: 'Single', cost: 2400, price: 3100, stock: 0, gst: 18, brand: 'Habib Packaging' },
    { sku: 'OF-2001', upc: '8964002200018', name: 'HP LaserJet Toner 85A', cat: 'Office Supplies', unit: 'Pcs', pack: 'Single', cost: 9800, price: 12900, stock: 46, gst: 18, brand: 'HP' },
    { sku: 'OF-2002', upc: '8964002200025', name: 'A4 Paper Ream 80gsm', cat: 'Office Supplies', unit: 'Ream', pack: 'Box 5', cost: 1350, price: 1690, stock: 1240, gst: 18, brand: 'Double A' },
    { sku: 'OF-2003', upc: '8964002200032', name: 'Box File Lever Arch', cat: 'Office Supplies', unit: 'Pcs', pack: 'Carton 20', cost: 380, price: 520, stock: 420, gst: 18, brand: 'Deli' },
    { sku: 'IN-3001', upc: '8964003300015', name: 'Industrial Nitrile Gloves (100)', cat: 'Safety', unit: 'Box', pack: 'Carton 10', cost: 1450, price: 1990, stock: 280, gst: 18, brand: 'SafeHands' },
    { sku: 'IN-3002', upc: '8964003300022', name: 'Safety Helmet ANSI', cat: 'Safety', unit: 'Pcs', pack: 'Carton 12', cost: 1150, price: 1650, stock: 95, gst: 18, brand: 'SafeHands' },
    { sku: 'EL-4001', upc: '8964004400012', name: 'LED Panel Light 2×2 48W', cat: 'Electrical', unit: 'Pcs', pack: 'Carton 4', cost: 3200, price: 4450, stock: 160, gst: 18, brand: 'Philips' },
    { sku: 'EL-4002', upc: '8964004400029', name: 'Copper Wire 7/29 (90m)', cat: 'Electrical', unit: 'Coil', pack: 'Single', cost: 11800, price: 14600, stock: 38, gst: 18, brand: 'Pakistan Cables' },
    { sku: 'FD-5001', upc: '8964005500019', name: 'Shan Biryani Masala 60g', cat: 'FMCG', unit: 'Pack', pack: 'Carton 144', cost: 118, price: 150, stock: 6400, gst: 18, brand: 'Shan Foods' },
    { sku: 'FD-5002', upc: '8964005500026', name: 'Tapal Danedar Tea 950g', cat: 'FMCG', unit: 'Pack', pack: 'Carton 12', cost: 1720, price: 1995, stock: 540, gst: 18, brand: 'Tapal' },
    { sku: 'FD-5003', upc: '8964005500033', name: 'Dettol Liquid 500ml', cat: 'FMCG', unit: 'Btl', pack: 'Carton 24', cost: 610, price: 780, stock: 720, gst: 18, brand: 'Reckitt' },
    { sku: 'FD-5004', upc: '8964005500040', name: 'Surf Excel 1kg', cat: 'FMCG', unit: 'Pack', pack: 'Carton 12', cost: 760, price: 940, stock: 15, gst: 18, brand: 'Unilever' },
    { sku: 'IT-6001', upc: '8964006600016', name: 'Logitech Wireless Mouse M185', cat: 'IT Accessories', unit: 'Pcs', pack: 'Carton 20', cost: 2150, price: 2890, stock: 88, gst: 18, brand: 'Logitech' },
  ],
  customers: [
    { code: 'CUST-0001', name: 'Shifa International', city: 'Islamabad', ntn: '0656231-9', limit: 4000000, balance: 1003000, phone: '0300-5551234', group: 'Corporate' },
    { code: 'CUST-0002', name: 'City Mart Superstores', city: 'Lahore', ntn: '3529184-2', limit: 1500000, balance: 1369100, phone: '0321-4557890', group: 'Retail Chain' },
    { code: 'CUST-0003', name: 'Fatima Group', city: 'Lahore', ntn: '0656231-9', limit: 4000000, balance: 0, phone: '042-111-328-462', group: 'Corporate' },
    { code: 'CUST-0004', name: 'Packages Ltd', city: 'Lahore', ntn: '0802143-1', limit: 6000000, balance: 663200, phone: '042-35811541', group: 'Corporate' },
    { code: 'CUST-0005', name: 'Hashoo Hotels', city: 'Islamabad', ntn: '1123456-7', limit: 2500000, balance: 412000, phone: '051-2272890', group: 'Hospitality' },
    { code: 'CUST-0006', name: 'Al-Fatah Stores', city: 'Lahore', ntn: '1748203-7', limit: 600000, balance: 718290, phone: '042-35761234', group: 'Retail Chain' },
    { code: 'CUST-0007', name: 'Metro Cash & Carry', city: 'Lahore', ntn: '2394817-0', limit: 3000000, balance: 46500, phone: '042-111-638-762', group: 'Retail Chain' },
    { code: 'CUST-0008', name: 'Engro Foods', city: 'Karachi', ntn: '3104521-8', limit: 5000000, balance: 1250000, phone: '021-111-211-211', group: 'Corporate' },
    { code: 'CUST-0009', name: 'Interloop Ltd', city: 'Faisalabad', ntn: '2845510-3', limit: 2000000, balance: 905000, phone: '041-8711021', group: 'Corporate' },
    { code: 'CUST-0010', name: 'Walk-in Customer', city: 'Lahore', ntn: '—', limit: 0, balance: 0, phone: '—', group: 'Cash' },
  ],
  vendors: [
    { code: 'VEN-0001', name: 'Habib Packaging', city: 'Lahore', ntn: '1209938-4', filer: true, balance: 842000 },
    { code: 'VEN-0002', name: 'Siemens Pakistan', city: 'Karachi', ntn: '0712456-1', filer: true, balance: 1240000 },
    { code: 'VEN-0003', name: 'Shan Foods', city: 'Karachi', ntn: '0812233-5', filer: true, balance: 365000 },
    { code: 'VEN-0004', name: 'Nishat Mills', city: 'Lahore', ntn: '0400120-2', filer: true, balance: 0 },
    { code: 'VEN-0005', name: 'Daraz Business', city: 'Karachi', ntn: '4410093-6', filer: true, balance: 58000 },
    { code: 'VEN-0006', name: 'TCS Logistics', city: 'Karachi', ntn: '0921884-0', filer: true, balance: 74500 },
    { code: 'VEN-0007', name: 'Pak Suzuki Spares', city: 'Karachi', ntn: '1009823-9', filer: false, balance: 125000 },
    { code: 'VEN-0008', name: 'LESCO', city: 'Lahore', ntn: '—', filer: true, balance: 297400 },
  ],
  employees: [
    { id: 'EMP-0001', name: 'Ahmed Raza', role: 'Chief Executive Officer', dept: 'Administration', branch: 'Lahore HQ', email: 'ahmed.raza@alnoor.com.pk', phone: '0300-4001122' },
    { id: 'EMP-0004', name: 'Sana Javed', role: 'Finance Manager', dept: 'Finance', branch: 'Lahore HQ', email: 'sana@alnoor.com.pk', phone: '0321-4440011' },
    { id: 'EMP-0006', name: 'Ayesha Noor', role: 'HR Manager', dept: 'Human Resources', branch: 'Lahore HQ', email: 'ayesha.noor@alnoor.com.pk', phone: '0333-4567712' },
    { id: 'EMP-0011', name: 'Hira Ali', role: 'Senior Accountant', dept: 'Finance', branch: 'Lahore HQ', email: 'hira.ali@alnoor.com.pk', phone: '0302-4419900' },
    { id: 'EMP-0018', name: 'Usman Ali', role: 'Procurement Lead', dept: 'Procurement', branch: 'Lahore HQ', email: 'usman.ali@alnoor.com.pk', phone: '0345-4123987' },
    { id: 'EMP-0021', name: 'Zainab Raza', role: 'Sales Manager', dept: 'Sales', branch: 'Karachi', email: 'zainab.raza@alnoor.com.pk', phone: '0300-2334455' },
    { id: 'EMP-0042', name: 'Bilal Khan', role: 'Sales Executive', dept: 'Sales', branch: 'Lahore HQ', email: 'bilal.khan@alnoor.com.pk', phone: '0312-4778899' },
    { id: 'EMP-0009', name: 'Faisal Qureshi', role: 'Operations Head', dept: 'Operations', branch: 'Lahore HQ', email: 'faisal.q@alnoor.com.pk', phone: '0301-4556677' },
    { id: 'EMP-0027', name: 'Fatima Noor', role: 'HR Executive', dept: 'Human Resources', branch: 'Lahore HQ', email: 'fatima.noor@alnoor.com.pk', phone: '0322-4001188' },
    { id: 'EMP-0033', name: 'Kashif Ali', role: 'Warehouse Supervisor', dept: 'Warehouse', branch: 'Faisalabad', email: 'kashif.ali@alnoor.com.pk', phone: '0306-7654321' },
    { id: 'EMP-0035', name: 'Mehwish Tariq', role: 'IT Lead', dept: 'IT', branch: 'Lahore HQ', email: 'mehwish.t@alnoor.com.pk', phone: '0334-4223311' },
    { id: 'EMP-0048', name: 'Ali Haider', role: 'Delivery Officer', dept: 'Operations', branch: 'Islamabad', email: 'ali.haider@alnoor.com.pk', phone: '0315-5009988' },
  ],
  salesTeam: { bookers: ['Bilal Khan', 'Imran Siddiqui', 'Nadeem Akhtar'], deliverymen: ['Ali Haider', 'Rafiq Shah', 'Salman Butt'], salesmen: ['Zainab Raza', 'Bilal Khan', 'Tanveer Hassan'], supervisors: ['Faisal Qureshi', 'Zainab Raza'] },
  banks: [
    { code: '1120-01', name: 'Meezan Bank — 0123', short: 'Meezan 0123', balance: 21452900 },
    { code: '1120-02', name: 'HBL — 8721', short: 'HBL 8721', balance: 11988640 },
    { code: '1120-03', name: 'UBL — 2294', short: 'UBL 2294', balance: 7346200 },
    { code: '1120-04', name: 'Bank Alfalah — 5510', short: 'Alfalah 5510', balance: 4435240 },
  ],
  cashAccounts: [
    { code: '1110-01', name: 'Cash in Hand — Lahore HQ', short: 'Lahore HQ drawer', balance: 2942320 },
    { code: '1110-02', name: 'Petty Cash — Karachi', short: 'Karachi petty', balance: 50000 },
    { code: '1110-03', name: 'Cash Counter — Islamabad', short: 'Islamabad counter', balance: 184250 },
    { code: '1110-04', name: 'Imprest — Faisalabad', short: 'Faisalabad imprest', balance: 30000 },
  ],
};

/* ---- v4 augmentation: inventory master data + wholesale/distribution ---- */
(function (D) {
  const meta = {
    'PK-1001': { ctn: 25, loose: 'Pcs', shelf: 'A1', cls: 'MC-001', sub: 'ST-001', co: 'CO-07', low: 800, high: 6000, attrs: [] },
    'PK-1003': { ctn: 36, loose: 'Roll', shelf: 'A1', cls: 'MC-001', sub: 'ST-002', co: 'CO-07', low: 400, high: 3000, attrs: [] },
    'PK-1004': { ctn: 6, loose: 'Roll', shelf: 'A2', cls: 'MC-001', sub: 'ST-003', co: 'CO-07', low: 120, high: 800, attrs: [] },
    'PK-1005': { ctn: 1, loose: 'Roll', shelf: 'A2', cls: 'MC-001', sub: 'ST-003', co: 'CO-07', low: 10, high: 60, attrs: ['short'] },
    'OF-2001': { ctn: 1, loose: 'Pcs', shelf: 'B1', cls: 'MC-002', sub: 'ST-004', co: 'CO-01', low: 20, high: 120, attrs: ['precious'] },
    'OF-2002': { ctn: 5, loose: 'Ream', shelf: 'B1', cls: 'MC-002', sub: 'ST-005', co: 'CO-02', low: 300, high: 2000, attrs: [] },
    'OF-2003': { ctn: 20, loose: 'Pcs', shelf: 'B2', cls: 'MC-002', sub: 'ST-005', co: 'CO-03', low: 100, high: 800, attrs: [] },
    'IN-3001': { ctn: 10, loose: 'Box', shelf: 'C1', cls: 'MC-003', sub: 'ST-006', co: 'CO-04', low: 80, high: 500, attrs: ['expiry'] },
    'IN-3002': { ctn: 12, loose: 'Pcs', shelf: 'C1', cls: 'MC-003', sub: 'ST-007', co: 'CO-04', low: 40, high: 240, attrs: [] },
    'EL-4001': { ctn: 4, loose: 'Pcs', shelf: 'C2', cls: 'MC-004', sub: 'ST-008', co: 'CO-05', low: 60, high: 400, attrs: [] },
    'EL-4002': { ctn: 1, loose: 'Coil', shelf: 'C2', cls: 'MC-004', sub: 'ST-009', co: 'CO-06', low: 15, high: 80, attrs: ['precious'] },
    'FD-5001': { ctn: 144, loose: 'Pack', shelf: 'D1', cls: 'MC-005', sub: 'ST-010', co: 'CO-08', low: 1440, high: 10000, attrs: ['expiry'] },
    'FD-5002': { ctn: 12, loose: 'Pack', shelf: 'D1', cls: 'MC-005', sub: 'ST-011', co: 'CO-09', low: 240, high: 1200, attrs: ['expiry'] },
    'FD-5003': { ctn: 24, loose: 'Btl', shelf: 'D2', cls: 'MC-006', sub: 'ST-012', co: 'CO-10', low: 240, high: 1500, attrs: ['expiry', 'controlled'] },
    'FD-5004': { ctn: 12, loose: 'Pack', shelf: 'D2', cls: 'MC-006', sub: 'ST-012', co: 'CO-11', low: 120, high: 900, attrs: ['expiry'] },
    'IT-6001': { ctn: 20, loose: 'Pcs', shelf: 'B2', cls: 'MC-002', sub: 'ST-004', co: 'CO-12', low: 30, high: 200, attrs: [] },
  };
  D.items.forEach((it) => {
    const m = meta[it.sku] || { ctn: 12, loose: 'Pcs', shelf: 'A1', cls: 'MC-001', sub: 'ST-001', co: 'CO-07', low: 50, high: 500, attrs: [] };
    Object.assign(it, m, {
      company: m.co, wprice: Math.round(it.price * 0.92), retail: it.price,
      barcodes: [it.upc, '9' + it.upc.slice(1, 12) + '0'],
      batches: m.attrs.includes('expiry') ? [
        { no: it.sku.replace('-', '') + 'A', exp: '2026-12-31', qty: Math.round(it.stock * 0.35), cost: it.cost },
        { no: it.sku.replace('-', '') + 'B', exp: '2027-06-30', qty: Math.round(it.stock * 0.65), cost: Math.round(it.cost * 1.03) },
      ] : [],
    });
  });
  D.companies = [
    { code: 'CO-01', name: 'HP Pakistan', short: 'HP', city: 'Karachi', status: 'Active', color: '#2F6FD0' },
    { code: 'CO-02', name: 'Double A (Pvt) Ltd', short: 'DA', city: 'Lahore', status: 'Active', color: '#1F8A55' },
    { code: 'CO-03', name: 'Deli Stationery', short: 'Deli', city: 'Karachi', status: 'Active', color: '#E0532A' },
    { code: 'CO-04', name: 'SafeHands Industries', short: 'SH', city: 'Sialkot', status: 'Active', color: '#B7791F' },
    { code: 'CO-05', name: 'Philips Pakistan', short: 'PH', city: 'Karachi', status: 'Active', color: '#1E5BC6' },
    { code: 'CO-06', name: 'Pakistan Cables Ltd', short: 'PCL', city: 'Karachi', status: 'Active', color: '#C2410C' },
    { code: 'CO-07', name: 'Habib Packaging', short: 'HBP', city: 'Lahore', status: 'Active', color: '#1F5F45' },
    { code: 'CO-08', name: 'Shan Foods', short: 'Shan', city: 'Karachi', status: 'Active', color: '#D64545' },
    { code: 'CO-09', name: 'Tapal Tea (Pvt) Ltd', short: 'Tapal', city: 'Karachi', status: 'Active', color: '#9A3412' },
    { code: 'CO-10', name: 'Reckitt Benckiser Pakistan', short: 'RB', city: 'Karachi', status: 'Active', color: '#DB2777' },
    { code: 'CO-11', name: 'Unilever Pakistan', short: 'U', city: 'Karachi', status: 'Active', color: '#1D4ED8' },
    { code: 'CO-12', name: 'Logitech (Daraz Mall)', short: 'Logi', city: 'Islamabad', status: 'Inactive', color: '#0F766E' },
  ];
  D.companies.forEach((c) => { c.products = D.items.filter((i) => i.company === c.code).length; });
  D.classes = [
    { id: 'MC-001', name: 'Packaging', icon: 'package', visible: true, subs: [{ id: 'ST-001', name: 'Cartons', visible: true }, { id: 'ST-002', name: 'Tapes', visible: true }, { id: 'ST-003', name: 'Films & Wraps', visible: true }] },
    { id: 'MC-002', name: 'Office Supplies', icon: 'paperclip', visible: true, subs: [{ id: 'ST-004', name: 'Printer Consumables', visible: true }, { id: 'ST-005', name: 'Paper & Files', visible: true }] },
    { id: 'MC-003', name: 'Safety', icon: 'hard-hat', visible: true, subs: [{ id: 'ST-006', name: 'Gloves', visible: true }, { id: 'ST-007', name: 'Headgear', visible: true }] },
    { id: 'MC-004', name: 'Electrical', icon: 'lightbulb', visible: true, subs: [{ id: 'ST-008', name: 'Lighting', visible: true }, { id: 'ST-009', name: 'Cables & Wires', visible: true }] },
    { id: 'MC-005', name: 'Grocery', icon: 'shopping-basket', visible: true, subs: [{ id: 'ST-010', name: 'Spices', visible: true }, { id: 'ST-011', name: 'Tea & Beverages', visible: true }] },
    { id: 'MC-006', name: 'Home Care', icon: 'spray-can', visible: true, subs: [{ id: 'ST-012', name: 'Cleaning', visible: true }, { id: 'ST-013', name: 'Laundry', visible: false }] },
  ];
  D.locations = [
    { code: 'WH-LHR', name: 'Lahore HQ Warehouse', type: 'Warehouse', address: '42-B Industrial Estate, Kot Lakhpat, Lahore', stock: 12450, products: 412 },
    { code: 'WH-KHI', name: 'Karachi Depot', type: 'Warehouse', address: 'Plot 18, SITE Area, Karachi', stock: 8920, products: 336 },
    { code: 'SH-DHA', name: 'Shop DHA Phase 6', type: 'Shop', address: 'Khayaban-e-Iqbal, DHA Phase 6, Lahore', stock: 3210, products: 280 },
    { code: 'SH-ISB', name: 'Islamabad Store', type: 'Shop', address: 'Blue Area, Jinnah Avenue, Islamabad', stock: 2740, products: 245 },
    { code: 'WH-FSD', name: 'Faisalabad Depot', type: 'Warehouse', address: 'Sargodha Road, Faisalabad', stock: 4630, products: 198 },
  ];
  const shopNames = ['Bismillah Traders', 'Madina General Store', 'Al-Rehman Kiryana', 'Hamza Cash and Carry', 'Usman Super Store', 'Khan Brothers', 'New Punjab Store', 'Pak Mart', 'Fazal Din and Sons', 'Rehmat Kiryana', 'Sialkot Traders', 'Al-Habib Store', 'Model Town Mart', 'Gulberg Super Store', 'Johar Town Grocers', 'Iqbal Town Traders', 'Township Mart', 'Faisal Town Store', 'Garden Town Kiryana', 'Shadman Store', 'Wapda Town Mart', 'Allama Iqbal Store', 'Samanabad Traders', 'Ichra Bazaar Store', 'Mozang Kiryana', 'Bahria Mart', 'Valencia Store', 'DHA Cash and Carry', 'Cantt Traders', 'Walton Road Store'];
  D.routes = [
    { code: 'RT-01', name: 'Lahore Central', days: ['Mon', 'Thu'], booker: 'Bilal Khan', salesman: 'Imran Siddiqui', van: 'LES-4471', driver: 'Ali Haider' },
    { code: 'RT-02', name: 'Lahore South (DHA/Cantt)', days: ['Tue', 'Fri'], booker: 'Nadeem Akhtar', salesman: 'Tanveer Hassan', van: 'LEA-2290', driver: 'Rafiq Shah' },
    { code: 'RT-03', name: 'Lahore West (Johar/Iqbal Town)', days: ['Wed', 'Sat'], booker: 'Imran Siddiqui', salesman: 'Bilal Khan', van: 'LEB-8812', driver: 'Salman Butt' },
  ];
  const areas = ['Anarkali', 'Gulberg', 'DHA', 'Cantt', 'Johar Town', 'Iqbal Town', 'Model Town', 'Township', 'Faisal Town', 'Garden Town'];
  const tiers = ['Retailer', 'Wholesaler', 'Retailer', 'Distributor', 'Retailer'];
  const limits = [150000, 400000, 200000, 900000, 120000];
  D.shops = shopNames.map((n, i) => ({
    code: 'SHP-' + String(i + 1).padStart(3, '0'), name: n, route: D.routes[i % 3].code,
    area: areas[i % 10], tier: tiers[i % 5], limit: limits[i % 5],
    balance: Math.round(((i * 37) % 90) * 2100 + 5000), overdueDays: (i * 13) % 75,
    phone: '03' + (10 + (i % 40)) + '-' + String(4000000 + i * 7919).slice(0, 7),
  }));
  D.priceTiers = { Retailer: 1, Wholesaler: 0.95, Distributor: 0.9 };
  D.schemes = [
    { sku: 'FD-5001', buy: 10, free: 1, label: 'Buy 10 get 1' },
    { sku: 'FD-5003', buy: 12, free: 1, label: '12 + 1' },
    { sku: 'PK-1003', buy: 36, free: 2, label: 'Carton + 2' },
  ];
})(window.FS_DATA);
