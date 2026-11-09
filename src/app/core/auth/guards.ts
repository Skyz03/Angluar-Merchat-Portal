import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { Role } from '../models/user';
import { AuthService } from './auth.service';
import { hasRole } from './permissions';

/** Blocks unauthenticated users and remembers where they were going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps logged-in users off the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/applications']) : true;
};

/**
 * canMatch so a forbidden lazy chunk is never even downloaded.
 * Usage: `canMatch: [roleGuard(['SALES'])]`
 */
export function roleGuard(roles: readonly Role[]): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
    return hasRole(auth.user(), roles) ? true : router.createUrlTree(['/forbidden']);
  };
}
