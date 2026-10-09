import { Module } from '@nestjs/common';
import { DepartmentStore } from './departments/application/department-store.js';
import { DepartmentsService } from './departments/application/departments.service.js';
import { PrismaDepartmentStore } from './departments/infrastructure/prisma-department.store.js';
import { DepartmentsController } from './departments/presentation/departments.controller.js';
import { DesignationStore } from './designations/application/designation-store.js';
import { DesignationsService } from './designations/application/designations.service.js';
import { PrismaDesignationStore } from './designations/infrastructure/prisma-designation.store.js';
import { DesignationsController } from './designations/presentation/designations.controller.js';
import { DeviceStore } from './devices/application/device-store.js';
import { DevicesService } from './devices/application/devices.service.js';
import { PrismaDeviceStore } from './devices/infrastructure/prisma-device.store.js';
import { DevicesController } from './devices/presentation/devices.controller.js';
import { EmployeeStore } from './employees/application/employee-store.js';
import { EmployeesService } from './employees/application/employees.service.js';
import { PrismaEmployeeStore } from './employees/infrastructure/prisma-employee.store.js';
import { EmployeesController } from './employees/presentation/employees.controller.js';
import { GradeStore } from './grades/application/grade-store.js';
import { GradesService } from './grades/application/grades.service.js';
import { PrismaGradeStore } from './grades/infrastructure/prisma-grade.store.js';
import { GradesController } from './grades/presentation/grades.controller.js';
import { HolidayStore } from './holidays/application/holiday-store.js';
import { HolidaysService } from './holidays/application/holidays.service.js';
import { PrismaHolidayStore } from './holidays/infrastructure/prisma-holiday.store.js';
import { HolidaysController } from './holidays/presentation/holidays.controller.js';
import { LeaveTypeStore } from './leave-types/application/leave-type-store.js';
import { LeaveTypesService } from './leave-types/application/leave-types.service.js';
import { PrismaLeaveTypeStore } from './leave-types/infrastructure/prisma-leave-type.store.js';
import { LeaveTypesController } from './leave-types/presentation/leave-types.controller.js';
import { OrgStore } from './org/application/org-store.js';
import { OrgService } from './org/application/org.service.js';
import { PrismaOrgStore } from './org/infrastructure/prisma-org.store.js';
import { OrgController } from './org/presentation/org.controller.js';
import { OvertimeStore } from './overtime/application/overtime-store.js';
import { OvertimeService } from './overtime/application/overtime.service.js';
import { PrismaOvertimeStore } from './overtime/infrastructure/prisma-overtime.store.js';
import { OvertimeController } from './overtime/presentation/overtime.controller.js';
import { ShiftStore } from './shifts/application/shift-store.js';
import { ShiftsService } from './shifts/application/shifts.service.js';
import { PrismaShiftStore } from './shifts/infrastructure/prisma-shift.store.js';
import { ShiftsController } from './shifts/presentation/shifts.controller.js';
// Phase 13: talent & policy setup
import { OnboardingTemplateStore } from './onboarding-templates/application/onboarding-template-store.js';
import { OnboardingTemplatesService } from './onboarding-templates/application/onboarding-templates.service.js';
import { PrismaOnboardingTemplateStore } from './onboarding-templates/infrastructure/prisma-onboarding-template.store.js';
import { OnboardingTemplatesController } from './onboarding-templates/presentation/onboarding-templates.controller.js';
import { PerformanceCycleStore } from './performance-cycles/application/performance-cycle-store.js';
import { PerformanceCyclesService } from './performance-cycles/application/performance-cycles.service.js';
import { PrismaPerformanceCycleStore } from './performance-cycles/infrastructure/prisma-performance-cycle.store.js';
import { PerformanceCyclesController } from './performance-cycles/presentation/performance-cycles.controller.js';
import { TrainingProgramStore } from './training-programs/application/training-program-store.js';
import { TrainingProgramsService } from './training-programs/application/training-programs.service.js';
import { PrismaTrainingProgramStore } from './training-programs/infrastructure/prisma-training-program.store.js';
import { TrainingProgramsController } from './training-programs/presentation/training-programs.controller.js';
import { PolicyStore } from './policies/application/policy-store.js';
import { PoliciesService } from './policies/application/policies.service.js';
import { PrismaPolicyStore } from './policies/infrastructure/prisma-policy.store.js';
import { PoliciesController } from './policies/presentation/policies.controller.js';

// Phase 30: time & attendance
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { AttendanceStore } from './attendance/application/attendance-store.js';
import { AttendanceService } from './attendance/application/attendance.service.js';
import { PrismaAttendanceStore } from './attendance/infrastructure/prisma-attendance.store.js';
import { AttendanceController, MyAttendanceController } from './attendance/presentation/attendance.controller.js';
import { RegularisationStore } from './regularisation/application/regularisation-store.js';
import { RegularisationService } from './regularisation/application/regularisation.service.js';
import { PrismaRegularisationStore } from './regularisation/infrastructure/prisma-regularisation.store.js';
import { MyRegularisationController, RegularisationController } from './regularisation/presentation/regularisation.controller.js';
import { RosterStore } from './rosters/application/roster-store.js';
import { RostersService } from './rosters/application/rosters.service.js';
import { PrismaRosterStore } from './rosters/infrastructure/prisma-roster.store.js';
import { MyShiftsController, OpenShiftsController, RostersController, ShiftSwapsController } from './rosters/presentation/rosters.controller.js';
import { OvertimeClaimStore } from './overtime-claims/application/overtime-claim-store.js';
import { OvertimeClaimsService } from './overtime-claims/application/overtime-claims.service.js';
import { PrismaOvertimeClaimStore } from './overtime-claims/infrastructure/prisma-overtime-claim.store.js';
import { OvertimeClaimsController } from './overtime-claims/presentation/overtime-claims.controller.js';
// Phase 31: leave & lifecycle
import { LeaveRequestStore } from './leave-requests/application/leave-request-store.js';
import { LeaveRequestsService } from './leave-requests/application/leave-requests.service.js';
import { PrismaLeaveRequestStore } from './leave-requests/infrastructure/prisma-leave-request.store.js';
import { LeaveRequestsController, MyLeaveController } from './leave-requests/presentation/leave-requests.controller.js';
import { LeaveBalanceStore } from './leave-balances/application/leave-balance-store.js';
import { LeaveBalancesService } from './leave-balances/application/leave-balances.service.js';
import { PrismaLeaveBalanceStore } from './leave-balances/infrastructure/prisma-leave-balance.store.js';
import { LeaveAdjustmentsController, LeaveBalancesController, LeaveYearEndController } from './leave-balances/presentation/leave-balances.controller.js';
import { OnboardingStore } from './onboardings/application/onboarding-store.js';
import { OnboardingsService } from './onboardings/application/onboardings.service.js';
import { PrismaOnboardingStore } from './onboardings/infrastructure/prisma-onboarding.store.js';
import { MyOnboardingController, OnboardingsController } from './onboardings/presentation/onboardings.controller.js';
import { OffboardingStore } from './offboardings/application/offboarding-store.js';
import { OffboardingsService } from './offboardings/application/offboardings.service.js';
import { PrismaOffboardingStore } from './offboardings/infrastructure/prisma-offboarding.store.js';
import { OffboardingsController } from './offboardings/presentation/offboardings.controller.js';
// Phase 33 (talent): recruitment, performance, training
import { RecruitmentStore } from './recruitment/application/recruitment-store.js';
import { RecruitmentService } from './recruitment/application/recruitment.service.js';
import { PrismaRecruitmentStore } from './recruitment/infrastructure/prisma-recruitment.store.js';
import { CandidatesController, JobOpeningsController, RecruitmentController } from './recruitment/presentation/recruitment.controller.js';
import { PerformanceStore } from './performance/application/performance-store.js';
import { PerformanceService } from './performance/application/performance.service.js';
import { PrismaPerformanceStore } from './performance/infrastructure/prisma-performance.store.js';
import { MyGoalsController, PerformanceController } from './performance/presentation/performance.controller.js';
import { TrainingStore } from './training/application/training-store.js';
import { TrainingService } from './training/application/training.service.js';
import { PrismaTrainingStore } from './training/infrastructure/prisma-training.store.js';
import { TrainingController, TrainingSessionsController } from './training/presentation/training.controller.js';
// Phase 33 (exits): employee letters (PDF) and assets
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { PdfRenderer } from '../../core/application/ports/pdf-renderer.js';
import { PdfkitRenderer } from '../../infrastructure/pdf/pdfkit-renderer.js';
import { EmployeeLetterStore } from './letters/application/letter-store.js';
import { EmployeeLettersService } from './letters/application/letters.service.js';
import { PrismaEmployeeLetterStore } from './letters/infrastructure/prisma-letter.store.js';
import { EmployeeLettersController, LetterVerificationController } from './letters/presentation/letters.controller.js';
import { EmployeeAssetStore } from './assets/application/asset-store.js';
import { EmployeeAssetsService } from './assets/application/assets.service.js';
import { PrismaEmployeeAssetStore } from './assets/infrastructure/prisma-asset.store.js';
import { EmployeeAssetsController } from './assets/presentation/assets.controller.js';

/**
 * HR: organisation (Phase 10: departments, designations, grades, work shifts, holidays, org chart) and policies & people
 * (Phase 11: employees, leave types, overtime policy, biometric devices, branch HR settings).
 */
@Module({
  imports: [ApprovalsModule, AttachmentsModule /* Phase 33 exits */],
  controllers: [
    OrgController, DepartmentsController, DesignationsController, GradesController, ShiftsController, HolidaysController,
    EmployeesController, LeaveTypesController, OvertimeController, DevicesController,
    OnboardingTemplatesController, PerformanceCyclesController, TrainingProgramsController, PoliciesController, // Phase 13
    AttendanceController, MyAttendanceController, RegularisationController, MyRegularisationController, // Phase 30
    RostersController, ShiftSwapsController, OpenShiftsController, MyShiftsController, OvertimeClaimsController,
    LeaveRequestsController, MyLeaveController, LeaveBalancesController, LeaveAdjustmentsController, LeaveYearEndController, // Phase 31
    OnboardingsController, MyOnboardingController, OffboardingsController,
    RecruitmentController, JobOpeningsController, CandidatesController, PerformanceController, MyGoalsController, TrainingController, TrainingSessionsController, // Phase 33 talent
    EmployeeLettersController, LetterVerificationController, EmployeeAssetsController, // Phase 33 exits
  ],
  providers: [
    DepartmentsService, { provide: DepartmentStore, useClass: PrismaDepartmentStore },
    DesignationsService, { provide: DesignationStore, useClass: PrismaDesignationStore },
    GradesService, { provide: GradeStore, useClass: PrismaGradeStore },
    ShiftsService, { provide: ShiftStore, useClass: PrismaShiftStore },
    HolidaysService, { provide: HolidayStore, useClass: PrismaHolidayStore },
    OrgService, { provide: OrgStore, useClass: PrismaOrgStore },
    EmployeesService, { provide: EmployeeStore, useClass: PrismaEmployeeStore },
    LeaveTypesService, { provide: LeaveTypeStore, useClass: PrismaLeaveTypeStore },
    OvertimeService, { provide: OvertimeStore, useClass: PrismaOvertimeStore },
    DevicesService, { provide: DeviceStore, useClass: PrismaDeviceStore },
    OnboardingTemplatesService, { provide: OnboardingTemplateStore, useClass: PrismaOnboardingTemplateStore },
    PerformanceCyclesService, { provide: PerformanceCycleStore, useClass: PrismaPerformanceCycleStore },
    TrainingProgramsService, { provide: TrainingProgramStore, useClass: PrismaTrainingProgramStore },
    PoliciesService, { provide: PolicyStore, useClass: PrismaPolicyStore },
    AttendanceService, { provide: AttendanceStore, useClass: PrismaAttendanceStore }, // Phase 30
    RegularisationService, { provide: RegularisationStore, useClass: PrismaRegularisationStore },
    RostersService, { provide: RosterStore, useClass: PrismaRosterStore },
    OvertimeClaimsService, { provide: OvertimeClaimStore, useClass: PrismaOvertimeClaimStore },
    LeaveRequestsService, { provide: LeaveRequestStore, useClass: PrismaLeaveRequestStore }, // Phase 31
    LeaveBalancesService, { provide: LeaveBalanceStore, useClass: PrismaLeaveBalanceStore },
    OnboardingsService, { provide: OnboardingStore, useClass: PrismaOnboardingStore },
    OffboardingsService, { provide: OffboardingStore, useClass: PrismaOffboardingStore },
    RecruitmentService, { provide: RecruitmentStore, useClass: PrismaRecruitmentStore }, // Phase 33 talent
    PerformanceService, { provide: PerformanceStore, useClass: PrismaPerformanceStore },
    TrainingService, { provide: TrainingStore, useClass: PrismaTrainingStore },
    EmployeeLettersService, { provide: EmployeeLetterStore, useClass: PrismaEmployeeLetterStore }, { provide: PdfRenderer, useClass: PdfkitRenderer }, // Phase 33 exits
    EmployeeAssetsService, { provide: EmployeeAssetStore, useClass: PrismaEmployeeAssetStore },
  ],
  // Phase 33 exits: other modules issue employee letters through EmployeeLettersService.issueLetter / issueLetterInTransaction
  exports: [EmployeeLettersService],
})
export class HrModule {}
