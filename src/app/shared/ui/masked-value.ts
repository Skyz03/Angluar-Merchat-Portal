import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ApplicationsApi } from '../../core/api/applications.api';
import { SensitiveField } from '../../core/models/application';

export const REVEAL_DURATION_MS = 30_000;

/**
 * Shows a server-masked value (e.g. "•••• 1234"). If the caller is allowed, a
 * Reveal button asks the API for the clear value; the server checks the role
 * again and writes an audit event. The clear value lives only in this component's
 * memory and is re-masked automatically after 30s or when the view is destroyed.
 */
@Component({
  selector: 'app-masked-value',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="d-inline-flex flex-wrap align-items-center gap-2">
      <span class="font-monospace" data-testid="masked-text">
        {{ clear() ?? masked() ?? 'Not provided' }}
      </span>

      @if (masked() && canReveal()) {
        <button
          type="button"
          class="btn btn-link btn-sm p-0"
          (click)="clear() ? hide() : reveal()"
          [disabled]="loading()"
          [attr.aria-label]="(clear() ? 'Hide ' : 'Reveal ') + label()"
          data-testid="reveal-btn"
        >
          {{ loading() ? 'Loading…' : clear() ? 'Hide' : 'Reveal' }}
        </button>
      }
      @if (error()) {
        <span class="text-danger small" role="alert">{{ error() }}</span>
      }
      <span class="visually-hidden" aria-live="polite">{{
        clear() ? label() + ' revealed' : ''
      }}</span>
    </span>
  `,
})
export class MaskedValue {
  private readonly api = inject(ApplicationsApi);

  readonly applicationId = input.required<string>();
  readonly field = input.required<SensitiveField>();
  readonly masked = input<string | null>(null);
  readonly canReveal = input(false);
  readonly label = input('value');

  protected readonly clear = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  reveal(): void {
    if (!this.canReveal()) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.reveal(this.applicationId(), this.field()).subscribe({
      next: (res) => {
        this.clear.set(res.value);
        this.loading.set(false);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.hide(), REVEAL_DURATION_MS);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not reveal');
      },
    });
  }

  hide(): void {
    clearTimeout(this.timer);
    this.clear.set(null);
  }
}
