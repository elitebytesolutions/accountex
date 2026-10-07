## HR — posting rules

**HR posts nothing to the general ledger and has no stock effect.** HR produces approved *inputs*. Payroll turns them into earnings and deductions, and the payroll run posts the journal (see §Payroll).

| HR event | Source table | Feed to payroll | GL / stock effect |
|---|---|---|---|
| Overtime approved, then *Push to payroll* | `HumanResources.OvertimeClaims` (status APPROVED → PUSHED, `isCompOff = false`) | `Payroll.PayrollAdjustments`: OT earning = `amount` (hours × hourly rate × multiplier) for `payrollMonth`; `payrollRunId` written back | None in HR. The payroll run posts Dr Salaries & Wages (OT) / Cr Salaries Payable |
| Overtime as compensatory off | `HumanResources.OvertimeClaims` (`isCompOff = true`, amount 0) | none. Creates `HumanResources.LeaveAdjustments` (COMP_OFF credit) | None |
| Leave encashment at year end (*Run carry forward*) | `HumanResources.LeaveAdjustments` (kind ENCASHMENT, `encashAmount` = basic or gross ÷ 30 × days) via `HumanResources.LeaveYearEndClosings` | `Payroll.PayrollAdjustments`: "Leave encashment" earning in the chosen run (next payroll or off-cycle) | None in HR. Payroll posts Dr Leave Encashment expense / Cr Salaries Payable |
| Leave encashment at exit | `HumanResources.LeaveBalances.encashable` for the exiting employee | `Payroll.FinalSettlementLines` in the final settlement | Posted by the final settlement |
| Unpaid leave / absence / late-mark ½-day deductions | `HumanResources.AttendanceRegister.payableFraction` (locked by the run), `HumanResources.LeaveRequests` on unpaid types (`deductionBasis`) | Payroll reads payable days from `HumanResources.getAttendanceRegister` | Reduces gross in payroll. No separate HR entry |
| Attendance month lock | `HumanResources.AttendanceRegister.lockedAt`, `payrollRunId` | Payroll run consumes the register | None. Later corrections go to the next run as adjustments |
| Asset issued / returned | `HumanResources.EmployeeAssets` | none | None. Fixed-asset custody only; any write-off is posted by `FixedAssets.AssetDisposals` |
| Clearance: recoverable amounts | `HumanResources.ClearanceItems.recoverableAmount` | Deducted in `Payroll.FinalSettlements` | Posted by the final settlement |
