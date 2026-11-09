import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/guards';
import { pendingChangesGuard } from './wizard/pending-changes.guard';

export const APPLICATION_ROUTES: Routes = [
  {
    path: '',
    title: 'Applications · Merchant Portal',
    loadComponent: () => import('./dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'new',
    title: 'New application · Merchant Portal',
    canMatch: [roleGuard(['SALES'])],
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./wizard/wizard.page').then((m) => m.WizardPage),
  },
  {
    path: ':id/edit',
    title: 'Edit application · Merchant Portal',
    canMatch: [roleGuard(['SALES'])],
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./wizard/wizard.page').then((m) => m.WizardPage),
  },
  {
    path: ':id',
    title: 'Application · Merchant Portal',
    loadComponent: () => import('./detail/detail.page').then((m) => m.DetailPage),
  },
];
