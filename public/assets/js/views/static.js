import { html } from '../ui.js';
import { t } from '../i18n.js';

export function privacyView(root) {
  root.innerHTML = html`<article class="card prose" style="margin:0 auto">
    <h1>${t('privacy.title')}</h1>
    ${[1, 2, 3, 4, 5].map((n) => html`<h2>${t(`privacy.h${n}`)}</h2><p>${t(`privacy.p${n}`)}</p>`)}
  </article>`.s;
}

export function notFoundView(root) {
  root.innerHTML = html`<div class="card empty"><div class="big">🚧</div><h1>404</h1><p>${t('err.page_not_found')}</p><a class="btn btn-primary" href="/">${t('nav.home')}</a></div>`.s;
}
