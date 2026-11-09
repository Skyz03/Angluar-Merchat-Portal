import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { AuthService } from '../../../core/auth/auth.service';
import { ApplicationDetail } from '../../../core/models/application';
import { User } from '../../../core/models/user';
import { DetailPage } from './detail.page';

const detail: ApplicationDetail = {
  id: 'app-1',
  reference: 'MA-1',
  legalName: 'Test Merchant',
  status: 'IN_REVIEW',
  createdById: 's1',
  createdByName: 'Sita',
  assignedReviewerId: 'r1',
  assignedReviewerName: 'Riya',
  riskLevel: null,
  updatedAt: '2026-11-01T00:00:00Z',
  business: {
    legalName: 'Test Merchant',
    tradingName: '',
    businessType: 'PRIVATE_LIMITED',
    registrationNumber: 'REG-1',
    website: '',
    category: 'Retail',
  },
  contact: {
    contactName: 'C',
    email: 'c@merchant.test',
    phone: '+9779800000000',
    addressLine: '1',
    city: 'KTM',
    country: 'NP',
    postalCode: '44600',
  },
  processing: {
    monthlyVolume: 1000,
    averageTicket: 10,
    maxTicket: 20,
    statementDescriptor: 'TEST',
  },
  banking: {
    bankName: 'B',
    accountHolder: 'H',
    swiftCode: 'EXMPNPKA',
    accountNumberMasked: '•••• 2222',
    taxIdMasked: '•••• 9999',
  },
  riskHistory: [
    {
      id: 'e1',
      at: '2026-11-01T00:00:00Z',
      actorName: 'Sita',
      actorRole: 'SALES',
      type: 'SUBMITTED',
    },
  ],
  version: 1,
};

describe('DetailPage (permission-aware UI)', () => {
  const user = signal<User | null>(null);

  const render = async (u: User) => {
    user.set(u);
    const fixture = TestBed.createComponent(DetailPage);
    fixture.componentRef.setInput('id', 'app-1');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DetailPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: ApplicationsApi, useValue: { get: () => of(detail), reviewers: () => of([]) } },
      ],
    });
  });

  it('SALES: no review controls, no reveal, values masked', async () => {
    const el = await render({ id: 's1', name: 'Sita', email: 's@t', role: 'SALES' });
    expect(el.querySelector('h1')?.textContent).toContain('Test Merchant');
    expect(el.querySelector('[data-testid=review-panel]')).toBeNull();
    expect(el.querySelector('[data-testid=assign-panel]')).toBeNull();
    expect(el.querySelector('[data-testid=reveal-btn]')).toBeNull();
    expect(el.textContent).toContain('•••• 2222');
  });

  it('assigned REVIEWER: review panel and reveal are available', async () => {
    const el = await render({ id: 'r1', name: 'Riya', email: 'r@t', role: 'REVIEWER' });
    expect(el.querySelector('[data-testid=review-panel]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid=reveal-btn]')).toHaveLength(2);
    expect(el.querySelector('[data-testid=assign-panel]')).toBeNull();
  });

  it('ADMIN: assignment panel, no review panel', async () => {
    const el = await render({ id: 'a1', name: 'Asha', email: 'a@t', role: 'ADMIN' });
    expect(el.querySelector('[data-testid=assign-panel]')).not.toBeNull();
    expect(el.querySelector('[data-testid=review-panel]')).toBeNull();
  });

  it('renders the risk history', async () => {
    const el = await render({ id: 'r1', name: 'Riya', email: 'r@t', role: 'REVIEWER' });
    expect(el.querySelector('[data-testid=risk-history]')?.textContent).toContain(
      'Submitted for review',
    );
  });
});
