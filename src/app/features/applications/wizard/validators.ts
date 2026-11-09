import { AbstractControl, AsyncValidatorFn, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Observable, catchError, first, map, of, switchMap, timer } from 'rxjs';

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

/** Pattern validator that returns a NAMED error so messages can be specific. */
export function patternNamed(regex: RegExp, errorKey: string): ValidatorFn {
  return (c) => (isEmpty(c.value) || regex.test(String(c.value)) ? null : { [errorKey]: true });
}

/** https only, real-looking host. Empty is allowed (field is optional). */
export const httpsUrl: ValidatorFn = (c) => {
  if (isEmpty(c.value)) return null;
  try {
    const u = new URL(String(c.value));
    return u.protocol === 'https:' && u.hostname.includes('.') ? null : { httpsUrl: true };
  } catch {
    return { httpsUrl: true };
  }
};

/** E.164: +, country code, 8–15 digits total. */
export const e164Phone = patternNamed(/^\+[1-9]\d{7,14}$/, 'phone');
export const registrationFormat = patternNamed(/^[A-Z0-9-]{5,20}$/, 'registrationFormat');
export const descriptorFormat = patternNamed(/^[A-Za-z0-9 .&-]+$/, 'descriptor');
export const swiftFormat = patternNamed(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'swift');
export const accountNumberFormat = patternNamed(/^\d{8,18}$/, 'accountNumber');
export const taxIdFormat = patternNamed(/^[A-Z0-9]{6,15}$/, 'taxId');

const POSTAL_RULES: Record<string, RegExp> = {
  NP: /^\d{5}$/,
  IN: /^\d{6}$/,
  US: /^\d{5}(-\d{4})?$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
};

/**
 * Cross-field (group) validator: postal code format depends on the selected country.
 * The error is set on the group AND mirrored onto the postalCode control so the
 * message shows next to the right input.
 */
export const postalCodeForCountry: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const country = group.get('country')?.value as string;
  const postal = group.get('postalCode');
  if (!postal) return null;
  const rule = POSTAL_RULES[country];
  const bad = !!rule && !isEmpty(postal.value) && !rule.test(String(postal.value));
  setMirroredError(postal, 'postalCodeCountry', bad);
  return bad ? { postalCodeCountry: true } : null;
};

/** Cross-field: max ticket ≥ average ticket, and average ticket ≤ monthly volume. */
export const ticketSizes: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const volume = group.get('monthlyVolume')?.value as number | null;
  const avg = group.get('averageTicket')?.value as number | null;
  const max = group.get('maxTicket')?.value as number | null;
  const maxBad = avg != null && max != null && max < avg;
  const avgBad = avg != null && volume != null && avg > volume;
  setMirroredError(group.get('maxTicket'), 'maxBelowAverage', maxBad);
  setMirroredError(group.get('averageTicket'), 'averageAboveVolume', avgBad);
  const errors: ValidationErrors = {};
  if (maxBad) errors['maxBelowAverage'] = true;
  if (avgBad) errors['averageAboveVolume'] = true;
  return Object.keys(errors).length ? errors : null;
};

/** Adds/removes a single error key on a child control without clobbering its other errors. */
function setMirroredError(control: AbstractControl | null, key: string, on: boolean): void {
  if (!control) return;
  const current = { ...(control.errors ?? {}) };
  if (on === !!current[key]) return;
  if (on) current[key] = true;
  else delete current[key];
  control.setErrors(Object.keys(current).length ? current : null, { emitEvent: false });
}

/**
 * Async uniqueness check, debounced inside the validator (timer + switchMap) so
 * typing doesn't fire a request per keystroke. Fails OPEN on network errors: the
 * server re-validates on submit, so we don't block the user on a flaky check.
 */
export function uniqueRegistration(
  check: (value: string) => Observable<boolean>,
  debounceMs = 400,
): AsyncValidatorFn {
  return (c) => {
    if (isEmpty(c.value) || c.hasError('registrationFormat') || c.hasError('required'))
      return of(null);
    return timer(debounceMs).pipe(
      switchMap(() => check(String(c.value))),
      map((taken) => (taken ? { registrationTaken: true } : null)),
      catchError(() => of(null)),
      first(),
    );
  };
}
