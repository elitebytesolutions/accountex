## HR (Full edition) — schema `HumanResources`

**Screens (22).**
- People: `app/hr/employees`, `/employees/new`, `/employees/view`, `/departments`, `/org`
- Time & attendance: `/attendance`, `/attendance/register`, `/attendance/requests`, `/devices`, `/shifts`, `/holidays`, `/overtime`
- Leave: `/leave`, `/leave/requests`, `/leave/balances`, `/leave/policies`
- Lifecycle and talent: `/onboarding`, `/offboarding`, `/recruitment`, `/performance`, `/training`
- Reports: `/reports`

ESS reuses the HR tables for attendance corrections, leave, goals, 1:1s, feedback and onboarding tasks. Payroll, loans and final settlement are scoped under Payroll.

### Features
- **Employee master** (`EMP-0042`):
  - Identity exactly as on the NADRA CNIC: father/husband name, CNIC issue/expiry, DOB, gender, marital status, religion, blood group.
  - Contact and emergency contacts.
  - Job: department, designation, grade, reporting manager, cost centre, branch, shift, weekly off.
  - Terms: employment type, probation, confirmation, notice period, biometric ID.
  - Field-role flags (booker / salesman / deliveryman / supervisor) that the distribution pickers use.
  - Statutory record (EOBI, PESSI/SESSI/KPESSI, NTN, ATL filer status, PF, group insurance, OT eligibility) and a salary bank account (IBAN, bank/cheque/cash).
  - Documents with verification and expiry, assets in custody, position history, and HR letters (salary certificate, experience, NOC, increment, warning) in English or Urdu.
- **5-step Add Employee wizard.** One save creates the employee, statutory and bank records, documents, the salary (payroll) and the ESS login, and starts the onboarding checklist.
- **Organisation:**
  - Departments with parent, head, cost centre, annual budget and division.
  - Designations with approved positions (filled/open are derived).
  - Grade bands G-1…G-8 with min/mid/max monthly gross.
  - Branch HR settings: social security scheme, branch manager, default shift, ESS geofence.
  - Org chart that shows vacancies.
- **Time & attendance:**
  - **Devices.** ZKTeco devices over ADMS push or TCP pull, with a heartbeat/sync log.
  - **Punches.** Raw punches are partitioned by month and come from three sources: device, manual, and ESS selfie + geofence.
  - **Daily attendance.** One processed row per employee per day: status, in/out, late/early/worked/OT minutes, payable fraction.
  - **Monthly register.** Codes P/A/L/H/W/LT/HD, locked once payroll uses it.
  - **Regularisation requests** (`REG-`): missed punch, late arrival, on-duty, WFH, early leaving. Approval goes line manager → HR.
- **Shifts and holidays:**
  - Shifts carry grace, break, Friday Jumu'ah break, half-day threshold, late marks per ½-day, OT start, night and seasonal (Ramzan) options.
  - Weekly roster (shift / OFF / LEAVE) that can be published to ESS.
  - Holiday calendar with public, company, optional and event types. Moon-dependent dates are tentative, holidays can be limited to branches, and the gazette can be imported.
- **Overtime:**
  - Policy (one active per tenant): weekday 1.5×, weekly off 2×, holiday 2×; hourly basis gross÷26÷8; daily and monthly caps; minimum minutes; rounding; eligible grade; pre-approval; comp-off option.
  - Claims (`OT-`): amount = hours × hourly rate × multiplier.
  - Push to payroll, or comp-off credit.
- **Leave:**
  - Fully configurable leave types: accrual monthly/upfront/event/once in service; pro-rata for new joiners; carry forward capped/unlimited with expiry and accumulation cap; encashment at year end or exit (basic or gross ÷ 30).
  - Rules: sandwich, half day, negative balance, payroll-lock block, attachment rules, backdating, minimum notice, maximum consecutive days, maximum per month, maximum times in service.
  - Eligibility by gender, employment type, branch, grade and service length, plus an approval workflow per type.
  - Requests (`LV-`): full day / half AM / half PM, handover, contact during leave.
  - A balance ledger per employee × type × leave year, with manual adjustments and a year-end carry forward run (carry / encash / lapse).
- **Lifecycle:**
  - Onboarding templates and checklists (new joiner and role-change tracks) with owners, due dates and a buddy.
  - Offboarding (`OFF-`): resignation/termination, notice served, reason, retention talk, departmental clearance (IT, Admin, Finance, Line manager, HR), exit interview (confidential option), then hand-off to final settlement in payroll.
- **Talent:**
  - Recruitment: requisitions (`REQ-`) with a candidate pipeline (Rozee.pk / LinkedIn / careers page / referral), activities, ratings and offers. A hire creates the employee and starts onboarding.
  - Performance: cycles (goal setting → self → manager → calibration → sign-off), reviews with a 9-box grid, KRAs/OKRs with key results, competency ratings, 1:1s and feedback.
  - Training: programs, sessions, enrolments and certifications with expiry reminders.
- **Reports** (HR Report Studio): headcount, attendance summary, leave balances/liability, late arrivals, turnover and department cost. All of these are views.

### Key business rules
- Each tenant has a unique EMP code, CNIC, biometric ID and ESS user. Reporting manager ≠ self, and DOB must be before joining.
- `status = EXITED` ⇔ `exitDate` is set. Opening an offboarding case sets NOTICE_PERIOD. Closing it sets EXITED and writes a history row.
- Attendance day: one row per employee per date. LATE counts as present. Payable fraction is 0 / 0.5 / 1. Once payroll locks a day it is read-only (trigger), and later corrections go through the next payroll.
- Late marks: every *n* late marks (shift `lateMarksPerHalfDay`, default 3) costs ½ day unless the mark is waived.
- Regularisation requests: at most N per month (company setting, "4 allowed"). An approved request adds a MANUAL punch and recomputes the day.
- Leave:
  - An employee cannot hold two live (pending or approved) requests over overlapping dates (exclusion constraint).
  - A half day is a single date with 0.5 days.
  - The balance is maintained only by triggers: pending → `booked`, approved → `used`, adjustments → entitled / carried / adjusted / encashed / lapsed.
  - A negative balance on a paid type is rejected unless the type allows it.
- Overtime amount must equal hours × rate × multiplier, or 0 when it is taken as comp-off. A comp-off entry creates exactly one COMP_OFF leave credit. Only APPROVED, non-comp-off entries can be pushed to payroll.
- Sandwich rule: holidays and weekly offs between leave days count as leave when the type has `sandwichRule`.
- Exits: the exit interview is unique per exit case. Clearance must be complete before the case moves to SETTLEMENT.

### Statuses
| Entity | Values |
|---|---|
| employee | PROBATION, ACTIVE, ON_LEAVE, NOTICE_PERIOD, EXITED |
| AttendanceRegister | PRESENT, LATE, WFH, ON_DUTY, HALF_DAY, ABSENT, LEAVE, HOLIDAY, WEEKLY_OFF |
| RegularisationRequests | PENDING → APPROVED / REJECTED / WITHDRAWN (stage LINE_MANAGER → HR) |
| device | ONLINE, OFFLINE, UNSTABLE |
| holiday | UPCOMING, TENTATIVE, OBSERVED, CANCELLED |
| OvertimeClaims | PENDING → APPROVED → PUSHED · REJECTED · CANCELLED |
| LeaveRequests | PENDING → APPROVED / REJECTED · CANCELLED (stage LINE_MANAGER → HR_REVIEW → CEO) |
| LeaveYearEndClosings | DRAFT → COMPLETED · REVERSED |
| onboarding / task | PRE_JOINING → IN_PROGRESS → COMPLETED · CANCELLED / NOT_STARTED → IN_PROGRESS · SCHEDULED → COMPLETED · SKIPPED (overdue derived) |
| offboarding | SERVING_NOTICE → RETENTION_TALK → SETTLEMENT → CLOSED · WITHDRAWN |
| JobOpenings | DRAFT → PENDING_APPROVAL → OPEN ↔ ON_HOLD → OFFER_STAGE → CLOSED · CANCELLED |
| candidate | APPLIED → SCREENING → INTERVIEW → OFFER → HIRED · REJECTED |
| PerformanceCycles stage / review | GOAL_SETTING → SELF_REVIEW → MANAGER_REVIEW → CALIBRATION → SIGN_OFF / SELF_PENDING → AWAITING_MANAGER → REVIEWED → CALIBRATED → SIGNED_OFF |
| training enrolment | ENROLLED → IN_PROGRESS → COMPLETED · BEHIND · WITHDRAWN |

### Document numbers
EMP (`EMP-0042`), REG (`REG-2026-0418`), OT (`OT-2026-0214`), LV (`LV-2026-0612`), REQ (`REQ-2026-031`), ONB, OFF. These come from `Company.getNextDocNo`. The ESS prototype prefixes `AC-` and `LR-` are unified into REG and LV.

### Integrations
- ZKTeco biometric devices: ADMS push to the cloud, or TCP pull on port 4370.
- ESS mobile check-in with selfie, liveness and geofence.
- Rozee.pk / LinkedIn / careers page as candidate sources.
- .ics holiday feed.
- Cabinet Division gazette import.
- Email/SMS through `Company.Notifications`.

### Statutory context (PK)
- EOBI: 5% employer / 1% employee.
- Provincial social security: PESSI (Punjab), SESSI (Sindh), KPESSI (KP).
- Income tax u/s 149, with ATL filer status.
- Labour law: Factories Act 1934 and the Shops & Establishments Ordinance 1969 (overtime, leave); Maternity & Paternity Leave Act 2023 (90 / 30 days).

### Out of scope here
Salary, payroll runs, payslips, loans and final settlement (Payroll). Helpdesk, letters requested from ESS, kudos and polls (ESS). HR posts nothing to the GL.
