-- =============================================================================
-- Finsoft ERP (FULL) — 13-ess.sql
-- Employee self-service extras that no back-office module owns: HR letter
-- requests, helpdesk (categories, tickets, messages, FAQ), kudos & reactions,
-- weekly pulse surveys, polls, shift swaps and open shifts, company
-- announcements, policy documents with acknowledgement, presence status, and
-- the employee-initiated profile change requests on ess/profile.
-- (Emergency contacts are HumanResources.Employees.emergency_* — primary + alternate — and
-- are not duplicated here.)
--
-- Numbering of reused HR documents as ESS shows them: attendance corrections
-- are HumanResources.RegularisationRequests, doc type REG (ESS label "AC-2026-0104"); leave
-- requests are HumanResources.LeaveRequests, doc type LV (ESS label "LR-2026-0441").
--
-- FULL EDITION ONLY (erp-basic has no ESS).
--
-- ESS screens that only reuse other modules' tables are documented in
-- entities/14-ess.md and need no table here:
--   ess/attendance  → HumanResources.AttendanceRegister, HumanResources.RegularisationRequests
--   ess/leave       → HumanResources.LeaveRequests, HumanResources.LeaveBalances, HumanResources.Holidays
--   ess/payslips, ess/tax, ess/loans → Payroll.Payslips, Payroll.TaxDeclarations, Payroll.LoansAndAdvances
--   ess/expenses    → BankCash.ExpenseClaims (+ _line, _action)
--   ess/goals       → HumanResources.Goals, HumanResources.KeyResults, HumanResources.PerformanceReviews, HumanResources.OneOnOneMeetings, HumanResources.PerformanceFeedback
--   ess/onboarding  → HumanResources.Onboardings, HumanResources.OnboardingTasks (+ EmployeeSelfService.PolicyAcknowledgements)
--   ess/notifications → Company.Notifications, Company.NotificationPreferences
--
-- Screens (source): src/6A-ess.html (section shells) + src/9C-ess.js (engine);
-- ess/dashboard in src/48-dash-stock.html.
--
-- Cross-module FKs (hr.*) are added in database/fk/13-ess-fks.sql. Inline FKs
-- here go only to ess.*, platform.* and core.* (contract §3).
-- Doc types: RQ (letter request), HD (helpdesk ticket), SW (shift swap).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- LetterRequests — ess/requests "Letters & Requests": type cards (Salary
-- certificate · Experience letter · NOC for visa · Bank letter · Employment
-- verification, each with an SLA "Same day / 1 working day / Within 4 hours"),
-- request sheet (Addressed to *, Purpose *, Country, Leave approved?, Travel
-- from / till, Include salary breakdown, Key responsibilities, Format Digital
-- PDF + QR / Printed & stamped, Language English / Urdu), tracker
-- Submitted → HR review → Signed → Ready, rejected reason, generated letter
-- (Ref ALN/HR/2026-0142, QR "Verify … Code 0142-0042"). RQ-2026-0142.
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."LetterRequests" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                             -- RQ-2026-0142
  "docDate"                date NOT NULL DEFAULT current_date,                        -- "12 Aug 2026"
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees (requester)
  "letterType"             text NOT NULL,
  "addressedTo"            text NOT NULL,                                             -- "The Manager, Meezan Bank — Car Ijarah"
  purpose                 text NOT NULL,                                             -- "Car finance (Suzuki Cultus)"
  "travelCountry"          text,                                                      -- NOC: "United Arab Emirates"
  "travelFrom"             date,
  "travelTill"             date,
  "leaveRequestId"        uuid,                                                      -- → HumanResources.LeaveRequests "Leave approved? Yes · LV-2026-0571"
  "includeSalary"          boolean NOT NULL DEFAULT false,                            -- "Include salary breakdown"
  responsibilities        text,                                                      -- experience letter "Key responsibilities"
  "outputFormat"           text NOT NULL DEFAULT 'DIGITAL_PDF_QR',
  language                text NOT NULL DEFAULT 'EN',
  stage                   text NOT NULL DEFAULT 'SUBMITTED',
  status                  text NOT NULL DEFAULT 'OPEN',
                            -- badge: In review (OPEN) / Approved (COMPLETED) / Rejected / Withdrawn
  "rejectedReason"         text,                                                      -- "HBL accepts its own template …"
  "dueAt"                  timestamptz,                                               -- from the type SLA
  "signedByUserId"       uuid,                                                      -- Ayesha Noor, HR Manager
  "signedAt"               timestamptz,
  "referenceNo"            text,                                                      -- ALN/HR/2026-0142
  "verificationCode"       text,                                                      -- 0142-0042 (QR verify)
  "salaryGrossSnapshot"   numeric(18,2) CHECK ("salaryGrossSnapshot" >= 0),          -- 142,500 printed on the letter
  "salaryNetSnapshot"     numeric(18,2) CHECK ("salaryNetSnapshot" >= 0),            -- 127,630
  "docTemplateId"         uuid,                                                      -- Company.DocumentTemplates (HR letters)
  "pdfAttachmentId"       uuid,
  "hrLetterId"            uuid,                                                      -- → HumanResources.EmployeeLetters (issued-letter register)
  "withdrawnAt"            timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "letterRequestSignedByFk" FOREIGN KEY ("tenantId", "signedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "letterRequestTemplateFk" FOREIGN KEY ("tenantId", "docTemplateId")
    REFERENCES "Company"."DocumentTemplates" ("tenantId", id),
  CONSTRAINT "letterRequestPdfFk" FOREIGN KEY ("tenantId", "pdfAttachmentId")
    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "letterRequestNocChk" CHECK
    ("letterType" <> 'NOC_VISA' OR ("travelCountry" IS NOT NULL AND "travelFrom" IS NOT NULL AND "travelTill" IS NOT NULL)),
  CONSTRAINT "letterRequestTravelChk" CHECK ("travelTill" IS NULL OR "travelFrom" IS NULL OR "travelTill" >= "travelFrom"),
  CONSTRAINT "letterRequestCompletedChk" CHECK ((status = 'COMPLETED') = (stage = 'READY')),
  CONSTRAINT "letterRequestSignedChk" CHECK (stage NOT IN ('SIGNED','READY') OR "signedAt" IS NOT NULL),
  CONSTRAINT "letterRequestRejectedChk" CHECK (status <> 'REJECTED' OR "rejectedReason" IS NOT NULL),
  CONSTRAINT "letterRequestWithdrawnChk" CHECK (status <> 'WITHDRAWN' OR "withdrawnAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."LetterRequests"', true);
CREATE INDEX "letterRequestEmployeeIdx" ON "EmployeeSelfService"."LetterRequests" ("tenantId", "employeeId", "docDate" DESC);
CREATE INDEX "letterRequestQueueIdx"    ON "EmployeeSelfService"."LetterRequests" ("tenantId", status, stage, "dueAt");
CREATE UNIQUE INDEX "letterRequestVerifyUq" ON "EmployeeSelfService"."LetterRequests" ("tenantId", "verificationCode")
  WHERE "verificationCode" IS NOT NULL;
COMMENT ON TABLE "EmployeeSelfService"."LetterRequests" IS
  'Self-service HR letter requests (salary certificate, experience, NOC, bank letter, employment verification) with HR signing workflow — ess/requests.';


-- ---------------------------------------------------------------------------
-- HelpdeskCategories — ess/helpdesk category cards: HR (Fatima Noor · SLA 72h ·
-- "Policies, insurance, letters, leave rules"), Payroll (Nida Shah · 48h),
-- IT (Mehwish Tariq · 24h), Admin (Faisal Qureshi · 72h); "Avg reply" is
-- derived. routingKeywords drive the auto-routing in the New ticket sheet
-- ("salary, commission, tax, payslip → Payroll"; "laptop, vpn, email,
-- password → IT"; …). High priority halves the SLA.
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."HelpdeskCategories" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),     -- HR, PAYROLL, IT, ADMIN
  name                    text NOT NULL,                                             -- Payroll
  description             text,                                                      -- "Salary, commission, tax, deductions"
  "ownerEmployeeId"       uuid,                                                      -- → HumanResources.Employees (team owner / default agent)
  "slaHours"               numeric(6,2) NOT NULL CHECK ("slaHours" > 0),               -- 48
  "highPrioritySlaFactor" numeric(5,4) NOT NULL DEFAULT 0.5 CHECK ("highPrioritySlaFactor" > 0 AND "highPrioritySlaFactor" <= 1),
  "routingKeywords"        text[] NOT NULL DEFAULT '{}',                              -- {salary,commission,tax,payslip}
  icon                    text,                                                      -- banknote / laptop
  "sortOrder"              smallint NOT NULL DEFAULT 0,
  status                  text NOT NULL DEFAULT 'ACTIVE',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."HelpdeskCategories"');
CREATE INDEX "helpdeskCategoryKeywordsIdx" ON "EmployeeSelfService"."HelpdeskCategories" USING gin ("routingKeywords");
COMMENT ON TABLE "EmployeeSelfService"."HelpdeskCategories" IS
  'Helpdesk desks (HR / Payroll / IT / Admin) with owner, response SLA and keyword routing — ess/helpdesk.';

-- HelpdeskTickets — "My tickets" (HD-2026-0436 · Payroll, subject, agent,
-- messages, Opened 30 Sep 11:20, SLA countdown, status Open / In progress /
-- Resolved / Closed, "Met SLA · 3h 12m", CSAT stars) and the New ticket sheet
-- (Category, Subject *, Priority Low/Normal/High, Contact me on WhatsApp/Email,
-- Describe the issue *, Attachments). Service levels card (96% on time, first
-- reply, avg rating) is derived.
CREATE TABLE "EmployeeSelfService"."HelpdeskTickets" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                             -- HD-2026-0436
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees (requester)
  "categoryId"             uuid NOT NULL,
  subject                 text NOT NULL,                                             -- "Commission for Sept not matching CRM"
  description             text NOT NULL,                                             -- first message
  priority                text NOT NULL DEFAULT 'NORMAL',
  status                  text NOT NULL DEFAULT 'OPEN',
  "agentEmployeeId"       uuid,                                                      -- → HumanResources.Employees "Assigned to Nida Shah"
  "contactChannel"         text NOT NULL DEFAULT 'WHATSAPP',
  "contactValue"           text,                                                      -- 0312-4778899 / email
  "openedAt"               timestamptz NOT NULL DEFAULT now(),
  "slaHours"               numeric(6,2) NOT NULL CHECK ("slaHours" > 0),               -- category SLA × priority factor
  "dueAt"                  timestamptz NOT NULL,                                      -- SLA deadline (countdown)
  "firstResponseAt"       timestamptz,
  "resolvedAt"             timestamptz,
  "closedAt"               timestamptz,
  "slaMet"                 boolean,                                                   -- "Met SLA"
  "reopenedCount"          smallint NOT NULL DEFAULT 0 CHECK ("reopenedCount" >= 0),   -- "Reopen"
  "csatRating"             smallint CHECK ("csatRating" BETWEEN 1 AND 5),              -- "How did Mehwish do?"
  "csatAt"                 timestamptz,
  "sourceDocType"         text REFERENCES "Company"."DocumentTypes" (code),                      -- linked document, e.g. PRUN PR-2026-10
  "sourceDocId"           uuid,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "helpdeskTicketCategoryFk" FOREIGN KEY ("tenantId", "categoryId")
    REFERENCES "EmployeeSelfService"."HelpdeskCategories" ("tenantId", id),
  CONSTRAINT "helpdeskTicketDueChk" CHECK ("dueAt" > "openedAt"),
  CONSTRAINT "helpdeskTicketResolvedChk" CHECK (status NOT IN ('RESOLVED','CLOSED') OR "resolvedAt" IS NOT NULL),
  CONSTRAINT "helpdeskTicketClosedChk" CHECK (status <> 'CLOSED' OR "closedAt" IS NOT NULL),
  CONSTRAINT "helpdeskTicketCsatChk" CHECK (("csatRating" IS NULL) = ("csatAt" IS NULL)),
  CONSTRAINT "helpdeskTicketSourceChk" CHECK (("sourceDocType" IS NULL) = ("sourceDocId" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."HelpdeskTickets"', true);
CREATE INDEX "helpdeskTicketEmployeeIdx" ON "EmployeeSelfService"."HelpdeskTickets" ("tenantId", "employeeId", status, "openedAt" DESC);
CREATE INDEX "helpdeskTicketQueueIdx"    ON "EmployeeSelfService"."HelpdeskTickets" ("tenantId", "categoryId", status, "dueAt");
CREATE INDEX "helpdeskTicketAgentIdx"    ON "EmployeeSelfService"."HelpdeskTickets" ("tenantId", "agentEmployeeId", status)
  WHERE status IN ('OPEN','IN_PROGRESS');
COMMENT ON TABLE "EmployeeSelfService"."HelpdeskTickets" IS
  'Employee helpdesk ticket with SLA deadline, assignment, resolution and CSAT — ess/helpdesk.';

-- HelpdeskTicketMessages — chat drawer bubbles (requester / agent, text, time,
-- one attachment "crm-commission-sep.png").
CREATE TABLE "EmployeeSelfService"."HelpdeskTicketMessages" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "ticketId"               uuid NOT NULL,
  "authorRole"             text NOT NULL,
  "authorEmployeeId"      uuid,                                                      -- → HumanResources.Employees
  body                    text NOT NULL,
  "attachmentId"           uuid,
  "sentAt"                 timestamptz NOT NULL DEFAULT now(),
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "helpdeskMessageTicketFk" FOREIGN KEY ("tenantId", "ticketId")
    REFERENCES "EmployeeSelfService"."HelpdeskTickets" ("tenantId", id) ON DELETE CASCADE,
  CONSTRAINT "helpdeskMessageAttachmentFk" FOREIGN KEY ("tenantId", "attachmentId")
    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "helpdeskMessageAuthorChk" CHECK ("authorRole" = 'SYSTEM' OR "authorEmployeeId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."HelpdeskTicketMessages"');
CREATE INDEX "helpdeskMessageTicketIdx" ON "EmployeeSelfService"."HelpdeskTicketMessages" ("tenantId", "ticketId", "sentAt");
COMMENT ON TABLE "EmployeeSelfService"."HelpdeskTicketMessages" IS 'Conversation of a helpdesk ticket (ess/helpdesk chat drawer).';

-- faq — "Quick answers" (category badge + question + answer, search) and the
-- "These answers might help" suggestions while typing a ticket subject.
CREATE TABLE "EmployeeSelfService"."HelpdeskFaqs" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "categoryId"             uuid NOT NULL,
  question                text NOT NULL,                                             -- "When is salary credited?"
  answer                  text NOT NULL,
  keywords                text[] NOT NULL DEFAULT '{}',                              -- suggestion matching
  "sortOrder"              smallint NOT NULL DEFAULT 0,
  "isPublished"            boolean NOT NULL DEFAULT true,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  CONSTRAINT "faqCategoryFk" FOREIGN KEY ("tenantId", "categoryId")
    REFERENCES "EmployeeSelfService"."HelpdeskCategories" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."HelpdeskFaqs"');
CREATE INDEX "faqCategoryIdx"  ON "EmployeeSelfService"."HelpdeskFaqs" ("tenantId", "categoryId", "sortOrder") WHERE "deletedAt" IS NULL;
CREATE INDEX "faqKeywordsIdx"  ON "EmployeeSelfService"."HelpdeskFaqs" USING gin (keywords);
CREATE INDEX "faqQuestionTrgm" ON "EmployeeSelfService"."HelpdeskFaqs" USING gin (question gin_trgm_ops);
COMMENT ON TABLE "EmployeeSelfService"."HelpdeskFaqs" IS 'Helpdesk FAQ answers with keywords for in-sheet suggestions (ess/helpdesk).';


-- ---------------------------------------------------------------------------
-- kudos — ess/kudos "Give kudos" (To, Badge Customer Hero / Team Player /
-- Go-Getter / Problem Solver / Mentor, Message 0/280, Share on company wall,
-- "+20 points to them") and the Recognition wall (filters Everyone / For me /
-- By me / per badge); "Your recognition" Received / Given / Points.
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."Kudos" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "fromEmployeeId"        uuid NOT NULL,                                             -- → HumanResources.Employees
  "toEmployeeId"          uuid NOT NULL,                                             -- → HumanResources.Employees
  badge                   text NOT NULL,
  message                 text NOT NULL CHECK (char_length(message) BETWEEN 8 AND 280),
  "shareOnWall"           boolean NOT NULL DEFAULT true,
  "pointsToRecipient"     integer NOT NULL DEFAULT 20 CHECK ("pointsToRecipient" >= 0),
  "pointsToGiver"         integer NOT NULL DEFAULT 5 CHECK ("pointsToGiver" >= 0),
  "givenAt"                timestamptz NOT NULL DEFAULT now(),
  "isHidden"               boolean NOT NULL DEFAULT false,                            -- moderation
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "kudosNotSelfChk" CHECK ("fromEmployeeId" <> "toEmployeeId")
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."Kudos"');
CREATE INDEX "kudosWallIdx" ON "EmployeeSelfService"."Kudos" ("tenantId", "givenAt" DESC) WHERE "shareOnWall" AND NOT "isHidden";
CREATE INDEX "kudosToIdx"   ON "EmployeeSelfService"."Kudos" ("tenantId", "toEmployeeId", badge);
CREATE INDEX "kudosFromIdx" ON "EmployeeSelfService"."Kudos" ("tenantId", "fromEmployeeId");
COMMENT ON TABLE "EmployeeSelfService"."Kudos" IS 'Peer recognition with badge and points (ess/kudos wall). Comments use Company.Comments.';

-- KudosReactions — 👏 clap · ❤️ heart · 🔥 fire · 🎉 party toggles with counts.
CREATE TABLE "EmployeeSelfService"."KudosReactions" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "kudosId"                uuid NOT NULL,
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  reaction                text NOT NULL,
  "isActive"               boolean NOT NULL DEFAULT true,                             -- toggled off = false (no hard delete)
  "reactedAt"              timestamptz NOT NULL DEFAULT now(),
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "kudosId", "employeeId", reaction),
  CONSTRAINT "kudosReactionKudosFk" FOREIGN KEY ("tenantId", "kudosId")
    REFERENCES "EmployeeSelfService"."Kudos" ("tenantId", id) ON DELETE CASCADE
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."KudosReactions"');
CREATE INDEX "kudosReactionCountIdx" ON "EmployeeSelfService"."KudosReactions" ("tenantId", "kudosId", reaction) WHERE "isActive";
COMMENT ON TABLE "EmployeeSelfService"."KudosReactions" IS
  'One reaction type of one employee on a kudos card; un-toggling sets "isActive" = false (the app role has no DELETE).';


-- ---------------------------------------------------------------------------
-- PulseSurveys — ess/kudos "Weekly pulse" card (Anonymous badge, 1 of 3 dots,
-- faces 😫…😄, "78% of Sales have responded this week", results Workload 3.6 ·
-- Manager support 4.3 · eNPS 4.0).
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."PulseSurveys" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  title                   text NOT NULL,                                             -- "Weekly pulse · week 40"
  "periodFrom"             date NOT NULL,                                             -- week start
  "periodTo"               date NOT NULL,
  "departmentId"           uuid,                                                      -- → HumanResources.Departments; NULL = everyone
  "isAnonymous"            boolean NOT NULL DEFAULT true,
  status                  text NOT NULL DEFAULT 'DRAFT',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "pulseSurveyPeriodChk" CHECK ("periodTo" >= "periodFrom")
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."PulseSurveys"');
CREATE INDEX "pulseSurveyOpenIdx" ON "EmployeeSelfService"."PulseSurveys" ("tenantId", status, "periodFrom" DESC);
COMMENT ON TABLE "EmployeeSelfService"."PulseSurveys" IS 'Short recurring (weekly) anonymous engagement survey — ess/kudos.';

-- PulseSurveyQuestions (helper) — the 3 questions with scale labels:
-- "How manageable was your workload this week?" (Overwhelming … Very manageable) …
CREATE TABLE "EmployeeSelfService"."PulseSurveyQuestions" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "surveyId"               uuid NOT NULL,
  seq                     smallint NOT NULL CHECK (seq > 0),
  "questionText"           text NOT NULL,
  "lowLabel"               text NOT NULL,                                             -- "Overwhelming"
  "highLabel"              text NOT NULL,                                             -- "Very manageable"
  "metricKey"              text,   -- result rows
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "surveyId", seq),
  UNIQUE ("tenantId", id, "surveyId"),                                                 -- target of PulseSurveyResponses FK
  CONSTRAINT "pulseQuestionSurveyFk" FOREIGN KEY ("tenantId", "surveyId")
    REFERENCES "EmployeeSelfService"."PulseSurveys" ("tenantId", id) ON DELETE CASCADE
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."PulseSurveyQuestions"');
COMMENT ON TABLE "EmployeeSelfService"."PulseSurveyQuestions" IS 'Questions (1–5 scale with end labels) of a pulse survey.';

-- PulseSurveyResponses — one 1–5 answer per question per respondent. Anonymous: no
-- employeeId is stored, only a per-survey respondent hash
-- (digest(surveyId || employeeId || server secret)) for one-answer-per-person,
-- plus the department for the participation rate.
CREATE TABLE "EmployeeSelfService"."PulseSurveyResponses" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "surveyId"               uuid NOT NULL,
  "questionId"             uuid NOT NULL,
  "respondentHash"         text NOT NULL CHECK (char_length("respondentHash") >= 32),
  "departmentId"           uuid,                                                      -- → HumanResources.Departments
  score                   smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  "respondedAt"            timestamptz NOT NULL DEFAULT now(),
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "questionId", "respondentHash"),
  CONSTRAINT "pulseResponseQuestionFk" FOREIGN KEY ("tenantId", "questionId", "surveyId")
    REFERENCES "EmployeeSelfService"."PulseSurveyQuestions" ("tenantId", id, "surveyId")
);
-- no audit trigger (would undermine anonymity); createdBy is left NULL by the API
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."PulseSurveyResponses"');
CREATE INDEX "pulseResponseSurveyIdx" ON "EmployeeSelfService"."PulseSurveyResponses" ("tenantId", "surveyId", "departmentId");
COMMENT ON TABLE "EmployeeSelfService"."PulseSurveyResponses" IS
  'Anonymous 1–5 pulse answers; identity reduced to a per-survey respondent hash. Never audited.';


-- ---------------------------------------------------------------------------
-- poll — ess/kudos "Poll" card ("Venue for the annual dinner (12 Dec)?",
-- "Admin · Ahmed Raza", "148 votes", "Closes Fri, 09 Oct"; results after voting).
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."Polls" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  question                text NOT NULL,
  "createdByEmployeeId"  uuid,                                                      -- → HumanResources.Employees "Admin · Ahmed Raza"
  "departmentId"           uuid,                                                      -- → HumanResources.Departments; NULL = company-wide
  "opensAt"                timestamptz NOT NULL DEFAULT now(),
  "closesAt"               timestamptz NOT NULL,
  "showResultsAfterVote" boolean NOT NULL DEFAULT true,
  status                  text NOT NULL DEFAULT 'OPEN',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "pollWindowChk" CHECK ("closesAt" > "opensAt")
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."Polls"');
CREATE INDEX "pollOpenIdx" ON "EmployeeSelfService"."Polls" ("tenantId", status, "closesAt");
COMMENT ON TABLE "EmployeeSelfService"."Polls" IS 'Company poll (ess/kudos).';

-- PollOptions — Pearl Continental / Nishat Hotel / Royal Palm Golf Club.
CREATE TABLE "EmployeeSelfService"."PollOptions" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "pollId"                 uuid NOT NULL,
  seq                     smallint NOT NULL CHECK (seq > 0),
  label                   text NOT NULL,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "pollId", seq),
  UNIQUE ("tenantId", id, "pollId"),                                                   -- target of PollVotes FK
  CONSTRAINT "pollOptionPollFk" FOREIGN KEY ("tenantId", "pollId")
    REFERENCES "EmployeeSelfService"."Polls" ("tenantId", id) ON DELETE CASCADE
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."PollOptions"');
COMMENT ON TABLE "EmployeeSelfService"."PollOptions" IS 'Choices of a poll.';

-- PollVotes — one vote per employee per poll; the option must belong to the poll.
CREATE TABLE "EmployeeSelfService"."PollVotes" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "pollId"                 uuid NOT NULL,
  "optionId"               uuid NOT NULL,
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "votedAt"                timestamptz NOT NULL DEFAULT now(),
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "pollId", "employeeId"),
  CONSTRAINT "pollVoteOptionFk" FOREIGN KEY ("tenantId", "optionId", "pollId")
    REFERENCES "EmployeeSelfService"."PollOptions" ("tenantId", id, "pollId")
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."PollVotes"');
CREATE INDEX "pollVoteOptionIdx" ON "EmployeeSelfService"."PollVotes" ("tenantId", "pollId", "optionId");
COMMENT ON TABLE "EmployeeSelfService"."PollVotes" IS 'A single employee vote (one per poll).';


-- ---------------------------------------------------------------------------
-- ShiftSwapRequests — ess/shifts "Swap requests" + "Request a shift swap" wizard
-- (1 Shift · 2 Colleague · 3 Reason: Family event / Medical appointment /
-- Client visit / Training / Personal, note for colleague). "Swap with" when the
-- colleague works that day, "Cover by" when the colleague is off. Tracker
-- Requested → Accepted → Manager → Approved; team-lead card "Imran ⇄ Salman ·
-- Needs you" with Approve swap / Decline (reason). SW-2026-014.
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."ShiftSwapRequests" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                             -- SW-2026-014
  "docDate"                date NOT NULL DEFAULT current_date,                        -- requested on
  "requesterEmployeeId"   uuid NOT NULL,                                             -- → HumanResources.Employees
  "counterpartEmployeeId" uuid NOT NULL,                                             -- → HumanResources.Employees
  "swapDate"               date NOT NULL,                                             -- Sat 03 Oct
  "swapMode"               text NOT NULL,
  "requesterShiftId"      uuid NOT NULL,                                             -- → HumanResources.WorkShifts (Morning field 07–15)
  "counterpartShiftId"    uuid,                                                      -- → HumanResources.WorkShifts; NULL when COVER (colleague off)
  "reasonCategory"         text NOT NULL,
  reason                  text,                                                      -- "brother's walima in Kasur"
  "noteToCounterpart"     text,                                                      -- "I'll cover your Saturday next week"
  status                  text NOT NULL DEFAULT 'REQUESTED',
  "acceptedAt"             timestamptz,
  "approverEmployeeId"    uuid,                                                      -- → HumanResources.Employees (line manager)
  "decidedByUserId"      uuid,
  "decidedAt"              timestamptz,
  "decisionReason"         text,                                                      -- decline / reject reason "shared with both"
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "shiftSwapDecidedByFk" FOREIGN KEY ("tenantId", "decidedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "shiftSwapPeopleChk" CHECK ("requesterEmployeeId" <> "counterpartEmployeeId"),
  CONSTRAINT "shiftSwapModeChk" CHECK (("swapMode" = 'SWAP') = ("counterpartShiftId" IS NOT NULL)),
  CONSTRAINT "shiftSwapAcceptedChk" CHECK (status NOT IN ('ACCEPTED','APPROVED') OR "acceptedAt" IS NOT NULL),
  CONSTRAINT "shiftSwapDecidedChk" CHECK (status NOT IN ('APPROVED','REJECTED') OR "decidedAt" IS NOT NULL),
  CONSTRAINT "shiftSwapReasonChk" CHECK (status NOT IN ('DECLINED','REJECTED') OR "decisionReason" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."ShiftSwapRequests"', true);
CREATE INDEX "shiftSwapRequesterIdx"   ON "EmployeeSelfService"."ShiftSwapRequests" ("tenantId", "requesterEmployeeId", "swapDate");
CREATE INDEX "shiftSwapCounterpartIdx" ON "EmployeeSelfService"."ShiftSwapRequests" ("tenantId", "counterpartEmployeeId", "swapDate");
CREATE INDEX "shiftSwapApproverIdx"    ON "EmployeeSelfService"."ShiftSwapRequests" ("tenantId", "approverEmployeeId", status)
  WHERE status IN ('REQUESTED','ACCEPTED');
-- one live request per person per day ("pending" badge in the roster cell)
CREATE UNIQUE INDEX "shiftSwapOneLivePerDay" ON "EmployeeSelfService"."ShiftSwapRequests" ("tenantId", "requesterEmployeeId", "swapDate")
  WHERE status IN ('REQUESTED','ACCEPTED');
COMMENT ON TABLE "EmployeeSelfService"."ShiftSwapRequests" IS
  'Employee shift swap / cover request: colleague accepts, manager approves, roster (HumanResources.ShiftRosters) is updated — ess/shifts.';

-- OpenShifts — "Open shifts" (OS-31 · 03 Sat · Market activation · Al-Fatah
-- Gulberg · 10:00 – 16:00 · 6h · 2 slots left · +Rs 2,500 allowance; OS-32
-- "OT 1.5× · lunch provided"). "First come, first served · manager confirms".
CREATE TABLE "EmployeeSelfService"."OpenShifts" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL,                                             -- OS-31
  "shiftDate"              date NOT NULL,
  "shiftId"                uuid NOT NULL,                                             -- → HumanResources.WorkShifts (Activation 10–16)
  "branchId"               uuid,
  "departmentId"           uuid,                                                      -- → HumanResources.Departments (team it is offered to)
  title                   text NOT NULL,                                             -- "Market activation · Al-Fatah Gulberg"
  "perkText"               text,                                                      -- "+Rs 2,500 allowance"
  "allowanceAmount"        numeric(18,2) CHECK ("allowanceAmount" >= 0),               -- 2,500 → PayrollAdjustments
  "overtimeMultiplier"     numeric(5,2) CHECK ("overtimeMultiplier" >= 1),             -- 1.5
  "slotsTotal"             smallint NOT NULL CHECK ("slotsTotal" > 0),                 -- 2
  status                  text NOT NULL DEFAULT 'OPEN',
  "postedByUserId"       uuid,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "openShiftBranchFk" FOREIGN KEY ("tenantId", "branchId")
    REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "openShiftPostedByFk" FOREIGN KEY ("tenantId", "postedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."OpenShifts"', true);
CREATE INDEX "openShiftDateIdx" ON "EmployeeSelfService"."OpenShifts" ("tenantId", status, "shiftDate");
COMMENT ON TABLE "EmployeeSelfService"."OpenShifts" IS 'Extra shift offered to a team with a perk and limited slots — ess/shifts.';

-- OpenShiftClaims — "Pick up" → badge "Requested"; manager confirms.
CREATE TABLE "EmployeeSelfService"."OpenShiftClaims" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "openShiftId"           uuid NOT NULL,
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "claimedAt"              timestamptz NOT NULL DEFAULT now(),
  status                  text NOT NULL DEFAULT 'REQUESTED',
  "decidedByUserId"      uuid,
  "decidedAt"              timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "openShiftId", "employeeId"),
  CONSTRAINT "openShiftClaimShiftFk" FOREIGN KEY ("tenantId", "openShiftId")
    REFERENCES "EmployeeSelfService"."OpenShifts" ("tenantId", id),
  CONSTRAINT "openShiftClaimDecidedByFk" FOREIGN KEY ("tenantId", "decidedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "openShiftClaimDecidedChk" CHECK (status NOT IN ('CONFIRMED','DECLINED') OR "decidedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."OpenShiftClaims"', true);
CREATE INDEX "openShiftClaimEmployeeIdx" ON "EmployeeSelfService"."OpenShiftClaims" ("tenantId", "employeeId");
COMMENT ON TABLE "EmployeeSelfService"."OpenShiftClaims" IS 'Employee pick-up of an open shift slot, confirmed by the manager.';

-- Slots guard: confirmed + requested claims may not exceed slotsTotal.
CREATE OR REPLACE FUNCTION "EmployeeSelfService"."triggerOpenShiftClaimSlots"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vShift" record;
  "vTaken" integer;
BEGIN
  IF NEW.status NOT IN ('REQUESTED','CONFIRMED') THEN
    RETURN NEW;
  END IF;
  SELECT s."slotsTotal", s.status INTO "vShift"
    FROM "EmployeeSelfService"."OpenShifts" s
   WHERE s."tenantId" = NEW."tenantId" AND s.id = NEW."openShiftId"
   FOR UPDATE;
  IF "vShift".status <> 'OPEN' THEN
    RAISE EXCEPTION 'Open shift is %, it can no longer be picked up', "vShift".status USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO "vTaken"
    FROM "EmployeeSelfService"."OpenShiftClaims" c
   WHERE c."tenantId" = NEW."tenantId" AND c."openShiftId" = NEW."openShiftId"
     AND c.status IN ('REQUESTED','CONFIRMED') AND c.id <> NEW.id;
  IF "vTaken" >= "vShift"."slotsTotal" THEN
    RAISE EXCEPTION 'No slots left on this open shift' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "openShiftClaimSlots" BEFORE INSERT OR UPDATE OF status ON "EmployeeSelfService"."OpenShiftClaims"
  FOR EACH ROW EXECUTE FUNCTION "EmployeeSelfService"."triggerOpenShiftClaimSlots"();


-- ---------------------------------------------------------------------------
-- CompanyAnnouncements — ess/company "Announcements · 4 new" (icon tile,
-- title, "Ahmed Raza · Pearl Continental, Shalimar Hall · 10:00 AM", age),
-- detail drawer ("Got it" = mark read); ess/dashboard "Announcements" card.
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."CompanyAnnouncements" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  title                   text NOT NULL,                                             -- "Q2 sales kick-off · 05 Oct"
  summary                 text,                                                      -- sub-line on the card
  body                    text,                                                      -- drawer text
  kind                    text NOT NULL DEFAULT 'GENERAL',   -- megaphone / file-text / sparkles / party
  "authorEmployeeId"      uuid,                                                      -- → HumanResources.Employees (Ahmed Raza)
  "authorLabel"            text,                                                      -- "HR", "Finance", "Admin"
  "eventAt"                timestamptz,                                               -- 05 Oct 10:00
  venue                   text,                                                      -- Pearl Continental Lahore, Shalimar Hall
  "requiresRsvp"           boolean NOT NULL DEFAULT false,                            -- "Please confirm attendance"
  "branchId"               uuid,                                                      -- audience; NULL = all branches
  "departmentId"           uuid,                                                      -- → HumanResources.Departments; NULL = all
  "policyDocumentId"      uuid,                                                      -- "Updated travel & expense policy v3.2"
  "isPinned"               boolean NOT NULL DEFAULT false,
  status                  text NOT NULL DEFAULT 'DRAFT',
  "publishedAt"            timestamptz,
  "expiresAt"              timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "companyAnnouncementBranchFk" FOREIGN KEY ("tenantId", "branchId")
    REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "companyAnnouncementPublishedChk" CHECK (status <> 'PUBLISHED' OR "publishedAt" IS NOT NULL),
  CONSTRAINT "companyAnnouncementExpiryChk" CHECK ("expiresAt" IS NULL OR "publishedAt" IS NULL OR "expiresAt" > "publishedAt")
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."CompanyAnnouncements"');
CREATE INDEX "companyAnnouncementFeedIdx" ON "EmployeeSelfService"."CompanyAnnouncements" ("tenantId", "publishedAt" DESC)
  WHERE status = 'PUBLISHED';
COMMENT ON TABLE "EmployeeSelfService"."CompanyAnnouncements" IS 'Company news / events shown on ess/company and ess/dashboard.';

-- CompanyAnnouncementReads (helper) — "4 new" count and "Got it / Marked as read".
CREATE TABLE "EmployeeSelfService"."CompanyAnnouncementReads" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "announcementId"         uuid NOT NULL,
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "readAt"                 timestamptz NOT NULL DEFAULT now(),
  rsvp                    text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "announcementId", "employeeId"),
  CONSTRAINT "announcementReadAnnouncementFk" FOREIGN KEY ("tenantId", "announcementId")
    REFERENCES "EmployeeSelfService"."CompanyAnnouncements" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."CompanyAnnouncementReads"');
COMMENT ON TABLE "EmployeeSelfService"."CompanyAnnouncementReads" IS 'Per-employee read receipt / RSVP of an announcement.';


-- ---------------------------------------------------------------------------
-- CompanyPolicies — ess/company "Policies · 4 of 5 acknowledged" (Code of
-- conduct v4.0 · Jan 2026, Leave & attendance policy v2.3, Travel & expense
-- policy v3.2, IT acceptable use v1.8, Anti-harassment (Act 2010) v2.0);
-- ess/onboarding policy sheet "HR-POL-014 · v3 · effective 01 Sep 2026 · owner
-- Ayesha Noor" with numbered sections; ess/leave "HR-POL-07"; ess/shifts
-- "Policy HR-ATT-04". POL-014.
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."CompanyPolicies" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL,                                             -- POL-014 / HR-POL-07 / HR-ATT-04
  title                   text NOT NULL,                                             -- Leave & attendance approval policy
  version                 text NOT NULL,                                             -- v3 / v4.0
  category                text NOT NULL DEFAULT 'HR',
  "effectiveDate"          date NOT NULL,                                             -- 01 Sep 2026
  "ownerEmployeeId"       uuid,                                                      -- → HumanResources.Employees (Ayesha Noor)
  body                    text,                                                      -- numbered sections (reader sheet)
  "readMinutes"            smallint CHECK ("readMinutes" > 0),                         -- "4 min read"
  "attachmentId"           uuid,                                                      -- "Download PDF"
  "requiresAcknowledgement" boolean NOT NULL DEFAULT true,
  "supersedesPolicyId"    uuid,                                                      -- previous version
  status                  text NOT NULL DEFAULT 'DRAFT',
  "publishedAt"            timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code, version),
  CONSTRAINT "policyDocumentAttachmentFk" FOREIGN KEY ("tenantId", "attachmentId")
    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "policyDocumentSupersedesFk" FOREIGN KEY ("tenantId", "supersedesPolicyId")
    REFERENCES "EmployeeSelfService"."CompanyPolicies" ("tenantId", id),
  CONSTRAINT "policyDocumentPublishedChk" CHECK (status <> 'PUBLISHED' OR "publishedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."CompanyPolicies"', true);
-- one published version per policy code
CREATE UNIQUE INDEX "policyDocumentOnePublished" ON "EmployeeSelfService"."CompanyPolicies" ("tenantId", code)
  WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL;
COMMENT ON TABLE "EmployeeSelfService"."CompanyPolicies" IS 'Versioned company policies employees read and acknowledge (ess/company, ess/onboarding).';

ALTER TABLE "EmployeeSelfService"."CompanyAnnouncements"
  ADD CONSTRAINT "companyAnnouncementPolicyFk" FOREIGN KEY ("tenantId", "policyDocumentId")
  REFERENCES "EmployeeSelfService"."CompanyPolicies" ("tenantId", id);

-- PolicyAcknowledgements (helper) — "Acknowledge" → "I confirm I have read …"
-- ("recorded with timestamp"); onboarding "Read & agree" (scroll to end, tick,
-- "I agree" → "e-signature recorded").
CREATE TABLE "EmployeeSelfService"."PolicyAcknowledgements" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "policyDocumentId"      uuid NOT NULL,
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "acknowledgedAt"         timestamptz NOT NULL DEFAULT now(),
  "readToEnd"             boolean NOT NULL DEFAULT false,                            -- reader progress reached the end
  "signatureText"          text,                                                      -- typed / drawn e-signature reference
  "ipAddress"              inet,
  "userAgent"              text,
  "onboardingTaskId"      uuid,                                                      -- → HumanResources.OnboardingTasks ("Read & agree" step)
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "policyDocumentId", "employeeId"),
  CONSTRAINT "policyAcknowledgementPolicyFk" FOREIGN KEY ("tenantId", "policyDocumentId")
    REFERENCES "EmployeeSelfService"."CompanyPolicies" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."PolicyAcknowledgements"', true);
CREATE INDEX "policyAcknowledgementEmployeeIdx" ON "EmployeeSelfService"."PolicyAcknowledgements" ("tenantId", "employeeId");
COMMENT ON TABLE "EmployeeSelfService"."PolicyAcknowledgements" IS 'Timestamped employee acceptance of a policy version (legal record, kept 6 years).';


-- ---------------------------------------------------------------------------
-- PresenceStatuses — ess/company directory status dot + text: Available ·
-- Busy ("In a meeting until 11:30", "Month-end close") · In the field
-- ("Vendor visit · Sundar Estate", "On delivery route") · Away ("On leave until
-- 05 Oct", "Not checked in"). One current row per employee.
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."PresenceStatuses" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  status                  text NOT NULL DEFAULT 'AVAILABLE',
  message                 text,                                                      -- "In a meeting until 11:30"
  "locationLabel"          text,                                                      -- "Karachi", "Faisalabad"
  "untilAt"                timestamptz,                                               -- auto-clear time
  source                  text NOT NULL DEFAULT 'MANUAL',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "employeeId")
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."PresenceStatuses"');
COMMENT ON TABLE "EmployeeSelfService"."PresenceStatuses" IS 'Current availability of an employee for the people directory (ess/company).';


-- ---------------------------------------------------------------------------
-- ProfileChangeRequests (helper) — ess/profile "Request a change" (Field,
-- Current value, New value *, Reason, Supporting proof, "Verified by OTP"),
-- "Pending changes" card (In review · Submitted → HR review → Updated),
-- per-field "Pending change → …" badge and Withdraw. HR applies the approved
-- value to HumanResources.Employees / HumanResources.EmployeeBankAccounts.
-- ---------------------------------------------------------------------------
CREATE TABLE "EmployeeSelfService"."ProfileChangeRequests" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "employeeId"             uuid NOT NULL,                                             -- → HumanResources.Employees
  "fieldKey"               text NOT NULL,
  "fieldLabel"             text NOT NULL,                                             -- "Home address"
  "currentValue"           text,
  "requestedValue"         text NOT NULL,
  reason                  text,                                                      -- "Moved house in September"
  "proofAttachmentId"     uuid,                                                      -- LESCO-bill-Sep-2026.pdf
  "otpVerifiedAt"         timestamptz,                                               -- code sent to 0312-•••8899
  status                  text NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId"     uuid,                                                      -- Ayesha Noor
  "reviewedAt"             timestamptz,
  "reviewComment"          text,
  "appliedAt"              timestamptz,                                               -- bank changes apply from next payroll
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  CONSTRAINT "profileChangeRequestProofFk" FOREIGN KEY ("tenantId", "proofAttachmentId")
    REFERENCES "Company"."Attachments" ("tenantId", id),
  CONSTRAINT "profileChangeRequestReviewedByFk" FOREIGN KEY ("tenantId", "reviewedByUserId")
    REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "profileChangeRequestReviewedChk" CHECK (status NOT IN ('APPROVED','REJECTED') OR "reviewedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"EmployeeSelfService"."ProfileChangeRequests"', true);
-- one pending change per field ("Change" button becomes "Withdraw")
CREATE UNIQUE INDEX "profileChangeRequestOnePending" ON "EmployeeSelfService"."ProfileChangeRequests" ("tenantId", "employeeId", "fieldKey")
  WHERE status = 'PENDING';
CREATE INDEX "profileChangeRequestQueueIdx" ON "EmployeeSelfService"."ProfileChangeRequests" ("tenantId", status, "createdAt");
COMMENT ON TABLE "EmployeeSelfService"."ProfileChangeRequests" IS
  'Employee-initiated change to HR-held personal/bank data, OTP-verified and approved by HR — ess/profile.';
