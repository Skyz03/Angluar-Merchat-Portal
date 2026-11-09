import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApplicationsApi } from '../core/api/applications.api';
import { AuthService } from '../core/auth/auth.service';
import { MockBackendControls } from '../core/mock/mock-backend';

/**
 * Development-only panel for demonstrating failure paths a reviewer would want to see:
 * concurrent 401 → single refresh, and flaky network → retry / auto-save recovery.
 */
@Component({
  selector: 'app-dev-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="dev-toolbar border-bottom bg-body-tertiary small" aria-label="Developer tools">
      <div class="container-xl d-flex flex-wrap align-items-center gap-2 py-2">
        <span class="badge text-bg-warning">DEV</span>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          (click)="burst()"
          [disabled]="busy()"
        >
          Expire token + fire 3 parallel requests
        </button>
        <span aria-live="polite">
          Refresh calls this session:
          <strong data-testid="refresh-count">{{ auth.refreshCount() }}</strong>
          @if (lastBurst(); as b) {
            <span class="text-body-secondary">· last burst: {{ b }}</span>
          }
        </span>
        <div class="form-check form-switch ms-md-auto mb-0">
          <input
            class="form-check-input"
            type="checkbox"
            role="switch"
            id="chaos"
            [checked]="mock.failureRate() > 0"
            (change)="toggleChaos($event)"
          />
          <label class="form-check-label" for="chaos"
            >Simulate flaky API (30% of list/save calls fail)</label
          >
        </div>
      </div>
    </aside>
  `,
})
export class DevToolbar {
  protected readonly auth = inject(AuthService);
  protected readonly mock = inject(MockBackendControls);
  private readonly api = inject(ApplicationsApi);
  protected readonly busy = signal(false);
  protected readonly lastBurst = signal<string | null>(null);

  burst(): void {
    this.busy.set(true);
    this.mock.server.expireAllAccessTokens();
    const before = this.auth.refreshCount();
    const q = { page: 1, pageSize: 5, search: '', status: '' as const };
    const prevRate = this.mock.failureRate();
    this.mock.failureRate.set(0);
    forkJoin([
      this.api.list(q),
      this.api.list({ ...q, page: 2 }),
      this.api.list({ ...q, page: 3 }),
    ]).subscribe({
      next: () =>
        this.lastBurst.set(
          `3 requests got 401 → ${this.auth.refreshCount() - before} refresh call(s) → all 3 replayed OK`,
        ),
      error: () => this.lastBurst.set('burst failed'),
      complete: () => {
        this.mock.failureRate.set(prevRate);
        this.busy.set(false);
      },
    });
  }

  toggleChaos(e: Event): void {
    this.mock.failureRate.set((e.target as HTMLInputElement).checked ? 0.3 : 0);
  }
}
