import { User } from '../models/user';
import { canAssign, canEdit, canReveal, canReview, canView, hasPermission } from './permissions';

const sales: User = { id: 's1', name: 'S', email: 's@t', role: 'SALES' };
const otherSales: User = { id: 's2', name: 'S2', email: 's2@t', role: 'SALES' };
const reviewer: User = { id: 'r1', name: 'R', email: 'r@t', role: 'REVIEWER' };
const otherReviewer: User = { id: 'r2', name: 'R2', email: 'r2@t', role: 'REVIEWER' };
const admin: User = { id: 'a1', name: 'A', email: 'a@t', role: 'ADMIN' };

const app = (status: string, assigned: string | null = 'r1') =>
  ({ createdById: 's1', assignedReviewerId: assigned, status }) as Parameters<typeof canView>[1];

describe('permissions', () => {
  it('role permission matrix', () => {
    expect(hasPermission(sales, 'application:create')).toBe(true);
    expect(hasPermission(reviewer, 'application:create')).toBe(false);
    expect(hasPermission(admin, 'application:create')).toBe(false);
    expect(hasPermission(admin, 'application:assign')).toBe(true);
    expect(hasPermission(sales, 'sensitive:reveal')).toBe(false);
    expect(hasPermission(null, 'application:create')).toBe(false);
  });

  it('SALES sees only their own; REVIEWER only assigned; ADMIN everything', () => {
    const a = app('IN_REVIEW');
    expect(canView(sales, a)).toBe(true);
    expect(canView(otherSales, a)).toBe(false);
    expect(canView(reviewer, a)).toBe(true);
    expect(canView(otherReviewer, a)).toBe(false);
    expect(canView(admin, a)).toBe(true);
    expect(canView(null, a)).toBe(false);
  });

  it.each([
    ['DRAFT', true],
    ['INFO_REQUESTED', true],
    ['SUBMITTED', false],
    ['APPROVED', false],
  ])('owner can edit when %s → %s', (status, expected) => {
    expect(canEdit(sales, app(status))).toBe(expected);
    expect(canEdit(otherSales, app(status))).toBe(false);
    expect(canEdit(admin, app(status))).toBe(false);
  });

  it('only the assigned reviewer can review, and only while reviewable', () => {
    expect(canReview(reviewer, app('IN_REVIEW'))).toBe(true);
    expect(canReview(otherReviewer, app('IN_REVIEW'))).toBe(false);
    expect(canReview(reviewer, app('APPROVED'))).toBe(false);
    expect(canReview(sales, app('IN_REVIEW'))).toBe(false);
    expect(canReview(admin, app('IN_REVIEW'))).toBe(false);
  });

  it('assignment is ADMIN-only and not for drafts or closed applications', () => {
    expect(canAssign(admin, app('SUBMITTED', null))).toBe(true);
    expect(canAssign(admin, app('DRAFT', null))).toBe(false);
    expect(canAssign(admin, app('REJECTED'))).toBe(false);
    expect(canAssign(reviewer, app('SUBMITTED'))).toBe(false);
  });

  it('reveal needs the permission AND visibility of that application', () => {
    expect(canReveal(sales, app('IN_REVIEW'))).toBe(false);
    expect(canReveal(reviewer, app('IN_REVIEW'))).toBe(true);
    expect(canReveal(otherReviewer, app('IN_REVIEW'))).toBe(false);
    expect(canReveal(admin, app('IN_REVIEW'))).toBe(true);
  });
});
