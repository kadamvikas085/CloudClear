/* Shared view fragments used by several pages. */
import { el, statusBadge, safeUrl, isBrowserImage, relativeTime, formatDate } from './ui.js';
import { modelLabel } from './models-data.js';

/** Thumbnail for an experiment: result if available, else source if the browser can render it. */
export function experimentThumb(exp) {
  const src = exp.sourceImage || {};
  let url = '';
  if (exp.status === 'completed' && exp.processedImageUrl) url = safeUrl(exp.processedImageUrl);
  else if (isBrowserImage(src.fileType) && src.cloudinaryUrl) url = safeUrl(src.cloudinaryUrl);
  if (url) return el('img', { class: 'thumb', src: url, alt: '', loading: 'lazy' });
  const label = src.fileType === 'geotiff' || src.fileType === 'tiff' ? 'TIFF' : 'IMG';
  return el('div', { class: 'thumb', 'aria-hidden': 'true', text: label });
}

export function experimentTitle(exp) {
  return (exp.sourceImage && exp.sourceImage.originalFileName) || `Experiment ${String(exp._id).slice(-6)}`;
}

export function projectName(exp) {
  return exp.project && typeof exp.project === 'object' ? exp.project.name : '';
}

/** A link-row for an experiment, used on the dashboard and results gallery. */
export function experimentRow(exp) {
  const parts = [modelLabel(exp.modelUsed), projectName(exp), relativeTime(exp.createdAt)].filter(Boolean);
  return el('a', { class: 'list-row', href: `#/results/${encodeURIComponent(exp._id)}`, 'aria-label': `Open ${experimentTitle(exp)}, ${exp.status}` },
    experimentThumb(exp),
    el('div', { class: 'grow' },
      el('div', { class: 'title', text: experimentTitle(exp) }),
      el('div', { class: 'meta', text: parts.join(' · '), title: formatDate(exp.createdAt) })),
    statusBadge(exp.status));
}

export function pageHead(title, subtitle, ...actions) {
  return el('div', { class: 'page-head' },
    el('div', {}, el('h1', { text: title }), subtitle ? el('p', { text: subtitle }) : null),
    actions.length ? el('div', { class: 'row-between', style: { gap: '10px' } }, ...actions) : null);
}

export function statCard(label, value, sub, { unavailable = false } = {}) {
  return el('div', { class: 'glass stat' },
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: `stat-val${unavailable ? ' na' : ''}`, text: unavailable ? 'Unavailable' : String(value) }),
    sub ? el('div', { class: 'stat-sub', text: sub }) : null);
}
