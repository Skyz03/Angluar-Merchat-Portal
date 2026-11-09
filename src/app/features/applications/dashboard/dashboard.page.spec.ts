import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { AuthService } from '../../../core/auth/auth.service';
import { ApplicationSummary, Page } from '../../../core/models/application';
import { User } from '../../../core/models/user';
import { DashboardPage, parseQuery } from './dashboard.page';

const row = (over: Partial<ApplicationSummary> = {}): ApplicationSummary => ({
  id: 'app-1',
  reference: 'MA-1',
  legalName: 'Test Merchant',
  status: 'DRAFT',
  createdById: 's1',
  createdByName: 'Sita',
  assignedReviewerId: null,
  assignedReviewerName: null,
  riskLevel: null,
  updatedAt: '2026-11-01T00:00:00Z',
  ...over,
});
const page = (items: ApplicationSummary[]): Page<ApplicationSummary> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 10,
  counts: { DRAFT: items.length },
});

describe('DashboardPage', () => {
  const user = signal<User | null>(null);
  let list: ReturnType<typeof vi.fn>;

  const render = async (u: User) => {
    user.set(u);
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    list = vi.fn(() => of(page([row()])));
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        { provide: ApplicationsApi, useValue: { list } },
        { provide: AuthService, useValue: { user } },
      ],
    });
  });

  it('SALES sees "New application" and an Edit action on their own draft', async () => {
    const el = await render({ id: 's1', name: 'Sita', email: 's@t', role: 'SALES' });
    expect(el.querySelector('[data-testid=new-application]')).not.toBeNull();
    expect(el.querySelector('tbody a[aria-label="Edit Test Merchant"]')).not.toBeNull();
  });

  it('REVIEWER does not see create or edit controls', async () => {
    const el = await render({ id: 'r1', name: 'Riya', email: 'r@t', role: 'REVIEWER' });
    expect(el.querySelector('[data-testid=new-application]')).toBeNull();
    expect(el.querySelector('tbody a[aria-label^="Edit"]')).toBeNull();
    expect(el.querySelector('h1')?.textContent).toContain('Assigned to me');
  });

  it('shows an error with Retry, and Retry re-fetches', async () => {
    list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    user.set({ id: 'a1', name: 'Asha', email: 'a@t', role: 'ADMIN' });
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=list-error]')?.textContent).toContain(
      'server is having trouble',
    );

    (el.querySelector('[data-testid=retry]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(list).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[data-testid=list-error]')).toBeNull();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('renders an empty state', async () => {
    list.mockReturnValue(of(page([])));
    const el = await render({ id: 's1', name: 'Sita', email: 's@t', role: 'SALES' });
    expect(el.querySelector('[data-testid=empty-state]')).not.toBeNull();
  });

  it('parseQuery sanitizes untrusted URL params', () => {
    const q = parseQuery(new URLSearchParams('page=-3&pageSize=9999&status=HACKED&search=abc'));
    expect(q).toEqual({ page: 1, pageSize: 10, status: '', search: 'abc' });
  });
});
