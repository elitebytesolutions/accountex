import type { TrainingBoard, TrainingBoardQuery, TrainingEnrolmentItem, TrainingOptions, TrainingSessionItem } from '../../../../../shared/index.js';

export type TrainingProgramFacts = { id: string; name: string; status: string; seats: number | null; deleted: boolean };

/** Port: sessions, enrolments and certifications (HumanResources.TrainingSessions / TrainingEnrolments / Certifications). */
export abstract class TrainingStore {
  abstract today(tenantId: string): Promise<string>;
  abstract board(tenantId: string, q: TrainingBoardQuery, today: string): Promise<TrainingBoard>;
  abstract options(tenantId: string): Promise<TrainingOptions>;
  abstract program(tenantId: string, id: string): Promise<TrainingProgramFacts | null>;
  abstract activeEnrolments(tenantId: string, programId: string): Promise<number>;
  abstract enrolledAlready(tenantId: string, programId: string, employeeIds: string[]): Promise<{ id: string; name: string }[]>;
  abstract session(tenantId: string, id: string): Promise<TrainingSessionItem | null>;
  abstract enrolment(tenantId: string, id: string): Promise<TrainingEnrolmentItem | null>;

  abstract saveSession(data: Record<string, unknown>): Promise<string>;
  abstract saveEnrolment(data: Record<string, unknown>): Promise<string>;
  abstract completeEnrolment(id: string, data: Record<string, unknown>): Promise<string | null>;
  abstract withdrawEnrolment(id: string, rowVersion: number): Promise<void>;
}
