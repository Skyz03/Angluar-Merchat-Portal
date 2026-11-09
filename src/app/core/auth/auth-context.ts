import { HttpContextToken } from '@angular/common/http';

/** Requests that must not carry a bearer token or trigger refresh (login, refresh). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

/** Set on the replayed request after a refresh so a second 401 cannot loop. */
export const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);
