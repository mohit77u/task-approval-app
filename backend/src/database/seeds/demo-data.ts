import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { RoleCode } from '../../common/enums/role-code.enum';

/** Demo-only accounts that the README publishes for reviewers. Never reuse these values for real systems. */
export const DEMO_PASSWORDS = {
  admin: 'Admin@12345',
  employee: 'Employee@12345',
} as const;

export const SEED_ROLES = [
  { code: RoleCode.ADMIN, name: 'Administrator' },
  { code: RoleCode.EMPLOYEE, name: 'Employee' },
] as const;

export const DEMO_USERS = [
  { name: 'Mohit Singh', phone: '+91 90000 00001', email: 'admin@taskapp.dev', role: RoleCode.ADMIN, password: DEMO_PASSWORDS.admin },
  { name: 'Kavya Nair', phone: '+91 90000 00002', email: 'admin2@taskapp.dev', role: RoleCode.ADMIN, password: DEMO_PASSWORDS.admin },
  { name: 'Priya Sharma', phone: '+91 90000 00003', email: 'priya@taskapp.dev', role: RoleCode.EMPLOYEE, password: DEMO_PASSWORDS.employee },
  { name: 'Rahul Verma', phone: '+91 90000 00004', email: 'rahul@taskapp.dev', role: RoleCode.EMPLOYEE, password: DEMO_PASSWORDS.employee },
  { name: 'Ananya Iyer', phone: '+91 90000 00005', email: 'ananya@taskapp.dev', role: RoleCode.EMPLOYEE, password: DEMO_PASSWORDS.employee },
] as const;

export interface SampleTask {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueInDays: number;
  assignee: (typeof DEMO_USERS)[number]['email'];
}

export const SAMPLE_TASKS: readonly SampleTask[] = [
  { title: 'Prepare Q4 onboarding checklist', description: 'Draft the onboarding checklist for new joiners.', priority: TaskPriority.HIGH, status: TaskStatus.PENDING, dueInDays: 5, assignee: 'priya@taskapp.dev' },
  { title: 'Update vendor contact sheet', description: 'Verify phone numbers and emails of active vendors.', priority: TaskPriority.LOW, status: TaskStatus.PENDING, dueInDays: 9, assignee: 'rahul@taskapp.dev' },
  { title: 'Reconcile September expenses', description: 'Match receipts against the ledger and flag gaps.', priority: TaskPriority.MEDIUM, status: TaskStatus.IN_PROGRESS, dueInDays: 3, assignee: 'priya@taskapp.dev' },
  { title: 'Migrate shared drive folders', description: 'Move legacy folders to the new structure.', priority: TaskPriority.HIGH, status: TaskStatus.IN_PROGRESS, dueInDays: -1, assignee: 'rahul@taskapp.dev' },
  { title: 'Draft customer FAQ page', description: 'Collect the top 15 questions and write answers.', priority: TaskPriority.MEDIUM, status: TaskStatus.PENDING_APPROVAL, dueInDays: 2, assignee: 'priya@taskapp.dev' },
  { title: 'Audit access permissions', description: 'Review who has admin access to internal tools.', priority: TaskPriority.HIGH, status: TaskStatus.PENDING_APPROVAL, dueInDays: 4, assignee: 'rahul@taskapp.dev' },
  { title: 'Publish release notes v1.4', description: 'Summarise shipped changes for stakeholders.', priority: TaskPriority.LOW, status: TaskStatus.COMPLETED, dueInDays: -6, assignee: 'priya@taskapp.dev' },
  { title: 'Renew domain certificates', description: 'Renew and verify TLS certificates.', priority: TaskPriority.MEDIUM, status: TaskStatus.COMPLETED, dueInDays: -3, assignee: 'rahul@taskapp.dev' },
];
