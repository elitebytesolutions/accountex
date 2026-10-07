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

/**
 * HR: organisation (Phase 10: departments, designations, grades, work shifts, holidays, org chart) and policies & people
 * (Phase 11: employees, leave types, overtime policy, biometric devices, branch HR settings).
 */
@Module({
  controllers: [
    OrgController, DepartmentsController, DesignationsController, GradesController, ShiftsController, HolidaysController,
    EmployeesController, LeaveTypesController, OvertimeController, DevicesController,
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
  ],
})
export class HrModule {}
