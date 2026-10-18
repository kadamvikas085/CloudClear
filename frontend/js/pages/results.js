/* Results: gallery of completed experiments, and the Results Studio for one experiment.
 * The studio is also the live status page: it polls GET /experiments/:id, stops on a
 * terminal state, and only shows results/metrics the API actually returned. */
import { ExperimentsAPI } from '../api.js';
import { el, mount, icon, toast, emptyState, errorState, skeletons, statusBadge, formatDate, formatDuration, formatNumber, formatBytes, safeUrl, isBrowserImage } from '../ui.js';
import { pageHead, experimentTitle } from '../components.js';
import { modelLabel, SELECTABLE_MODELS } from '../models-data.js';
import { POLL, setSelectedProjectId } from '../state.js';

export default async function render(ctx) {
  return ctx.params[0] ? studio(ctx, ctx.params[0]) : gallery(ctx);
}

/* ======================= gallery ======================= */
async function gallery({ main }) {
  let alive = true;
  let page = 1;
  const host = el('div');
  const pager = el('div');
  mount(main, pageHead('Results', 'Completed reconstructions. Open one to compare, inspect and download.',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/experiments' }, icon('list', 14), 'All experiments')), host, pager);

  async function load() {
    mount(host, el('div', { class: 'grid grid-3' }, [1, 2, 3].map(() => el('div', { class: 'skeleton', style: { height: '230px' } }))));
    try {
      const r = await ExperimentsAPI.list({ status: 'completed', limit: 9, page });
      if (!alive) return;
      const list = r.data.experiments;
      if (!list.length) {
        mount(host, emptyState({ iconName: 'image', title: 'No completed results yet', text: 'Finished reconstructions will appear here.', action: el('a', { class: 'btn btn-primary btn-sm', href: '#/lab', text: 'Run a reconstruction' }) }));
        mount(pager); return;
      }
      mount(host, el('div', { class: 'grid grid-3' }, list.map((e) => {
        const url = safeUrl(e.processedImageUrl);
        return el('a', { class: 'glass card-hover', href: `#/results/${encodeURIComponent(e._id)}`, style: { overflow: 'hidden', display: 'block' }, 'aria-label': `Open result for ${experimentTitle(e)}` },
          url ? el('img', { src: url, alt: `Reconstructed ${experimentTitle(e)}`, loading: 'lazy', style: { width: '100%', height: '170px', objectFit: 'cover', borderBottom: '1px solid var(--line)' } })
            : el('div', { class: 'thumb', style: { width: '100%', height: '170px', borderRadius: 0 }, text: 'No preview' }),
          el('div', { style: { padding: '14px 16px' } },
            el('div', { style: { fontWeight: '600', fontSize: '14.5px', overflowWrap: 'anywhere' }, text: experimentTitle(e) }),
            el('div', { class: 'faint', style: { fontSize: '12.5px', marginTop: '4px' }, text: `${modelLabel(e.modelUsed)} · ${formatDate(e.updatedAt)}` })));
      })));
      mount(pager, r.meta.totalPages > 1 ? el('div', { class: 'pager' },
        el('span', { text: `Page ${r.meta.page} of ${r.meta.totalPages}` }),
        el('div', { style: { display: 'flex', gap: '8px' } },
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Previous', disabled: page <= 1, onclick: () => { page -= 1; load(); } }),
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Next', disabled: page >= r.meta.totalPages, onclick: () => { page += 1; load(); } }))) : null);
    } catch (e) { if (alive) { mount(host, errorState(e, load)); mount(pager); } }
  }
  await load();
  return { destroy() { alive = false; } };
}

/* ======================= studio ======================= */
async function studio({ main, setTitle }, id) {
  let alive = true;
  let timer = null;
  let ticker = null;
  let viewer = null;
  let exp = null;
  let sig = '';
  let failedSince = null;
  let netFails = 0;
  let delay = POLL.intervalMs;
  const startedAt = Date.now();

  const banner = el('div', { 'aria-live': 'polite' });
  const host = el('div');
  mount(main, banner, host);
  mount(host, skeletons(3, 120));

  const setBanner = (node) => mount(banner, node || null);

  async function tick() {
    if (!alive) return;
    if (document.hidden) { timer = setTimeout(tick, POLL.intervalMs); return; }
    try {
      const r = await ExperimentsAPI.get(id);
      if (!alive) return;
      exp = r.data.experiment;
      netFails = 0;
      setBanner(null);
      handle();
    } catch (e) {
      if (!alive) return;
      if (e.status === 404 || e.status === 403 || e.status === 400) {
        stopAll(); mount(host, errorState(e)); return;
      }
      netFails += 1;
      if (netFails >= 8 || !exp) {
        if (!exp) { stopAll(); mount(host, errorState(e, () => location.reload())); return; }
        stopAll(); setBanner(el('div', { class: 'notice err mb-4', role: 'alert' }, 'Lost connection to the server. ', el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Retry', onclick: () => { netFails = 0; delay = POLL.intervalMs; tick(); } })));
        return;
      }
      setBanner(el('div', { class: 'notice warn mb-4', text: `Connection problem, retrying… (${e.message})` }));
      delay = Math.min(delay * 1.5, 15000);
      timer = setTimeout(tick, delay);
    }
  }

  function stopAll() { clearTimeout(timer); timer = null; clearInterval(ticker); ticker = null; }

  function handle() {
    const s = exp.status;
    if (s === 'completed') { draw(); stopAll(); window.dispatchEvent(new Event('cc:notifications-changed')); return; }
    if (s === 'failed') {
      if (failedSince === null) failedSince = Date.now();
      const inGrace = Date.now() - failedSince < POLL.failedGraceMs;
      draw(inGrace);
      if (inGrace) { timer = setTimeout(tick, 5000); return; }
      stopAll(); window.dispatchEvent(new Event('cc:notifications-changed')); return;
    }
    failedSince = null;
    draw();
    if (Date.now() - startedAt > POLL.maxTotalMs) {
      stopAll();
      setBanner(el('div', { class: 'notice warn mb-4' }, 'This job is taking longer than expected, so automatic updates stopped. ', el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Check again', onclick: () => { delay = POLL.intervalMs; tick(); } })));
      return;
    }
    delay = Math.min(Math.round(delay * 1.25), POLL.maxIntervalMs);
    timer = setTimeout(tick, delay);
  }

  /* ---------- drawing ---------- */
  function draw(inGrace = false) {
    const nextSig = `${exp.status}|${exp.updatedAt}|${inGrace}`;
    if (nextSig === sig) return;
    sig = nextSig;
    if (viewer) { viewer.destroy(); viewer = null; }
    clearInterval(ticker);

    const src = exp.sourceImage || {};
    const title = src.originalFileName || `Experiment ${String(exp._id).slice(-6)}`;
    setTitle('Results Studio');
    document.title = `${title} — CloudClear AI`;

    const head = el('div', { class: 'page-head' },
      el('div', {},
        el('a', { href: '#/experiments', class: 'faint', style: { fontSize: '13px' }, text: '← Experiments' }),
        el('h1', { style: { marginTop: '6px', overflowWrap: 'anywhere' }, text: title }),
        el('p', { class: 'mono faint', style: { fontSize: '12px' }, text: `ID ${exp._id}` })),
      statusBadge(exp.status));

    if (exp.status === 'completed') {
      const hasResult = !!safeUrl(exp.processedImageUrl);
      mount(host, head, el('div', { class: 'studio' },
        el('div', { class: 'stack' }, hasResult ? viewerCard() : el('div', { class: 'notice warn', text: 'This experiment is marked completed but the backend returned no result image URL.' }), metricsCard()),
        el('div', { class: 'stack' }, downloadsCard(), infoCard())));
      return;
    }

    if (exp.status === 'failed') {
      mount(host, head, el('div', { class: 'studio' },
        el('div', { class: 'stack' }, failedCard(inGrace)),
        el('div', { class: 'stack' }, infoCard())));
      return;
    }

    mount(host, head, el('div', { class: 'studio' },
      el('div', { class: 'stack' }, progressCard()),
      el('div', { class: 'stack' }, infoCard())));
  }

  function progressCard() {
    const queued = exp.status === 'queued';
    const elapsed = el('span', { class: 'mono', text: '' });
    const upd = () => { elapsed.textContent = formatDuration(Math.max(0, Date.now() - new Date(exp.createdAt).getTime())); };
    upd(); ticker = setInterval(upd, 1000);
    return el('section', { class: 'glass card', 'aria-label': 'Processing status' },
      el('p', { class: 'eyebrow', text: 'Status' }),
      el('div', { class: 'status-flow', role: 'list', 'aria-label': 'Job stages' },
        el('span', { role: 'listitem', class: `sf ${queued ? 'on' : 'done'}`, text: 'Queued' }), el('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }),
        el('span', { role: 'listitem', class: `sf ${queued ? '' : 'on'}`, text: 'Running' }), el('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }),
        el('span', { role: 'listitem', class: 'sf', text: 'Completed' })),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', margin: '22px 0 8px' } }, el('span', { class: 'spinner', 'aria-hidden': 'true' }),
        el('b', { text: queued ? 'Waiting for a worker' : 'The AI service is processing your image' })),
      el('p', { class: 'dim', style: { fontSize: '14px', lineHeight: '1.6' }, text: queued
        ? 'Your job is in the queue. It will start as soon as a worker is free.'
        : 'The backend reports only that the job is running; there is no finer-grained progress. Large images can take several minutes.' }),
      el('p', { class: 'faint', style: { fontSize: '13px', marginTop: '12px' } }, 'Time since submission: ', elapsed),
      el('p', { class: 'faint', style: { fontSize: '12.5px', marginTop: '8px' }, text: 'You can leave this page. The result will be here when you come back, and you will get a notification.' }));
  }

  function failedCard(inGrace) {
    const rows = [
      el('p', { class: 'eyebrow', text: 'Status' }),
      el('h2', { class: 'section-title', text: 'Processing failed' }),
      el('div', { class: 'notice err', role: 'alert', text: exp.errorMessage || 'The backend did not provide an error message.' }),
    ];
    if (inGrace) {
      rows.push(el('p', { class: 'dim', style: { fontSize: '14px', marginTop: '14px', lineHeight: '1.6' } }, el('span', { class: 'spinner', 'aria-hidden': 'true', style: { marginRight: '8px', verticalAlign: 'middle' } }), 'The job queue retries failed jobs automatically (up to 3 attempts). Checking whether a retry has started…'));
    } else {
      rows.push(el('p', { class: 'dim', style: { fontSize: '14px', marginTop: '14px', lineHeight: '1.6' }, text: 'All automatic attempts have finished. The backend has no manual retry endpoint, so start a new run on the same project, with this or another model.' }));
      rows.push(el('div', { style: { display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' } },
        el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Start a new run', onclick: () => { if (exp.project && exp.project._id) setSelectedProjectId(exp.project._id); location.hash = '#/lab'; } }),
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/experiments', text: 'Back to experiments' })));
      const t = `${src().fileType || ''}`;
      if (t === 'geotiff' || t === 'tiff') rows.push(el('div', { class: 'notice warn', style: { marginTop: '14px' }, text: 'This source is a TIFF. The inference service reads images as 8-bit RGB, so multi-band or 16-bit GeoTIFFs can fail. Try exporting an 8-bit RGB PNG or JPG.' }));
    }
    return el('section', { class: 'glass card' }, ...rows);
  }

  function src() { return exp.sourceImage || {}; }

  function viewerCard() {
    const before = isBrowserImage(src().fileType) ? safeUrl(src().cloudinaryUrl) : '';
    const after = safeUrl(exp.processedImageUrl);
    const conf = safeUrl(exp.confidenceMapUrl);
    const aspect = src().width && src().height ? `${src().width}/${src().height}` : '4/3';
    viewer = createViewer({ before, after, conf, aspect });
    return el('section', { class: 'glass card', style: { padding: '16px' }, 'aria-label': 'Image viewer' },
      viewer.node,
      !before ? el('div', { class: 'notice warn', style: { marginTop: '12px' }, text: 'The original is not a browser-viewable image (TIFF), so side-by-side comparison is unavailable. The reconstructed output is shown on its own.' }) : null);
  }

  function metricsCard() {
    const tiles = [];
    const tile = (label, val, sub) => el('div', { class: 'glass metric' }, el('div', { class: 'm-val', text: val }), el('div', { class: 'm-lab', text: label }), sub ? el('div', { class: 'm-sub', text: sub }) : null);
    if (exp.processingTimeMs != null) tiles.push(tile('Processing time', formatDuration(exp.processingTimeMs)));
    if (exp.confidenceScore != null) tiles.push(tile('Mean confidence', formatNumber(exp.confidenceScore, 3), 'Mean of the confidence map (observed pixels 1.0, cloud pixels lower). Not an accuracy measure.'));
    const ref = [['PSNR', exp.psnr, 2, 'dB'], ['SSIM', exp.ssim, 4, ''], ['MAE', exp.mae, 3, ''], ['RMSE', exp.rmse, 3, ''], ['IoU', exp.iou, 4, '']];
    ref.forEach(([l, v, d, u]) => { if (v != null) tiles.push(tile(l, `${formatNumber(v, d)}${u ? ' ' + u : ''}`)); });
    const anyReference = ref.some(([, v]) => v != null);
    return el('section', { 'aria-label': 'Evaluation metrics' },
      el('div', { class: 'section-title', text: 'Metrics' }),
      tiles.length ? el('div', { class: 'grid grid-3' }, tiles) : el('p', { class: 'dim', text: 'The backend returned no metrics for this experiment.' }),
      !anyReference ? el('div', { class: 'notice info mt-4', text: 'PSNR, SSIM, MAE and RMSE are not available for this experiment. They need a cloud-free reference image, which a real upload does not have; the AI service only computes them for its synthetic benchmark, and the backend does not use that endpoint.' }) : null);
  }

  function downloadsCard() {
    const items = [];
    const add = (label, url, name) => { const u = safeUrl(url); if (u) items.push(el('a', { class: 'btn btn-ghost btn-sm btn-block', href: downloadUrl(u), download: name, target: '_blank', rel: 'noopener noreferrer' }, icon('download', 14), label)); };
    add('Reconstructed image (PNG)', exp.processedImageUrl, `reconstructed-${exp._id}.png`);
    add('Confidence map (PNG)', exp.confidenceMapUrl, `confidence-${exp._id}.png`);
    add('Original upload', src().cloudinaryUrl, src().originalFileName || 'original');
    return el('section', { class: 'glass card', 'aria-label': 'Downloads' },
      el('div', { class: 'section-title', text: 'Downloads' }),
      items.length ? el('div', { class: 'stack', style: { gap: '10px' } }, items) : el('p', { class: 'dim', style: { fontSize: '14px' }, text: 'No output files are available yet.' }));
  }

  function infoCard() {
    const m = SELECTABLE_MODELS.find((x) => x.id === exp.modelUsed);
    const proj = exp.project && typeof exp.project === 'object' ? exp.project : null;
    return el('section', { class: 'glass card', 'aria-label': 'Experiment details' },
      el('div', { class: 'section-title', text: 'Details' }),
      el('dl', { class: 'kv' },
        el('dt', { text: 'Status' }), el('dd', {}, statusBadge(exp.status)),
        el('dt', { text: 'Project' }), el('dd', { text: proj ? proj.name : '—' }),
        el('dt', { text: 'Model' }), el('dd', { text: `${modelLabel(exp.modelUsed)}${m ? ` (${m.kind.toLowerCase()})` : ''}` }),
        el('dt', { text: 'Source' }), el('dd', { text: src().originalFileName || '—' }),
        el('dt', { text: 'File' }), el('dd', { text: `${src().fileType || '—'}${src().fileSizeBytes ? ' · ' + formatBytes(src().fileSizeBytes) : ''}${src().width ? ` · ${src().width}×${src().height}` : ''}` }),
        el('dt', { text: 'Submitted' }), el('dd', { text: formatDate(exp.createdAt) }),
        el('dt', { text: exp.status === 'completed' ? 'Completed' : 'Last update' }), el('dd', { text: formatDate(exp.updatedAt) })),
      m ? el('div', { class: 'notice mt-4', style: { fontSize: '12.5px' }, text: m.detail }) : null);
  }

  tick();
  return { destroy() { alive = false; stopAll(); if (viewer) viewer.destroy(); } };
}

/* Ask Cloudinary for an attachment disposition so the browser downloads instead of navigating.
 * Falls back to the plain URL (opened in a new tab) for any other host. */
function downloadUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('cloudinary.com') && u.pathname.includes('/upload/') && !u.pathname.includes('fl_attachment')) {
      u.pathname = u.pathname.replace('/upload/', '/upload/fl_attachment/');
      return u.href;
    }
  } catch { /* use as is */ }
  return url;
}

/* ======================= viewer: compare slider + zoom/pan ======================= */
function createViewer({ before, after, conf, aspect }) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const st = { mode: before ? 'compare' : 'after', scale: 1, tx: 0, ty: 0, slider: 0.5 };

  const imgAfter = el('img', { src: after, alt: 'Reconstructed image', draggable: 'false' });
  const imgConf = conf ? el('img', { src: conf, alt: 'Confidence map', draggable: 'false', hidden: true }) : null;
  const beforeLayer = before ? el('div', { class: 'before' }, el('img', { src: before, alt: 'Original image', draggable: 'false' })) : null;
  const wrap = el('div', { class: 'layer' }, imgAfter, imgConf, beforeLayer);
  const handle = before ? el('div', { class: 'handle', role: 'slider', tabindex: '0', 'aria-label': 'Comparison position: original on the left, reconstructed on the right', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '50', style: { touchAction: 'none' } }) : null;
  const tagL = before ? el('span', { class: 'vtag l', text: 'Original' }) : null;
  const tagR = el('span', { class: 'vtag r', text: 'Reconstructed' });
  const stage = el('div', { class: 'stage', style: { '--ar': aspect } }, wrap, handle, tagL, tagR);
  const err = el('div', { class: 'notice err', style: { margin: '12px' }, role: 'alert', hidden: true, text: 'The image could not be loaded. The storage link may have expired or been removed.' });

  const modeBtns = {};
  const modes = [];
  if (before) modes.push(['compare', 'Compare']);
  if (before) modes.push(['before', 'Original']);
  modes.push(['after', 'Reconstructed']);
  if (conf) modes.push(['conf', 'Confidence map']);
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'View mode' }, modes.map(([k, label]) => {
    const b = el('button', { type: 'button', text: label, 'aria-pressed': String(st.mode === k), onclick: () => setMode(k) });
    modeBtns[k] = b; return b;
  }));
  const zoomIn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.5) }, icon('zoomIn', 16));
  const zoomOut = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.5) }, icon('zoomOut', 16));
  const reset = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Reset zoom', onclick: () => { st.scale = 1; st.tx = 0; st.ty = 0; apply(); } }, icon('reset', 16));
  const zoomLabel = el('span', { class: 'mono faint', style: { fontSize: '11.5px', minWidth: '44px' }, 'aria-live': 'off' });
  const bar = el('div', { class: 'viewer-bar' }, seg, el('span', { style: { flex: 1 } }), zoomOut, zoomIn, reset, zoomLabel,
    el('span', { class: 'faint', style: { fontSize: '11.5px', width: '100%' }, text: 'Ctrl or ⌘ + scroll to zoom · drag to pan when zoomed' + (before ? ' · drag the handle or use arrow keys to compare' : '') }));
  const node = el('div', { class: 'viewer' }, stage, err, bar);

  function size() { return { W: stage.clientWidth || 1, H: stage.clientHeight || 1 }; }

  function constrain() {
    const { W, H } = size();
    st.tx = clamp(st.tx, W - W * st.scale, 0);
    st.ty = clamp(st.ty, H - H * st.scale, 0);
  }

  function apply() {
    constrain();
    const { W } = size();
    wrap.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
    if (beforeLayer) {
      const wx = (st.slider * W - st.tx) / st.scale;
      const frac = clamp(wx / W, 0, 1);
      beforeLayer.style.clipPath = st.mode === 'before' ? 'none' : `inset(0 ${(1 - frac) * 100}% 0 0)`;
      handle.style.left = `${st.slider * 100}%`;
      handle.setAttribute('aria-valuenow', String(Math.round(st.slider * 100)));
    }
    zoomLabel.textContent = `${Math.round(st.scale * 100)}%`;
    stage.style.touchAction = st.scale > 1 ? 'none' : 'pan-y';
    stage.style.cursor = st.scale > 1 ? 'grab' : 'default';
  }

  function setMode(m) {
    st.mode = m;
    Object.entries(modeBtns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === m)));
    imgAfter.hidden = m === 'before' || m === 'conf';
    if (imgConf) imgConf.hidden = m !== 'conf';
    if (beforeLayer) beforeLayer.hidden = !(m === 'compare' || m === 'before');
    if (handle) handle.hidden = m !== 'compare';
    if (tagL) tagL.hidden = !(m === 'compare' || m === 'before');
    tagR.hidden = m === 'before';
    tagR.textContent = m === 'conf' ? 'Confidence map' : 'Reconstructed';
    if (tagL) tagL.textContent = 'Original';
    apply();
  }

  function zoomAt(next, cx, cy) {
    const ns = clamp(next, 1, 8);
    st.tx = cx - (cx - st.tx) * (ns / st.scale);
    st.ty = cy - (cy - st.ty) * (ns / st.scale);
    st.scale = ns;
    apply();
  }
  function zoomBy(f) { const { W, H } = size(); zoomAt(st.scale * f, W / 2, H / 2); }

  /* pointer interaction */
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (handle && e.target === handle && st.mode === 'compare') drag = { type: 'slider' };
    else if (st.scale > 1) { drag = { type: 'pan', x: e.clientX, y: e.clientY }; stage.classList.add('panning'); }
    if (drag) stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.type === 'slider') {
      const r = stage.getBoundingClientRect();
      st.slider = clamp((e.clientX - r.left) / r.width, 0, 1);
    } else {
      st.tx += e.clientX - drag.x; st.ty += e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    }
    apply();
  });
  const end = () => { drag = null; stage.classList.remove('panning'); };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(st.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  if (handle) handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') st.slider = clamp(st.slider - step, 0, 1);
    else if (e.key === 'ArrowRight') st.slider = clamp(st.slider + step, 0, 1);
    else if (e.key === 'Home') st.slider = 0;
    else if (e.key === 'End') st.slider = 1;
    else return;
    e.preventDefault(); apply();
  });

  /* image lifecycle */
  imgAfter.addEventListener('load', () => {
    if (!aspect.includes('/') || aspect === '4/3') {
      if (imgAfter.naturalWidth) stage.style.setProperty('--ar', `${imgAfter.naturalWidth}/${imgAfter.naturalHeight}`);
    }
    apply();
  });
  imgAfter.addEventListener('error', () => { err.hidden = false; });
  const onResize = () => apply();
  window.addEventListener('resize', onResize);

  setMode(st.mode);
  return { node, destroy() { window.removeEventListener('resize', onResize); } };
}
