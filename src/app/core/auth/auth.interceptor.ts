import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, of, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';
import { RETRIED_AFTER_REFRESH, SKIP_AUTH } from './auth-context';
import { AuthService } from './auth.service';

function withBearer(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

const is401 = (e: unknown): e is HttpErrorResponse =>
  e instanceof HttpErrorResponse && e.status === 401;

/**
 * 1. Attaches `Authorization: Bearer <token>` to calls to our API only (never third-party URLs).
 * 2. On 401, obtains a fresh token from AuthService.refresh(). That call is single-flight,
 *    so when several requests fail together exactly ONE POST /auth/refresh is sent and
 *    every failed request is replayed once with the new token.
 * 3. If a request was sent with a token that has ALREADY been replaced (its 401 arrived
 *    after another refresh finished), it is replayed with the current token, no new refresh.
 * 4. A replay that 401s again, or a failed refresh, ends the session. No infinite loops.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const baseUrl = inject(API_BASE_URL);

  if (req.context.get(SKIP_AUTH) || !req.url.startsWith(baseUrl)) {
    return next(req);
  }

  const sentToken = auth.token();

  return next(withBearer(req, sentToken)).pipe(
    catchError((error: unknown) => {
      if (!is401(error) || req.context.get(RETRIED_AFTER_REFRESH)) {
        return throwError(() => error);
      }

      const current = auth.token();
      const freshToken$: Observable<string> =
        current && current !== sentToken ? of(current) : auth.refresh();

      return freshToken$.pipe(
        catchError((refreshError: unknown) => {
          auth.logout('expired');
          return throwError(() => refreshError);
        }),
        switchMap((token) => {
          const replay = withBearer(req, token);
          replay.context.set(RETRIED_AFTER_REFRESH, true);
          return next(replay).pipe(
            catchError((replayError: unknown) => {
              if (is401(replayError)) auth.logout('expired');
              return throwError(() => replayError);
            }),
          );
        }),
      );
    }),
  );
};
