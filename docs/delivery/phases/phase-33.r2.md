# Phase 33 rev 2: Talent & exits

> **Status: approved 2026-10-08 (revision 2: letters in English only).** This session owns Phase 33 (confirmed with the other session). SQL `prisma/sql/204-talent-exits.sql`.

**Objective:** the rest of the employee lifecycle:
- final settlements on exit (calculated, approved, posted, paid);
- recruitment from requisition to hire (which creates the employee and their onboarding);
- performance reviews with goals, KRAs and competency ratings, calibration and sign-off;
- training sessions, enrolments and certifications;
- employee letters (generated PDFs) and assets issued to employees.

**Entities (5, TRANSACTIONAL):** Final Settlements · Recruitment · Performance · Training · Employee Letters & Assets

**Decisions (2026-10-08):**
- **Gratuity = 30 days' pay per completed year.** It starts after 1 full year of service; a part-year over 6 months counts as a year. The base is the last salary's components flagged "include in gratuity base". The rule is stored as a company HR setting (days per year, minimum service), so it can be changed later.
- **Settlement before exit.** Completing an offboarding is refused until its final settlement is APPROVED (posted to the GL). Payment can follow afterwards.
- **Letters are generated as PDFs on the server.** A small PDF library renders them in **English only** from the company's HR letter templates with merge fields. The PDF is stored as an attachment (Phase 32 storage) and is verifiable by its code. A few default HR letter templates are seeded.

**Defaults applied** (they follow the DB or earlier answers; no separate decision needed):
- **Statuses follow the DB:** settlement DRAFT → PENDING_APPROVAL → APPROVED (posts the JV) → PAID. The roadmap's "submitted / posted" wording maps onto these.
- **Approvals use the engine:** new subjects FINAL_SETTLEMENT and JOB_REQUISITION, with a default workflow of HR Manager → Financial Accountant (settlement) and HR Manager (requisition).
- **Training enrolments stay at programme level** (as the DB defines them); sessions are a schedule under each programme.
- **Hire** creates the employee (Phase 11 path) and an onboarding from the default template (Phase 31), linking `Onboardings.candidateId`.

## 1. Selection rationale
| Entity | Depends on (status) |
|---|---|
| Final Settlements | Offboardings, leave balances (31), payroll setup and loans (12, 32), GL and banking (16–18) |
| Recruitment | Designations / departments (10), employees (11), onboarding templates (13), onboardings (31) |
| Performance | Performance cycles (13), employees (11) |
| Training | Training programmes (13), employees (11) |
| Employee Letters & Assets | Employees (11), document templates (2), fixed assets (optional link), attachments (32) |

## 2. Verified schema (live DB; all 16 tables empty)

**`Payroll.FinalSettlements`**
- Columns:
  - `docNo`, employee, `offboardingId` (required);
  - service months, notice shortfall days, last basic and last gross;
  - per-day amounts, earnings / deductions / net (checked), amount in words, PF trust balance;
  - employee bank, pay-from bank account;
  - journal + payment journal, approval request, `approvedAt`, `paidAt`.
- One settlement per employee and per offboarding (unless cancelled).

**`Payroll.FinalSettlementLines`**
- `componentKind`: PENDING_SALARY, LEAVE_ENCASHMENT, GRATUITY, NOTICE_PAY, BONUS, OTHER_EARNING / NOTICE_SHORTFALL, ADVANCE_RECOVERY, LOAN_RECOVERY, INCOME_TAX, EOBI, OTHER_DEDUCTION. The direction is derived from the kind; loan lines need `loanId`.

**`HumanResources.JobOpenings`**
- Columns:
  - `docNo` (REQ), designation (optional), department + branch;
  - NEW / REPLACEMENT (replacement needs the employee being replaced), posted channels;
  - status DRAFT / PENDING_APPROVAL / OPEN / ON_HOLD / OFFER_STAGE / CLOSED / CANCELLED (closed ⇔ `closedOn`).

**`HumanResources.Candidates`**
- Columns:
  - FK `jobRequisitionId`, unique per opening and email;
  - stages APPLIED / SCREENING / INTERVIEW / OFFER / HIRED / REJECTED;
  - offer needs a salary, hired ⇔ `hiredEmployeeId`, a referral needs a referrer, CNIC format.

**`HumanResources.CandidateActivities`**
- A stage change needs `toStage`.

**`HumanResources.PerformanceReviews`**
- Columns:
  - unique per cycle and employee;
  - `nineBox` generated from performance and potential;
  - stages SELF_PENDING / AWAITING_MANAGER / REVIEWED / CALIBRATED / SIGNED_OFF (rating ⇔ submitted-at; sign-off needs the final rating).

**`HumanResources.Goals`** + **`KeyResults`**
- KRA / OKR, weight 1–100.

**`HumanResources.CompetencyRatings`**
- SELF / MANAGER / CALIBRATION.

**`HumanResources.PerformanceFeedback`**
- REQUESTED / GIVEN.

**`HumanResources.OneOnOneMeetings`**
- Action items (jsonb).

**`HumanResources.TrainingSessions`**
- Per programme: time range, seats, mode, status.

**`HumanResources.TrainingEnrolments`**
- Per programme and employee: progress, score, cost; completed ⇔ progress 100 + date.

**`HumanResources.Certifications`**
- Issue / expiry, linked to the enrolment; the programme's `grantsCertification` / validity drive it.

**`HumanResources.EmployeeLetters`**
- Columns: `letterNo` + `verificationCode` (unique), template, 11 letter types; language is always EN (the UR option isn't offered). Issued letters need a PDF.

**`HumanResources.EmployeeAssets`**
- Columns: optional fixed asset (one ISSUED holder), returned ⇔ `returnedOn`. Referenced by offboarding clearance items.

**Missing audit triggers → added:** JobOpenings, Candidates, CandidateActivities, Goals, PerformanceFeedback, OneOnOneMeetings, CompetencyRatings, KeyResults, TrainingSessions, TrainingEnrolments, Certifications, EmployeeAssets.

**Defects fixed in `204-talent-exits.sql`:**
1. **No FS / REQ / LTR numbering series exist** → seeded per company + a trigger for new companies.
2. **`finalSettlementPay` always fails** (no pay-entries function). → New `finalSettlementPayEntries` (Dr Salaries Payable / Cr Bank via `BankCash.postBankingVoucher`, as `payrollRunPay` does).
3. **Settlement totals go stale, and paid / journal fields are writable.** → Totals are refreshed on save and approve; those fields are no longer writable.
4. **Approving fails for lines with no account.** → Account fallbacks by posting role for NOTICE_SHORTFALL, OTHER_DEDUCTION and GRATUITY; partial loan installments are recovered.
5. **Job openings:** `jobOpeningCancel` fails its own check (no `closedOn`), and the insert drops `postedChannels` / `postedOn` / status. → Fixed, plus approve / open / hold / close functions.
6. **Letters can't be created:** `employeeLetterAddUpdate` never sets status, never numbers `letterNo`, and can't create a draft. → Fixed, plus issue (with PDF) / void.
7. **Feedback requests can't be created:** `performanceFeedbackAddUpdate` never sets status. → Fixed (REQUESTED vs GIVEN).
8. **Stage / status columns are freely writable** (candidates, reviews, goals, enrolments, certifications). → Writes go through dedicated functions: candidate move / hire / reject, review submit-self / submit-manager / calibrate / sign-off, enrolment complete (issues the certification when the programme grants one), asset issue / return.

**Also in the SQL:**
- **Settlement calculation in a DB function** `finalSettlementCalculate(id)`, filling the lines from the employee's last salary, the period worked in the exit month, leave encashment (`LeaveBalances.encashable`, `LeaveTypes` encash rules), gratuity (company setting), notice pay or shortfall (`Offboardings.noticeDaysRequired / Served / noticeWaived`), open loans and advances, EOBI and income tax (the Phase 32 tax rule for the final month).
- **Subject lookup codes** FINAL_SETTLEMENT and JOB_REQUISITION.
- **The gratuity HR setting**, with defaults.
- **`offboardingComplete`** refuses when there's no APPROVED settlement.
- **HR letter templates** seeded per company (offer, appointment, experience, salary certificate, relieving), English only, with the `letterKind` mapping.
- Error codes; lookup tones.

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| Final Settlement | `app/hr/settlement` (`51-hr-pay-talent.html:698–789`): profile header, computation table + Recalculate, amount in words, PF trust banner, accounting-on-approval panel, exit panel, clearance checklist, approvals timeline, Print / Approve | `/hr/settlements/[id]` (+ "Start settlement" from the offboarding drawer) | From the template. Edits are allowed while DRAFT. Print view for the settlement statement. Pay → bank voucher. |
| Recruitment | `app/hr/recruitment` (`795–887`): KPIs, openings table + chips, candidate kanban, drawer `#pay-candidate` | `/hr/recruitment` | From the template. **Template-style additions:** requisition form (with approval), candidate form, Hire dialog (joining date, salary, onboarding template). |
| Performance | `app/hr/performance` (`1052–1142`): review table, goals & KRAs panel, 9-box, "Open calibration" | `/hr/performance` (fills Phase 13's empty states) | From the template; calibration drawer in template style |
| My Goals | `app/profile/goals` (`9C-ess.js:2555–2745`): OKR sliders, 5-step tracker, 1:1 notes, feedback, competency self-assessment, 1:1 and request-feedback sheets | `/profile/goals` (replace the placeholder) | From the template |
| Training | `app/hr/training` (`1145–1261`): sessions list, enrolments table, expiring certifications, modals `#po-trn-session`, `#po-trn-enrol` | `/hr/training` (fills Phase 13's empty states) | From the template. "Send reminders" waits for email (Phase 29). |
| Letters & assets | employee view Documents + Assets panes (`50-hr-core.html:388–417`), modal `#hrc-letter` | `/hr/employees/[id]` tabs (enable Phase 11's disabled buttons) | Letter → generated PDF → verify code. Assets assign / return; return feeds offboarding clearance. |

**Nav:** Workforce › Talent (Recruitment) and Payroll (Final settlements), at the template positions.

## 4. Clean Architecture
- **Contracts:** `src/shared/hr/{settlement,recruitment,performance,training,letter,asset}.ts`, with prefixed export names to avoid collisions.
- **Server:**
  - `src/server/modules/hr/{recruitment,performance,training,letters,assets}`;
  - `src/server/modules/payroll/final-settlements`;
  - domain helpers (gratuity years, notice days);
  - approval subjects registered like `leave-requests.service.ts`.
- **PDF port + adapter:** `core/application/ports/pdf-renderer.ts`, with an adapter using a small library such as `pdfmake` (server-side, no browser). No Urdu font or shaping is needed: letters are English only.
- **UI:** `src/features/hr/*` (talent and exits screens) and `src/features/payroll/*` (settlement).

## 5. API (permissions `fs`, `emp`, `mygoal`)
| Method & path | Notes | Errors |
|---|---|---|
| `POST /api/payroll/final-settlements` (from an offboarding), `POST /:id/calculate`, `PATCH /:id` (lines, DRAFT), `POST /:id/submit \| approve \| pay \| cancel`, `GET /:id` (+ print) | Approve posts the JV via the engine; pay → bank voucher | 409 one per offboarding, 409 `SETTLEMENT_NOT_APPROVED` (offboarding complete), 403 preparer approving |
| `GET/POST/PATCH /api/hr/job-openings(/:id)`, `POST /:id/submit \| open \| hold \| close \| cancel`; `GET/POST/PATCH /api/hr/candidates(/:id)`, `POST /:id/move \| activities \| reject \| hire` | Hire = employee + onboarding, in one transaction | 409 duplicate candidate, 400 offer salary |
| `GET /api/hr/performance/reviews?cycle=`, `POST /reviews/:id/manager \| calibrate \| sign-off`; goals / key results CRUD; feedback request / give; 1:1 CRUD; `GET/POST /api/me/goals`, `POST /api/me/reviews/:id/self` | Stage order is enforced | 409 stage |
| `POST /api/hr/training-programs/:id/sessions`, `POST /api/hr/training/enrol` (bulk), `PATCH /enrolments/:id` (progress / score), `POST /enrolments/:id/complete` | Completion issues the certificate when the programme grants one | 409 duplicate enrolment, 400 seats |
| `POST /api/hr/employees/:id/letters` (generate → PDF), `POST /letters/:id/void`, `GET /letters/verify/:code`; `POST /api/hr/employees/:id/assets` (issue), `POST /assets/:id/return` | The PDF is stored as an attachment | 409 asset already issued |

## 6. Database: `prisma/sql/204-talent-exits.sql` (idempotent)
Everything in §2 "Defects fixed" and "Also in the SQL", plus the audit triggers.

## 7. Audit
- **Tables:** all 16 audited.
- **Attribution:** tenant actor context.
- **History:** History tabs on settlement, requisition, candidate, review and letter.

## 8. Ordered tasks
1. SQL 204 + models + registries.
2. Contracts.
3. Settlement (calculate / approve / pay / print + the offboarding rule).
4. Recruitment (hire → employee + onboarding).
5. Performance (+ My Goals).
6. Training.
7. Letters (PDF) & assets.
8. Pages.
9. Verify.

## 9. Verification (Test Co, marker employees; never Demo)
- **Settlement:** an exiting employee with 3.5 years' service, leave balance, notice shortfall and an open loan → calculate (hand-check gratuity = base ÷ 30 × 30 × 4 years, encashment, notice recovery, loan, tax) → approve (balanced JV) → completing the offboarding is refused before approval and allowed after → pay (bank voucher).
- **Recruitment:** requisition → approve → open → candidate moves → offer → hire (employee + onboarding linked to the candidate).
- **Performance:** cycle reviews → self → manager → calibrate → sign-off (nine-box); goals with key results; feedback request and give; 1:1.
- **Training:** session, enrol, complete → certificate with expiry.
- **Letters:** experience letter PDF (English) generated and verifiable; void.
- **Assets:** issue → return → offboarding clearance item cleared.
- **Permissions and history:** staff see only their own goals; history attributed.
- **Visual:** the settlement, recruitment, performance, training, employee-view tabs and My Goals against the templates (light, dark, 390 px).

## 10. Risks / blockers
- **Settlement tax and EOBI** follow the Phase 32 rules and seeded data.
- **Blockers:** none.
