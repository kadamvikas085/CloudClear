/* Image Lab: project -> upload/choose image -> model -> submit. The result is asynchronous;
 * after submission we hand off to the experiment page, which polls the real status. */
import { ProjectsAPI, ImagesAPI, ExperimentsAPI } from '../api.js';
import { el, mount, icon, toast, errorState, emptyState, skeletons, formatBytes, safeUrl, isBrowserImage, plural } from '../ui.js';
import { pageHead } from '../components.js';
import { SELECTABLE_MODELS } from '../models-data.js';
import { getSelectedProjectId, setSelectedProjectId } from '../state.js';

const MAX_BYTES = 100 * 1024 * 1024; // backend multer limit
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.tif', '.tiff'];
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/tiff', 'image/tif'];

function extOf(name) { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i).toLowerCase(); }
function isTiff(file) { return ['.tif', '.tiff'].includes(extOf(file.name)); }

function validateFile(file) {
  const ext = extOf(file.name);
  if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(file.type)) return 'Unsupported file type. Use PNG, JPG or TIFF.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_BYTES) return `File is ${formatBytes(file.size)}. The maximum is ${formatBytes(MAX_BYTES)}.`;
  return null;
}

export default async function render({ main, query }) {
  let alive = true;
  const s = {
    projects: [], projectId: getSelectedProjectId(), images: [],
    file: null, previewUrl: '', fileError: '',
    image: null,            // the backend image document to process
    model: SELECTABLE_MODELS.some((m) => m.id === (query && query.model)) ? query.model : 'LaMa',
    uploading: false, progress: 0, submitting: false, uploadError: '', submitError: '',
  };
  let abort = null;

  const stepsHost = el('div');
  const col1 = el('div', { class: 'stack' });
  const col2 = el('div', { class: 'stack' });
  mount(main,
    pageHead('Image Lab', 'Upload a satellite image, choose a model and submit a reconstruction. Results arrive asynchronously.'),
    stepsHost, el('div', { class: 'grid grid-2', style: { alignItems: 'start' } }, col1, col2));
  mount(col1, skeletons(2, 120));

  /* ---------- data ---------- */
  async function loadProjects() {
    try {
      const r = await ProjectsAPI.list({ limit: 100, status: 'active' });
      if (!alive) return;
      s.projects = r.data.projects;
      if (!s.projects.some((p) => p._id === s.projectId)) s.projectId = s.projects.length === 1 ? s.projects[0]._id : '';
      if (s.projectId) await loadImages();
      draw();
    } catch (e) {
      if (alive) mount(col1, errorState(e, loadProjects));
    }
  }

  async function loadImages() {
    try {
      const r = await ImagesAPI.list(s.projectId, { limit: 50 });
      s.images = r.data.images;
    } catch (e) {
      s.images = [];
      toast(e.fullMessage || e.message, 'err');
    }
  }

  /* ---------- rendering ---------- */
  function stepState() {
    return [
      { n: 1, label: 'Project', done: !!s.projectId },
      { n: 2, label: 'Image', done: !!s.image },
      { n: 3, label: 'Model', done: !!s.image && !!s.model },
      { n: 4, label: 'Run', done: false },
    ];
  }

  function draw() {
    const steps = stepState();
    const active = steps.find((x) => !x.done) || steps[3];
    mount(stepsHost, el('ol', { class: 'steps', 'aria-label': 'Progress' }, steps.map((st) =>
      el('li', { class: `step-pill${st.done ? ' done' : st === active ? ' active' : ''}`, 'aria-current': st === active ? 'step' : null },
        el('span', { class: 'n' }, st.done ? '✓' : String(st.n)), st.label))));
    mount(col1, projectCard(), imageCard());
    mount(col2, modelCard(), runCard());
  }

  function projectCard() {
    const sel = el('select', { class: 'select', id: 'lab-project', 'aria-describedby': 'lab-project-hint', disabled: s.uploading || s.submitting },
      el('option', { value: '', text: s.projects.length ? 'Select a project…' : 'No active projects' }),
      s.projects.map((p) => el('option', { value: p._id, text: p.name, selected: p._id === s.projectId })));
    sel.addEventListener('change', async () => {
      s.projectId = sel.value; setSelectedProjectId(s.projectId);
      resetImage(); s.images = [];
      if (s.projectId) await loadImages();
      draw();
    });
    const p = s.projects.find((x) => x._id === s.projectId);
    return el('section', { class: 'glass card', 'aria-labelledby': 'h-s1' },
      el('p', { class: 'eyebrow', text: 'Step 1' }), el('h2', { id: 'h-s1', class: 'section-title', text: 'Select a project' }),
      s.projects.length
        ? el('div', { class: 'field' }, el('label', { for: 'lab-project', text: 'Project' }), sel,
          el('div', { class: 'hint', id: 'lab-project-hint', text: p ? `${plural(p.imageCount, 'image')} · ${plural(p.experimentCount, 'experiment')}${p.region ? ' · ' + p.region : ''}` : 'Images are stored inside a project.' }))
        : emptyState({ iconName: 'folder', title: 'Create a project first', text: 'Uploads belong to a project.', action: el('a', { class: 'btn btn-primary btn-sm', href: '#/projects?new=1', text: 'New project' }) }));
  }

  function imageCard() {
    const disabled = !s.projectId;
    const card = el('section', { class: 'glass card', 'aria-labelledby': 'h-s2' },
      el('p', { class: 'eyebrow', text: 'Step 2' }), el('h2', { id: 'h-s2', class: 'section-title', text: 'Upload or choose an image' }));

    if (disabled) { card.append(el('p', { class: 'dim', style: { fontSize: '14px' }, text: 'Select a project to continue.' })); return card; }

    if (s.image) {
      const im = s.image;
      card.append(
        el('div', { class: 'preview-box' }, previewNode(im)),
        el('dl', { class: 'kv mt-4' },
          el('dt', { text: 'File' }), el('dd', { text: im.originalFileName }),
          el('dt', { text: 'Type' }), el('dd', { text: im.fileType }),
          el('dt', { text: 'Size' }), el('dd', { text: formatBytes(im.fileSizeBytes) }),
          im.width ? [el('dt', { text: 'Dimensions' }), el('dd', { text: `${im.width} × ${im.height} px` })] : null),
        im.fileType === 'geotiff' || im.fileType === 'tiff' ? tiffNotice() : null,
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm mt-4', disabled: s.submitting, text: 'Use a different image', onclick: () => { resetImage(); draw(); } }));
      return card;
    }

    /* dropzone + chooser */
    const input = el('input', { type: 'file', accept: '.png,.jpg,.jpeg,.tif,.tiff,image/png,image/jpeg,image/tiff', hidden: true, 'aria-label': 'Choose a satellite image' });
    const dz = el('div', { class: `dropzone${s.uploading ? ' disabled' : ''}`, tabindex: '0', role: 'button', 'aria-label': 'Choose a satellite image to upload. PNG, JPG or TIFF, up to 100 megabytes.' },
      icon('upload', 34), el('div', { class: 'dz-title', text: s.file ? s.file.name : 'Drop a satellite image here' }),
      el('div', { class: 'dz-sub', text: 'or click to browse · PNG, JPG, TIFF · up to 100 MB' }), input);
    dz.addEventListener('click', (e) => { if (e.target !== input && !s.uploading) input.click(); });
    dz.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !s.uploading) { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => { if (!s.uploading && e.dataTransfer.files.length) pick(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files.length) pick(input.files[0]); });
    card.append(dz);

    if (s.fileError) card.append(el('div', { class: 'form-error', role: 'alert', text: s.fileError }));

    if (s.file && !s.fileError) {
      card.append(
        el('div', { class: 'preview-box mt-4' }, s.previewUrl
          ? el('img', { src: s.previewUrl, alt: `Preview of ${s.file.name}` })
          : el('div', { class: 'ph' }, icon('image', 32), el('div', { text: isTiff(s.file) ? 'TIFF files cannot be previewed in the browser.' : 'No preview available.' }))),
        el('p', { class: 'faint', style: { fontSize: '13px', marginTop: '8px' }, text: `${s.file.name} · ${formatBytes(s.file.size)}` }),
        isTiff(s.file) ? tiffNotice() : null);
      if (s.uploading) {
        card.append(el('div', { class: 'mt-4' },
          el('div', { class: 'progress-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(s.progress * 100)), 'aria-label': 'Upload progress' },
            el('div', { class: 'progress-fill', style: { width: `${Math.round(s.progress * 100)}%` } })),
          el('p', { class: 'faint mono', style: { fontSize: '11.5px', marginTop: '8px' }, text: s.progress >= 1 ? 'Stored upload… finishing' : `Uploading ${Math.round(s.progress * 100)}%` })));
      } else {
        card.append(el('button', { type: 'button', class: 'btn btn-primary btn-sm mt-4', text: 'Upload to project', onclick: doUpload }));
      }
      if (s.uploadError) card.append(el('div', { class: 'form-error', role: 'alert', text: s.uploadError }));
    }

    if (s.images.length && !s.uploading) {
      const existing = el('select', { class: 'select', id: 'lab-existing', 'aria-label': 'Choose an already uploaded image' },
        el('option', { value: '', text: 'Choose an uploaded image…' }),
        s.images.map((im) => el('option', { value: im._id, text: `${im.originalFileName} (${formatBytes(im.fileSizeBytes)})` })));
      existing.addEventListener('change', () => {
        const im = s.images.find((x) => x._id === existing.value);
        if (im) { s.image = im; clearFile(); draw(); }
      });
      card.append(el('div', { class: 'field mt-5' }, el('label', { for: 'lab-existing', text: 'Or reuse an image already in this project' }), existing));
    }
    return card;
  }

  function tiffNotice() {
    return el('div', { class: 'notice warn mt-4', text: 'TIFF cannot be previewed here. The inference service reads images as 8-bit RGB, so multi-band or 16-bit GeoTIFFs may fail to process, and the output is a PNG.' });
  }

  function previewNode(im) {
    if (isBrowserImage(im.fileType) && safeUrl(im.cloudinaryUrl)) return el('img', { src: safeUrl(im.cloudinaryUrl), alt: `Uploaded image ${im.originalFileName}` });
    return el('div', { class: 'ph' }, icon('image', 32), el('div', { text: 'No browser preview for this file type.' }));
  }

  function modelCard() {
    const list = SELECTABLE_MODELS.map((m) => {
      const input = el('input', { type: 'radio', name: 'model', value: m.id, checked: s.model === m.id, disabled: s.submitting, id: `m-${m.id}` });
      input.addEventListener('change', () => { s.model = m.id; draw(); });
      return el('label', { class: `model-opt${s.model === m.id ? ' sel' : ''}`, for: `m-${m.id}` }, input,
        el('div', {}, el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, el('b', { text: m.title }),
          el('span', { class: `badge badge-plain ${m.neural ? 'badge-violet' : ''}`, text: m.neural ? 'Neural' : 'Classical' })),
          el('p', { text: m.summary })));
    });
    const chosen = SELECTABLE_MODELS.find((m) => m.id === s.model);
    return el('section', { class: 'glass card', 'aria-labelledby': 'h-s3' },
      el('p', { class: 'eyebrow', text: 'Step 3' }), el('h2', { id: 'h-s3', class: 'section-title', text: 'Choose a model' }),
      el('fieldset', { style: { border: 'none' } }, el('legend', { class: 'sr-only', text: 'Reconstruction model' }), el('div', { class: 'stack', style: { gap: '10px' } }, list)),
      chosen ? el('div', { class: 'notice mt-4', text: chosen.detail }) : null,
      el('p', { class: 'faint', style: { fontSize: '12.5px', marginTop: '12px' } }, 'More about each option in the ', el('a', { href: '#/models', style: { color: 'var(--cyan-bright)' }, text: 'Model Zoo' }), '.'));
  }

  function runCard() {
    const ready = !!s.image && !!s.model && !s.submitting && !s.uploading;
    const btn = el('button', { type: 'button', class: 'btn btn-primary btn-block', disabled: !ready, onclick: submit }, s.submitting ? el('span', { class: 'spinner', 'aria-hidden': 'true' }) : icon('flask', 16), s.submitting ? 'Submitting…' : 'Run reconstruction');
    return el('section', { class: 'glass card', 'aria-labelledby': 'h-s4' },
      el('p', { class: 'eyebrow', text: 'Step 4' }), el('h2', { id: 'h-s4', class: 'section-title', text: 'Run' }),
      el('dl', { class: 'kv', style: { marginBottom: '16px' } },
        el('dt', { text: 'Project' }), el('dd', { text: (s.projects.find((p) => p._id === s.projectId) || {}).name || '—' }),
        el('dt', { text: 'Image' }), el('dd', { text: s.image ? s.image.originalFileName : '—' }),
        el('dt', { text: 'Model' }), el('dd', { text: (SELECTABLE_MODELS.find((m) => m.id === s.model) || {}).title || '—' })),
      btn,
      s.submitError ? el('div', { class: 'form-error', role: 'alert', text: s.submitError }) : null,
      el('p', { class: 'faint', style: { fontSize: '12.5px', marginTop: '12px', lineHeight: '1.6' }, text: 'The job is queued and processed in the background. You will be taken to its page, where the status updates until it finishes. Large scenes can take several minutes, and very large ones may time out.' }));
  }

  /* ---------- actions ---------- */
  function clearFile() {
    if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    s.file = null; s.previewUrl = ''; s.fileError = ''; s.uploadError = ''; s.progress = 0;
  }
  function resetImage() { s.image = null; clearFile(); s.submitError = ''; }

  function pick(file) {
    clearFile();
    const err = validateFile(file);
    s.file = file; s.fileError = err || '';
    if (!err && !isTiff(file) && file.type.startsWith('image/')) s.previewUrl = URL.createObjectURL(file);
    draw();
  }

  async function doUpload() {
    if (s.uploading || !s.file || !s.projectId) return;
    s.uploading = true; s.uploadError = ''; s.progress = 0; draw();
    abort = new AbortController();
    try {
      const r = await ImagesAPI.upload(s.projectId, s.file, {
        signal: abort.signal,
        onProgress: (f) => { s.progress = f; const bar = main.querySelector('.progress-fill'); if (bar) { bar.style.width = `${Math.round(f * 100)}%`; bar.parentElement.setAttribute('aria-valuenow', String(Math.round(f * 100))); } },
      });
      if (!alive) return;
      s.image = r.data.image;
      s.images = [s.image, ...s.images];
      clearFile();
      toast('Image uploaded.', 'ok');
    } catch (e) {
      if (!alive || (e && e.name === 'AbortError')) return;
      s.uploadError = e.fullMessage || e.message;
    } finally {
      s.uploading = false;
      if (alive) draw();
    }
  }

  async function submit() {
    if (s.submitting || !s.image) return;
    s.submitting = true; s.submitError = ''; draw();
    try {
      const r = await ExperimentsAPI.process(s.image._id, s.model);
      const id = r.data.experiment._id;
      toast('Job queued.', 'ok');
      location.hash = `#/results/${encodeURIComponent(id)}`;
    } catch (e) {
      s.submitError = e.fullMessage || e.message;
      s.submitting = false;
      if (alive) draw();
    }
  }

  await loadProjects();
  return {
    destroy() {
      alive = false;
      if (abort) abort.abort();
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    },
  };
}
