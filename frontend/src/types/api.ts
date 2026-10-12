export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type RoleCode = 'ADMIN' | 'EMPLOYEE';

export interface Role {
  id: number;
  code: string;
  name: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  /** Seeded demo account: cannot be deleted. */
  isDefault: boolean;
  role: Role;
}

export interface PersonRef {
  id: number;
  name: string;
  email: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Calendar date, `YYYY-MM-DD`. */
  dueDate: string;
  assignee: PersonRef;
  createdBy: PersonRef;
  /** Statuses the current viewer may move this task to, decided by the backend. */
  allowedTransitions: TaskStatus[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: number;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  note: string | null;
  actor: { id: number; name: string };
  createdAt: string;
}

export interface TaskComment {
  id: number;
  body: string;
  author: { id: number; name: string };
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface DashboardData {
  counts: Record<TaskStatus, number>;
  total: number;
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_TRANSITION'
  | 'STATE_CONFLICT'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface ApiErrorDetail {
  field: string;
  message: string;
}

/** The single error type the UI ever sees, whatever went wrong underneath. */
export interface ApiError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: ApiErrorDetail[];
  retryAfterSeconds?: number;
  /** Set when the API layer already dealt with the failure (e.g. ended the session), so it is not toasted again. */
  handled?: boolean;
}
