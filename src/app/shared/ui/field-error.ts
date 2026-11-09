import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { map, startWith, switchMap } from 'rxjs';
import { errorMessage } from '../util/error-messages';

/**
 * Renders the first validation message for a control once it's touched.
 * Subscribes to `control.events` (Angular 18+) so it updates under zoneless
 * change detection even when status changes asynchronously (async validators).
 */
@Component({
  selector: 'app-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as m) {
      <div class="invalid-feedback d-block" [id]="errorId()" role="alert">{{ m }}</div>
    } @else if (pending()) {
      <div class="form-text" [id]="errorId()">Checking…</div>
    }
  `,
})
export class FieldError {
  readonly control = input.required<AbstractControl>();
  readonly label = input.required<string>();
  /** DOM id for the message, referenced by the input's aria-describedby. */
  readonly errorId = input.required<string>();

  private readonly tick = toSignal(
    toObservable(this.control).pipe(
      switchMap((c) => c.events.pipe(startWith(null))),
      map(() => ({})),
    ),
  );

  protected readonly message = computed(() => {
    this.tick();
    const c = this.control();
    return c.touched && c.invalid ? errorMessage(c.errors, this.label()) : null;
  });

  protected readonly pending = computed(() => {
    this.tick();
    return this.control().pending;
  });
}
