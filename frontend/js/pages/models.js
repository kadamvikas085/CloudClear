/* Model Zoo: what the inference service can actually run, and what it cannot. */
import { el, mount, icon } from '../ui.js';
import { pageHead } from '../components.js';
import { SELECTABLE_MODELS, NOT_IMPLEMENTED, CLOUD_DETECTION } from '../models-data.js';

export default async function render({ main }) {
  const available = SELECTABLE_MODELS.map((m) => el('article', { class: 'glass zoo-card card-hover' },
    el('div', { class: 'row-between' }, el('h3', { text: m.title }),
      el('span', { class: 'badge badge-ok', text: m.status })),
    el('div', { class: 'z-sub', text: m.kind.toUpperCase() }),
    el('p', { text: m.summary }),
    el('dl', { class: 'kv' }, el('dt', { text: 'Task' }), el('dd', { text: m.task }), el('dt', { text: 'API value' }), el('dd', { class: 'mono', text: m.id })),
    el('p', { class: 'faint', style: { fontSize: '12.5px' }, text: m.detail }),
    el('div', { class: 'z-foot' },
      el('a', { class: 'btn btn-primary btn-sm', href: `#/lab?model=${encodeURIComponent(m.id)}`, text: 'Use in Image Lab' }),
      el('span', { class: `badge badge-plain ${m.neural ? 'badge-violet' : ''}`, text: m.neural ? 'Trained network' : 'No training involved' }))));

  const missing = NOT_IMPLEMENTED.map((m) => el('article', { class: 'glass zoo-card', style: { opacity: '.85' } },
    el('div', { class: 'row-between' }, el('h3', { text: m.title }), el('span', { class: 'badge badge-plain', text: 'Not implemented' })),
    el('div', { class: 'z-sub', text: m.task.toUpperCase() }),
    el('p', { text: m.note }),
    el('div', { class: 'z-foot' }, el('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: true, 'aria-disabled': 'true', text: 'Not selectable' }))));

  mount(main,
    pageHead('Model Zoo', 'The options below are the only values the backend accepts. Each card says what actually runs.'),
    el('div', { class: 'notice info mb-4' }, icon('info', 14), ' No accuracy or benchmark figures are shown. The inference service computes PSNR/SSIM only for a synthetic benchmark endpoint that the application does not call, so there are no validated numbers for real uploads.'),
    el('div', { class: 'section-title', text: 'Available in this deployment' }),
    el('div', { class: 'grid grid-2' }, available),
    el('section', { class: 'glass card mt-5', 'aria-label': 'Cloud detection' },
      el('div', { class: 'section-title', text: CLOUD_DETECTION.title }), el('p', { class: 'dim', style: { fontSize: '14px', lineHeight: '1.7' }, text: CLOUD_DETECTION.text })),
    el('div', { class: 'section-title mt-5', text: 'Referenced on the project site, not available here' }),
    el('div', { class: 'grid grid-3' }, missing));
}
