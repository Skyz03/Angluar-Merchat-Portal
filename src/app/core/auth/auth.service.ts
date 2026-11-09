import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';
import { LoginResponse, RefreshResponse, User } from '../models/user';
import { SKIP_AUTH } from './auth-context';
import { Permission, hasPermission } from './permissions';

const SESSION_KEY = 'mp.session';

interface PersistedSession {
  user: User;
  /**
   * In production the refresh token lives in an httpOnly, Secure, SameSite=Strict
   * cookie the browser sends automatically, so JS never sees it. The mock API has
   * no cookie jar, so we keep it in sessionStorage (tab-scoped, cleared on close).
   */
  refreshToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = inject(API_BASE_URL);

  /** Access token is memory-only: never written to any storage. */
  private readonly accessToken = signal<string | null>(null);
  private readonly _user = signal<User | null>(null);
  private refreshToken: string | null = null;

  /** Shared in-flight refresh; every concurrent 401 subscribes to this same stream. */
  private refreshInFlight$: Observable<string> | null = null;

  /** Exposed for the dev toolbar / tests so the single-refresh behaviour is observable. */
  readonly refreshCount = signal(0);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly role = computed(() => this._user()?.role ?? null);

  constructor() {
    this.restore();
  }

  token(): string | null {
    return this.accessToken();
  }

  can(permission: Permission): boolean {
    return hasPermission(this._user(), permission);
  }

  /** Mock login by demo persona. A real build would use OIDC/SSO; no passwords live in this repo. */
  login(email: string): Observable<User> {
    return this.http
      .post<LoginResponse>(
        `${this.baseUrl}/auth/login`,
        { email },
        { context: new HttpContext().set(SKIP_AUTH, true) },
      )
      .pipe(
        tap((res) => {
          this.accessToken.set(res.accessToken);
          this.refreshToken = res.refreshToken;
          this._user.set(res.user);
          this.persist();
        }),
        map((res) => res.user),
      );
  }

  /**
   * Returns a fresh access token. If a refresh is already running, callers share it,
   * so N simultaneous 401s produce exactly ONE POST /auth/refresh.
   */
  refresh(): Observable<string> {
    if (this.refreshInFlight$) return this.refreshInFlight$;
    if (!this.refreshToken) return throwError(() => new Error('No refresh token'));

    this.refreshCount.update((n) => n + 1);
    this.refreshInFlight$ = this.http
      .post<RefreshResponse>(
        `${this.baseUrl}/auth/refresh`,
        { refreshToken: this.refreshToken },
        { context: new HttpContext().set(SKIP_AUTH, true) },
      )
      .pipe(
        tap((res) => {
          this.accessToken.set(res.accessToken);
          this.refreshToken = res.refreshToken; // rotated
          this.persist();
        }),
        map((res) => res.accessToken),
        finalize(() => (this.refreshInFlight$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refreshInFlight$;
  }

  logout(reason?: 'expired'): void {
    this.accessToken.set(null);
    this.refreshToken = null;
    this._user.set(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
    void this.router.navigate(['/login'], reason ? { queryParams: { reason } } : {});
  }

  private persist(): void {
    const user = this._user();
    if (!user || !this.refreshToken) return;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ user, refreshToken: this.refreshToken } satisfies PersistedSession),
      );
    } catch {
      /* storage unavailable: session simply won't survive reload */
    }
  }

  /** After a reload we have a user + refresh token but no access token; the first API call 401s and refreshes. */
  private restore(): void {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw) as PersistedSession;
      this._user.set(session.user);
      this.refreshToken = session.refreshToken;
    } catch {
      /* corrupted or unavailable storage: start logged out */
    }
  }
}
