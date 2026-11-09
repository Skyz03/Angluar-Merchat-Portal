import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { ApplicationDetail, ReviewDecision, RiskLevel } from '../../../core/models/application';
import { FieldError } from '../../../shared/ui/field-error';
import { httpErrorMessage } from '../../../shared/util/load-state';

/**
 * Reviewer decision form. Only ever rendered when canReview() is true, and the
 * API independently rejects decisions from anyone but the assigned reviewer.
 */
@Component({
  selector: 'app-review-panel',
  imports: [ReactiveFormsModule, FieldError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="card border-primary"
      aria-labelledby="review-heading"
      data-testid="review-panel"
    >
      <div class="card-header bg-primary-subtle">
        <h2 id="review-heading" class="h6 mb-0">Record risk decision</h2>
      </div>
      <form class="card-body" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset class="mb-3">
          <legend class="form-label fs-6">Decision</legend>
          @for (d of decisions; track d.value) {
            <div class="form-check">
              <input
                class="form-check-input"
                type="radio"
                formControlName="decision"
                [id]="'dec-' + d.value"
                [value]="d.value"
              />
              <label class="form-check-label" [for]="'dec-' + d.value">{{ d.label }}</label>
            </div>
          }
        </fieldset>

        <div class="mb-3">
          <label for="riskLevel" class="form-label">Risk level</label>
          <select id="riskLevel" class="form-select" formControlName="riskLevel">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        <div class="mb-3">
          <label for="note" class="form-label">
            Note
            @if (noteRequired()) {
              <span class="text-danger">(required)</span>
            }
          </label>
          <textarea
            id="note"
            class="form-control"
            rows="3"
            formControlName="note"
            maxlength="1000"
            aria-describedby="note-err"
          ></textarea>
          <app-field-error [control]="form.controls.note" label="Note" errorId="note-err" />
        </div>

        @if (error()) {
          <div class="alert alert-danger py-2" role="alert">{{ error() }}</div>
        }
        <button type="submit" class="btn btn-primary w-100" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save decision' }}
        </button>
      </form>
    </section>
  `,
})
export class ReviewPanel {
  private readonly api = inject(ApplicationsApi);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly applicationId = input.required<string>();
  readonly decided = output<ApplicationDetail>();

  protected readonly decisions: { value: ReviewDecision; label: string }[] = [
    { value: 'APPROVE', label: 'Approve' },
    { value: 'REQUEST_INFO', label: 'Request more information' },
    { value: 'REJECT', label: 'Reject' },
  ];

  readonly form = this.fb.group({
    decision: this.fb.control<ReviewDecision>('APPROVE'),
    riskLevel: this.fb.control<RiskLevel>('LOW'),
    note: ['', Validators.maxLength(1000)],
  });

  protected readonly noteRequired = toSignal(
    this.form.controls.decision.valueChanges.pipe(map((d) => d !== 'APPROVE')),
    { initialValue: false },
  );
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Conditional validation: a note is mandatory when rejecting or requesting info.
    this.form.controls.decision.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((d) => {
        const note = this.form.controls.note;
        note.setValidators(
          d === 'APPROVE'
            ? [Validators.maxLength(1000)]
            : [Validators.required, Validators.maxLength(1000)],
        );
        note.updateValueAndValidity();
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    this.api.review(this.applicationId(), { ...v, note: v.note.trim() }).subscribe({
      next: (d) => {
        this.saving.set(false);
        this.decided.emit(d);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(httpErrorMessage(e));
      },
    });
  }
}
