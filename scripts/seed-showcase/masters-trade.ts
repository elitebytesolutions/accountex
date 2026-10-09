/**
 * Trade masters for the showcase company (FMCG distributor): warehouses and bins, brand principals, product classes,
 * ~150 products (piece + carton, barcodes, preferred supplier, reorder rules; dairy / frozen / juices track expiry),
 * customer groups and ~60 customers over the three branches, vendor categories and ~30 vendors, two price lists, two
 * sales schemes, and distribution (shop areas, vans, routes with stops, commission slabs).
 *
 * State written (ctx.state.ids.trade):
 *   units:        { PCS, CTN, ... }                       uomId by code
 *   warehouses:   [{ id, code, branchId, main }]          main = the branch's primary store (WH-LHR / WH-KHI / WH-ISB); WH-LCS = Lahore cold & returns
 *   companies:    [{ id, code, name }]                    brand principals (manufacturerId on products)
 *   classes:      [{ id, name, subclasses: [{ id, name }] }]
 *   vendors:      [{ id, code, name, kind: 'PRINCIPAL' | 'SERVICE', category, brand? }]   brand = principal's product-company name
 *   products:     [{ id, sku, name, unitId, cartonUnitId, perCarton, cost, price, wprice, gstRate, batchTracked, companyId, vendorId, classId }]
 *   groups:       [{ id, code, name }]                    RETAIL / WHOLESALE / SUPERSTORE / INSTITUTIONAL
 *   customers:    [{ id, code, name, branchId, groupId, group, creditLimit, creditDays, city }]
 *   priceLists:   [{ id, code, name }]
 *   schemes:      [{ id, name, schemeType }]
 *   shopAreas:    [{ id, code, branchId }]
 *   vans:         [{ id, regNo, branchId }]
 *   routes:       [{ id, code, name, branchId, warehouseId, vanId, salesmanId, bookerId, driverId, customerIds }]
 */
import { pool, soft, type Ctx, type Step } from './ctx.ts';
import { rngFor } from './rng.ts';

type Trade = Record<string, any>;
const T = (ctx: Ctx): Trade => (ctx.state.ids.trade ??= {});
const branchByCode = (ctx: Ctx, code: string) => (ctx.state.ids.branches as { id: string; code: string }[]).find((b) => b.code === code)!;
const items = (r: any): any[] => (Array.isArray(r) ? r : (r?.items ?? r?.rows ?? []));

/** EAN-13 from a 12-digit body. */
const ean13 = (body12: string) => body12 + ((10 - ([...body12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10);

// ------------------------------------------------------------------------------------------------ catalogue data
const BRANDS = [
  { code: 'CO-01', name: 'Nestlé Pakistan', short: 'NES', colour: '#1F4E9C', city: 'Lahore', vendor: 'Nestlé Pakistan Ltd' },
  { code: 'CO-02', name: 'Unilever Pakistan', short: 'UNI', colour: '#1F36C7', city: 'Karachi', vendor: 'Unilever Pakistan Ltd' },
  { code: 'CO-03', name: 'National Foods', short: 'NFL', colour: '#C8102E', city: 'Karachi', vendor: 'National Foods Ltd' },
  { code: 'CO-04', name: 'Shan Foods', short: 'SHN', colour: '#B5121B', city: 'Karachi', vendor: 'Shan Foods (Pvt) Ltd' },
  { code: 'CO-05', name: 'Engro Foods', short: 'ENG', colour: '#0A7B3E', city: 'Karachi', vendor: 'FrieslandCampina Engro Pakistan Ltd' },
  { code: 'CO-06', name: 'Reckitt Pakistan', short: 'RB', colour: '#E2007A', city: 'Karachi', vendor: 'Reckitt Benckiser Pakistan Ltd' },
  { code: 'CO-07', name: 'Coca-Cola Beverages Pakistan', short: 'CCBP', colour: '#E41E2B', city: 'Lahore', vendor: 'Coca-Cola Beverages Pakistan Ltd' },
  { code: 'CO-08', name: "K&N's Foods", short: 'KNS', colour: '#F7A800', city: 'Lahore', vendor: "K&N's Foods (Pvt) Ltd" },
] as const;

const CLASSES = [
  { name: 'Beverages', icon: 'cup-soda', subs: ['Carbonated Drinks', 'Juices', 'Water', 'Tea & Coffee'] },
  { name: 'Dairy', icon: 'shopping-basket', subs: ['Milk', 'Yogurt', 'Tea Whitener'] },
  { name: 'Spices & Condiments', icon: 'package', subs: ['Recipe Masala', 'Ketchup & Sauces', 'Salt'] },
  { name: 'Snacks & Noodles', icon: 'cookie', subs: ['Noodles', 'Cereals', 'Desserts'] },
  { name: 'Personal Care', icon: 'spray-can', subs: ['Soap', 'Shampoo', 'Oral Care', 'Skin Care'] },
  { name: 'Home Care', icon: 'spray-can', subs: ['Detergent', 'Dishwash', 'Disinfectant'] },
  { name: 'Frozen Foods', icon: 'package', subs: ['Nuggets', 'Kababs', 'Ready to Cook'] },
] as const;

/** brand short, class, subclass, base name, [size label, cost per piece (PKR), pieces per carton], expiry?, hs code */
type Base = [string, string, string, string, [string, number, number][], boolean, string];
const BASES: Base[] = [
  ['NES', 'Beverages', 'Water', 'Nestlé Pure Life Water', [['500 ml', 38, 24], ['1.5 L', 72, 6], ['6 L', 165, 2]], false, '2201.1010'],
  ['NES', 'Beverages', 'Juices', 'Nestlé Fruita Vitals Red Grape', [['200 ml', 52, 27], ['1 L', 245, 12]], true, '2009.6900'],
  ['NES', 'Beverages', 'Juices', 'Nestlé Fruita Vitals Mango', [['200 ml', 52, 27], ['1 L', 245, 12]], true, '2009.8900'],
  ['NES', 'Dairy', 'Milk', 'Nestlé Milkpak UHT Milk', [['250 ml', 88, 24], ['1 L', 290, 12], ['1.5 L', 420, 8]], true, '0401.2000'],
  ['NES', 'Dairy', 'Tea Whitener', 'Nestlé Everyday Tea Whitener', [['220 g', 260, 24], ['600 g', 690, 12]], false, '0402.2100'],
  ['NES', 'Dairy', 'Yogurt', 'Nestlé Nesvita Yogurt', [['400 g', 175, 12], ['800 g', 330, 6]], true, '0403.2000'],
  ['NES', 'Beverages', 'Tea & Coffee', 'Nescafé Classic Coffee', [['50 g', 520, 24], ['100 g', 980, 12], ['200 g', 1850, 6]], false, '2101.1100'],
  ['NES', 'Snacks & Noodles', 'Cereals', 'Nestlé Cerelac Wheat', [['175 g', 520, 24], ['350 g', 990, 12]], false, '1901.1000'],
  ['NES', 'Snacks & Noodles', 'Noodles', 'Maggi 2-Minute Noodles Chicken', [['65 g', 42, 96], ['4-pack', 165, 24]], false, '1902.3000'],
  ['UNI', 'Personal Care', 'Soap', 'Lux Soap Rose', [['100 g', 98, 72], ['150 g', 140, 48]], false, '3401.1100'],
  ['UNI', 'Personal Care', 'Soap', 'Lifebuoy Total Soap', [['100 g', 88, 72], ['140 g', 120, 48]], false, '3401.1100'],
  ['UNI', 'Personal Care', 'Shampoo', 'Sunsilk Black Shine Shampoo', [['180 ml', 340, 24], ['360 ml', 640, 12]], false, '3305.1000'],
  ['UNI', 'Personal Care', 'Shampoo', 'Clear Anti-Dandruff Shampoo', [['185 ml', 420, 24], ['370 ml', 790, 12]], false, '3305.1000'],
  ['UNI', 'Personal Care', 'Oral Care', 'Close Up Toothpaste', [['70 g', 135, 72], ['150 g', 260, 48]], false, '3306.1000'],
  ['UNI', 'Personal Care', 'Skin Care', 'Fair & Lovely Cream', [['25 g', 150, 72], ['50 g', 280, 48]], false, '3304.9900'],
  ['UNI', 'Home Care', 'Detergent', 'Surf Excel Washing Powder', [['500 g', 330, 24], ['1 kg', 640, 12], ['2 kg', 1250, 6]], false, '3402.2000'],
  ['UNI', 'Home Care', 'Dishwash', 'Vim Dishwash Bar', [['175 g', 70, 72], ['300 g', 115, 48]], false, '3402.2000'],
  ['UNI', 'Beverages', 'Tea & Coffee', 'Lipton Yellow Label Tea', [['95 g', 290, 48], ['190 g', 560, 24], ['475 g', 1350, 12]], false, '0902.4000'],
  ['UNI', 'Beverages', 'Tea & Coffee', 'Brooke Bond Supreme Tea', [['95 g', 265, 48], ['190 g', 510, 24], ['950 g', 2480, 6]], false, '0902.4000'],
  ['NFL', 'Spices & Condiments', 'Ketchup & Sauces', 'National Tomato Ketchup', [['300 g', 175, 24], ['800 g', 390, 12], ['1.5 kg', 690, 6]], false, '2103.2000'],
  ['NFL', 'Spices & Condiments', 'Recipe Masala', 'National Biryani Masala', [['39 g', 82, 144], ['78 g', 150, 72]], false, '0910.9100'],
  ['NFL', 'Spices & Condiments', 'Recipe Masala', 'National Karahi Masala', [['44 g', 82, 144], ['88 g', 150, 72]], false, '0910.9100'],
  ['NFL', 'Spices & Condiments', 'Salt', 'National Iodized Salt', [['800 g', 42, 24], ['1.5 kg', 75, 12]], false, '2501.0010'],
  ['NFL', 'Snacks & Noodles', 'Desserts', 'National Custard Vanilla', [['120 g', 115, 48], ['275 g', 245, 24]], false, '2106.9090'],
  ['NFL', 'Spices & Condiments', 'Ketchup & Sauces', 'National Chilli Garlic Sauce', [['300 g', 190, 24], ['800 g', 420, 12]], false, '2103.9000'],
  ['SHN', 'Spices & Condiments', 'Recipe Masala', 'Shan Biryani Masala', [['50 g', 92, 144], ['100 g', 170, 72]], false, '0910.9100'],
  ['SHN', 'Spices & Condiments', 'Recipe Masala', 'Shan Nihari Masala', [['60 g', 92, 144], ['120 g', 170, 72]], false, '0910.9100'],
  ['SHN', 'Spices & Condiments', 'Recipe Masala', 'Shan Tikka Masala', [['50 g', 88, 144], ['100 g', 165, 72]], false, '0910.9100'],
  ['SHN', 'Spices & Condiments', 'Recipe Masala', 'Shan Red Chilli Powder', [['100 g', 120, 72], ['200 g', 230, 36], ['400 g', 440, 24]], false, '0904.2210'],
  ['SHN', 'Spices & Condiments', 'Ketchup & Sauces', 'Shan Mango Pickle', [['320 g', 260, 24], ['1 kg', 690, 12]], false, '2001.9000'],
  ['ENG', 'Dairy', 'Milk', 'Olpers Full Cream Milk', [['250 ml', 90, 24], ['1 L', 295, 12], ['1.5 L', 430, 8]], true, '0401.2000'],
  ['ENG', 'Dairy', 'Tea Whitener', "Tarang Tea Whitener", [['250 ml', 70, 24], ['1 L', 240, 12]], true, '0401.2000'],
  ['ENG', 'Dairy', 'Yogurt', 'Olpers Dahi', [['400 g', 165, 12], ['800 g', 310, 6]], true, '0403.2000'],
  ['ENG', 'Dairy', 'Milk', 'Olpers Flavoured Milk Chocolate', [['180 ml', 75, 24]], true, '0402.9900'],
  ['ENG', 'Dairy', 'Milk', 'Omung Lassi', [['250 ml', 62, 24], ['1 L', 210, 12]], true, '0403.9000'],
  ['RB', 'Home Care', 'Disinfectant', 'Dettol Antiseptic Liquid', [['60 ml', 145, 48], ['250 ml', 520, 24], ['500 ml', 960, 12]], false, '3808.9400'],
  ['RB', 'Personal Care', 'Soap', 'Dettol Original Soap', [['85 g', 105, 72], ['130 g', 150, 48]], false, '3401.1100'],
  ['RB', 'Home Care', 'Disinfectant', 'Harpic Toilet Cleaner', [['500 ml', 330, 24], ['1 L', 610, 12]], false, '3402.9000'],
  ['RB', 'Home Care', 'Disinfectant', 'Mortein Insect Killer', [['375 ml', 520, 24], ['550 ml', 720, 12]], false, '3808.9100'],
  ['RB', 'Personal Care', 'Skin Care', 'Veet Hair Removal Cream', [['25 g', 140, 72], ['50 g', 260, 48]], false, '3307.9000'],
  ['CCBP', 'Beverages', 'Carbonated Drinks', 'Coca-Cola', [['345 ml', 62, 24], ['1 L', 118, 12], ['1.5 L', 160, 6], ['2.25 L', 215, 6]], false, '2202.1000'],
  ['CCBP', 'Beverages', 'Carbonated Drinks', 'Sprite', [['345 ml', 62, 24], ['1.5 L', 160, 6], ['2.25 L', 215, 6]], false, '2202.1000'],
  ['CCBP', 'Beverages', 'Carbonated Drinks', 'Fanta Orange', [['345 ml', 62, 24], ['1.5 L', 160, 6]], false, '2202.1000'],
  ['CCBP', 'Beverages', 'Juices', 'Minute Maid Pulpy Orange', [['250 ml', 70, 24], ['1 L', 230, 12]], true, '2202.9900'],
  ['CCBP', 'Beverages', 'Water', 'Kinley Water', [['500 ml', 36, 24], ['1.5 L', 68, 6]], false, '2201.1010'],
  ['KNS', 'Frozen Foods', 'Nuggets', "K&N's Chicken Nuggets", [['270 g', 520, 12], ['1 kg', 1650, 6]], true, '1602.3200'],
  ['KNS', 'Frozen Foods', 'Kababs', "K&N's Seekh Kabab", [['252 g', 560, 12], ['1 kg', 1890, 6]], true, '1602.3200'],
  ['KNS', 'Frozen Foods', 'Kababs', "K&N's Chapli Kabab", [['252 g', 540, 12], ['1 kg', 1820, 6]], true, '1602.3200'],
  ['KNS', 'Frozen Foods', 'Ready to Cook', "K&N's Chicken Burger Patty", [['276 g', 480, 12], ['1 kg', 1590, 6]], true, '1602.3200'],
  ['KNS', 'Frozen Foods', 'Ready to Cook', "K&N's Chicken Samosa", [['240 g', 380, 12]], true, '1602.3200'],
  ['KNS', 'Frozen Foods', 'Nuggets', "K&N's Chicken Tempura", [['270 g', 560, 12]], true, '1602.3200'],
  ['NES', 'Snacks & Noodles', 'Cereals', 'Nestlé Koko Krunch Cereal', [['170 g', 420, 24], ['330 g', 780, 12]], false, '1904.1000'],
  ['NES', 'Beverages', 'Tea & Coffee', 'Nestlé Milo Activ-Go', [['200 g', 560, 24], ['400 g', 1050, 12]], false, '1806.9000'],
  ['NES', 'Dairy', 'Milk', 'Nestlé Nesvita Calcium Milk', [['1 L', 310, 12]], true, '0401.2000'],
  ['UNI', 'Personal Care', 'Shampoo', 'Dove Intense Repair Shampoo', [['175 ml', 470, 24], ['360 ml', 880, 12]], false, '3305.1000'],
  ['UNI', 'Personal Care', 'Soap', 'Dove Beauty Bar', [['90 g', 210, 72], ['135 g', 290, 48]], false, '3401.1100'],
  ['UNI', 'Personal Care', 'Oral Care', 'Pepsodent Germicheck Toothpaste', [['70 g', 120, 72], ['140 g', 225, 48]], false, '3306.1000'],
  ['UNI', 'Home Care', 'Detergent', 'Rin Washing Powder', [['500 g', 270, 24], ['1 kg', 520, 12]], false, '3402.2000'],
  ['UNI', 'Home Care', 'Dishwash', 'Vim Dishwash Liquid', [['250 ml', 190, 24], ['500 ml', 350, 12]], false, '3402.2000'],
  ['UNI', 'Personal Care', 'Skin Care', 'Ponds Cold Cream', [['50 ml', 310, 48], ['100 ml', 560, 24]], false, '3304.9900'],
  ['NFL', 'Spices & Condiments', 'Recipe Masala', 'National Chicken Tikka Masala', [['50 g', 82, 144], ['100 g', 150, 72]], false, '0910.9100'],
  ['NFL', 'Spices & Condiments', 'Ketchup & Sauces', 'National Mayonnaise', [['200 ml', 210, 24], ['500 ml', 460, 12], ['1 L', 860, 6]], true, '2103.9000'],
  ['NFL', 'Snacks & Noodles', 'Desserts', 'National Jelly Strawberry', [['80 g', 85, 48]], false, '2106.9090'],
  ['SHN', 'Spices & Condiments', 'Recipe Masala', 'Shan Haleem Mix', [['300 g', 290, 24]], false, '2106.9090'],
  ['SHN', 'Spices & Condiments', 'Recipe Masala', 'Shan Chaat Masala', [['50 g', 95, 144], ['100 g', 175, 72]], false, '0910.9100'],
  ['SHN', 'Spices & Condiments', 'Salt', 'Shan Pink Himalayan Salt', [['400 g', 120, 24], ['800 g', 220, 12]], false, '2501.0010'],
  ['ENG', 'Dairy', 'Milk', 'Olpers Lite Milk', [['1 L', 300, 12]], true, '0401.1000'],
  ['ENG', 'Dairy', 'Yogurt', 'Olpers Raita Mint', [['250 g', 120, 12]], true, '0403.2000'],
  ['RB', 'Home Care', 'Disinfectant', 'Dettol Surface Cleaner', [['500 ml', 450, 12], ['1 L', 820, 6]], false, '3402.9000'],
  ['RB', 'Personal Care', 'Skin Care', 'Dettol Hand Wash', [['200 ml', 280, 24], ['500 ml refill', 420, 12]], false, '3401.3000'],
  ['RB', 'Home Care', 'Detergent', 'Vanish Stain Remover', [['500 ml', 560, 12]], false, '3402.9000'],
  ['CCBP', 'Beverages', 'Carbonated Drinks', 'Coca-Cola Zero', [['345 ml', 62, 24], ['1.5 L', 160, 6]], false, '2202.1000'],
  ['CCBP', 'Beverages', 'Carbonated Drinks', 'Sprite Zero', [['345 ml', 62, 24]], false, '2202.1000'],
  ['CCBP', 'Beverages', 'Juices', 'Minute Maid Apple', [['250 ml', 70, 24], ['1 L', 230, 12]], true, '2202.9900'],
  ['KNS', 'Frozen Foods', 'Nuggets', "K&N's Chicken Strips", [['270 g', 590, 12]], true, '1602.3200'],
  ['KNS', 'Frozen Foods', 'Ready to Cook', "K&N's Chicken Cheese Sausages", [['340 g', 620, 12]], true, '1602.3200'],
  ['KNS', 'Frozen Foods', 'Kababs', "K&N's Shami Kabab", [['252 g', 520, 12], ['1 kg', 1760, 6]], true, '1602.3200'],
];

const SERVICE_VENDORS: [string, string, string][] = [
  ['Al-Madina Goods Transport', 'Logistics', 'Lahore'], ['Karachi Cargo Movers', 'Logistics', 'Karachi'], ['Capital Freight Services', 'Logistics', 'Islamabad'],
  ['Lahore Electric Supply Company', 'Utilities', 'Lahore'], ['K-Electric Ltd', 'Utilities', 'Karachi'], ['Islamabad Electric Supply Company', 'Utilities', 'Islamabad'],
  ['Sui Northern Gas Pipelines Ltd', 'Utilities', 'Lahore'], ['Pakistan Telecommunication Company Ltd', 'Utilities', 'Islamabad'],
  ['Pakistan State Oil', 'Supplies', 'Karachi'], ['Packages Ltd', 'Supplies', 'Lahore'], ['Office World Stationers', 'Supplies', 'Lahore'],
  ['Prime Packaging Solutions', 'Supplies', 'Karachi'], ['Shield Security Services', 'Services', 'Lahore'], ['Spotless Cleaning Services', 'Services', 'Lahore'],
  ['TechServe IT Solutions', 'Services', 'Islamabad'], ['Gulberg Properties (Landlord)', 'Services', 'Lahore'], ['SITE Estates (Landlord)', 'Services', 'Karachi'],
  ['Hassan Motors Workshop', 'Services', 'Lahore'], ['Crescent Insurance Brokers', 'Services', 'Karachi'], ['Riaz & Co Chartered Accountants', 'Services', 'Lahore'],
  ['Metro Forklift Rentals', 'Services', 'Karachi'], ['Blue Area Printing Press', 'Supplies', 'Islamabad'],
];
const VENDOR_CATEGORIES = ['Principals', 'Logistics', 'Utilities', 'Services', 'Supplies'];

const GROUPS = [
  { code: 'RETAIL', name: 'Retailers', remarks: 'Kiryana and general stores served on van routes', limit: [50_000, 250_000], terms: 'NET_15', days: 15 },
  { code: 'WHOLESALE', name: 'Wholesalers', remarks: 'Bulk buyers in wholesale markets', limit: [500_000, 2_000_000], terms: 'NET_30', days: 30 },
  { code: 'SUPERSTORE', name: 'Super Stores', remarks: 'Modern trade chains and cash & carry', limit: [1_000_000, 5_000_000], terms: 'NET_45', days: 45 },
  { code: 'INSTITUTIONAL', name: 'Institutional', remarks: 'Hotels, hospitals, schools and offices', limit: [300_000, 1_500_000], terms: 'NET_30', days: 30 },
] as const;

const AREAS: Record<string, { city: string; province: string; areas: string[] }> = {
  HO: { city: 'Lahore', province: 'PUNJAB', areas: ['Gulberg', 'Model Town', 'Johar Town', 'Iqbal Town', 'DHA', 'Township', 'Shadman', 'Anarkali'] },
  KHI: { city: 'Karachi', province: 'SINDH', areas: ['Saddar', 'Clifton', 'Gulshan-e-Iqbal', 'North Nazimabad', 'Korangi', 'Tariq Road'] },
  ISB: { city: 'Islamabad', province: 'ICT', areas: ['F-10 Markaz', 'G-9 Markaz', 'I-8 Markaz', 'Blue Area', 'Saddar Rawalpindi'] },
};
const SHOP_PREFIX = ['Al-Madina', 'Bismillah', 'Al-Rehman', 'Madni', 'Sadiq', 'Hamza', 'Faisal', 'Usman', 'Bilal', 'Shaheen', 'Royal', 'City', 'Al-Habib', 'Rehmat', 'Zam Zam', 'Noor', 'Al-Karim', 'Hafiz', 'Ittefaq', 'Khyber'];
const SHOP_SUFFIX: Record<string, string[]> = {
  RETAIL: ['General Store', 'Kiryana Store', 'Mart', 'Departmental Store'],
  WHOLESALE: ['Traders', 'Wholesale Centre', 'Distributors', 'Trading Company'],
  SUPERSTORE: ['Super Mart', 'Cash & Carry', 'Hypermarket', 'Super Store'],
  INSTITUTIONAL: ['Hotel', 'Hospital Canteen', 'School Cafeteria', 'Catering Services'],
};

// ------------------------------------------------------------------------------------------------ steps
const units: Step = {
  name: 'masters.trade.units',
  async run(ctx) {
    let list = items(await ctx.admin.get('/inventory/units'));
    for (const u of [{ code: 'CTN', name: 'Carton' }, { code: 'PACK', name: 'Pack' }, { code: 'DOZ', name: 'Dozen' }]) {
      if (u.code === 'DOZ' && list.some((x) => x.code === 'DZN')) continue;
      if (!list.some((x) => x.code === u.code)) await ctx.admin.post('/inventory/units', { ...u, kind: 'COUNT', decimals: 0 });
    }
    list = items(await ctx.admin.get('/inventory/units'));
    T(ctx).units = Object.fromEntries(list.map((u) => [u.code, u.id]));
    ctx.save();
  },
};

const warehouses: Step = {
  name: 'masters.trade.warehouses',
  async run(ctx) {
    const want = [
      { code: 'WH-LHR', name: 'Lahore Main Warehouse', branch: 'HO', city: 'Lahore', address: 'Plot 9, Sundar Industrial Estate, Raiwind Road, Lahore', capacityPallets: 1200, isPrimary: true, main: true },
      { code: 'WH-KHI', name: 'Karachi Warehouse', branch: 'KHI', city: 'Karachi', address: 'Plot 14, SITE Area, Karachi', capacityPallets: 800, isPrimary: false, main: true },
      { code: 'WH-ISB', name: 'Islamabad Warehouse', branch: 'ISB', city: 'Islamabad', address: 'Plot 33, I-10/3 Industrial Area, Islamabad', capacityPallets: 500, isPrimary: false, main: true },
      { code: 'WH-LCS', name: 'Lahore Cold & Returns Store', branch: 'HO', city: 'Lahore', address: 'Plot 10, Sundar Industrial Estate, Raiwind Road, Lahore', capacityPallets: 200, isPrimary: false, main: false },
    ];
    let list = items(await ctx.admin.get('/inventory/warehouses'));
    for (const w of want) {
      if (list.some((x) => x.code === w.code)) continue;
      const { branch, main, ...body } = w;
      await ctx.admin.post('/inventory/warehouses', { ...body, type: 'WAREHOUSE', branchId: branchByCode(ctx, branch).id, blockNegativeStock: true });
    }
    list = items(await ctx.admin.get('/inventory/warehouses'));
    for (const w of list) {
      if (w.bins?.length) continue;
      const racks = w.code === 'WH-LCS' ? ['C'] : ['A', 'B', 'C'];
      for (const rack of racks) await ctx.admin.post(`/inventory/warehouses/${w.id}/bins/generate`, { prefix: `${rack}-`, from: 1, to: w.code === 'WH-LCS' ? 6 : 12, pad: 2, rack, zone: rack === 'C' ? 'Cold' : 'Dry' });
    }
    T(ctx).warehouses = want.map((w) => {
      const x = list.find((l) => l.code === w.code)!;
      return { id: x.id, code: x.code, branchId: branchByCode(ctx, w.branch).id, main: w.main };
    });
    ctx.log(`  warehouses: ${T(ctx).warehouses.length}`);
    ctx.save();
  },
};

const companies: Step = {
  name: 'masters.trade.companies',
  async run(ctx) {
    let list = await ctx.admin.all('/inventory/companies');
    await pool(BRANDS.filter((b) => !list.some((x) => x.code === b.code)), 4, (b) =>
      ctx.admin.post('/inventory/companies', { code: b.code, name: b.name, shortName: b.short.slice(0, 5), city: b.city, country: 'Pakistan', brandColour: b.colour }));
    list = await ctx.admin.all('/inventory/companies');
    T(ctx).companies = BRANDS.map((b) => { const x = list.find((l) => l.code === b.code)!; return { id: x.id, code: x.code, name: x.name, short: b.short }; });
    ctx.save();
  },
};

const classes: Step = {
  name: 'masters.trade.classes',
  async run(ctx) {
    let list = items(await ctx.admin.get('/inventory/classes'));
    for (const c of CLASSES) {
      let cls = list.find((x) => x.name === c.name);
      if (!cls) cls = await ctx.admin.post('/inventory/classes', { name: c.name, icon: c.icon, isVisible: true });
      const have = new Set((cls.subclasses ?? []).map((s: any) => s.name));
      for (const s of c.subs) if (!have.has(s)) await ctx.admin.post(`/inventory/classes/${cls.id}/subclasses`, { name: s, isVisible: true });
    }
    list = items(await ctx.admin.get('/inventory/classes'));
    T(ctx).classes = CLASSES.map((c) => { const x = list.find((l) => l.name === c.name)!; return { id: x.id, name: x.name, subclasses: x.subclasses.map((s: any) => ({ id: s.id, name: s.name })) }; });
    ctx.save();
  },
};

const vendors: Step = {
  name: 'masters.trade.vendors',
  async run(ctx) {
    const rng = rngFor('trade.vendors');
    let cats = items(await ctx.admin.get('/purchases/vendor-categories'));
    for (const [i, name] of VENDOR_CATEGORIES.entries()) if (!cats.some((c) => c.name === name)) await ctx.admin.post('/purchases/vendor-categories', { name, sortOrder: (i + 1) * 10 });
    cats = items(await ctx.admin.get('/purchases/vendor-categories'));
    const catId = (n: string) => cats.find((c) => c.name === n)!.id;
    const want = [
      ...BRANDS.map((b) => ({ name: b.vendor, category: 'Principals', city: b.city, kind: 'PRINCIPAL' as const, brand: b.name })),
      ...SERVICE_VENDORS.map(([name, category, city]) => ({ name, category, city, kind: 'SERVICE' as const, brand: null })),
    ];
    let list = await ctx.admin.all('/purchases/vendors');
    const missing = want.filter((v) => !list.some((x) => x.name === v.name));
    // Sequential so VEN-0001… follow the list order.
    for (const v of missing) {
      const principal = v.kind === 'PRINCIPAL';
      const ntn = `${rng.int(1000000, 9999999)}-${rng.int(0, 9)}`;
      await ctx.admin.post('/purchases/vendors', {
        name: v.name, legalName: v.name, categoryId: catId(v.category), ntn,
        strn: principal ? `${String(rng.int(1, 99)).padStart(2, '0')}-${String(rng.int(1, 99)).padStart(2, '0')}-${rng.int(1000, 9999)}-${rng.int(100, 999)}-${rng.int(10, 99)}` : null,
        atlStatus: 'ACTIVE', defaultWhtSection: principal ? '153_1_A' : v.category === 'Utilities' ? 'EXEMPT' : '153_1_B',
        paymentTerms: principal ? rng.pick(['NET_30', 'NET_45', 'NET_60'] as const) : v.category === 'Utilities' ? 'ON_RECEIPT' : rng.pick(['NET_15', 'NET_30'] as const),
        phone: `0${rng.pick(['42', '21', '51'])}-${rng.int(3500000, 3599999)}`, email: `accounts@${v.name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 18)}.example.com`,
        address: `${rng.int(1, 120)} ${rng.pick(['Main Boulevard', 'Industrial Area', 'Shahrah-e-Faisal', 'Ferozepur Road', 'Jinnah Avenue'])}, ${v.city}`,
        city: v.city, vendorSince: '2024-0' + rng.int(1, 9) + '-01', contactPerson: rng.pick(['Kamran Ali', 'Asad Mehmood', 'Sana Javed', 'Imran Qureshi', 'Nadia Hussain', 'Tariq Aziz']),
      });
    }
    list = await ctx.admin.all('/purchases/vendors');
    T(ctx).vendors = want.map((v) => { const x = list.find((l) => l.name === v.name)!; return { id: x.id, code: x.code, name: x.name, kind: v.kind, category: v.category, brand: v.brand }; });
    ctx.log(`  vendors: ${T(ctx).vendors.length} (${missing.length} new)`);
    ctx.save();
  },
};

const products: Step = {
  name: 'masters.trade.products',
  async run(ctx) {
    const rng = rngFor('trade.products');
    const t = T(ctx);
    const codes: Record<string, string> = t.units;
    const taxCodes = items(await soft(ctx, 'tax codes', () => ctx.admin.get('/tax/codes')) ?? []);
    const gst18 = taxCodes.find((c: any) => Number(c.rate) === 18 && /sales|gst|output/i.test(`${c.code} ${c.name} ${c.taxType ?? ''}`) && !/input|purchase/i.test(`${c.code} ${c.name}`));
    type P = { sku: string; name: string; base: Base; size: [string, number, number]; idx: number };
    const all: P[] = [];
    let n = 0;
    for (const base of BASES) for (const size of base[4]) all.push({ sku: `${base[0].slice(0, 3)}-${String(1001 + n).padStart(4, '0')}`, name: `${base[3]} ${size[0]}`, base, size, idx: n++ });

    const existing = await ctx.admin.all('/inventory/products');
    const bySku = new Map(existing.map((p: any) => [p.sku, p]));
    const company = (short: string) => t.companies.find((c: any) => c.short === short);
    const cls = (name: string) => t.classes.find((c: any) => c.name === name);
    const vendorFor = (short: string) => t.vendors.find((v: any) => v.brand === BRANDS.find((b) => b.short === short)!.name);
    let created = 0;
    await pool(all.filter((p) => !bySku.has(p.sku)), 6, async (p) => {
      const [short, className, subName, , , expiry, hs] = p.base;
      const [, cost, perCtn] = p.size;
      const c = cls(className);
      const price = Math.round(cost * (1.14 + rng.next() * 0.1));
      const wprice = Math.round(cost * 1.07);
      const body12 = `896${String(1000000 + p.idx * 37).padStart(7, '0').slice(-7)}${String(BRANDS.findIndex((b) => b.short === short)).padStart(2, '0')}`;
      const pieceEan = ean13(body12);
      const ctnEan = ean13(`1${body12.slice(1)}`);
      const daily = Math.max(2, Math.round(9000 / cost));
      await ctx.admin.post('/inventory/products', {
        sku: p.sku, upc: pieceEan, name: p.name, description: `${p.name}, ${perCtn} pieces per carton.`, status: 'ACTIVE',
        manufacturerId: company(short).id, distributorVendorId: vendorFor(short)?.id ?? null,
        productClassId: c.id, productSubclassId: c.subclasses.find((s: any) => s.name === subName)?.id ?? null,
        uomId: codes.PCS, ctn: perCtn, defaultShelf: `${'ABC'[p.idx % 3]}${(p.idx % 12) + 1}`,
        cost, price, wprice, gstRate: 18, taxCodeId: gst18?.id ?? null,
        lowLevel: daily * 7, highLevel: daily * 30, trackExpiry: expiry, hsCode: hs, weightKg: null, leadDays: rng.int(3, 10),
        units: perCtn > 1 ? [{ uomId: codes.CTN, factor: perCtn, isPurchaseDefault: true, isSalesDefault: false }] : [],
        barcodes: [{ barcode: pieceEan, kind: 'PIECE', qtyPerScan: 1, isPrimary: true }, ...(perCtn > 1 ? [{ barcode: ctnEan, kind: 'CARTON', qtyPerScan: perCtn, isPrimary: false }] : [])],
        suppliers: vendorFor(short) ? [{ vendorId: vendorFor(short).id, vendorItemCode: `${short}${1001 + p.idx}`, lastPrice: cost, leadDays: rng.int(3, 10), sharePct: 100, isPreferred: true }] : [],
      });
      created++;
    });
    const list = await ctx.admin.all('/inventory/products');
    const map = new Map(list.map((p: any) => [p.sku, p]));
    t.products = all.map((p) => {
      const x: any = map.get(p.sku);
      const [short, className, , , , expiry] = p.base;
      return {
        id: x.id, sku: p.sku, name: p.name, unitId: codes.PCS, cartonUnitId: p.size[2] > 1 ? codes.CTN : null, perCarton: p.size[2],
        cost: Number(x.cost), price: Number(x.price), wprice: Number(x.wprice ?? x.cost), gstRate: 18, batchTracked: expiry,
        companyId: company(short).id, vendorId: vendorFor(short)?.id ?? null, classId: cls(className).id,
      };
    });
    ctx.log(`  products: ${t.products.length} (${created} new, ${t.products.filter((p: any) => p.batchTracked).length} expiry-tracked)`);
    ctx.save();
  },
};

const reorderRules: Step = {
  name: 'masters.trade.reorder-rules',
  async run(ctx) {
    const t = T(ctx);
    const existing = items(await ctx.admin.get('/inventory/reorder-rules'));
    const have = new Set(existing.map((r: any) => `${r.item?.id ?? r.itemId ?? r.product?.id}:${r.warehouse?.id ?? r.warehouseId}`));
    const mains = t.warehouses.filter((w: any) => w.main);
    const share: Record<string, number> = { 'WH-LHR': 1, 'WH-KHI': 0.6, 'WH-ISB': 0.4 };
    const todo = t.products.flatMap((p: any) => mains.map((w: any) => ({ p, w }))).filter(({ p, w }: any) => !have.has(`${p.id}:${w.id}`));
    await pool(todo, 6, ({ p, w }: any) => {
      const daily = Math.max(2, Math.round((9000 / p.cost) * share[w.code]));
      return ctx.admin.post('/inventory/reorder-rules', { itemId: p.id, warehouseId: w.id, lowLevel: daily * 7, highLevel: daily * 30, leadDays: 7, safetyDays: 3, coverAlertDays: 10, isActive: true });
    });
    ctx.log(`  reorder rules: ${todo.length} new`);
  },
};

const customers: Step = {
  name: 'masters.trade.customers',
  async run(ctx) {
    const rng = rngFor('trade.customers');
    const t = T(ctx);
    let groups = items(await ctx.admin.get('/sales/customer-groups'));
    for (const g of GROUPS) if (!groups.some((x) => x.code === g.code)) await ctx.admin.post('/sales/customer-groups', { code: g.code, name: g.name, remarks: g.remarks });
    groups = items(await ctx.admin.get('/sales/customer-groups'));
    t.groups = GROUPS.map((g) => { const x = groups.find((l) => l.code === g.code)!; return { id: x.id, code: x.code, name: x.name }; });

    // 60 customers: Lahore 30, Karachi 18, Islamabad 12; mix 60% retail, 20% wholesale, 12% super stores, 8% institutional.
    const plan: { branch: string; group: (typeof GROUPS)[number] }[] = [];
    for (const [branch, count] of [['HO', 30], ['KHI', 18], ['ISB', 12]] as const)
      for (let i = 0; i < count; i++) plan.push({ branch, group: GROUPS[i % 25 < 15 ? 0 : i % 25 < 20 ? 1 : i % 25 < 23 ? 2 : 3] });
    const used = new Set<string>();
    const want = plan.map(({ branch, group }) => {
      const a = AREAS[branch];
      let name = '';
      do name = `${rng.pick(SHOP_PREFIX)} ${rng.pick(SHOP_SUFFIX[group.code])}`; while (used.has(name));
      used.add(name);
      const area = rng.pick(a.areas);
      return { branch, group, name: `${name}, ${area}`, area, a };
    });
    const existing = await ctx.admin.all('/sales/customers');
    const missing = want.filter((w) => !existing.some((x: any) => x.name === w.name));
    for (const w of missing) {
      const g = w.group, registered = g.code !== 'RETAIL';
      await ctx.admin.post('/sales/customers', {
        name: w.name, displayName: w.name.split(',')[0].slice(0, 60), customerType: g.code === 'INSTITUTIONAL' && rng.chance(0.3) ? 'GOVERNMENT' : g.code === 'RETAIL' ? 'INDIVIDUAL' : 'COMPANY',
        customerGroupId: t.groups.find((x: any) => x.code === g.code).id, branchId: branchByCode(ctx, w.branch).id,
        customerSince: `2024-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
        customerChannel: g.code === 'WHOLESALE' ? 'WHOLESALE' : 'STANDARD',
        ntn: registered ? `${rng.int(1000000, 9999999)}-${rng.int(0, 9)}` : null,
        cnic: registered ? null : `${rng.pick(['35202', '42101', '61101'])}-${rng.int(1000000, 9999999)}-${rng.int(1, 9)}`,
        strn: registered && g.code !== 'INSTITUTIONAL' ? `${String(rng.int(1, 99)).padStart(2, '0')}-${String(rng.int(1, 99)).padStart(2, '0')}-${rng.int(1000, 9999)}-${rng.int(100, 999)}-${rng.int(10, 99)}` : null,
        atlStatus: registered ? 'ACTIVE' : 'NOT_ON_ATL', isSalesTaxRegistered: registered && g.code !== 'INSTITUTIONAL',
        applyFurtherTax: !registered && rng.chance(0.2), deductsWht: g.code === 'SUPERSTORE' || g.code === 'INSTITUTIONAL',
        whtSection: g.code === 'SUPERSTORE' || g.code === 'INSTITUTIONAL' ? '153_1_A' : null,
        whtRate: g.code === 'SUPERSTORE' || g.code === 'INSTITUTIONAL' ? 5 : null,
        contactPerson: rng.pick(['Muhammad Asif', 'Ahmed Raza', 'Shahid Iqbal', 'Naveed Akhtar', 'Zahid Hussain', 'Waqas Ahmed', 'Rizwan Khan', 'Faisal Mehmood', 'Saima Noreen', 'Adnan Sheikh']),
        mobile: `03${rng.int(0, 4)}${rng.int(0, 9)}-${rng.int(1000000, 9999999)}`, phone: null,
        email: registered ? `purchase@${w.name.split(',')[0].toLowerCase().replace(/[^a-z]+/g, '').slice(0, 20)}.example.com` : null,
        billingAddress: `Shop ${rng.int(1, 250)}, ${rng.pick(['Main Bazar', 'Market Road', 'Commercial Area', 'Circular Road', 'Main Boulevard'])}, ${w.area}, ${w.a.city}`,
        area: w.area, city: w.a.city, province: w.a.province, shippingSameAsBilling: true,
        creditLimit: rng.money(g.limit[0], g.limit[1], 10_000), paymentTerms: g.terms, creditDays: g.days,
        // Credit checks warn rather than block, so the history of invoices posts in full.
        blockOverLimit: false, autoReminders: true,
      });
    }
    const list = await ctx.admin.all('/sales/customers');
    t.customers = want.map((w) => {
      const x: any = list.find((l: any) => l.name === w.name);
      return { id: x.id, code: x.code, name: x.name, branchId: branchByCode(ctx, w.branch).id, branch: w.branch, groupId: t.groups.find((g: any) => g.code === w.group.code).id, group: w.group.code, creditLimit: Number(x.creditLimit), creditDays: w.group.days, city: w.a.city, area: w.area };
    });
    ctx.log(`  customers: ${t.customers.length} (${missing.length} new)`);
    ctx.save();
  },
};

const pricing: Step = {
  name: 'masters.trade.pricing',
  async run(ctx) {
    const t = T(ctx);
    let lists = items(await ctx.admin.get('/sales/price-lists'));
    const want = [
      { code: 'PL-WHS', name: 'Wholesale Price List', markupPct: 7, group: 'WHOLESALE', remarks: 'Cost plus 7% for wholesale markets' },
      { code: 'PL-MT', name: 'Modern Trade Price List', markupPct: 10, group: 'SUPERSTORE', remarks: 'Cost plus 10% for super stores and chains' },
    ];
    for (const l of want) {
      if (lists.some((x) => x.code === l.code)) continue;
      await ctx.admin.post('/sales/price-lists', { code: l.code, name: l.name, markupPct: l.markupPct, roundingTo: 1, currencyCode: 'PKR', validFrom: '2025-04-01', remarks: l.remarks, fill: 'MARKUP' });
    }
    lists = items(await ctx.admin.get('/sales/price-lists'));
    t.priceLists = want.map((l) => { const x = lists.find((y) => y.code === l.code)!; return { id: x.id, code: x.code, name: x.name, group: l.group }; });
    // Groups use their list.
    const groups = items(await ctx.admin.get('/sales/customer-groups'));
    for (const pl of t.priceLists) {
      const g = groups.find((x) => x.code === pl.group);
      if (g && g.priceList?.id !== pl.id && g.priceListId !== pl.id) await soft(ctx, `price list on ${g.code}`, () => ctx.admin.patch(`/sales/customer-groups/${g.id}`, { priceListId: pl.id, rowVersion: g.rowVersion }));
    }

    const schemes = items(await ctx.admin.get('/sales/schemes'));
    const juices = t.products.filter((p: any) => /Juice|Fruita|Pulpy/.test(p.name)).slice(0, 6);
    const wantSchemes = [
      {
        name: 'Juice Summer Offer: Buy 10 Get 1 Free', description: 'One free piece with every ten juice packs (summer 2026).', schemeType: 'FREE_GOODS',
        validFrom: '2026-05-01', validTo: '2026-08-31', buyQty: 10, freeQty: 1, appliesToAll: true, budgetCap: 500_000,
        items: [...juices.map((p: any) => ({ itemId: p.id, itemRole: 'BUY', qty: 10 })), ...juices.map((p: any) => ({ itemId: p.id, itemRole: 'FREE', qty: 1 }))],
        eligibility: [],
      },
      {
        name: 'Modern Trade 2% Invoice Discount', description: '2% off invoices of PKR 250,000 and above for super stores.', schemeType: 'INVOICE_DISCOUNT',
        validFrom: '2025-07-01', validTo: '2026-12-31', discountPct: 2, minInvoiceAmount: 250_000, appliesToAll: false, budgetCap: 1_500_000,
        items: [], eligibility: [{ customerGroupId: t.groups.find((g: any) => g.code === 'SUPERSTORE').id, isExcluded: false }],
      },
    ];
    for (const s of wantSchemes) if (!schemes.some((x) => x.name === s.name)) await soft(ctx, `scheme ${s.name}`, () => ctx.admin.post('/sales/schemes', s));
    const after = items(await ctx.admin.get('/sales/schemes'));
    t.schemes = after.map((s: any) => ({ id: s.id, code: s.code, name: s.name, schemeType: s.schemeType, validFrom: s.validFrom, validTo: s.validTo }));
    ctx.log(`  price lists: ${t.priceLists.length}, schemes: ${t.schemes.length}`);
    ctx.save();
  },
};

const distribution: Step = {
  name: 'masters.trade.distribution',
  async run(ctx) {
    const t = T(ctx);
    const rng = rngFor('trade.distribution');
    // Shop areas (one per customer area).
    let areas = items(await ctx.admin.get('/distribution/shop-areas'));
    for (const [branch, a] of Object.entries(AREAS)) for (const name of a.areas) {
      const code = `${branch === 'HO' ? 'LHR' : branch}-${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase()}`;
      if (!areas.some((x) => x.code === code)) await ctx.admin.post('/distribution/shop-areas', { code, name, city: a.city, branchId: branchByCode(ctx, branch).id });
    }
    areas = items(await ctx.admin.get('/distribution/shop-areas'));
    t.shopAreas = areas.map((x: any) => ({ id: x.id, code: x.code, name: x.name, branchId: x.branch?.id ?? x.branchId ?? null }));

    // Employees come from masters-people (another process); wait for them so route seats can be filled.
    let staff: any = null;
    for (let i = 0; i < 60; i++) {
      const emps = await ctx.admin.all('/hr/employees').catch(() => []);
      if (emps.length >= 10) { staff = (await ctx.admin.get('/distribution/routes/options')).staff; break; }
      if (i === 0) ctx.log('  waiting for employees (masters-people)…');
      await new Promise((r) => setTimeout(r, 20_000));
    }
    if (!staff) ctx.log('  ! no employees yet: routes are created without staff seats');

    // Vans: two per branch.
    let vans = items(await ctx.admin.get('/distribution/vans'));
    const vanPlan = [['HO', 'LEA-4521', 'Suzuki Ravi Pickup'], ['HO', 'LEB-7788', 'Hyundai Shehzore'], ['HO', 'LEC-1290', 'Suzuki Bolan'], ['KHI', 'KHI-3345', 'Hyundai Shehzore'], ['KHI', 'KHI-9012', 'Suzuki Ravi Pickup'], ['ISB', 'ICT-6610', 'Suzuki Ravi Pickup']] as const;
    for (const [i, [branch, regNo, model]] of vanPlan.entries()) {
      if (vans.some((v) => v.regNo === regNo)) continue;
      await ctx.admin.post('/distribution/vans', {
        regNo, model, capacityCtn: model.includes('Shehzore') ? 220 : 120, capacityKg: model.includes('Shehzore') ? 2500 : 1000, branchId: branchByCode(ctx, branch).id,
        defaultDriverEmployeeId: staff?.driver?.[i % Math.max(1, staff.driver.length)]?.id ?? null, status: 'ACTIVE', remarks: null,
      });
    }
    vans = items(await ctx.admin.get('/distribution/vans'));
    const branchOf = (v: any) => v.branch?.id ?? v.branchId;
    t.vans = vans.map((v: any) => ({ id: v.id, regNo: v.regNo, branchId: branchOf(v) }));

    // Routes: Lahore 3, Karachi 2, Islamabad 1; stops = the branch's retail and wholesale customers.
    let routes = items(await ctx.admin.get('/distribution/routes'));
    const routePlan = [['HO', 'Lahore North (Shadman, Anarkali, Iqbal Town)', ['MON', 'THU']], ['HO', 'Lahore Central (Gulberg, Model Town)', ['TUE', 'FRI']], ['HO', 'Lahore South (Johar Town, DHA, Township)', ['WED', 'SAT']], ['KHI', 'Karachi East (Gulshan, Korangi)', ['MON', 'WED', 'FRI']], ['KHI', 'Karachi West (Saddar, Clifton, Tariq Road)', ['TUE', 'THU', 'SAT']], ['ISB', 'Islamabad & Rawalpindi', ['MON', 'WED', 'FRI']]] as const;
    // Prefer field staff over the company's default user (who holds every role).
    const pool_ = (k: string) => { const all = staff?.[k] ?? []; const field = all.filter((e: any) => e.code !== 'EMP-0001'); return field.length ? field : all; };
    const seat = (k: string, i: number) => { const p = pool_(k); return p.length ? p[i % p.length].id : null; };
    const vanFor = (branchId: string, i: number) => { const v = t.vans.filter((x: any) => x.branchId === branchId); return v.length ? v[i % v.length].id : null; };
    for (const [i, [branch, name, days]] of routePlan.entries()) {
      if (routes.some((r) => r.name === name)) continue;
      const b = branchByCode(ctx, branch);
      await ctx.admin.post('/distribution/routes', {
        name, branchId: b.id, sourceWarehouseId: t.warehouses.find((w: any) => w.branchId === b.id && w.main).id,
        vehicleId: vanFor(b.id, i),
        bookerEmployeeId: seat('booker', i), salesmanEmployeeId: seat('salesman', i), driverEmployeeId: seat('driver', i), supervisorEmployeeId: seat('supervisor', i),
        days: [...days],
      });
    }
    routes = items(await ctx.admin.get('/distribution/routes'));
    // Fill empty seats on re-runs once staff exist.
    for (const [i, r] of routes.entries()) {
      const id = (x: any) => x?.id ?? x ?? null;
      const held = (x: any) => (x && x.code !== 'EMP-0001' ? id(x) : null);
      const cur = { booker: held(r.booker), salesman: held(r.salesman), driver: held(r.driver), supervisor: held(r.supervisor) };
      const van = id(r.van ?? r.vehicle ?? r.vehicleId) ?? vanFor(r.branchId ?? r.branch?.id, i);
      if ((!staff || Object.entries(cur).every(([k, v]) => v || !pool_(k).some((e: any) => e.code !== 'EMP-0001'))) && van === id(r.van ?? r.vehicle ?? r.vehicleId)) continue;
      await soft(ctx, `seats on ${r.name}`, () => ctx.admin.put(`/distribution/routes/${r.id}/assignment`, {
        bookerEmployeeId: cur.booker ?? seat('booker', i), salesmanEmployeeId: cur.salesman ?? seat('salesman', i), driverEmployeeId: cur.driver ?? seat('driver', i),
        supervisorEmployeeId: cur.supervisor ?? seat('supervisor', i), vehicleId: van, rowVersion: r.rowVersion,
      }));
    }
    routes = items(await ctx.admin.get('/distribution/routes'));

    // Stops: each route takes the branch's van-served customers whose area is in its name (Islamabad takes all).
    const tiers: Record<string, string> = { RETAIL: 'RETAILER', WHOLESALE: 'WHOLESALER', SUPERSTORE: 'DISTRIBUTOR', INSTITUTIONAL: 'RETAILER' };
    const assigned = new Map<string, string[]>();
    for (const r of routes) {
      const branchId = r.branch?.id ?? r.branchId;
      const branchRoutes = routes.filter((x: any) => (x.branch?.id ?? x.branchId) === branchId);
      const mine = t.customers.filter((c: any) => c.branchId === branchId && c.group !== 'SUPERSTORE' && c.group !== 'INSTITUTIONAL')
        .filter((c: any) => branchRoutes.length === 1 || r.name.includes(c.area.split(/[- ]/)[0]) || (!branchRoutes.some((x: any) => x.name.includes(c.area.split(/[- ]/)[0])) && branchRoutes[0].id === r.id));
      assigned.set(r.id, mine.map((c: any) => c.id));
      if ((r.stops?.length ?? r.stopCount ?? 0) > 0 || !mine.length) continue;
      await soft(ctx, `stops on ${r.name}`, async () => {
        for (const [j, c] of mine.entries()) {
          const area = t.shopAreas.find((a: any) => a.name === c.area && a.branchId === branchId);
          await ctx.admin.put(`/distribution/shop-profiles/${c.id}`, { routeId: r.id, areaId: area?.id ?? null, visitSeq: j + 1, priceTier: tiers[c.group] });
        }
        const fresh = items(await ctx.admin.get('/distribution/routes')).find((x: any) => x.id === r.id);
        await ctx.admin.put(`/distribution/routes/${r.id}/stops`, { stops: mine.map((c: any, j: number) => ({ customerId: c.id, weekday: null, plannedEta: `${String(9 + Math.floor(j / 3)).padStart(2, '0')}:${String((j % 3) * 20).padStart(2, '0')}` })), rowVersion: fresh.rowVersion });
      });
    }
    t.routes = routes.map((r: any) => ({
      id: r.id, code: r.code, name: r.name, branchId: r.branch?.id ?? r.branchId, warehouseId: r.sourceWarehouse?.id ?? r.sourceWarehouseId ?? null, vanId: r.van?.id ?? r.vehicle?.id ?? r.vehicleId ?? null,
      salesmanId: r.salesman?.id ?? r.salesmanEmployeeId ?? null, bookerId: r.booker?.id ?? r.bookerEmployeeId ?? null, driverId: r.driver?.id ?? r.driverEmployeeId ?? null,
      customerIds: assigned.get(r.id) ?? [],
    }));

    // Salesman commission bands (on target achievement).
    const slabs: any = await ctx.admin.get('/distribution/commission-slabs');
    if (!(slabs?.periods ?? []).length) await soft(ctx, 'commission slabs', () => ctx.admin.put('/distribution/commission-slabs', {
      effectiveFrom: '2025-04-01', effectiveTo: null,
      bands: [{ label: 'Below 80%', fromPct: 0, toPct: 80, ratePct: 0.5 }, { label: '80% to 100%', fromPct: 80, toPct: 100, ratePct: 1 }, { label: 'Above target', fromPct: 100, toPct: null, ratePct: 1.5 }],
    }));
    void rng;
    ctx.log(`  areas ${t.shopAreas.length}, vans ${t.vans.length}, routes ${t.routes.length} (${t.routes.filter((r: any) => r.salesmanId).length} with a salesman)`);
    ctx.save();
  },
};

export const steps: Step[] = [units, warehouses, companies, classes, vendors, products, reorderRules, customers, pricing, distribution];
