"""End-to-end test of the CloudClear frontend against a mocked backend.
The mock follows the contract read from the real Express source."""
import io, json, re, sys, time, threading, http.server, socketserver, functools, os
from urllib.parse import urlparse, parse_qs
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1]
PORT = 5500
ORIGIN = f'http://localhost:{PORT}'
API = 'http://localhost:5000/api/v1'

# ---------- static server ----------
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Q, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

# ---------- test images ----------
def png(kind):
    im = Image.new('RGB', (800, 600), (40, 90, 60) if kind != 'before' else (60, 80, 70))
    d = ImageDraw.Draw(im)
    if kind == 'before':
        d.ellipse((250, 150, 600, 450), fill=(240, 240, 240))
    if kind == 'conf':
        im = Image.new('L', (800, 600), 255).convert('RGB'); d = ImageDraw.Draw(im); d.ellipse((250, 150, 600, 450), fill=(90, 90, 90))
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()
IMGS = {k: png(k) for k in ('before', 'after', 'conf')}

# ---------- mock backend ----------
S = {}
def reset():
    S.clear()
    S.update(valid={'tok1'}, refresh_ok=True, refresh_calls=0, projects=[], images=[], experiments=[], gets={}, ids=0, posts_projects=0,
             user={'_id': 'u1', 'name': 'Asha Rao', 'email': 'asha@example.com', 'role': 'user', 'isEmailVerified': False,
                   'createdAt': '2026-10-01T10:00:00Z', 'lastLoginAt': '2026-10-17T08:00:00Z'},
             login_calls=0, process_calls=0)
reset()

def nid(p):
    S['ids'] += 1
    return f'{p}{S["ids"]:022d}'[-24:] if False else (p * 24 + str(S['ids']))[:24 - len(str(S['ids']))] + str(S['ids'])

def now(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

def env(status, message, data=None, meta=None, details=None):
    b = {'success': status < 400, 'statusCode': status, 'message': message, 'data': data}
    if meta: b['meta'] = meta
    if details: b['details'] = details
    return status, b

def paginate(items, q):
    page = int(q.get('page', ['1'])[0]); limit = int(q.get('limit', ['10'])[0])
    total = len(items)
    return items[(page - 1) * limit: page * limit], {'page': page, 'limit': limit, 'total': total, 'totalPages': max(1, -(-total // limit))}

def exp_view(e, full=False):
    out = dict(e)
    img = next((i for i in S['images'] if i['_id'] == e['sourceImage']), None)
    out['sourceImage'] = img
    out['project'] = next(({'_id': p['_id'], 'name': p['name']} for p in S['projects'] if p['_id'] == e['project']), None)
    return out

def api(method, path, q, body, auth, raw):
    if method == 'POST' and path == '/auth/login':
        S['login_calls'] += 1
        if body.get('email') == 'asha@example.com' and body.get('password') == 'Passw0rd1':
            S['valid'].add('tok1'); return env(200, 'Login successful', {'user': S['user'], 'accessToken': 'tok1'})
        return env(401, 'Invalid email or password')
    if method == 'POST' and path == '/auth/register':
        if len(body.get('password', '')) < 8: return env(422, 'Validation failed', details=[{'field': 'password', 'message': 'Password must be at least 8 characters'}])
        return env(201, 'Registration successful. Please verify your email.', {'user': S['user']})
    if method == 'POST' and path == '/auth/refresh':
        S['refresh_calls'] += 1
        if S['refresh_ok']:
            S['valid'].add('tok2'); return env(200, 'Token refreshed', {'accessToken': 'tok2'})
        return env(401, 'Session expired or invalid. Please log in again.')
    if method == 'POST' and path == '/auth/logout': return env(200, 'Logged out successfully')
    token = (auth or '').replace('Bearer ', '')
    if token not in S['valid']: return env(401, 'Authentication required. Please log in.')

    if path == '/auth/me': return env(200, 'Current user fetched', {'user': S['user']})
    if path == '/notifications': return env(200, 'ok', {'notifications': [], 'unreadCount': 0}, {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0})
    if path == '/users/me' and method == 'PATCH':
        S['user']['name'] = body['name']; return env(200, 'Profile updated successfully', {'user': S['user']})
    if path == '/projects' and method == 'POST':
        S['posts_projects'] += 1
        if len(body.get('name', '').strip()) < 2: return env(422, 'Validation failed', details=[{'field': 'name', 'message': 'Project name must be between 2 and 150 characters'}])
        p = {'_id': nid('p'), 'owner': 'u1', 'name': body['name'], 'description': body.get('description', ''), 'region': body.get('region', ''), 'status': 'active', 'imageCount': 0, 'experimentCount': 0, 'createdAt': now(), 'updatedAt': now()}
        S['projects'].insert(0, p); return env(201, 'Project created successfully', {'project': p})
    if path == '/projects' and method == 'GET':
        items = S['projects']
        if q.get('status', [''])[0]: items = [p for p in items if p['status'] == q['status'][0]]
        if q.get('search', [''])[0]: items = [p for p in items if q['search'][0].lower() in p['name'].lower()]
        pg, meta = paginate(items, q); return env(200, 'Projects fetched successfully', {'projects': pg}, meta)
    m = re.fullmatch(r'/projects/(\w+)', path)
    if m and method == 'PATCH':
        p = next(p for p in S['projects'] if p['_id'] == m.group(1)); p.update({k: v for k, v in body.items()}); return env(200, 'Project updated successfully', {'project': p})
    if path == '/images' and method == 'POST':
        fn = re.search(rb'filename="([^"]+)"', raw).group(1).decode()
        pid = re.search(rb'name="projectId"\r\n\r\n(\w+)', raw).group(1).decode()
        ft = 'geotiff' if fn.lower().endswith(('.tif', '.tiff')) else 'png' if fn.lower().endswith('.png') else 'jpg'
        im = {'_id': nid('i'), 'project': pid, 'owner': 'u1', 'originalFileName': fn, 'fileType': ft, 'mimeType': 'image/png', 'fileSizeBytes': len(raw),
              'cloudinaryUrl': 'https://res.cloudinary.test/image/upload/v1/before.png', 'width': 800, 'height': 600, 'status': 'uploaded', 'createdAt': now(), 'updatedAt': now()}
        S['images'].insert(0, im)
        next(p for p in S['projects'] if p['_id'] == pid)['imageCount'] += 1
        return env(201, 'Image uploaded successfully', {'image': im})
    if path == '/images' and method == 'GET':
        items = [i for i in S['images'] if i['project'] == q['projectId'][0]]
        pg, meta = paginate(items, q); return env(200, 'ok', {'images': pg}, meta)
    if path == '/experiments/process' and method == 'POST':
        S['process_calls'] += 1
        e = {'_id': nid('e'), 'project': next(i for i in S['images'] if i['_id'] == body['imageId'])['project'], 'owner': 'u1', 'sourceImage': body['imageId'], 'modelUsed': body['model'],
             'status': 'queued', 'processedImageUrl': None, 'confidenceMapUrl': None, 'processingTimeMs': None, 'psnr': None, 'ssim': None, 'iou': None, 'rmse': None, 'mae': None,
             'confidenceScore': None, 'errorMessage': None, 'createdAt': now(), 'updatedAt': now()}
        S['experiments'].insert(0, e); return env(202, 'AI processing job queued', {'experiment': e})
    if path == '/experiments' and method == 'GET':
        items = S['experiments']
        for k, f in (('status', 'status'), ('model', 'modelUsed'), ('projectId', 'project')):
            if q.get(k, [''])[0]: items = [e for e in items if e[f] == q[k][0]]
        pg, meta = paginate(items, q); return env(200, 'ok', {'experiments': [exp_view(e) for e in pg]}, meta)
    m = re.fullmatch(r'/experiments/(\w+)', path)
    if m and method == 'GET':
        e = next((e for e in S['experiments'] if e['_id'] == m.group(1)), None)
        if not e: return env(404, 'Experiment not found')
        n = S['gets'][e['_id']] = S['gets'].get(e['_id'], 0) + 1
        if e['modelUsed'] == 'GAN':
            e.update(status='failed', errorMessage='AI service returned an error: Failed to download source image', updatedAt=now())
        elif n == 1: e['status'] = 'queued'
        elif n == 2: e['status'] = 'running'
        else:
            e.update(status='completed', processedImageUrl='https://res.cloudinary.test/image/upload/v1/after.png', confidenceMapUrl='https://res.cloudinary.test/image/upload/v1/conf.png',
                     processingTimeMs=4210, confidenceScore=0.9312, updatedAt=now())
        return env(200, 'Experiment fetched successfully', {'experiment': exp_view(e)})
    if path == '/dashboard/summary':
        done = [e for e in S['experiments'] if e['status'] == 'completed']
        return env(200, 'ok', {'totals': {'projects': len(S['projects']), 'images': len(S['images']), 'completedExperiments': len(done)},
                               'averageMetrics': {k: None for k in ('psnr', 'ssim', 'iou', 'rmse', 'mae', 'confidenceScore')},
                               'storage': {'usedBytes': sum(i['fileSizeBytes'] for i in S['images']), 'usedMB': 0, 'usedGB': 0},
                               'recentExperiments': [exp_view(e) for e in S['experiments'][:10]]})
    return env(404, f'Not mocked: {method} {path}')

def route_api(route):
    req = route.request
    cors = {'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'}
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=cors)
    u = urlparse(req.url); path = u.path.replace('/api/v1', '', 1)
    raw = req.post_data_buffer or b''
    body = {}
    if raw and 'json' in (req.headers.get('content-type') or ''):
        try: body = json.loads(raw)
        except Exception: body = {}
    status, b = api(req.method, path, parse_qs(u.query), body, req.headers.get('authorization'), raw)
    route.fulfill(status=status, headers={**cors, 'content-type': 'application/json'}, body=json.dumps(b))

def route_img(route):
    k = 'after' if 'after' in route.request.url else 'conf' if 'conf' in route.request.url else 'before'
    route.fulfill(status=200, headers={'content-type': 'image/png', 'access-control-allow-origin': '*'}, body=IMGS[k])

# ---------- harness ----------
results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond), extra)); print(('PASS' if cond else 'FAIL'), name, extra)

errors = []
def new_page(ctx):
    p = ctx.new_page()
    p.on('console', lambda m: errors.append((p.url, m.text)) if m.type == 'error' else None)
    p.on('pageerror', lambda e: errors.append((p.url, 'PAGEERROR ' + str(e))))
    return p

def wait_url(pg, sub, timeout=15000):
    pg.wait_for_function('s => location.href.includes(s)', arg=sub, timeout=timeout)

def login(page):
    page.goto(f'{ORIGIN}/login.html')
    page.fill('#email', 'asha@example.com'); page.fill('#password', 'Passw0rd1')
    page.click('#submitBtn')
    wait_url(page, 'app.html#/dashboard')
    page.wait_for_selector('#app:not([hidden])')

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 800})
    ctx.route('http://localhost:5000/**', route_api)
    ctx.route('https://res.cloudinary.test/**', route_img)
    ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.fulfill(status=200, body='', content_type='text/css'))
    page = new_page(ctx)

    # ---- landing ----
    page.goto(f'{ORIGIN}/index.html'); page.wait_for_timeout(600)
    html = page.content()
    check('landing: no fabricated stats (31.4 / 0.94 / 312)', not any(s in page.inner_text('body') for s in ('31.4', '0.94', '312 ', 'Aarav')))
    check('landing: 4 model cards', page.locator('#modelGrid .model-card').count() == 4)
    check('landing: Log In/Sign Up point to real pages', page.get_attribute('#navCtaLoggedOut a:nth-child(1)', 'href') == 'login.html' and page.get_attribute('#navCtaLoggedOut a:nth-child(2)', 'href') == 'register.html')
    dead = page.eval_on_selector_all('a[href="#"]', 'els => els.length')
    check('landing: no dead href="#" links', dead == 0, f'found {dead}')
    check('landing: no performance/team/mock-demo sections', page.locator('#performance, #team, #dropzone').count() == 0)
    check('landing: 7 datasets, none claimed as trained', page.locator('#datasetGrid .dataset-card').count() == 7 and 'Reference only' in page.inner_text('#datasetGrid'))

    # ---- auth ----
    page.goto(f'{ORIGIN}/login.html')
    page.fill('#email', 'asha@example.com'); page.fill('#password', 'wrong'); page.click('#submitBtn')
    page.wait_for_selector('#msg.error')
    check('login: wrong password shows backend message', 'Invalid email or password' in page.inner_text('#msg'))
    check('login: button re-enabled after failure', page.is_enabled('#submitBtn'))
    page.goto(f'{ORIGIN}/register.html')
    page.fill('#name', 'Asha Rao'); page.fill('#email', 'a@b.co'); page.fill('#password', 'short'); page.click('#submitBtn')
    check('register: client-side password rule', 'at least 8' in page.inner_text('#msg'))
    S['refresh_ok'] = False
    page.goto(f'{ORIGIN}/app.html')
    wait_url(page, 'login.html')
    S['refresh_ok'] = True
    check('guard: app.html without session redirects to login', 'login.html' in page.url)
    login(page)
    check('login: success lands on workspace dashboard', page.url.endswith('app.html#/dashboard'))
    check('dashboard: welcome uses real name', 'Asha' in page.inner_text('h1'))

    # ---- dashboard empty ----
    page.wait_for_selector('.stat')
    page.wait_for_timeout(300)
    txt = page.inner_text('#main')
    check('dashboard: empty-state onboarding for new account', 'Run your first reconstruction' in txt)
    check('dashboard: real zeros, no invented numbers', page.locator('.stat .stat-val').all_inner_texts() == ['0', '0', '0', '0'], str(page.locator('.stat .stat-val').all_inner_texts()))

    # ---- projects ----
    page.goto(f'{ORIGIN}/app.html#/projects'); page.wait_for_selector('.empty')
    page.click('text=New project >> nth=0')
    page.wait_for_selector('.dialog')
    page.fill('#pj-name', 'x'); page.click('.dialog .btn-primary')
    check('projects: short name rejected client-side, no request sent', S['posts_projects'] == 0 and page.locator('.dialog .form-error:not([hidden])').count() == 1)
    page.fill('#pj-name', '<img src=x onerror="window.__xss=1"> Vidarbha'); page.fill('#pj-region', 'Maharashtra')
    page.dblclick('.dialog .btn-primary')
    page.wait_for_selector('.project-card')
    check('projects: double-click creates exactly one project', S['posts_projects'] == 1, f'posts={S["posts_projects"]}')
    check('projects: XSS payload rendered as text', page.evaluate('window.__xss') is None and '<img src=x' in page.inner_text('.project-card h3'))
    check('projects: created project auto-selected for Image Lab', page.evaluate("localStorage.getItem('cc.selectedProject')") == S['projects'][0]['_id'])
    page.fill('input[type=search]', 'zzz'); page.wait_for_selector('text=No matching projects')
    check('projects: search with no hits shows empty state', True)
    page.fill('input[type=search]', '')
    page.wait_for_selector('.project-card')

    # ---- Image Lab ----
    page.goto(f'{ORIGIN}/app.html#/lab'); page.wait_for_selector('#lab-project')
    check('lab: remembered project preselected', page.input_value('#lab-project') == S['projects'][0]['_id'])
    check('lab: run disabled before image', page.is_disabled('button:has-text("Run reconstruction")'))
    page.set_input_files('input[type=file]', files=[{'name': 'scene.gif', 'mimeType': 'image/gif', 'buffer': b'GIF89a'}])
    check('lab: unsupported type rejected', 'Unsupported file type' in page.inner_text('.form-error'))
    big = os.path.join(os.path.dirname(__file__), 'big.png')
    with open(big, 'wb') as fh: fh.truncate(101 * 1024 * 1024)
    page.set_input_files('input[type=file]', big)
    check('lab: >100 MB rejected with size message', 'maximum is 100' in page.inner_text('.form-error'), page.inner_text('.form-error'))
    page.set_input_files('input[type=file]', files=[{'name': 'scene.png', 'mimeType': 'image/png', 'buffer': IMGS['before']}])
    page.wait_for_selector('.preview-box img')
    check('lab: png preview shown before upload', True)
    page.click('text=Upload to project'); page.wait_for_selector('text=Use a different image')
    check('lab: upload hits real endpoint, image doc shown', 'scene.png' in page.inner_text('#main') and len(S['images']) == 1)
    check('lab: classical models labelled as classical', page.locator('.model-opt', has_text='U-Net').inner_text().lower().count('classical') >= 1)
    page.click('button:has-text("Run reconstruction")')
    wait_url(page, '#/results/')
    check('lab: submit queues job and opens experiment page', S['process_calls'] == 1 and '/results/' in page.url)

    # ---- polling / results ----
    page.wait_for_selector('text=Waiting for a worker', timeout=8000)
    check('results: queued state shown from backend status', True)
    page.wait_for_selector('text=The AI service is processing your image', timeout=9000)
    check('results: running state shown', True)
    page.wait_for_selector('.viewer', timeout=15000)
    check('results: completed -> viewer rendered', True)
    gets_at_done = S['gets'][S['experiments'][0]['_id']]
    page.wait_for_timeout(5000)
    check('results: polling stops after completion', S['gets'][S['experiments'][0]['_id']] == gets_at_done, f'{gets_at_done} -> {S["gets"][S["experiments"][0]["_id"]]}')
    body = page.inner_text('#main')
    check('results: metrics only real fields (time + confidence)', '4.2 s' in body and '0.931' in body)
    check('results: no PSNR/SSIM tiles, honest note shown', 'PSNR' in body and 'not available for this experiment' in body and page.locator('.metric .m-lab', has_text='PSNR').count() == 0)
    check('results: downloads for result + confidence + original', page.locator('a[download]').count() == 3)
    h = page.locator('.handle'); h.focus(); page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowRight')
    check('results: slider keyboard-operable', h.get_attribute('aria-valuenow') == '54', h.get_attribute('aria-valuenow'))
    page.click('.seg button:has-text("Confidence map")')
    check('results: confidence-map mode', page.locator('.viewer .layer img').nth(1).is_visible())
    page.click('.seg button:has-text("Compare")')
    page.click('[aria-label="Zoom in"]'); page.click('[aria-label="Zoom in"]')
    check('results: zoom works', page.inner_text('.viewer-bar .mono') == '225%', page.inner_text('.viewer-bar .mono'))
    page.click('[aria-label="Reset zoom"]')
    check('results: reset zoom', page.inner_text('.viewer-bar .mono') == '100%')
    hb = page.locator('.handle').bounding_box(); sb = page.locator('.viewer .stage').bounding_box()
    cx, cy = hb['x'] + hb['width'] / 2, sb['y'] + sb['height'] / 2
    page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(sb['x'] + sb['width'] * 0.8, cy, steps=6); page.mouse.up()
    check('results: dragging the handle moves the slider', int(page.locator('.handle').get_attribute('aria-valuenow')) > 55, page.locator('.handle').get_attribute('aria-valuenow'))

    # ---- failed experiment (grace + final) ----
    page.goto(f'{ORIGIN}/app.html#/lab'); page.wait_for_selector('#lab-project')
    page.select_option('#lab-existing', index=1)
    page.click('label.model-opt:has-text("GAN")'); page.click('button:has-text("Run reconstruction")')
    page.wait_for_selector('text=Processing failed', timeout=15000)
    check('failed: backend errorMessage displayed', 'Failed to download source image' in page.inner_text('#main'))
    check('failed: grace-period retry notice, no retry button invented', 'retries failed jobs automatically' in page.inner_text('#main') and page.get_by_role('button', name=re.compile('^retry', re.I)).count() == 0)
    page.evaluate("import('/js/state.js').then(m => { m.POLL.failedGraceMs = 100; })")
    page.wait_for_selector('text=Start a new run', timeout=12000)
    check('failed: final state offers new run after grace', True)

    # ---- experiments list ----
    page.goto(f'{ORIGIN}/app.html#/experiments'); page.wait_for_selector('table.tbl')
    check('experiments: rows from API', page.locator('table.tbl tbody tr').count() == 2)
    page.select_option('select[aria-label="Filter by status"]', 'completed'); page.wait_for_timeout(500)
    check('experiments: status filter', page.locator('table.tbl tbody tr').count() == 1)
    page.select_option('select[aria-label="Filter by status"]', 'queued'); page.wait_for_selector('.empty')
    check('experiments: empty filter result handled', 'No experiments match' in page.inner_text('.empty'))

    # ---- dashboard populated ----
    page.goto(f'{ORIGIN}/app.html#/dashboard'); page.wait_for_selector('.stat'); page.wait_for_timeout(400)
    vals = page.locator('.stat .stat-val').all_inner_texts()
    check('dashboard: totals from summary (1 project, 1 image, 1 completed)', vals[:3] == ['1', '1', '1'], str(vals))

    # ---- results gallery / models / settings ----
    page.goto(f'{ORIGIN}/app.html#/results'); page.wait_for_selector('.card-hover')
    check('results gallery lists completed only', page.locator('a.card-hover').count() == 1)
    page.goto(f'{ORIGIN}/app.html#/models'); page.wait_for_selector('.zoo-card')
    check('models: 4 available + 7 not implemented, none selectable', page.locator('.zoo-card').count() == 11 and page.locator('.zoo-card button[disabled]').count() == 7)
    check('models: no benchmark numbers', not re.search(r'\d+(\.\d+)? dB|SSIM \d', page.inner_text('#main')))
    page.goto(f'{ORIGIN}/app.html#/settings'); page.wait_for_selector('#st-name')
    page.fill('#st-name', 'Asha R'); page.click('text=Save changes'); page.wait_for_selector('.toast.ok')
    check('settings: profile update reflected in top bar', page.inner_text('.profile-btn .profile-name') == 'Asha R')
    page.fill('#pw-cur', 'x'); page.fill('#pw-new', 'abcdefgh'); page.click('text=Change password')
    check('settings: password rule enforced client-side', 'letter and one number' in page.inner_text('#pw-hint ~ div, #main'))

    # ---- 401 -> refresh -> retry ----
    S['valid'] = {'tok2'}; S['refresh_ok'] = True; S['refresh_calls'] = 0
    page.goto(f'{ORIGIN}/app.html#/projects'); page.wait_for_selector('.project-card')
    check('session: expired access token silently refreshed', S['refresh_calls'] >= 1 and page.locator('.project-card').count() == 1, f'refresh_calls={S["refresh_calls"]}')
    # parallel calls share one refresh
    S['valid'] = {'tok3'}; S['refresh_ok'] = True; S['refresh_calls'] = 0
    page.evaluate("sessionStorage.setItem('accessToken','stale')")
    page.goto(f'{ORIGIN}/app.html#/dashboard'); page.wait_for_selector('.stat'); page.wait_for_timeout(400)
    check('session: concurrent 401s trigger a single refresh', S['refresh_calls'] == 1, f'refresh_calls={S["refresh_calls"]}')
    # refresh failure -> login
    S['valid'] = set(); S['refresh_ok'] = False
    page.goto(f'{ORIGIN}/app.html#/projects')
    wait_url(page, 'login.html')
    check('session: failed refresh redirects to login with message', 'reason=expired' in page.url and 'expired' in page.inner_text('#notice'))
    S['valid'] = {'tok1'}; S['refresh_ok'] = True

    # ---- responsive ----
    mctx = br.new_context(viewport={'width': 390, 'height': 800})
    mctx.route('http://localhost:5000/**', route_api); mctx.route('https://res.cloudinary.test/**', route_img)
    mctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.fulfill(status=200, body='', content_type='text/css'))
    m = new_page(mctx)
    m.goto(f'{ORIGIN}/login.html'); m.fill('#email', 'asha@example.com'); m.fill('#password', 'Passw0rd1'); m.click('#submitBtn'); wait_url(m, 'app.html#/dashboard'); m.wait_for_selector('#app:not([hidden])')
    eid = S['experiments'][-1]['_id']
    for route_name in ('dashboard', 'projects', 'lab', 'experiments', 'results', 'models', 'settings', f'results/{eid}', ''):
        if route_name == '':
            m.goto(f'{ORIGIN}/index.html'); label = 'landing'
        else:
            m.goto(f'{ORIGIN}/app.html#/{route_name}'); label = route_name.split('/')[0] + ('-studio' if '/' in route_name else '')
        m.wait_for_timeout(900)
        over = m.evaluate('document.documentElement.scrollWidth - window.innerWidth')
        if over > 1:
            off = m.evaluate('''() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.table-wrap')).slice(0, 8).map(e => e.tagName + '.' + (e.className && e.className.baseVal === undefined ? e.className : '') + ' w=' + Math.round(e.getBoundingClientRect().width) + ' r=' + Math.round(e.getBoundingClientRect().right))''')
            print('   offenders:', off)
        check(f'mobile 390px: no horizontal overflow on {label}', over <= 1, f'overflow={over}')
    m.goto(f'{ORIGIN}/app.html#/dashboard'); m.wait_for_selector('#menuBtn')
    check('mobile: sidebar hidden by default', not m.locator('#sidebar.open').count())
    m.click('#menuBtn'); check('mobile: drawer opens and exposes navigation', m.locator('#sidebar.open').count() == 1 and m.locator('#sideNav a').first.is_visible())
    m.keyboard.press('Escape'); check('mobile: Escape closes drawer', m.locator('#sidebar.open').count() == 0)
    m.screenshot(path=os.path.join(os.getcwd(), "mobile-dashboard.png"))

    # ---- screenshots (desktop) ----
    for name, url in (('dashboard', '#/dashboard'), ('lab', '#/lab'), ('studio', f'#/results/{eid}'), ('models', '#/models')):
        page.goto(f'{ORIGIN}/app.html{url}'); page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(os.path.dirname(__file__), f'desk-{name}.png'))
    br.close()

bad = [r for r in results if not r[1]]
print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
print('Console/page errors:', json.dumps(errors, indent=1) if errors else 'none')
sys.exit(1 if bad else 0)
