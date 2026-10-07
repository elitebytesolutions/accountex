# Finsoft v4 contract (read KIT2.md and KIT3.md first; all their rules apply)

## What v4 adds
An Inventory module rebuilt from the previous frontend's product/stock screens, a Wholesale & Distribution module, a feature-flag platform in Admin, and a business calculator. The design language is unchanged: Fundcy × Finsoft tokens, light AND dark, tokens only, purposeful motion, keyboard support.

## Ownership
Same rules as before. Each agent owns only its listed files plus its own scratch subfolder `<scratchpad>\<letter>\`. Never touch 10-styles.css, 95-ui.js, 99-app.js, 90-nav.js, 91-data.js or build.ps1. `build.ps1` already includes every v4 file.

## New FS_DATA fields (src/91-data.js)
- `items[]` gain:
  - `ctn` (pack size: pieces per carton), `loose` (piece unit name), `wprice` (wholesale), `retail`
  - `shelf`, `cls`/`sub` (class ids), `company` (CO-xx), `low`/`high` (reorder levels)
  - `attrs[]` ('short' | 'expiry' | 'precious' | 'controlled'), `barcodes[]` (piece + carton), `batches[]` {no, exp, qty, cost}
- `companies[]` {code CO-01..12, name, short, city, status, color, products}
- `classes[]` {id MC-001.., name, icon, visible, subs[{id ST-0xx, name, visible}]}
- `locations[]` {code, name, type Warehouse|Shop, address, stock, products}
- `routes[]` {code RT-01..03, name, days[], booker, salesman, van, driver}
- `shops[]` 30 retail shops {code SHP-001.., name, route, area, tier Retailer|Wholesaler|Distributor, limit, balance, overdueDays, phone}
- `priceTiers` {Retailer:1, Wholesaler:.95, Distributor:.9}
- `schemes[]` {sku, buy, free, label}
Clone data before mutating it in your screens.

## Previous-frontend references (old Finsoft repo)
`C:\Users\saim javed\Documents\finsoft`:
- Images in `ui-prototype\design\` (view them with Read).
- Screens in `apps\web\src\screens\`.
- CSS in `packages\ui\src\styles\kit.css` (grep the prefix):
  - All Products: `product-catalogue.tsx`, `.cat-` (K l.1359–1433), image `product catalogue page .png`.
  - Companies: `companies.tsx`, `.pco-` (K l.1435–1526), image `company product page .png`.
  - Classes: `product-classes.tsx`, `.pc-` (K l.1280–1358), image `porduct classification.png`.
  - Product detail: `detail-pages.tsx` ProductDetail l.89–238.
  - Manual Stock In/Out: `manual-stock.tsx`, `ms-*`. It has NO CSS in the repo, so build it from image `manual stock in and out page .png`.
  - Stock Transfer: `stock-transfer.tsx`, `.st-` (K l.1918–1980), image `stock transer page .png`.
  - Stock count / batches / as-of / issue: `inventory-pages.tsx` (PhysicalCount l.475, BatchExpiry l.692, StockAsOf l.792, IssueAdjustment l.336).
  - Stock Movements: `stock-movements.tsx`, `.sm-` (K l.3696–3754).
  - Stock In View: image only, `stocks page stock in .png`.
  - Demand of Goods: image only, `manual demand of goods .png`.
  - Today's Tasks calculator: image `todays task page .png`; CSS `.tw-calc` / `.tw-keys` in kit.css (grep `tw-calc`).
- Recolour everything to the v2 tokens. Generic SME products come from FS_DATA (no pharmacy names).
