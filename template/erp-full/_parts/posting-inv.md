## Inventory (inv)

**Costing.** Moving weighted average per item (`Inventory.Products.avgCost`, Bhatti AVCOST). The ledger trigger `Inventory.triggerStockLedgerApply` recomputes it on every costed receipt (GRN, MANUAL_IN, OPENING, ASSEMBLY):
`newAvg = (prevQty × avg + qtyIn × unitCost) / (prevQty + qtyIn)`, where `prevQty` is the item's on hand across all warehouses before the row; when `prevQty ≤ 0` the receipt cost becomes the average. TRANSFER_IN, SALES_RETURN, COUNT and ADJUSTMENT receipts move stock at the existing average and do not change it. Outgoing rows default `unitCost` to the current `avgCost`, so the stock value leaving equals the GL credit. Landed cost (purchase module) revalues `avgCost` directly and logs `Inventory.ProductPriceLogs` (AVG_COST).

**Picking.** Batches are picked **FEFO** (earliest `expiryDate` first); QUARANTINE / RETURN_TO_PRINCIPAL / WRITTEN_OFF batches cannot be sold (trigger). Expiry-tracked items need a batch on every movement.

**Accounts.** Resolved from `Company.DefaultAccountMappings` unless the document or reason names one. The **inventory account is the warehouse's** `Inventory.Warehouses.inventoryAccountId` (default role INVENTORY, e.g. 1201 Stock in trade / 1310 Inventory). Other roles used below: STOCK_ADJUSTMENT (5090), STOCK_WRITE_OFF (5095), INVENTORY_SHRINKAGE (5160), INVENTORY_GAIN (4920), STOCK_IN_TRANSIT (1205), OPENING_BALANCE_EQUITY, plus the movement reason's `expenseAccountId` and the stock-voucher type accounts (5110-03, 5220-07, 5220-08, 5220-03). All JVs are system postings in `Accounting.Vouchers` with `sourceDocType` / `sourceDocId` = the inventory document; values are Σ ledger `value` of the document (cost, never selling price).

| Event | Document → ledger rows | Dr | Cr | Notes |
|---|---|---|---|---|
| **Manual stock in** (MI), reason Opening Stock | `Inventory.StockInOut` mode IN → OPENING in | Inventory (warehouse) | Opening balance equity | at line `unitCost`; recomputes avg |
| Manual stock in, other reasons (Adjustment, Damaged Return, Production, Found in Count, Gift Received, Internal Return) | MANUAL_IN in | Inventory | reason `expenseAccountId` (Adjustment 5090, Found in Count 4920, Gift Received other income, Internal Return the internal-use expense, Production WIP / production clearing, Damaged Return 5090) | recomputes avg |
| **Manual stock out** (MO), reasons Consumption, Sample Issue, Internal Use, Adjustment, Damaged / Breakage, Lost / Theft | MANUAL_OUT out at avg | reason expense (consumables, 5220-08, 5220-03, 5090, 5110-03, 5160) | Inventory | |
| Manual stock out, Expired Write-off | WRITE_OFF out at avg | 5095 Inventory write-off | Inventory | batch → WRITTEN_OFF when emptied |
| **Stock adjustment** (ADJ), net decrease | ADJUSTMENT out per line (WRITE_OFF for write-off reasons) | offset account (5090 / 5095) | Inventory | at weighted average; posted only after approval when \|net\| > Rs 25,000 |
| Stock adjustment, net increase | ADJUSTMENT in per line | Inventory | offset account (5090) | mixed documents post both sides per line |
| **Batch write-off** (Batches & Expiry "Write off…") | ADJ (reason Expired write-off) → WRITE_OFF out | 5095 | Inventory | `Inventory.ProductBatches.disposition = WRITTEN_OFF` |
| Batch → Clearance / Priority / Quarantine | disposition only | — | — | no stock or GL effect |
| Batch → Return to principal | disposition; stock leaves on `Purchases.PurchaseReturns` (PURCHASE_RETURN) | per purchase module | | claim in `Inventory.PrincipalClaims` (EXPIRY) |
| **Transfer** (TRF) posted / dispatched | TRANSFER_OUT at source (avg cost) | Stock in transit (1205) | Source inventory | JV **only** when source and destination inventory accounts differ; otherwise no GL |
| Transfer received | TRANSFER_IN at destination (received qty, same unit cost) | Destination inventory | Stock in transit | as above |
| Transfer receipt shortage (Full) | — (never arrived) | 5160 Inventory shrinkage (or carrier receivable) | Stock in transit / source inventory | value = short qty × cost |
| Transfer receipt excess (Full) | extra TRANSFER_IN qty | Destination inventory | 4920 Inventory gains | |
| Van loading (Full, VAN warehouse) | TRANSFER_OUT / TRANSFER_IN warehouse ↔ van | — | — | same inventory account → no GL; settlement handled in dist |
| **Stock count variance** (SC) shortage (Full) | COUNT out per short line | 5160 Inventory shrinkage & losses | 1201 Stock in trade | JV at approval |
| Stock count excess (Full) | COUNT in per excess line | 1201 Stock in trade | 4920 Inventory gains (other income) | |
| **Stock voucher** Breakage (BRK) (Full) | BREAKAGE out | 5110-03 Stock breakage & write-off | Inventory | |
| Stock voucher Gift (GFT) (Full) | GIFT out | 5220-07 Gifts & promotions | Inventory | |
| Stock voucher Sample (SMP) (Full) | SAMPLE out | 5220-08 Samples & trials | Inventory | returned samples: MI reason Internal Return, Cr 5220-08 |
| Stock voucher Internal use (INT) (Full) | INTERNAL_USE out | 5220-03 Stationery & office supplies (cost centre = voucher cost centre) | Inventory | |
| **Assembly** ASSEMBLE (Full) | ASSEMBLY out per component (avg); ASSEMBLY in of the kit item at Σ component cost | Kit inventory | Component inventory | JV only when accounts differ; kit avg recomputed |
| Assembly DISASSEMBLE (Full) | ASSEMBLY out of kit (avg); ASSEMBLY in per component at kit cost × component share | Component inventory | Kit inventory | rounding difference to 5090 |
| Reservation (Full) | `Inventory.StockReservations` → `StockBalances.qtyReserved` | — | — | no ledger row, no GL |
| Price change (bulk / inline) | `Inventory.ProductPriceLogs` | — | — | prices only, no GL |

Stock effects owned by other modules (they write `Inventory.StockMovements`; GL is in their sections): GRN → GRN in (Dr Inventory / Cr GRNI), purchase return → PURCHASE_RETURN out, sale (INV / SV / WS / POS / DC) → SALE out at avg cost (Dr COGS / Cr Inventory), sales return → SALES_RETURN in at the original issue cost.
