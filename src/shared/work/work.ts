import { z } from 'zod';

/** Phase 44 — Today's Work (tasks + what is due), the Notification Centre and the workspace dashboard. */
const date = z.iso.date('Choose a date');
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Choose a time').transform((v) => v.slice(0, 5));
const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
type Who = { id: string; name: string } | null;

// ---------------------------------------------------------------- tasks
export const TASK_MODULES = ['ACCOUNTING', 'BANKING', 'CASH', 'RECEIVABLES', 'PAYABLES', 'SALES', 'PURCHASES', 'INVENTORY', 'TAX', 'HR', 'PAYROLL', 'PERIOD_CLOSE', 'OTHER'] as const;
export const TASK_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const TASK_REPEATS = ['NEVER', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;

export type Task = {
  id: string;
  kind: string;
  title: string;
  notes: string | null;
  module: string;
  assignee: Who;
  assignedBy: Who;
  dueDate: string;
  dueTime: string | null;
  priority: string;
  /** PENDING / IN_PROGRESS / DONE / CANCELLED; `overdue` when open and past due. */
  status: string;
  overdue: boolean;
  repeatRule: string;
  remindBeforeMin: number | null;
  source: string;
  linkRoute: string | null;
  completedAt: string | null;
  /** Whether the signed-in user may edit it (assignee or assigner). */
  canEdit: boolean;
  rowVersion: number;
};

export const TaskInputSchema = z.object({
  title: z.string().trim().min(2, 'Give the task a title').max(200),
  notes: text(2000),
  module: z.enum(TASK_MODULES).default('ACCOUNTING'),
  kind: z.enum(['TASK', 'MEETING', 'REMINDER']).default('TASK'),
  /** Defaults to the signed-in user. */
  assigneeUserId: z.uuid().optional().nullable(),
  dueDate: date,
  dueTime: time.optional().nullable().or(z.literal('').transform(() => null)),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  repeatRule: z.enum(TASK_REPEATS).default('NEVER'),
  remindBeforeMin: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  linkRoute: z.string().trim().max(200).regex(/^\/[A-Za-z0-9/_-]*$/, 'A page of the app').optional().nullable(),
});
export type TaskInput = z.infer<typeof TaskInputSchema>;
export type TaskInputFields = z.input<typeof TaskInputSchema>;

export const TaskQuerySchema = z.object({
  /** open (pending + in progress, default), done, all */
  status: z.enum(['open', 'done', 'all']).default('open'),
  /** mine: assigned to me (default); delegated: tasks I gave to others */
  scope: z.enum(['mine', 'delegated']).default('mine'),
  from: date.optional(),
  to: date.optional(),
});
export type TaskQuery = z.infer<typeof TaskQuerySchema>;

/** Something due today or overdue (Company.getTodayDueItems): an invoice, a bill, a cheque or one of my tasks. */
export type DueItem = {
  kind: 'INVOICE_DUE' | 'BILL_DUE' | 'CHEQUE_MATURING' | 'TASK_DUE' | string;
  docNo: string | null;
  title: string;
  party: string | null;
  dueOn: string;
  isOverdue: boolean;
  daysOverdue: number;
  direction: string | null;
  amount: number;
  href: string;
};

export type TodayKpis = {
  tasksDueToday: number;
  tasksDoneToday: number;
  dailyProgressPct: number;
  overdueTasks: number;
  oldestOverdueDate: string | null;
  awaitingApprovalCount: number;
  awaitingApprovalValue: number;
  dueTodayAmount: number;
  invoicesDueToday: { count: number; amount: number };
  billsDueToday: { count: number; amount: number };
  chequesDueToday: { count: number; amount: number };
};

/** GET /work/today */
export type TodayView = {
  date: string;
  kpis: TodayKpis;
  /** Money items due today (invoices, bills, cheques). */
  due: DueItem[];
  tasks: Task[];
  /** Mon–Sun of this week: per day open tasks and money items due. */
  week: { date: string; tasks: number; overdue: number; due: number }[];
};

export type WorkUser = { id: string; name: string };

// ---------------------------------------------------------------- notifications
export const NOTIFICATION_CATEGORIES = ['APPROVALS', 'FINANCE', 'HR', 'SYSTEM'] as const;
/** The events the app raises today, for the preferences list. */
export const NOTIFICATION_EVENTS: { code: string; label: string; category: string }[] = [
  { code: 'APPROVAL_PENDING', label: 'A document waits for my approval', category: 'APPROVALS' },
  { code: 'APPROVAL_DECIDED', label: 'My document was approved, rejected or returned', category: 'APPROVALS' },
  { code: 'TASK_ASSIGNED', label: 'Someone gave me a task', category: 'SYSTEM' },
  { code: 'TASK_REMINDER', label: 'Task reminders', category: 'SYSTEM' },
  { code: 'INVOICE_OVERDUE', label: 'Customer invoice overdue', category: 'FINANCE' },
  { code: 'BILL_DUE', label: 'Vendor bill due today', category: 'FINANCE' },
  { code: 'CHEQUE_MATURING', label: 'Cheque maturing today', category: 'FINANCE' },
  { code: 'INVITE_ACCEPTED', label: 'A person I invited joined', category: 'SYSTEM' },
  { code: 'PASSWORD_RESET_REQUESTED', label: 'Someone asked to reset their password', category: 'SYSTEM' },
];

export type NotificationItem = {
  id: string;
  category: string;
  eventCode: string;
  title: string;
  body: string | null;
  href: string | null;
  amount: number | null;
  severity: string;
  needsAction: boolean;
  isMention: boolean;
  actor: Who;
  readAt: string | null;
  createdAt: string;
};
export type NotificationSummary = {
  unread: number;
  needsAction: number;
  mentions: number;
  total7d: number;
  total: number;
  byCategory: Record<string, { count: number; unread: number }>;
};
export type NotificationList = { items: NotificationItem[]; total: number; summary: NotificationSummary };

export const NotificationQuerySchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  unread: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;
export const ReadAllSchema = z.object({ category: z.enum(NOTIFICATION_CATEGORIES).optional().nullable() });

/** Channel switches of the Notification Centre and per-event in-app switches. */
export type NotificationPreferences = {
  inApp: boolean;
  emailDigest: { on: boolean; time: string };
  smsApprovalsAbove: { on: boolean; amount: number };
  whatsappCheques: boolean;
  /** Events switched off for in-app. */
  mutedEvents: string[];
};
export const NotificationPreferencesSchema = z.object({
  inApp: z.boolean(),
  emailDigest: z.object({ on: z.boolean(), time: time.default('08:00') }),
  smsApprovalsAbove: z.object({ on: z.boolean(), amount: z.coerce.number().min(0).max(1_000_000_000_000).default(1_000_000) }),
  whatsappCheques: z.boolean(),
  mutedEvents: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,40}$/)).max(50).default([]),
});

// ---------------------------------------------------------------- password reset (public)
export const ForgotPasswordSchema = z.object({
  companyCode: z.string().trim().min(1, 'Enter the company code').max(40),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
/** GET /auth/token/:token */
export type SignInTokenInfo = { valid: boolean; purpose: string | null; email: string | null; fullName: string | null; companyName: string | null; companyCode: string | null };
export const SetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1, 'Choose a password').max(72),
});
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;

// ---------------------------------------------------------------- workspace dashboard
export type DashboardMoney = { amount: number };
export type WorkspaceDashboard = {
  asOf: string;
  fiscalLabel: string | null;
  cash: { total: number; banks: number; cashBooks: number; earnedLastMonth: number; collectionsMtd: number };
  revenue: { month: string; total: number; prevTotal: number; heat: number[]; split: { label: string; amount: number }[]; earnedVsPrev: number };
  expenses: { month: string; total: number; budget: number | null; gaugePct: number; vsPlanPct: number | null };
  /** Last 12 months, oldest first. */
  flow: { label: string; income: number; expense: number }[];
  budget: { name: string | null; remainingPct: number | null; lines: { label: string; usedPct: number; used: number; budget: number }[] };
  transactions: { id: string; party: string; ref: string; date: string; method: string; amount: number; direction: 'IN' | 'OUT'; status: string; href: string }[];
  approvals: { count: number; items: { id: string; docLabel: string; title: string | null; requestedBy: string | null; amount: number | null; href: string }[] };
  payroll: { runNo: string | null; period: string | null; netPay: number; employees: number; stepsDone: number; stepsTotal: number; status: string | null; dueDate: string | null; href: string } | null;
};
