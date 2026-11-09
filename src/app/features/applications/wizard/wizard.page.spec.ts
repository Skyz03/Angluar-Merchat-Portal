import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { AuthService } from '../../../core/auth/auth.service';
import {
  buildApplicationForm,
  setSensitiveOnFile,
  toLocalBackup,
  toPayload,
} from './application-form';
import { WizardPage } from './wizard.page';

describe('application form model', () => {
  const form = () =>
    TestBed.runInInjectionContext(() =>
      buildApplicationForm(TestBed.inject(NonNullableFormBuilder), () => of(false)),
    );

  it('only sends sensitive fields once they are complete and valid (no half-typed account numbers)', () => {
    const f = form();
    f.controls.banking.controls.accountNumber.setValue('1234'); // too short
    f.controls.banking.controls.taxId.setValue('TST123456');
    const p = toPayload(f);
    expect(p.banking.accountNumber).toBeNull();
    expect(p.banking.taxId).toBe('TST123456');
  });

  it('local backup never contains sensitive fields', () => {
    const f = form();
    f.controls.banking.controls.accountNumber.setValue('000011112222');
    expect(JSON.stringify(toLocalBackup(f))).not.toContain('000011112222');
  });

  it('sensitive fields become optional when a value is already on file', () => {
    const f = form();
    expect(f.controls.banking.controls.accountNumber.hasError('required')).toBe(true);
    setSensitiveOnFile(f, { accountNumber: true, taxId: false });
    expect(f.controls.banking.controls.accountNumber.valid).toBe(true);
    expect(f.controls.banking.controls.taxId.hasError('required')).toBe(true);
  });
});

describe('WizardPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [WizardPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user: signal({ id: 's1', name: 'S', email: 's@t', role: 'SALES' }) },
        },
        {
          provide: ApplicationsApi,
          useValue: {
            registrationTaken: () => of({ taken: false }),
            createDraft: vi.fn(),
            saveDraft: vi.fn(),
          },
        },
      ],
    });
  });

  const heading = (el: HTMLElement) => el.querySelector('#step-heading')!.textContent!;

  it('blocks Next while the step is invalid and shows field errors', async () => {
    const fixture = TestBed.createComponent(WizardPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('[data-testid=next]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(heading(el)).toContain('Step 1 of 5');
    expect(el.querySelector('#legalName-err')?.textContent).toContain('Legal name is required');
    expect(el.querySelector('#legalName')?.classList).toContain('is-invalid');
  });

  it('advances once the step is valid', async () => {
    const fixture = TestBed.createComponent(WizardPage);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.form.controls.business.patchValue({
      legalName: 'Spec Co',
      businessType: 'PRIVATE_LIMITED',
      registrationNumber: 'REG-12345',
      category: 'Retail',
    });
    await new Promise((r) => setTimeout(r, 450)); // async uniqueness validator debounce
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid=next]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(heading(el)).toContain('Step 2 of 5');
  });
});
