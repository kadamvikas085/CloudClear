/* Projects: list, search, create, edit/archive, select, and per-project images & experiments. */
import { ProjectsAPI, ImagesAPI, ExperimentsAPI } from '../api.js';
import { el, mount, icon, toast, openDialog, confirmDialog, emptyState, errorState, skeletons, statusBadge, formatDate, formatBytes, safeUrl, isBrowserImage, debounce, relativeTime, plural } from '../ui.js';
import { pageHead, experimentRow } from '../components.js';
import { getSelectedProjectId, setSelectedProjectId } from '../state.js';

const PAGE_SIZE = 9;

export default async function render({ main, query }) {
  let alive = true;
  const state = { page: 1, search: '', status: 'active', selected: getSelectedProjectId(), list: [], meta: null };

  const gridHost = el('div');
  const pagerHost = el('div');
  const detailHost = el('div');

  const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search projects by name', 'aria-label': 'Search projects', maxlength: '150' });
  const statusSel = el('select', { class: 'select', 'aria-label': 'Filter by status' },
    el('option', { value: 'active', text: 'Active' }), el('option', { value: 'archived', text: 'Archived' }), el('option', { value: '', text: 'All' }));

  const newBtn = el('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('plus', 14), 'New project');
  newBtn.addEventListener('click', () => projectDialog());

  mount(main,
    pageHead('Projects', 'Group satellite images and experiments by region or study.', newBtn),
    el('div', { class: 'toolbar' }, search, statusSel),
    gridHost, pagerHost, detailHost);

  search.addEventListener('input', debounce(() => { state.search = search.value.trim(); state.page = 1; load(); }, 350));
  statusSel.addEventListener('change', () => { state.status = statusSel.value; state.page = 1; load(); });

  async function load() {
    mount(gridHost, skeletons(3, 120));
    try {
      const r = await ProjectsAPI.list({ page: state.page, limit: PAGE_SIZE, search: state.search, status: state.status });
      if (!alive) return;
      state.list = r.data.projects;
      state.meta = r.meta;
      renderGrid();
      renderPager();
      // restore selection if it is in view, otherwise leave detail empty
      if (state.selected && state.list.some((p) => p._id === state.selected)) loadDetail(state.selected);
      else mount(detailHost);
    } catch (e) {
      if (alive) { mount(gridHost, errorState(e, load)); mount(pagerHost); }
    }
  }

  function renderGrid() {
    if (!state.list.length) {
      const filtered = state.search || state.status !== 'active';
      mount(gridHost, emptyState({
        iconName: 'folder',
        title: filtered ? 'No matching projects' : 'No projects yet',
        text: filtered ? 'Try a different search or filter.' : 'Create your first project, then upload imagery to it from Image Lab.',
        action: filtered ? null : el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Create a project', onclick: () => projectDialog() }),
      }));
      return;
    }
    mount(gridHost, el('div', { class: 'grid grid-3' }, state.list.map(projectCard)));
  }

  function projectCard(p) {
    const selected = p._id === state.selected;
    const card = el('article', { class: `glass project-card card-hover${selected ? ' selected' : ''}` },
      el('div', { class: 'row-between' }, el('h3', { text: p.name }), statusBadge(p.status)),
      el('p', { text: p.description || 'No description.' }),
      p.region ? el('div', { class: 'faint', style: { fontSize: '12.5px' }, text: `Region: ${p.region}` }) : null,
      el('div', { class: 'pc-meta' }, el('span', { text: plural(p.imageCount, 'image') }), el('span', { text: plural(p.experimentCount, 'experiment') }), el('span', { text: `Created ${formatDate(p.createdAt)}` })),
      el('div', { class: 'row-between' },
        el('button', { type: 'button', class: `btn btn-sm ${selected ? 'btn-primary' : 'btn-ghost'}`, 'aria-pressed': String(selected), onclick: () => select(p._id), text: selected ? 'Selected' : 'Select' }),
        el('div', { style: { display: 'flex', gap: '6px' } },
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Edit ${p.name}`, onclick: () => projectDialog(p) }, icon('edit', 16)),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': `${p.status === 'active' ? 'Archive' : 'Restore'} ${p.name}`, onclick: () => toggleArchive(p) }, icon('archive', 16)))));
    return card;
  }

  function renderPager() {
    const m = state.meta;
    if (!m || m.totalPages <= 1) return mount(pagerHost);
    mount(pagerHost, el('div', { class: 'pager' },
      el('span', { text: `Page ${m.page} of ${m.totalPages} · ${plural(m.total, 'project')}` }),
      el('div', { style: { display: 'flex', gap: '8px' } },
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Previous', disabled: m.page <= 1, onclick: () => { state.page -= 1; load(); } }),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Next', disabled: m.page >= m.totalPages, onclick: () => { state.page += 1; load(); } }))));
  }

  function select(id) {
    state.selected = id;
    setSelectedProjectId(id);
    renderGrid();
    loadDetail(id);
    toast('Project selected. Image Lab will use it.', 'ok', 2500);
  }

  async function loadDetail(id) {
    const project = state.list.find((p) => p._id === id);
    if (!project) return;
    mount(detailHost, el('section', { class: 'glass card mt-5' }, skeletons(2, 60)));
    const [imgs, exps] = await Promise.allSettled([ImagesAPI.list(id, { limit: 12 }), ExperimentsAPI.list({ projectId: id, limit: 8 })]);
    if (!alive || state.selected !== id) return;

    const imageBlock = imgs.status === 'rejected'
      ? errorState(imgs.reason, () => loadDetail(id))
      : !imgs.value.data.images.length
        ? emptyState({ iconName: 'image', title: 'No images in this project', text: 'Upload a satellite image to start processing.', action: el('a', { class: 'btn btn-primary btn-sm', href: '#/lab', text: 'Upload in Image Lab' }) })
        : el('div', {}, imgs.value.data.images.map((im) => imageRow(im, id)));

    const expBlock = exps.status === 'rejected'
      ? errorState(exps.reason, () => loadDetail(id))
      : !exps.value.data.experiments.length
        ? el('p', { class: 'dim', style: { fontSize: '14px' }, text: 'No experiments for this project yet.' })
        : el('div', {}, exps.value.data.experiments.map(experimentRow));

    mount(detailHost, el('section', { class: 'mt-5', 'aria-label': `Details for ${project.name}` },
      el('div', { class: 'section-title' }, el('span', { text: project.name }),
        el('a', { href: '#/lab', text: 'Process an image →' })),
      el('div', { class: 'grid grid-2' },
        el('div', { class: 'glass card' }, el('div', { class: 'section-title', text: `Images (${imgs.status === 'fulfilled' ? imgs.value.meta.total : '—'})` }), imageBlock),
        el('div', { class: 'glass card' }, el('div', { class: 'section-title', text: `Experiments (${exps.status === 'fulfilled' ? exps.value.meta.total : '—'})` }), expBlock))));
  }

  function imageRow(im, projectId) {
    const thumb = isBrowserImage(im.fileType) && safeUrl(im.cloudinaryUrl)
      ? el('img', { class: 'thumb', src: safeUrl(im.cloudinaryUrl), alt: '', loading: 'lazy' })
      : el('div', { class: 'thumb', 'aria-hidden': 'true', text: im.fileType === 'png' || im.fileType === 'jpg' ? 'IMG' : 'TIFF' });
    return el('div', { class: 'list-row' }, thumb,
      el('div', { class: 'grow' },
        el('div', { class: 'title', text: im.originalFileName }),
        el('div', { class: 'meta', text: `${formatBytes(im.fileSizeBytes)}${im.width ? ` · ${im.width}×${im.height}` : ''} · ${relativeTime(im.createdAt)}` })),
      statusBadge(im.status),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Delete ${im.originalFileName}`, onclick: async () => {
        const ok = await confirmDialog({ title: 'Delete image?', message: `"${im.originalFileName}" will be removed from storage. Existing experiments keep their saved results.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        try { await ImagesAPI.remove(im._id); toast('Image deleted.', 'ok'); load(); } catch (e) { toast(e.fullMessage || e.message, 'err'); }
      } }, icon('x', 16)));
  }

  /* create / edit */
  function projectDialog(project) {
    const editing = !!project;
    const name = el('input', { class: 'input', id: 'pj-name', required: true, minlength: '2', maxlength: '150', value: project ? project.name : '', autocomplete: 'off' });
    const region = el('input', { class: 'input', id: 'pj-region', maxlength: '200', value: project ? project.region : '', placeholder: 'e.g. Vidarbha, Maharashtra' });
    const desc = el('textarea', { class: 'textarea', id: 'pj-desc', maxlength: '2000' });
    desc.value = project ? project.description : '';
    const err = el('div', { class: 'form-error', role: 'alert', hidden: true });
    const form = el('form', { novalidate: true },
      el('div', { class: 'field' }, el('label', { for: 'pj-name', text: 'Project name' }), name),
      el('div', { class: 'field' }, el('label', { for: 'pj-region', text: 'Region (optional)' }), region),
      el('div', { class: 'field' }, el('label', { for: 'pj-desc', text: 'Description (optional)' }), desc), err);

    let busy = false;
    const submit = async (dlg) => {
      if (busy) return;
      const n = name.value.trim();
      if (n.length < 2) { err.textContent = 'Project name must be at least 2 characters.'; err.hidden = false; name.classList.add('invalid'); name.focus(); return; }
      busy = true; dlg.setBusy(true); err.hidden = true;
      const body = { name: n, description: desc.value.trim(), region: region.value.trim() };
      try {
        if (editing) await ProjectsAPI.update(project._id, body);
        else {
          const r = await ProjectsAPI.create(body);
          state.selected = r.data.project._id;
          setSelectedProjectId(state.selected);
        }
        dlg.close();
        toast(editing ? 'Project updated.' : 'Project created.', 'ok');
        state.page = 1;
        if (!editing) { state.search = ''; search.value = ''; state.status = 'active'; statusSel.value = 'active'; }
        load();
      } catch (e) {
        err.textContent = e.fullMessage || e.message; err.hidden = false;
        busy = false; dlg.setBusy(false);
      }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); dlgRef.submit(); });
    const dlgRef = openDialog({
      title: editing ? 'Edit project' : 'New project',
      sub: editing ? null : 'Projects keep related images and experiments together.',
      body: form,
      actions: [{ label: 'Cancel' }, { label: editing ? 'Save changes' : 'Create project', kind: 'primary', onClick: (d) => submit(d) }],
    });
    dlgRef.submit = () => submit(dlgRef);
  }

  async function toggleArchive(p) {
    const archiving = p.status === 'active';
    const ok = await confirmDialog({
      title: archiving ? 'Archive project?' : 'Restore project?',
      message: archiving ? `"${p.name}" will move to Archived. Its images and experiments are kept.` : `"${p.name}" will become active again.`,
      confirmLabel: archiving ? 'Archive' : 'Restore',
    });
    if (!ok) return;
    try {
      await ProjectsAPI.update(p._id, { status: archiving ? 'archived' : 'active' });
      if (archiving && state.selected === p._id) { state.selected = ''; setSelectedProjectId(''); }
      toast(archiving ? 'Project archived.' : 'Project restored.', 'ok');
      load();
    } catch (e) { toast(e.fullMessage || e.message, 'err'); }
  }

  await load();
  if (query && query.new === '1') {
    history.replaceState(null, '', '#/projects');
    projectDialog();
  }
  return { destroy() { alive = false; } };
}
