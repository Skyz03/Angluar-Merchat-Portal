import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_USERS } from '../../core/mock/seed';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="container py-5" id="main">
      <div class="row justify-content-center">
        <div class="col-md-7 col-lg-5">
          <h1 class="h3 mb-1">Merchant Portal</h1>
          <p class="text-body-secondary mb-4">
            Choose a demo persona. Each role sees a different slice of the app.
          </p>

          @if (reason() === 'expired') {
            <div class="alert alert-warning" role="alert">
              Your session expired. Please sign in again.
            </div>
          }
          @if (error()) {
            <div class="alert alert-danger" role="alert">{{ error() }}</div>
          }

          <div class="list-group" role="list">
            @for (u of users; track u.id) {
              <button
                type="button"
                role="listitem"
                class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                [disabled]="pending() !== null"
                (click)="signIn(u.email)"
              >
                <span>
                  <span class="fw-semibold d-block">{{ u.name }}</span>
                  <span class="small text-body-secondary">{{ roleHint[u.role] }}</span>
                </span>
                @if (pending() === u.email) {
                  <span class="spinner-border spinner-border-sm" aria-label="Signing in"></span>
                } @else {
                  <span class="badge text-bg-secondary">{{ u.role }}</span>
                }
              </button>
            }
          </div>
          <p class="small text-body-secondary mt-3">
            Mock authentication only — no passwords or real credentials exist in this project.
          </p>
        </div>
      </div>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly users = DEMO_USERS;
  protected readonly roleHint = {
    SALES: 'Creates and edits own merchant applications',
    REVIEWER: 'Reviews assigned applications, records risk decisions',
    ADMIN: 'Sees everything, manages reviewer assignments',
  } as const;
  protected readonly pending = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  signIn(email: string): void {
    this.pending.set(email);
    this.error.set(null);
    this.auth.login(email).subscribe({
      next: () => {
        // Only allow internal, path-relative redirects (prevents open-redirect via ?returnUrl=https://evil).
        const target = this.returnUrl();
        const safe =
          target && target.startsWith('/') && !target.startsWith('//') ? target : '/applications';
        void this.router.navigateByUrl(safe);
      },
      error: () => {
        this.error.set('Sign-in failed. Please try again.');
        this.pending.set(null);
      },
    });
  }
}
