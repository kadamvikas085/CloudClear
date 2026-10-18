/* Experiments: filterable history from the real API. Auto-refreshes while jobs are in flight. */
import { ProjectsAPI, ExperimentsAPI } from '../api.js';
import { el, mount, icon, emptyState, errorState, skeletons, statusBadge, formatDate, formatDuration, formatNumber } from '../ui.js';
import { pageHead, experimentThumb, experimentTitle, projectName } from '../components.js';
import { SELECTABLE_MODELS, modelLabel } from '../models-data.js';
import { setSelectedProjectId } from '../state.js';

const PAGE_SIZE = 10;

export default async function render({ main, query }) {
  let alive = true;
  let timer = null;
  const f = { page: 1, status: query.status || '', projectId: query.projectId || '', model: query.model || '' };

  const status = select('Status', 'Filter by status', [['', 'All statuses'], ['queued', 'Queued'], ['running', 'Running'], ['completed', 'Completed'], ['failed', 'Failed']], f.status);
  const model = select('Model', 'Filter by model', [['', 'All models'], ...SELECTABLE_MODELS.map((m) => [m.id, m.title])], f.model);
  const project = select('Project', 'Filter by project', [['', 'All projects']], f.projectId);
  const refresh = el('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, icon('refresh', 14), 'Refresh');
  const host = el('div');
  const pager = el('div');

  mount(main,
    pageHead('Experiments', 'Every reconstruction you have submitted, newest first.', el('a', { class: 'btn btn-primary btn-sm', href: '#/lab' }, icon('flask', 14), 'New experiment')),
    el('div', { class: 'toolbar' }, status, model, project, refresh),
    host, pager);

  [status, model, project].forEach((s) => s.addEventListener('change', () => {
    f.status = status.value; f.model = model.value; f.projectId = project.value; f.page = 1; load();
  }));
  refresh.addEventListener('click', () => load());

  ProjectsAPI.list({ limit: 100 }).then((r) => {
    if (!alive) return;
    r.data.projects.forEach((p) => project.append(el('option', { value: p._id, text: p.name })));
    project.value = f.projectId;
  }).catch(() => { /* filter just stays at "All projects" */ });

  async function load(silent = false) {
    clearTimeout(timer);
    if (!silent) mount(host, skeletons(4, 56));
    try {
      const r = await ExperimentsAPI.list({ page: f.page, limit: PAGE_SIZE, status: f.status, model: f.model, projectId: f.projectId });
      if (!alive) return;
      draw(r.data.experiments, r.meta);
      if (r.data.experiments.some((e) => e.status === 'queued' || e.status === 'running')) {
        timer = setTimeout(() => { if (alive) load(true); }, 6000);
      }
    } catch (e) {
      if (alive && !silent) { mount(host, errorState(e, () => load())); mount(pager); }
    }
  }

  function draw(list, meta) {
    if (!list.length) {
      const filtered = f.status || f.model || f.projectId;
      mount(host, emptyState({
        iconName: 'list', title: filtered ? 'No experiments match these filters' : 'No experiments yet',
        text: filtered ? 'Clear a filter to see more.' : 'Submit an image from Image Lab and it will appear here.',
        action: filtered ? null : el('a', { class: 'btn btn-primary btn-sm', href: '#/lab', text: 'Open Image Lab' }),
      }));
      mount(pager);
      return;
    }
    const table = el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['Image', 'Project', 'Model', 'Status', 'Created', 'Finished', 'Result data', ''].map((h) => el('th', { scope: 'col', text: h })))),
      el('tbody', {}, list.map(row)));
    mount(host, el('div', { class: 'glass card table-wrap', style: { padding: '8px' } }, table));
    mount(pager, meta.totalPages > 1 ? el('div', { class: 'pager' },
      el('span', { text: `Page ${meta.page} of ${meta.totalPages} · ${meta.total} experiments` }),
      el('div', { style: { display: 'flex', gap: '8px' } },
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Previous', disabled: meta.page <= 1, onclick: () => { f.page -= 1; load(); } }),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Next', disabled: meta.page >= meta.totalPages, onclick: () => { f.page += 1; load(); } }))) : null);
  }

  function row(e) {
    const href = `#/results/${encodeURIComponent(e._id)}`;
    const data = [];
    if (e.processingTimeMs != null) data.push(`${formatDuration(e.processingTimeMs)}`);
    if (e.psnr != null) data.push(`PSNR ${formatNumber(e.psnr, 2)}`);
    if (e.ssim != null) data.push(`SSIM ${formatNumber(e.ssim, 3)}`);
    const act = e.status === 'completed'
      ? el('a', { class: 'btn btn-ghost btn-sm', href, 'aria-label': `View result for ${experimentTitle(e)}`, text: 'View result' })
      : e.status === 'failed'
        ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Run again', onclick: (ev) => { ev.stopPropagation(); if (e.project && e.project._id) setSelectedProjectId(e.project._id); location.hash = '#/lab'; } })
        : el('a', { class: 'btn btn-ghost btn-sm', href, text: 'Track' });
    const tr = el('tr', { class: 'clickable', onclick: (ev) => { if (!ev.target.closest('a,button')) location.hash = href; } },
      el('td', {}, el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' } }, experimentThumb(e),
        el('a', { href, style: { fontWeight: '600', overflowWrap: 'anywhere' }, text: experimentTitle(e) }))),
      el('td', { text: projectName(e) || '—' }),
      el('td', { text: modelLabel(e.modelUsed) }),
      el('td', {}, statusBadge(e.status)),
      el('td', { class: 'dim', text: formatDate(e.createdAt) }),
      el('td', { class: 'dim', text: e.status === 'completed' ? formatDate(e.updatedAt) : '—' }),
      el('td', { class: 'dim', text: data.length ? data.join(' · ') : '—' }),
      el('td', {}, act));
    return tr;
  }

  await load();
  return { destroy() { alive = false; clearTimeout(timer); } };
}

function select(_label, aria, options, value) {
  const s = el('select', { class: 'select', 'aria-label': aria }, options.map(([v, t]) => el('option', { value: v, text: t })));
  s.value = value;
  return s;
}
