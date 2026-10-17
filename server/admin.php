<?php
/**
 * ohjeyti admin: review "lost my account" help requests.
 *
 * For each request you see what the student wrote next to the real account
 * data, so you can check they own it. Then you can:
 *   - reset their recovery code (they restore everything in the app), or
 *   - download their files as a .zip (logs spreadsheet, daily time record, photos).
 *
 * Deploy: upload to public_html/api/admin.php next to account.php and _lib.php,
 * and set admin_password_hash in ohjeyti-config.php (open this page once to
 * generate it).
 */

declare(strict_types=1);

require __DIR__ . '/_lib.php';

date_default_timezone_set($config['timezone'] ?? 'Asia/Manila');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'");

session_name('ohjeyti_admin');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => dirname($_SERVER['SCRIPT_NAME']) ?: '/',
    'secure' => ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off',
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

const CATEGORY_LABELS = [
    'development' => 'Development',
    'documentation' => 'Documentation',
    'hardware' => 'Hardware',
    'meeting' => 'Meeting',
    'training' => 'Training',
];

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function csrfToken(): string
{
    return $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function requireCsrf(): void
{
    if (!hash_equals(csrfToken(), (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Invalid form. Go back, refresh, and try again.');
    }
}

function selfUrl(array $query = []): string
{
    return h(basename($_SERVER['SCRIPT_NAME']) . ($query ? '?' . http_build_query($query) : ''));
}

function page(string $title, string $body): never
{
    $logout = !empty($_SESSION['admin'])
        ? '<form method="post" action="' . selfUrl() . '"><input type="hidden" name="csrf" value="' . h(csrfToken()) . '"><button name="do" value="logout" class="link">Log out</button></form>'
        : '';
    $home = selfUrl();
    echo <<<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{$title} · ohjeyti admin</title>
<style>
  :root { color-scheme: dark; --bg:#020617; --card:#0f172a; --line:#1e293b; --text:#e2e8f0; --muted:#94a3b8; --sun:#fbbf24; --red:#fca5a5; --green:#6ee7b7; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, 'Segoe UI', Roboto, sans-serif; }
  header { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.9rem 1.25rem; border-bottom:1px solid var(--line); }
  header a.brand { color:var(--text); font-weight:800; text-decoration:none; }
  header a.brand span { color:var(--sun); }
  main { max-width:1100px; margin:0 auto; padding:1.25rem; }
  h1 { font-size:1.5rem; margin:.25rem 0 1rem; }
  h2 { font-size:1rem; margin:0 0 .75rem; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
  a { color:var(--sun); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:1.1rem; margin-bottom:1rem; }
  .grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); }
  dl { display:grid; grid-template-columns:9rem 1fr; gap:.35rem .75rem; margin:0; }
  dt { color:var(--muted); }
  dd { margin:0; word-break:break-word; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:.55rem .5rem; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:.85rem; }
  input, textarea, select { width:100%; background:#1e293b; color:var(--text); border:1px solid #334155; border-radius:10px; padding:.6rem .75rem; font:inherit; }
  label { display:block; font-weight:600; margin:.6rem 0 .3rem; }
  button, .button { display:inline-block; background:var(--sun); color:#0f172a; border:0; border-radius:10px; padding:.6rem 1rem; font:inherit; font-weight:700; cursor:pointer; text-decoration:none; }
  .secondary { background:#334155; color:var(--text); }
  .danger { background:#7f1d1d; color:#fecaca; }
  .link { background:none; color:var(--muted); padding:0; font-weight:500; }
  .row { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
  .muted { color:var(--muted); }
  .pill { display:inline-block; padding:.1rem .55rem; border-radius:999px; font-size:.8rem; font-weight:700; }
  .pending { background:#78350f; color:#fde68a; } .resolved { background:#064e3b; color:var(--green); } .rejected { background:#450a0a; color:var(--red); }
  .match { color:var(--green); } .nomatch { color:var(--red); }
  .code { font:700 1.6rem ui-monospace, Consolas, monospace; color:var(--sun); letter-spacing:.06em; }
  .notice { border-left:3px solid var(--sun); padding:.6rem .9rem; background:#1c1917; border-radius:8px; }
  pre { white-space:pre-wrap; background:#1e293b; padding:.75rem; border-radius:10px; margin:0; font:inherit; }
</style>
</head>
<body>
<header><a class="brand" href="{$home}">☀ <span>ohjeyti</span> admin</a>{$logout}</header>
<main>{$body}</main>
</body>
</html>
HTML;
    exit;
}

// --- Setup: no admin password yet ----------------------------------------------------
if (empty($config['admin_password_hash'])) {
    $hash = '';
    if (($_POST['do'] ?? '') === 'hash' && strlen((string) ($_POST['password'] ?? '')) >= 12) {
        $hash = password_hash((string) $_POST['password'], PASSWORD_DEFAULT);
    }
    page('Set up', '<h1>Set up the admin password</h1><div class="card">'
        . '<p>No admin password is configured yet. Type the password you want (at least 12 characters), then copy the line below into <b>ohjeyti-config.php</b>.</p>'
        . '<form method="post"><label for="pw">New admin password</label><input id="pw" type="password" name="password" minlength="12" required autocomplete="new-password">'
        . '<p><button name="do" value="hash">Generate</button></p></form>'
        . ($hash ? '<p>Add this line to the config file, then reload this page:</p><pre>\'admin_password_hash\' => \'' . h($hash) . '\',</pre>' : '')
        . '</div>');
}

// --- Login / logout ------------------------------------------------------------------
$do = $_POST['do'] ?? '';

if ($do === 'logout') {
    requireCsrf();
    $_SESSION = [];
    session_destroy();
    header('Location: ' . basename($_SERVER['SCRIPT_NAME']));
    exit;
}

if (empty($_SESSION['admin'])) {
    $error = '';
    if ($do === 'login') {
        if (isRateLimited('admin-login', 10, 900)) {
            $error = 'Too many attempts. Wait 15 minutes.';
        } elseif (password_verify((string) ($_POST['password'] ?? ''), $config['admin_password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            header('Location: ' . basename($_SERVER['SCRIPT_NAME']));
            exit;
        } else {
            $error = 'Wrong password.';
        }
    }
    page('Log in', '<h1>Admin log in</h1><div class="card" style="max-width:420px">'
        . ($error ? '<p class="nomatch">' . h($error) . '</p>' : '')
        . '<form method="post"><label for="pw">Password</label><input id="pw" type="password" name="password" required autofocus autocomplete="current-password">'
        . '<p><button name="do" value="login">Log in</button></p></form></div>');
}

// --- Data helpers -----------------------------------------------------------------------

/** Account row + decoded backup + quick stats, or null. */
function loadAccount(string $username): ?array
{
    $stmt = db()->prepare(
        'SELECT a.id, a.username, a.full_name, a.created_at, a.locked_until, b.snapshot, b.updated_at AS backup_at,
                (SELECT COUNT(*) FROM account_tokens t WHERE t.account_id = a.id) AS devices
         FROM accounts a LEFT JOIN backups b ON b.account_id = a.id WHERE a.username = ?'
    );
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $snap = $row['snapshot'] ? json_decode($row['snapshot'], true) : null;
    $entries = $snap['entries'] ?? [];
    usort($entries, fn ($a, $b) => strcmp((string) ($b['date'] ?? ''), (string) ($a['date'] ?? '')));
    $row['snapshot'] = $snap;
    $row['profile'] = $snap['profile'] ?? [];
    $row['entry_count'] = count($entries);
    $row['photo_count'] = array_sum(array_map(fn ($e) => count($e['photos'] ?? []), $entries));
    $row['hours'] = array_sum(array_map(fn ($s) => (float) ($s['hours'] ?? 0), $snap['shifts'] ?? []));
    $row['recent'] = array_slice($entries, 0, 3);
    return $row;
}

function entryText(array $e): string
{
    return (($e['polishState'] ?? '') === 'polished' && !empty($e['polished'])) ? $e['polished'] : (string) ($e['description'] ?? '');
}

function categoryLabel(string $id, array $snap): string
{
    foreach ($snap['customCategories'] ?? [] as $c) {
        if (($c['id'] ?? '') === $id) {
            return (string) $c['label'];
        }
    }
    return CATEGORY_LABELS[$id] ?? $id;
}

function fmtHours(float $h): string
{
    $m = (int) round($h * 60);
    return intdiv($m, 60) . 'h' . ($m % 60 ? ' ' . ($m % 60) . 'm' : '');
}

function plural(int $n, string $one, string $many): string
{
    return $n . ' ' . ($n === 1 ? $one : $many);
}

function accountCard(array $a, ?array $request = null): string
{
    $p = $a['profile'];
    $cmp = function (?string $theirs, ?string $ours): string {
        if (!$theirs) {
            return '';
        }
        $same = $ours && mb_strtolower(trim($theirs)) === mb_strtolower(trim($ours));
        return $same ? ' <span class="match">✓ matches request</span>' : ' <span class="nomatch">✗ request says “' . h($theirs) . '”</span>';
    };
    $recent = '';
    foreach ($a['recent'] as $e) {
        $recent .= '<li><span class="muted">' . h($e['date'] ?? '') . '</span> ' . h(mb_strimwidth(entryText($e), 0, 140, '…')) . '</li>';
    }
    $csrf = h(csrfToken());
    $rid = $request ? '<input type="hidden" name="request" value="' . (int) $request['id'] . '">' : '';
    return '<div class="card"><h2>Account @' . h($a['username']) . '</h2><dl>'
        . '<dt>Full name</dt><dd>' . h($a['full_name']) . ($request ? $cmp($request['full_name'], $a['full_name']) : '') . '</dd>'
        . '<dt>Course</dt><dd>' . h($p['course'] ?? '') . '</dd>'
        . '<dt>Company</dt><dd>' . h($p['company'] ?? '') . ($request ? $cmp($request['company'], $p['company'] ?? null) : '') . '</dd>'
        . '<dt>Supervisor</dt><dd>' . h($p['supervisor'] ?? '') . ($request ? $cmp($request['supervisor'], $p['supervisor'] ?? null) : '') . '</dd>'
        . '<dt>Created</dt><dd>' . h($a['created_at']) . '</dd>'
        . '<dt>Last backup</dt><dd>' . h($a['backup_at'] ?? 'never') . '</dd>'
        . '<dt>Backed up</dt><dd>' . plural($a['entry_count'], 'entry', 'entries') . ' · ' . fmtHours((float) $a['hours']) . ' · ' . plural($a['photo_count'], 'photo', 'photos') . '</dd>'
        . '<dt>Signed-in phones</dt><dd>' . (int) $a['devices'] . '</dd>'
        . '</dl>'
        . ($recent ? '<h2 style="margin-top:1rem">Latest entries</h2><ul>' . $recent . '</ul>' : '')
        . '<div class="row" style="margin-top:1rem">'
        . '<form method="post" action="' . selfUrl() . '" class="row">'
        . '<input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="username" value="' . h($a['username']) . '">' . $rid
        . '<label style="display:flex;gap:.5rem;align-items:center;margin:0;font-weight:500"><input type="checkbox" name="verified" value="1" required style="width:auto"> I verified this student owns @' . h($a['username']) . '</label>'
        . '<button name="do" value="reset-code">Reset recovery code</button></form>'
        . ($a['snapshot'] ? '<a class="button secondary" href="' . selfUrl(['download' => $a['username']]) . '">Download files (.zip)</a>' : '<span class="muted">No backup to download yet.</span>')
        . '</div></div>';
}

// --- Actions ------------------------------------------------------------------------------

if ($do === 'reset-code') {
    requireCsrf();
    if (empty($_POST['verified'])) {
        page('Not verified', '<p>Tick “I verified this student” first. Use your browser’s back button.</p>');
    }
    $account = loadAccount(normalizeUsername($_POST['username'] ?? ''));
    if (!$account) {
        page('Not found', '<p>Account not found.</p>');
    }
    $code = newRecoveryCode();
    $pdo = db();
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE accounts SET code_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')
        ->execute([password_hash(normalizeCode($code), PASSWORD_DEFAULT), $account['id']]);
    $pdo->prepare('DELETE FROM account_tokens WHERE account_id = ?')->execute([$account['id']]);
    $request = null;
    if (!empty($_POST['request'])) {
        $pdo->prepare(
            "UPDATE recovery_requests SET status = 'resolved', resolved_at = NOW(),
               admin_note = CONCAT_WS('\n', admin_note, ?) WHERE id = ?"
        )->execute(['Recovery code reset for @' . $account['username'] . ' on ' . date('Y-m-d H:i'), (int) $_POST['request']]);
        $stmt = $pdo->prepare('SELECT * FROM recovery_requests WHERE id = ?');
        $stmt->execute([(int) $_POST['request']]);
        $request = $stmt->fetch() ?: null;
    }
    $pdo->commit();

    $message = "Hi {$account['full_name']}! Your ohjeyti account @{$account['username']} has a new recovery code:\n\n{$code}\n\n"
        . "To get your logs back: open ohjeyti, tap \"I already have an account\", then enter your username ({$account['username']}) and this code.\n"
        . "Your old code no longer works. Save this one and don't share it.";
    $contact = $request['contact'] ?? '';
    $mail = filter_var($contact, FILTER_VALIDATE_EMAIL)
        ? '<a class="button" href="mailto:' . h($contact) . '?subject=' . rawurlencode('Your ohjeyti recovery code') . '&body=' . rawurlencode($message) . '">Email it to ' . h($contact) . '</a>'
        : ($contact ? '<p>Send it to: <b>' . h($contact) . '</b></p>' : '');

    page('New code', '<h1>New recovery code for @' . h($account['username']) . '</h1><div class="card">'
        . '<p class="code">' . h($code) . '</p>'
        . '<p class="notice">This is shown once. The old code no longer works and all phones on this account were signed out.</p>'
        . '<h2 style="margin-top:1rem">Message to send</h2><pre>' . h($message) . '</pre>'
        . '<div class="row" style="margin-top:1rem">' . $mail . '<a class="button secondary" href="' . selfUrl() . '">Back to requests</a></div>'
        . '</div>');
}

if ($do === 'set-status') {
    requireCsrf();
    $status = in_array($_POST['status'] ?? '', ['pending', 'resolved', 'rejected'], true) ? $_POST['status'] : 'pending';
    db()->prepare(
        "UPDATE recovery_requests SET status = ?, resolved_at = IF(? = 'pending', NULL, NOW()),
           admin_note = NULLIF(TRIM(?), '') WHERE id = ?"
    )->execute([$status, $status, (string) ($_POST['note'] ?? ''), (int) ($_POST['request'] ?? 0)]);
    header('Location: ' . basename($_SERVER['SCRIPT_NAME']) . '?request=' . (int) ($_POST['request'] ?? 0));
    exit;
}

// Download a student's files as a .zip
if (isset($_GET['download'])) {
    $account = loadAccount(normalizeUsername($_GET['download']));
    if (!$account || !$account['snapshot']) {
        page('Not found', '<p>No backup for that account.</p>');
    }
    if (!class_exists('ZipArchive')) {
        page('Unavailable', '<p>The PHP zip extension is not enabled on this server. Enable it in hPanel → Advanced → PHP Configuration.</p>');
    }
    $snap = $account['snapshot'];
    $tmp = tempnam(sys_get_temp_dir(), 'ojz');
    $zip = new ZipArchive();
    $zip->open($tmp, ZipArchive::OVERWRITE);

    $csv = function (array $rows): string {
        $f = fopen('php://temp', 'r+');
        fwrite($f, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows accents correctly
        foreach ($rows as $r) {
            fputcsv($f, $r);
        }
        rewind($f);
        return stream_get_contents($f);
    };

    // Photos, named by date so they sort in order
    $photoNames = [];
    $dir = photoDir((int) $account['id']);
    $entries = $snap['entries'] ?? [];
    usort($entries, fn ($a, $b) => [$a['date'] ?? '', $a['createdAt'] ?? 0] <=> [$b['date'] ?? '', $b['createdAt'] ?? 0]);
    $perDay = [];
    foreach ($entries as $e) {
        foreach ($e['photos'] ?? [] as $p) {
            $file = $dir . '/' . basename((string) ($p['id'] ?? ''));
            if (!is_file($file)) {
                continue;
            }
            $day = (string) ($e['date'] ?? 'undated');
            $perDay[$day] = ($perDay[$day] ?? 0) + 1;
            $name = sprintf('photos/%s_%02d.jpg', $day, $perDay[$day]);
            $zip->addFile($file, $name);
            $photoNames[$p['id']] = $name;
        }
    }

    $logRows = [['Date', 'Weekday', 'Category', 'Entry', 'Original notes', 'Photos']];
    foreach ($entries as $e) {
        $ts = strtotime((string) ($e['date'] ?? ''));
        $logRows[] = [
            $e['date'] ?? '',
            $ts ? date('l', $ts) : '',
            categoryLabel((string) ($e['category'] ?? ''), $snap),
            entryText($e),
            (string) ($e['description'] ?? ''),
            implode(', ', array_filter(array_map(fn ($p) => $photoNames[$p['id'] ?? ''] ?? null, $e['photos'] ?? []))),
        ];
    }
    $zip->addFromString('logs.csv', $csv($logRows));

    $byDate = [];
    foreach ($snap['shifts'] ?? [] as $s) {
        $d = (string) ($s['date'] ?? '');
        $byDate[$d] ??= ['in' => null, 'out' => null, 'hours' => 0.0];
        $byDate[$d]['hours'] += (float) ($s['hours'] ?? 0);
        if (!empty($s['start'])) {
            $byDate[$d]['in'] = min($byDate[$d]['in'] ?? PHP_INT_MAX, (int) $s['start']);
            $byDate[$d]['out'] = max($byDate[$d]['out'] ?? 0, (int) $s['end']);
        }
    }
    ksort($byDate);
    $dtr = [['Date', 'Time in', 'Time out', 'Hours']];
    foreach ($byDate as $d => $x) {
        $dtr[] = [$d, $x['in'] ? date('g:i A', intdiv($x['in'], 1000)) : '', $x['out'] ? date('g:i A', intdiv($x['out'], 1000)) : '', round($x['hours'], 2)];
    }
    $dtr[] = ['Total', '', '', round(array_sum(array_column($byDate, 'hours')), 2)];
    $zip->addFromString('daily-time-record.csv', $csv($dtr));

    $zip->addFromString('backup.json', json_encode($snap, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $zip->addFromString('README.txt', "ohjeyti backup for {$account['full_name']} (@{$account['username']})\n"
        . 'Last backed up: ' . ($account['backup_at'] ?? '') . "\n\n"
        . "logs.csv                 every log entry (open in Excel or Google Sheets)\n"
        . "daily-time-record.csv    time in, time out, and hours per day\n"
        . "photos/                  photos attached to your entries, named by date\n"
        . "backup.json              the raw backup data\n\n"
        . "To get everything back inside the app instead, ask the admin for a new recovery code.\n");
    $zip->close();

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="ohjeyti-' . $account['username'] . '-' . date('Y-m-d') . '.zip"');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp);
    unlink($tmp);
    exit;
}

// --- Pages ----------------------------------------------------------------------------------

// One request, with matching accounts beside it
if (isset($_GET['request'])) {
    $stmt = db()->prepare('SELECT * FROM recovery_requests WHERE id = ?');
    $stmt->execute([(int) $_GET['request']]);
    $r = $stmt->fetch();
    if (!$r) {
        page('Not found', '<p>Request not found.</p>');
    }

    $accounts = [];
    if ($r['username'] && ($a = loadAccount($r['username']))) {
        $accounts[] = $a;
    }
    // Username missing or wrong: suggest accounts with a similar name
    if (!$accounts) {
        $words = preg_split('/\s+/u', trim($r['full_name']));
        $stmt = db()->prepare('SELECT username FROM accounts WHERE full_name LIKE ? OR full_name LIKE ? LIMIT 8');
        $stmt->execute(['%' . end($words) . '%', '%' . $words[0] . '%']);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $u) {
            $accounts[] = loadAccount($u);
        }
    }

    $csrf = h(csrfToken());
    $statusForm = '<form method="post" action="' . selfUrl() . '"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="request" value="' . (int) $r['id'] . '">'
        . '<label for="st">Status</label><select id="st" name="status">'
        . implode('', array_map(fn ($s) => '<option value="' . $s . '"' . ($r['status'] === $s ? ' selected' : '') . '>' . ucfirst($s) . '</option>', ['pending', 'resolved', 'rejected']))
        . '</select><label for="note">Note (only you see this)</label><textarea id="note" name="note" rows="3">' . h($r['admin_note']) . '</textarea>'
        . '<p><button class="secondary" name="do" value="set-status">Save</button></p></form>';

    $accountsHtml = $accounts
        ? implode('', array_map(fn ($a) => accountCard($a, $r), $accounts))
        : '<div class="card"><p class="nomatch">No account found with that username or a similar name.</p></div>';

    page('Request #' . $r['id'], '<p><a href="' . selfUrl() . '">← All requests</a></p>'
        . '<h1>Request #' . (int) $r['id'] . ' <span class="pill ' . h($r['status']) . '">' . h($r['status']) . '</span></h1>'
        . '<p class="notice">Check the request against the account before acting. Only reset the code if the details match what only the owner would know.</p>'
        . '<div class="grid"><div><div class="card"><h2>What the student says</h2><dl>'
        . '<dt>Sent</dt><dd>' . h($r['created_at']) . '</dd>'
        . '<dt>Username</dt><dd>' . ($r['username'] ? '@' . h($r['username']) : '<span class="muted">forgot</span>') . '</dd>'
        . '<dt>Full name</dt><dd>' . h($r['full_name']) . '</dd>'
        . '<dt>Contact</dt><dd>' . h($r['contact']) . '</dd>'
        . '<dt>School / course</dt><dd>' . h($r['school']) . '</dd>'
        . '<dt>Company</dt><dd>' . h($r['company']) . '</dd>'
        . '<dt>Supervisor</dt><dd>' . h($r['supervisor']) . '</dd>'
        . '</dl><h2 style="margin-top:1rem">Details</h2><pre>' . h($r['details']) . '</pre></div>'
        . '<div class="card">' . $statusForm . '</div></div>'
        . '<div>' . $accountsHtml . '</div></div>');
}

// Look up any account directly
if (isset($_GET['account'])) {
    $a = loadAccount(normalizeUsername($_GET['account']));
    page('Account', '<p><a href="' . selfUrl() . '">← All requests</a></p>'
        . ($a ? accountCard($a) : '<div class="card"><p class="nomatch">No account @' . h($_GET['account']) . '.</p></div>'));
}

// Request list
$filter = in_array($_GET['status'] ?? '', ['pending', 'resolved', 'rejected', 'all'], true) ? $_GET['status'] : 'pending';
$stmt = $filter === 'all'
    ? db()->query('SELECT * FROM recovery_requests ORDER BY created_at DESC LIMIT 200')
    : db()->prepare('SELECT * FROM recovery_requests WHERE status = ? ORDER BY created_at DESC LIMIT 200');
if ($filter !== 'all') {
    $stmt->execute([$filter]);
}
$rows = '';
foreach ($stmt->fetchAll() as $r) {
    $rows .= '<tr><td><a href="' . selfUrl(['request' => $r['id']]) . '">#' . (int) $r['id'] . '</a></td>'
        . '<td>' . h($r['full_name']) . '<br><span class="muted">' . ($r['username'] ? '@' . h($r['username']) : 'username forgotten') . '</span></td>'
        . '<td>' . h($r['contact']) . '</td><td>' . h($r['created_at']) . '</td>'
        . '<td><span class="pill ' . h($r['status']) . '">' . h($r['status']) . '</span></td></tr>';
}
$tabs = implode(' · ', array_map(
    fn ($s) => $s === $filter ? '<b>' . ucfirst($s) . '</b>' : '<a href="' . selfUrl(['status' => $s]) . '">' . ucfirst($s) . '</a>',
    ['pending', 'resolved', 'rejected', 'all'],
));
page('Requests', '<h1>Help requests</h1>'
    . '<div class="card"><form method="get" class="row"><input name="account" placeholder="Look up a username" style="max-width:280px"><button class="secondary">Find</button></form></div>'
    . '<p>' . $tabs . '</p>'
    . '<div class="card">' . ($rows ? '<table><tr><th>#</th><th>Student</th><th>Contact</th><th>Sent</th><th>Status</th></tr>' . $rows . '</table>' : '<p class="muted">No ' . ($filter === 'all' ? '' : $filter . ' ') . 'requests.</p>') . '</div>');
