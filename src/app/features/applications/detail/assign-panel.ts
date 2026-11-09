import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { ApplicationDetail } from '../../../core/models/application';
import { User } from '../../../core/models/user';
import { httpErrorMessage } from '../../../shared/util/load-state';

/** ADMIN-only reviewer assignment. */
@Component({
  selector: 'app-assign-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="assign-heading" data-testid="assign-panel">
      <div class="card-header">
        <h2 id="assign-heading" class="h6 mb-0">Reviewer assignment</h2>
      </div>
      <div class="card-body">
        <label for="reviewer" class="form-label">Assigned reviewer</label>
        <select
          id="reviewer"
          class="form-select mb-2"
          [value]="selected() ?? ''"
          (change)="selected.set($any($event.target).value || null)"
        >
          <option value="">Unassigned</option>
          @for (r of reviewers(); track r.id) {
            <option [value]="r.id">{{ r.name }}</option>
          }
        </select>
        @if (error()) {
          <div class="alert alert-danger py-2" role="alert">{{ error() }}</div>
        }
        <button
          type="button"
          class="btn btn-outline-primary w-100"
          (click)="assign()"
          [disabled]="!selected() || selected() === currentReviewerId() || saving()"
        >
          {{ saving() ? 'Assigning…' : 'Assign' }}
        </button>
      </div>
    </section>
  `,
})
export class AssignPanel {
  private readonly api = inject(ApplicationsApi);

  readonly applicationId = input.required<string>();
  readonly currentReviewerId = input<string | null>(null);
  readonly assigned = output<ApplicationDetail>();

  protected readonly reviewers = toSignal(
    this.api.reviewers().pipe(catchError(() => of([] as User[]))),
    { initialValue: [] as User[] },
  );
  protected readonly selected = linkedSignal(() => this.currentReviewerId());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  assign(): void {
    const id = this.selected();
    if (!id) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.assign(this.applicationId(), id).subscribe({
      next: (d) => {
        this.saving.set(false);
        this.assigned.emit(d);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(httpErrorMessage(e));
      },
    });
  }
}
