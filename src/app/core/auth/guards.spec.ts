import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlSegment, UrlTree, provideRouter } from '@angular/router';
import { User } from '../models/user';
import { AuthService } from './auth.service';
import { authGuard, roleGuard } from './guards';

describe('route guards', () => {
  const user = signal<User | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user, isAuthenticated: () => user() !== null } },
      ],
    });
  });

  const runRole = (roles: Parameters<typeof roleGuard>[0]) =>
    TestBed.runInInjectionContext(() =>
      roleGuard(roles)({} as Route, [] as UrlSegment[], {} as never),
    );

  it('roleGuard allows matching roles', () => {
    user.set({ id: '1', name: 'S', email: 's@t', role: 'SALES' });
    expect(runRole(['SALES'])).toBe(true);
  });

  it('roleGuard redirects other roles to /forbidden', () => {
    user.set({ id: '2', name: 'R', email: 'r@t', role: 'REVIEWER' });
    const result = runRole(['SALES']) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/forbidden');
  });

  it('authGuard sends anonymous users to login with a returnUrl', () => {
    user.set(null);
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/applications/new' } as never),
    ) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe(
      '/login?returnUrl=%2Fapplications%2Fnew',
    );
  });
});
