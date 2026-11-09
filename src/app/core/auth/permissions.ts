import { ApplicationStatus, ApplicationSummary } from '../models/application';
import { Role, User } from '../models/user';

/**
 * Single source of truth for "who can do what".
 *
 * The UI uses these to show/hide controls; the mock API uses the SAME functions
 * to enforce access, so hiding a button is never the only line of defence.
 */
export type Permission =
  | 'application:create'
  | 'application:viewAll'
  | 'application:review'
  | 'application:assign'
  | 'sensitive:reveal';

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SALES: ['application:create'],
  REVIEWER: ['application:review', 'sensitive:reveal'],
  ADMIN: ['application:viewAll', 'application:assign', 'sensitive:reveal'],
};

const EDITABLE_STATUSES: readonly ApplicationStatus[] = ['DRAFT', 'INFO_REQUESTED'];
const REVIEWABLE_STATUSES: readonly ApplicationStatus[] = ['SUBMITTED', 'IN_REVIEW'];

export function hasPermission(user: User | null, permission: Permission): boolean {
  return !!user && ROLE_PERMISSIONS[user.role].includes(permission);
}

export function hasRole(user: User | null, roles: readonly Role[]): boolean {
  return !!user && roles.includes(user.role);
}

type AppRef = Pick<ApplicationSummary, 'createdById' | 'assignedReviewerId' | 'status'>;

export function canView(user: User | null, app: AppRef): boolean {
  if (!user) return false;
  switch (user.role) {
    case 'ADMIN':
      return true;
    case 'SALES':
      return app.createdById === user.id;
    case 'REVIEWER':
      return app.assignedReviewerId === user.id;
  }
}

export function canEdit(user: User | null, app: AppRef): boolean {
  return (
    !!user &&
    user.role === 'SALES' &&
    app.createdById === user.id &&
    EDITABLE_STATUSES.includes(app.status)
  );
}

export function canReview(user: User | null, app: AppRef): boolean {
  return (
    hasPermission(user, 'application:review') &&
    app.assignedReviewerId === user!.id &&
    REVIEWABLE_STATUSES.includes(app.status)
  );
}

export function canAssign(user: User | null, app: AppRef): boolean {
  return (
    hasPermission(user, 'application:assign') &&
    app.status !== 'DRAFT' &&
    app.status !== 'APPROVED' &&
    app.status !== 'REJECTED'
  );
}

export function canReveal(user: User | null, app: AppRef): boolean {
  return hasPermission(user, 'sensitive:reveal') && canView(user, app);
}
