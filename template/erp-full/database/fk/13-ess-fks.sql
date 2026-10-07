-- =============================================================================
-- Finsoft ERP (FULL) — fk/13-ess-fks.sql
-- Cross-module foreign keys of the ess schema (contract §3). Runs after every
-- schema file, so hr.* already exists. Composite tenant FKs throughout.
-- Targets: HumanResources.Employees, HumanResources.WorkShifts, HumanResources.Departments, HumanResources.LeaveRequests,
--          HumanResources.EmployeeLetters, HumanResources.OnboardingTasks
-- =============================================================================

-- ---------------------------------------------------------------------------
-- → HumanResources.Employees
-- ---------------------------------------------------------------------------
ALTER TABLE "EmployeeSelfService"."LetterRequests"
  ADD CONSTRAINT "letterRequestEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."HelpdeskCategories"
  ADD CONSTRAINT "helpdeskCategoryOwnerEmployeeIdFk" FOREIGN KEY ("tenantId", "ownerEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."HelpdeskTickets"
  ADD CONSTRAINT "helpdeskTicketEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."HelpdeskTickets"
  ADD CONSTRAINT "helpdeskTicketAgentEmployeeIdFk" FOREIGN KEY ("tenantId", "agentEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."HelpdeskTicketMessages"
  ADD CONSTRAINT "helpdeskMessageAuthorEmployeeIdFk" FOREIGN KEY ("tenantId", "authorEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."Kudos"
  ADD CONSTRAINT "kudosFromEmployeeIdFk" FOREIGN KEY ("tenantId", "fromEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."Kudos"
  ADD CONSTRAINT "kudosToEmployeeIdFk" FOREIGN KEY ("tenantId", "toEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."KudosReactions"
  ADD CONSTRAINT "kudosReactionEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."Polls"
  ADD CONSTRAINT "pollCreatedByEmployeeIdFk" FOREIGN KEY ("tenantId", "createdByEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."PollVotes"
  ADD CONSTRAINT "pollVoteEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."ShiftSwapRequests"
  ADD CONSTRAINT "shiftSwapRequesterEmployeeIdFk" FOREIGN KEY ("tenantId", "requesterEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."ShiftSwapRequests"
  ADD CONSTRAINT "shiftSwapCounterpartEmployeeIdFk" FOREIGN KEY ("tenantId", "counterpartEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."ShiftSwapRequests"
  ADD CONSTRAINT "shiftSwapApproverEmployeeIdFk" FOREIGN KEY ("tenantId", "approverEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."OpenShiftClaims"
  ADD CONSTRAINT "openShiftClaimEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."CompanyAnnouncements"
  ADD CONSTRAINT "companyAnnouncementAuthorEmployeeIdFk" FOREIGN KEY ("tenantId", "authorEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."CompanyAnnouncementReads"
  ADD CONSTRAINT "announcementReadEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."CompanyPolicies"
  ADD CONSTRAINT "policyDocumentOwnerEmployeeIdFk" FOREIGN KEY ("tenantId", "ownerEmployeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."PolicyAcknowledgements"
  ADD CONSTRAINT "policyAcknowledgementEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."PresenceStatuses"
  ADD CONSTRAINT "presenceStatusEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."ProfileChangeRequests"
  ADD CONSTRAINT "profileChangeRequestEmployeeIdFk" FOREIGN KEY ("tenantId", "employeeId")
  REFERENCES "HumanResources"."Employees" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- → HumanResources.WorkShifts
-- ---------------------------------------------------------------------------
ALTER TABLE "EmployeeSelfService"."ShiftSwapRequests"
  ADD CONSTRAINT "shiftSwapRequesterShiftIdFk" FOREIGN KEY ("tenantId", "requesterShiftId")
  REFERENCES "HumanResources"."WorkShifts" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."ShiftSwapRequests"
  ADD CONSTRAINT "shiftSwapCounterpartShiftIdFk" FOREIGN KEY ("tenantId", "counterpartShiftId")
  REFERENCES "HumanResources"."WorkShifts" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."OpenShifts"
  ADD CONSTRAINT "openShiftShiftIdFk" FOREIGN KEY ("tenantId", "shiftId")
  REFERENCES "HumanResources"."WorkShifts" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- → HumanResources.Departments (audiences, anonymous pulse participation)
-- ---------------------------------------------------------------------------
ALTER TABLE "EmployeeSelfService"."PulseSurveys"
  ADD CONSTRAINT "pulseSurveyDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId")
  REFERENCES "HumanResources"."Departments" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."PulseSurveyResponses"
  ADD CONSTRAINT "pulseResponseDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId")
  REFERENCES "HumanResources"."Departments" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."Polls"
  ADD CONSTRAINT "pollDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId")
  REFERENCES "HumanResources"."Departments" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."OpenShifts"
  ADD CONSTRAINT "openShiftDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId")
  REFERENCES "HumanResources"."Departments" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."CompanyAnnouncements"
  ADD CONSTRAINT "companyAnnouncementDepartmentIdFk" FOREIGN KEY ("tenantId", "departmentId")
  REFERENCES "HumanResources"."Departments" ("tenantId", id);

-- ---------------------------------------------------------------------------
-- → HumanResources.LeaveRequests / HumanResources.EmployeeLetters / HumanResources.OnboardingTasks
-- ---------------------------------------------------------------------------
ALTER TABLE "EmployeeSelfService"."LetterRequests"
  ADD CONSTRAINT "letterRequestLeaveRequestIdFk" FOREIGN KEY ("tenantId", "leaveRequestId")
  REFERENCES "HumanResources"."LeaveRequests" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."LetterRequests"
  ADD CONSTRAINT "letterRequestHrLetterIdFk" FOREIGN KEY ("tenantId", "hrLetterId")
  REFERENCES "HumanResources"."EmployeeLetters" ("tenantId", id);
ALTER TABLE "EmployeeSelfService"."PolicyAcknowledgements"
  ADD CONSTRAINT "policyAcknowledgementOnboardingTaskIdFk" FOREIGN KEY ("tenantId", "onboardingTaskId")
  REFERENCES "HumanResources"."OnboardingTasks" ("tenantId", id);
