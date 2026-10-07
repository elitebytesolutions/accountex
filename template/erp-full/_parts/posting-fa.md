## Fixed assets (fa) — capitalisation, depreciation, disposal, transfer

Accounts come from the asset (defaults from `FixedAssets.FixedAssetCategories`): asset cost (e.g. 1105 Vehicles — Cost), accumulated depreciation (e.g. 1155 Vehicles — Acc. Dep.), depreciation expense (e.g. 6107). Gain/loss and output-GST accounts come from `Company.DefaultAccountMappings` (FA_GAIN e.g. 4910 Other Income / 4210-02, FA_LOSS, OUTPUT_GST). All journals pass the acc posting guard (balanced, open period, after books lock date). Stock effect: none.

### Capitalisation
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Asset bought on a vendor bill | asset cost account (`FixedAssets.FixedAssets.costAccountId`) + input GST if claimable | AP control | vendor | posted by the purchase bill; `FixedAssets.FixedAssets.sourceDoc*` links the bill |
| Asset capitalised without a bill (e.g. from CWIP) | asset cost account | CWIP / clearing account | — | manual JV |

### Monthly depreciation (`FixedAssets.depreciationRunPost`)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Post depreciation run for a period | depreciation expense (`expenseAccountId`) per branch and cost centre ("cost centre split by branch") | accumulated depreciation (`accumDepAccountId`) per category account and branch | — | one JV (source DEP, e.g. JV-2026-000412) dated the run posting date; charge = WDV: opening NBV × rate ÷ 12, SLM: cost × rate ÷ 12, capped at NBV − residual; method NONE (land) and fully depreciated assets skipped; full month in month of purchase when `chargeFullMonthOnPurchase` |
| After posting | — | — | — | `FixedAssets.FixedAssets.accumulatedDepreciation` += charge, `depreciatedThrough` = period end; NEW → IN_USE; NBV ≤ residual → FULLY_DEPRECIATED; an asset can be charged only once per period (unique run line) |

### Disposal (`FixedAssets.assetDisposalPost`)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Sale / trade-in proceeds | receive-into bank or cash account (proceeds + GST) | — | `customerId` when sold on credit to AR | |
| Remove accumulated depreciation | accumulated depreciation (to the month before disposal) | — | — | |
| Remove cost | — | asset cost account (original cost) | — | |
| Output GST on asset sale | — | output GST (`gstAmount`) | — | "GST 18% — Rs 243,000"; none when Exempt |
| Gain (proceeds > NBV) | — | gain on disposal (e.g. 4910 Other Income) | — | `gainLoss` > 0 |
| Loss (proceeds < NBV) | loss on disposal | — | — | `gainLoss` < 0; scrapped / written off with no proceeds = loss of the full NBV |
| After posting | — | — | — | asset DISPOSED (`disposedOn`), disposal POSTED with `journalEntryId` |

### Transfer
No journal. Completing `FixedAssets.AssetTransfers` changes `FixedAssets.FixedAssets.branchId` / custodian; later depreciation lines carry the new branch.
