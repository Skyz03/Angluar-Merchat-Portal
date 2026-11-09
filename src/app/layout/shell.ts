import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';
import { DevToolbar } from './dev-toolbar';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DevToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="visually-hidden-focusable btn btn-light position-absolute m-2" href="#main"
      >Skip to main content</a
    >

    <nav class="navbar navbar-expand-md navbar-dark bg-primary" aria-label="Main navigation">
      <div class="container-xl">
        <a class="navbar-brand fw-semibold" routerLink="/applications">Merchant Portal</a>

        <div class="d-flex align-items-center gap-2 order-md-last ms-auto">
          @if (user(); as u) {
            <span class="text-white small d-none d-sm-inline">{{ u.name }}</span>
            <span class="badge text-bg-light" data-testid="role-badge">{{ u.role }}</span>
            <button type="button" class="btn btn-sm btn-outline-light" (click)="auth.logout()">
              Sign out
            </button>
          }
        </div>

        <ul class="navbar-nav me-md-auto ms-md-3 flex-row gap-3">
          <li class="nav-item">
            <a
              class="nav-link"
              routerLink="/applications"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              ariaCurrentWhenActive="page"
            >
              Applications
            </a>
          </li>
          @if (canCreate()) {
            <li class="nav-item">
              <a
                class="nav-link"
                routerLink="/applications/new"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
                >New application</a
              >
            </li>
          }
        </ul>
      </div>
    </nav>

    @if (showDevTools) {
      <app-dev-toolbar />
    }

    <main id="main" class="container-xl py-4" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly user = this.auth.user;
  protected readonly canCreate = computed(
    () => this.user() !== null && this.auth.can('application:create'),
  );
  protected readonly showDevTools = environment.showDevTools;
}
