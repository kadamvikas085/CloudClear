/* Dashboard: real totals and recent activity from the backend. */
import { DashboardAPI, ProjectsAPI, ExperimentsAPI } from '../api.js';
import { el, mount, icon, emptyState, errorState, skeletons, formatBytes, relativeTime, plural } from '../ui.js';
import { experimentRow, pageHead, statCard } from '../components.js';

export default async function render({ main, user }) {
  let alive = true;
  let timer = null;

  const statsHost = el('div', { class: 'grid grid-4' });
  const gettingStarted = el('div');
  const activityHost = el('div');
  const recentExpHost = el('div');
  const recentProjHost = el('div');

  const firstName = (user.name || '').split(' ')[0] || 'there';
  mount(main,
    pageHead(`Welcome back, ${firstName}`, 'Your projects, uploads and reconstruction jobs at a glance.',
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/projects?new=1' }, icon('plus', 14), 'New project'),
      el('a', { class: 'btn btn-primary btn-sm', href: '#/lab' }, icon('flask', 14), 'Open Image Lab')),
    el('div', { class: 'stack' },
      statsHost,
      gettingStarted,
      el('div', { class: 'grid grid-4' },
        quick('plus', 'Create project', 'Group images by region or study', '#/projects?new=1'),
        quick('upload', 'Upload satellite image', 'PNG, JPG or TIFF up to 100 MB', '#/lab'),
        quick('flask', 'Start a reconstruction', 'Pick an image and a model', '#/lab'),
        quick('image', 'View previous results', 'Browse completed experiments', '#/results')),
      el('div', { class: 'grid grid-2' },
        el('section', { class: 'glass card', 'aria-labelledby': 'h-act' },
          el('div', { class: 'section-title' }, el('span', { id: 'h-act', text: 'Processing activity' }), el('a', { href: '#/experiments', text: 'All experiments' })),
          activityHost),
        el('section', { class: 'glass card', 'aria-labelledby': 'h-recent' },
          el('div', { class: 'section-title' }, el('span', { id: 'h-recent', text: 'Recent experiments' }), el('a', { href: '#/experiments', text: 'View all' })),
          recentExpHost)),
      el('section', { class: 'glass card', 'aria-labelledby': 'h-proj' },
        el('div', { class: 'section-title' }, el('span', { id: 'h-proj', text: 'Recent projects' }), el('a', { href: '#/projects', text: 'View all' })),
        recentProjHost)));

  mount(statsHost, ...[1, 2, 3, 4].map(() => el('div', { class: 'skeleton', style: { height: '112px' } })));
  mount(activityHost, skeletons(2, 56));
  mount(recentExpHost, skeletons(3, 56));
  mount(recentProjHost, skeletons(2, 56));

  async function load() {
    const [summary, projects, running, queued] = await Promise.allSettled([
      DashboardAPI.summary(),
      ProjectsAPI.list({ limit: 5 }),
      ExperimentsAPI.list({ status: 'running', limit: 5 }),
      ExperimentsAPI.list({ status: 'queued', limit: 5 }),
    ]);
    if (!alive) return;

    const S = summary.status === 'fulfilled' ? summary.value.data : null;
    const P = projects.status === 'fulfilled' ? projects.value : null;
    const R = running.status === 'fulfilled' ? running.value : null;
    const Q = queued.status === 'fulfilled' ? queued.value : null;

    /* summary cards: totals come from the backend; anything it can't give is shown as unavailable */
    const activeKnown = R && Q;
    const activeCount = activeKnown ? (R.meta.total + Q.meta.total) : 0;
    mount(statsHost,
      statCard('Projects', S ? S.totals.projects : P ? P.meta.total : '', null, { unavailable: !S && !P }),
      statCard('Uploaded images', S ? S.totals.images : '', S ? `${formatBytes(S.storage.usedBytes)} stored` : null, { unavailable: !S }),
      statCard('Completed experiments', S ? S.totals.completedExperiments : '', null, { unavailable: !S }),
      statCard('Jobs in progress', activeCount, activeKnown ? `${R.meta.total} running · ${Q.meta.total} queued` : null, { unavailable: !activeKnown }));

    /* getting started for brand-new accounts */
    const totalProjects = S ? S.totals.projects : P ? P.meta.total : null;
    mount(gettingStarted, totalProjects === 0
      ? el('section', { class: 'glass card', 'aria-label': 'Getting started' },
        el('p', { class: 'eyebrow', text: 'Getting started' }),
        el('h2', { style: { fontFamily: 'var(--font-display)', fontSize: '20px', marginBottom: '8px' }, text: 'Run your first reconstruction' }),
        el('ol', { style: { paddingLeft: '20px', color: 'var(--text-dim)', fontSize: '14px', lineHeight: '1.9' } },
          el('li', {}, el('a', { href: '#/projects?new=1', style: { color: 'var(--cyan-bright)' }, text: 'Create a project' }), ' to hold your imagery.'),
          el('li', {}, 'Upload a satellite image in ', el('a', { href: '#/lab', style: { color: 'var(--cyan-bright)' }, text: 'Image Lab' }), '.'),
          el('li', {}, 'Choose a model, run it, and open the result when the job finishes.')))
      : null);

    /* activity */
    const active = [...(R ? R.data.experiments : []), ...(Q ? Q.data.experiments : [])];
    if (!activeKnown && !R && !Q) mount(activityHost, errorState(running.reason || queued.reason, load));
    else if (!active.length) mount(activityHost, emptyState({ iconName: 'cpu', title: 'Nothing is processing', text: 'Jobs you start will appear here while they are queued or running.' }));
    else mount(activityHost, ...active.map(experimentRow));

    /* recent experiments */
    if (!S) mount(recentExpHost, errorState(summary.reason, load));
    else if (!S.recentExperiments.length) mount(recentExpHost, emptyState({ iconName: 'list', title: 'No experiments yet', text: 'Your reconstruction history will show up here.', action: el('a', { class: 'btn btn-primary btn-sm', href: '#/lab', text: 'Start one' }) }));
    else mount(recentExpHost, ...S.recentExperiments.slice(0, 6).map(experimentRow));

    /* recent projects */
    if (!P) mount(recentProjHost, errorState(projects.reason, load));
    else if (!P.data.projects.length) mount(recentProjHost, emptyState({ iconName: 'folder', title: 'No projects yet', text: 'Projects keep related images and experiments together.', action: el('a', { class: 'btn btn-primary btn-sm', href: '#/projects?new=1', text: 'Create a project' }) }));
    else mount(recentProjHost, ...P.data.projects.map((p) => el('a', { class: 'list-row', href: '#/projects', 'aria-label': `Project ${p.name}` },
      el('div', { class: 'thumb', 'aria-hidden': 'true' }, icon('folder', 20)),
      el('div', { class: 'grow' }, el('div', { class: 'title', text: p.name }), el('div', { class: 'meta', text: `${plural(p.imageCount, 'image')} · ${plural(p.experimentCount, 'experiment')} · ${relativeTime(p.updatedAt)}` })))));

    /* keep activity fresh only while something is in flight */
    clearTimeout(timer);
    if (active.length) timer = setTimeout(() => { if (alive && !document.hidden) load(); else if (alive) timer = setTimeout(load, 10000); }, 10000);
  }

  load();
  return { destroy() { alive = false; clearTimeout(timer); } };
}

function quick(ico, title, sub, href) {
  return el('a', { class: 'glass qa card-hover', href },
    el('span', { class: 'qa-ico' }, icon(ico)),
    el('div', {}, el('b', { text: title }), el('span', { text: sub })));
}
