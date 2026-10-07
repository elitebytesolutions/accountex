## Employee Self-Service (FULL edition — release P5)

**Screens (17):** My Day `ess/dashboard` · My Attendance `ess/attendance` · My Leave `ess/leave` · My Payslips `ess/payslips` · Expense Claims `ess/expenses` · Loans & Advances `ess/loans` · Letters & Requests `ess/requests` · Helpdesk `ess/helpdesk` · Kudos & Pulse `ess/kudos` · Goals & Reviews `ess/goals` · Tax Declarations `ess/tax` · Shifts & Swaps `ess/shifts` · My Team `ess/team` · Directory `ess/company` · Onboarding `ess/onboarding` · My Profile `ess/profile` · Notifications `ess/notifications`. Mobile app (`src/9D-mobile.js`) uses the same tables.

**Tables (schema `ess`, 22):** LetterRequests, HelpdeskCategories, HelpdeskTickets, HelpdeskTicketMessages, faq, kudos, KudosReactions, PulseSurveys, PulseSurveyQuestions*, PulseSurveyResponses, poll, PollOptions, PollVotes, ShiftSwapRequests, OpenShifts, OpenShiftClaims, CompanyAnnouncements, CompanyAnnouncementReads*, CompanyPolicies, PolicyAcknowledgements*, PresenceStatuses, ProfileChangeRequests* (* = helper tables beyond the registry).
**Reused tables:** HumanResources.Employees (incl. emergency_* contacts), HumanResources.AttendancePunches / AttendanceRegister / RegularisationRequests (doc type REG, ESS label "AC-"), HumanResources.LeaveRequests (doc type LV, ESS label "LR-") / LeaveBalances / holiday, HumanResources.Goals / KeyResults / PerformanceReviews / OneOnOneMeetings / feedback, HumanResources.Onboardings / OnboardingTasks, HumanResources.ShiftRosters / shift, HumanResources.EmployeeDocuments, BankCash.ExpenseClaims (+ line, action), Payroll.Payslips / loan / LoanInstallments / TaxDeclarations, Company.Notifications / NotificationPreferences / Approvals / ApprovalActions / comment.

### Features
- **My Day** — punch clock with geofence, leave balance gauge, latest payslip breakdown, month attendance calendar, holidays, announcements.
- **Attendance** — selfie + geofence check-in/out, live timer, month calendar with punch details, correction requests (missed punch-in/out, late arrival, on-duty/field visit, WFH) to the line manager (24 h SLA).
- **Leave** — balances (annual accrual 1.17/month, casual, sick with certificate > 2 days, comp-off expiry), apply with live working-day count excluding weekends/holidays, half days, handover, team-clash warning, manager then HR for > 3 days, withdraw / cancel.
- **Payslips & tax** — 12-month payslips, compare months, YTD, u/s 149 certificates, secure bank share link; tax projection on FBR slabs with Zakat / VPS / donation / health declarations and proof upload verified by Payroll.
- **Money requests** — expense claims with receipt OCR and policy limits; salary advance / staff loan / medical loan with live EMI, eligibility checks and repayment preview.
- **Letters** — salary certificate, experience, NOC for visa, bank letter, employment verification; auto-filled from profile, HR digital signature, QR verification, English/Urdu, digital or printed.
- **Helpdesk** — HR / Payroll / IT / Admin desks with owner and SLA (72/48/24/72 h; High priority halves it), keyword auto-routing, FAQ suggestions, chat, reopen, CSAT 1–5, service-level stats.
- **Culture** — kudos with five badges and points (+20 to recipient), reactions, recognition wall; anonymous weekly pulse (1–5, per-survey respondent hash, department participation); company polls (one vote per employee, results after voting).
- **Shifts** — weekly roster (me / team), swap or cover requests (colleague accepts → manager approves; 48 h notice, max 2 per month, 11 h rest), open shifts with perks and limited slots (manager confirms).
- **Manager (My Team)** — team today (in / late / leave / not in, nudge), swipe approval deck for leave, corrections, expenses, advances, bulk approve with undo, team calendar and stats.
- **Directory** — people search with presence (Available / Busy / In the field / Away), org chart, announcements with read receipts, policy acknowledgement with timestamp.
- **Onboarding** — role onboarding checklist (documents, policies with read-to-end e-signature, IT, buddy booking, training modules) with progress and completion badge.
- **Profile** — personal / job / bank & payroll tabs; OTP-verified change requests reviewed by HR; emergency contacts (primary + alternate on HumanResources.Employees); documents with expiry alerts.
- **Notifications** — grouped inbox, filters, read/unread/dismiss, per-category channels (in-app / email / WhatsApp), quiet hours.

### Business rules
- ESS rows are always scoped to the signed-in employee; managers see direct reports only (`EmployeeSelfService:team`).
- Pulse answers store no employee id; audit triggers are off on `PulseSurveyResponses`.
- One vote per poll, one reaction of each type per kudos, one pending change per profile field, one live swap request per person per day, one published version per policy code.
- ESS shows HR documents with their own labels (AC- for REG attendance corrections, LR- for LV leave requests); stored numbers come from the single HR series.
- Open-shift claims cannot exceed `slotsTotal` (trigger); kudos to self is blocked.
- Bank detail changes apply from the next payroll after HR approval.

### Statuses
LetterRequests stage SUBMITTED → HR_REVIEW → SIGNED → READY, status OPEN / COMPLETED / REJECTED / WITHDRAWN · HelpdeskTickets OPEN → IN_PROGRESS → RESOLVED → CLOSED · ShiftSwapRequests REQUESTED → ACCEPTED → APPROVED (DECLINED, REJECTED, WITHDRAWN) · OpenShiftClaims REQUESTED → CONFIRMED (DECLINED, WITHDRAWN) · PulseSurveys / poll DRAFT → OPEN → CLOSED · announcement / policy DRAFT → PUBLISHED → ARCHIVED / RETIRED · ProfileChangeRequests PENDING → APPROVED / REJECTED (WITHDRAWN) · presence AVAILABLE / BUSY / IN_FIELD / AWAY.

### Integrations
WhatsApp / SMS / email notifications, device GPS + camera (selfie liveness), calendar export (.ics), QR letter verification page.
