import { ValidationErrors } from '@angular/forms';

/** Human-readable message for the first error on a control. */
export function errorMessage(errors: ValidationErrors | null, label: string): string | null {
  if (!errors) return null;
  const key = Object.keys(errors)[0];
  const e = errors[key];
  switch (key) {
    case 'required':
      return `${label} is required.`;
    case 'requiredTrue':
      return 'Please confirm before submitting.';
    case 'email':
      return 'Enter a valid email address.';
    case 'maxlength':
      return `${label} must be at most ${e.requiredLength} characters.`;
    case 'min':
      return `${label} must be at least ${e.min}.`;
    case 'httpsUrl':
      return 'Enter a full https:// URL.';
    case 'phone':
      return 'Use international format, e.g. +9779812345678.';
    case 'registrationFormat':
      return 'Use 5–20 uppercase letters, digits or dashes.';
    case 'registrationTaken':
      return 'Another application already uses this registration number.';
    case 'postalCodeCountry':
      return 'Postal code format does not match the selected country.';
    case 'maxBelowAverage':
      return 'Maximum ticket must be at least the average ticket.';
    case 'averageAboveVolume':
      return 'Average ticket cannot exceed monthly volume.';
    case 'descriptor':
      return 'Letters, digits, spaces and . & - only.';
    case 'swift':
      return 'Enter an 8 or 11 character SWIFT/BIC code.';
    case 'accountNumber':
      return 'Account number must be 8–18 digits.';
    case 'taxId':
      return 'Tax ID must be 6–15 uppercase letters or digits.';
    case 'server':
      return String(e);
    default:
      return `${label} is invalid.`;
  }
}
