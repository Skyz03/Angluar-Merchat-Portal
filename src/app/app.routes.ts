import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · Merchant Portal',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'applications' },
      {
        path: 'applications',
        loadChildren: () =>
          import('./features/applications/applications.routes').then((m) => m.APPLICATION_ROUTES),
      },
      {
        path: 'forbidden',
        title: 'Access denied',
        loadComponent: () => import('./shared/ui/status-page').then((m) => m.ForbiddenPage),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./shared/ui/status-page').then((m) => m.NotFoundPage),
  },
];
