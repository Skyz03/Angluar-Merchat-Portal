import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="text-center py-5">
      <h1 class="h3">You don't have access to that page</h1>
      <p class="text-body-secondary">
        Your role doesn't include this action. Ask an administrator if you think this is wrong.
      </p>
      <a class="btn btn-primary" routerLink="/applications">Back to applications</a>
    </section>
  `,
})
export class ForbiddenPage {}

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="container py-5 text-center">
      <h1 class="h3">Page not found</h1>
      <a class="btn btn-primary" routerLink="/">Go home</a>
    </main>
  `,
})
export class NotFoundPage {}
