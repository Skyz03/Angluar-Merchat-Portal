import { FormControl, FormGroup, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import {
  ApplicationDetail,
  ApplicationPayload,
  BusinessType,
} from '../../../core/models/application';
import {
  accountNumberFormat,
  descriptorFormat,
  e164Phone,
  httpsUrl,
  postalCodeForCountry,
  registrationFormat,
  swiftFormat,
  taxIdFormat,
  ticketSizes,
  uniqueRegistration,
} from './validators';

export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'SOLE_PROPRIETOR', label: 'Sole proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PRIVATE_LIMITED', label: 'Private limited company' },
  { value: 'PUBLIC_LIMITED', label: 'Public limited company' },
  { value: 'NON_PROFIT', label: 'Non-profit' },
];
export const CATEGORIES = [
  'Retail',
  'Food & Beverage',
  'Travel',
  'Services',
  'Education',
  'Health & Beauty',
];
export const COUNTRIES = [
  { code: 'NP', name: 'Nepal' },
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
];

export type ApplicationForm = ReturnType<typeof buildApplicationForm>;
export type StepKey = 'business' | 'contact' | 'processing' | 'banking';

/** Strongly-typed form. One FormGroup per wizard step so each step validates independently. */
export function buildApplicationForm(
  fb: NonNullableFormBuilder,
  registrationCheck: (v: string) => Observable<boolean>,
) {
  return fb.group({
    business: fb.group({
      legalName: ['', [Validators.required, Validators.maxLength(120)]],
      tradingName: ['', Validators.maxLength(120)],
      businessType: fb.control<BusinessType | ''>('', Validators.required),
      registrationNumber: fb.control('', {
        validators: [Validators.required, registrationFormat],
        asyncValidators: uniqueRegistration(registrationCheck),
        updateOn: 'change',
      }),
      website: ['', httpsUrl],
      category: ['', Validators.required],
    }),
    contact: fb.group(
      {
        contactName: ['', [Validators.required, Validators.maxLength(80)]],
        email: ['', [Validators.required, Validators.email]],
        phone: ['', [Validators.required, e164Phone]],
        addressLine: ['', Validators.required],
        city: ['', Validators.required],
        country: ['NP', Validators.required],
        postalCode: ['', Validators.required],
      },
      { validators: postalCodeForCountry },
    ),
    processing: fb.group(
      {
        monthlyVolume: fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
        averageTicket: fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
        maxTicket: fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
        statementDescriptor: [
          '',
          [Validators.required, Validators.maxLength(22), descriptorFormat],
        ],
      },
      { validators: ticketSizes },
    ),
    banking: fb.group({
      bankName: ['', Validators.required],
      accountHolder: ['', Validators.required],
      swiftCode: ['', [Validators.required, swiftFormat]],
      // Required-ness is set at runtime: optional when a value is already on file.
      accountNumber: ['', [Validators.required, accountNumberFormat]],
      taxId: ['', [Validators.required, taxIdFormat]],
    }),
    confirm: fb.control(false, Validators.requiredTrue),
  });
}

/**
 * When the server already holds a sensitive value we never get it back, so the
 * input starts empty and becomes optional ("leave blank to keep").
 */
export function setSensitiveOnFile(
  form: ApplicationForm,
  onFile: { accountNumber: boolean; taxId: boolean },
): void {
  const set = (c: FormControl<string>, hasValue: boolean, format: typeof accountNumberFormat) => {
    c.setValidators(hasValue ? [format] : [Validators.required, format]);
    c.updateValueAndValidity({ emitEvent: false });
  };
  set(form.controls.banking.controls.accountNumber, onFile.accountNumber, accountNumberFormat);
  set(form.controls.banking.controls.taxId, onFile.taxId, taxIdFormat);
}

export function patchFromDetail(form: ApplicationForm, d: ApplicationDetail): void {
  form.patchValue(
    {
      business: d.business,
      contact: d.contact,
      processing: d.processing,
      banking: {
        bankName: d.banking.bankName,
        accountHolder: d.banking.accountHolder,
        swiftCode: d.banking.swiftCode,
        accountNumber: '',
        taxId: '',
      },
    },
    { emitEvent: false },
  );
  setSensitiveOnFile(form, {
    accountNumber: !!d.banking.accountNumberMasked,
    taxId: !!d.banking.taxIdMasked,
  });
}

/**
 * Builds the API payload. Sensitive fields are only sent when the user typed a
 * complete, valid value — half-typed account numbers are never persisted by auto-save.
 */
export function toPayload(form: ApplicationForm): ApplicationPayload {
  const v = form.getRawValue();
  const { accountNumber, taxId } = form.controls.banking.controls;
  const sendIfValid = (c: FormControl<string>) => (c.value && c.valid ? c.value.trim() : null);
  return {
    business: {
      ...v.business,
      registrationNumber: v.business.registrationNumber.trim().toUpperCase(),
    },
    contact: v.contact,
    processing: v.processing,
    banking: {
      bankName: v.banking.bankName,
      accountHolder: v.banking.accountHolder,
      swiftCode: v.banking.swiftCode.trim().toUpperCase(),
      accountNumber: sendIfValid(accountNumber),
      taxId: sendIfValid(taxId),
    },
  };
}

/** Snapshot safe to keep in browser storage: sensitive fields stripped. */
export function toLocalBackup(
  form: ApplicationForm,
): Omit<ApplicationPayload, 'banking'> & {
  banking: { bankName: string; accountHolder: string; swiftCode: string };
} {
  const v = form.getRawValue();
  return {
    business: v.business,
    contact: v.contact,
    processing: v.processing,
    banking: {
      bankName: v.banking.bankName,
      accountHolder: v.banking.accountHolder,
      swiftCode: v.banking.swiftCode,
    },
  };
}

export type StepGroup = FormGroup;
