<?php
/**
 * ohjeyti: accounts and online backup.
 *
 * A student creates an account with only a username and full name. Instead of
 * a password they get a one-time recovery code; with username + code they can
 * restore their logs on a new or reinstalled phone. Day to day the device uses
 * a random token, so the code is only ever needed for restoring.
 *
 * Deploy (Hostinger):
 *   1. Run account-setup.sql in phpMyAdmin.
 *   2. Upload this file to public_html/api/account.php
 *   3. Fill in the database and data_dir settings in ohjeyti-config.php
 *      (one level above public_html).
 *   4. Set VITE_ACCOUNT_API_URL=https://yourdomain.com/api/account.php and redeploy the app.
 *
 * Actions (?action=...):
 *   GET  check&username=x       -> { available }
 *   POST register               { username, fullName }      -> { username, fullName, recoveryCode, token }
 *   POST restore                { username, recoveryCode }  -> { username, fullName, token, hasBackup }
 *   POST backup        [token]  { snapshot, fullName? }     -> { updatedAt }
 *   GET  snapshot      [token]                              -> { snapshot, updatedAt }
 *   GET  photos        [token]                              -> { ids }
 *   POST photo&id=x    [token]  raw image bytes             -> { ok }
 *   GET  photo&id=x    [token]                              -> image bytes
 *   POST delete        [token]                              -> { deleted }
 * [token] = header X-Ohjeyti-Token.
 */

declare(strict_types=1);

$config = require dirname(__DIR__, 2) . '/ohjeyti-config.php';

const USERNAME_PATTERN = '/^[a-z][a-z0-9._]{2,19}$/';
const RESERVED_USERNAMES = ['admin', 'administrator', 'root', 'support', 'ohjeyti', 'api', 'null', 'undefined', 'system'];
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
const CODE_LENGTH = 16;
const MAX_FAILED_RESTORES = 5;
const LOCK_MINUTES = 15;
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_PHOTOS_PER_ACCOUNT = 3000;

header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// --- CORS --------------------------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    if (!in_array($origin, $config['allowed_origins'], true)) {
        respond(403, ['error' => 'Origin not allowed.']);
    }
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Ohjeyti-Token');
    header('Access-Control-Max-Age: 86400');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --- Helpers -------------------------------------------------------------------------
function db(): PDO
{
    static $pdo;
    global $config;
    $pdo ??= new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db']['host'], $config['db']['name']),
        $config['db']['user'],
        $config['db']['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ],
    );
    return $pdo;
}

function requireMethod(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        respond(405, ['error' => "Use $method."]);
    }
}

function jsonBody(int $maxBytes = 65536): array
{
    $raw = (string) file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if (strlen($raw) > $maxBytes) {
        respond(413, ['error' => 'Request is too large.']);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['error' => 'Expected a JSON body.']);
    }
    return $data;
}

/** Fixed-window rate limit per client IP and action. */
function rateLimit(string $action, int $max, int $windowSeconds): void
{
    $bucket = hash('sha256', $action . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $pdo = db();
    $pdo->prepare(
        'INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, NOW())
         ON DUPLICATE KEY UPDATE
           hits = IF(window_start < NOW() - INTERVAL ? SECOND, 1, hits + 1),
           window_start = IF(window_start < NOW() - INTERVAL ? SECOND, NOW(), window_start)'
    )->execute([$bucket, $windowSeconds, $windowSeconds]);
    $stmt = $pdo->prepare('SELECT hits FROM rate_limits WHERE bucket = ?');
    $stmt->execute([$bucket]);
    if ((int) $stmt->fetchColumn() > $max) {
        header('Retry-After: ' . $windowSeconds);
        respond(429, ['error' => 'Too many requests. Please try again later.']);
    }
}

function normalizeUsername(mixed $value): string
{
    return is_string($value) ? strtolower(trim($value)) : '';
}

function usernameProblem(string $username): ?string
{
    if (!preg_match(USERNAME_PATTERN, $username)) {
        return 'Use 3 to 20 characters: lowercase letters, numbers, dots, or underscores, starting with a letter.';
    }
    if (in_array($username, RESERVED_USERNAMES, true)) {
        return 'That username is reserved. Please choose another.';
    }
    return null;
}

function newRecoveryCode(): string
{
    $code = '';
    for ($i = 0; $i < CODE_LENGTH; $i++) {
        $code .= CODE_ALPHABET[random_int(0, strlen(CODE_ALPHABET) - 1)];
    }
    return implode('-', str_split($code, 4)); // XXXX-XXXX-XXXX-XXXX
}

function normalizeCode(mixed $value): string
{
    return is_string($value) ? preg_replace('/[^A-Z0-9]/', '', strtoupper($value)) : '';
}

function issueToken(int $accountId): string
{
    $token = bin2hex(random_bytes(32));
    db()->prepare('INSERT INTO account_tokens (token_hash, account_id) VALUES (?, ?)')
        ->execute([hash('sha256', $token), $accountId]);
    return $token;
}

/** The account that owns the request's token, or a 401. */
function authenticate(): array
{
    $token = $_SERVER['HTTP_X_OHJEYTI_TOKEN'] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        respond(401, ['error' => 'Not signed in.']);
    }
    $hash = hash('sha256', $token);
    $stmt = db()->prepare(
        'SELECT a.id, a.username, a.full_name FROM account_tokens t JOIN accounts a ON a.id = t.account_id WHERE t.token_hash = ?'
    );
    $stmt->execute([$hash]);
    $account = $stmt->fetch();
    if (!$account) {
        respond(401, ['error' => 'This device is no longer signed in. Restore your account again.']);
    }
    db()->prepare('UPDATE account_tokens SET last_used_at = NOW() WHERE token_hash = ?')->execute([$hash]);
    return $account;
}

function photoDir(int $accountId): string
{
    global $config;
    return rtrim($config['data_dir'], '/\\') . "/photos/$accountId";
}

function photoId(): string
{
    $id = $_GET['id'] ?? '';
    if (!is_string($id) || !preg_match('/^[A-Za-z0-9-]{8,64}$/', $id)) {
        respond(400, ['error' => 'Invalid photo id.']);
    }
    return $id;
}

// --- Actions -------------------------------------------------------------------------
try {
    switch ($_GET['action'] ?? '') {
        case 'check': {
            requireMethod('GET');
            rateLimit('check', 120, 3600);
            $username = normalizeUsername($_GET['username'] ?? '');
            if ($problem = usernameProblem($username)) {
                respond(200, ['available' => false, 'error' => $problem]);
            }
            $stmt = db()->prepare('SELECT 1 FROM accounts WHERE username = ?');
            $stmt->execute([$username]);
            respond(200, ['available' => !$stmt->fetchColumn()]);
        }

        case 'register': {
            requireMethod('POST');
            rateLimit('register', 10, 3600);
            $body = jsonBody();
            $username = normalizeUsername($body['username'] ?? '');
            $fullName = is_string($body['fullName'] ?? null) ? trim(preg_replace('/\s+/u', ' ', $body['fullName'])) : '';
            if ($problem = usernameProblem($username)) {
                respond(400, ['error' => $problem]);
            }
            if (mb_strlen($fullName) < 2 || mb_strlen($fullName) > 120) {
                respond(400, ['error' => 'Please enter your full name.']);
            }
            $code = newRecoveryCode();
            try {
                db()->prepare('INSERT INTO accounts (username, full_name, code_hash) VALUES (?, ?, ?)')
                    ->execute([$username, $fullName, password_hash(normalizeCode($code), PASSWORD_DEFAULT)]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') { // duplicate username
                    respond(409, ['error' => 'That username is already taken.']);
                }
                throw $e;
            }
            $accountId = (int) db()->lastInsertId();
            respond(201, [
                'username' => $username,
                'fullName' => $fullName,
                'recoveryCode' => $code,
                'token' => issueToken($accountId),
            ]);
        }

        case 'restore': {
            requireMethod('POST');
            rateLimit('restore', 30, 3600);
            $body = jsonBody();
            $username = normalizeUsername($body['username'] ?? '');
            $code = normalizeCode($body['recoveryCode'] ?? '');
            $wrong = 'That username and recovery code don\'t match.';

            $stmt = db()->prepare(
                'SELECT id, username, full_name, code_hash, failed_attempts, locked_until > NOW() AS locked,
                        CEIL(TIMESTAMPDIFF(SECOND, NOW(), locked_until) / 60) AS minutes_left
                 FROM accounts WHERE username = ?'
            );
            $stmt->execute([$username]);
            $account = $stmt->fetch();

            if (!$account) {
                // Spend the same time as a real check, so response timing doesn't reveal which usernames exist.
                password_verify($code, password_hash('timing', PASSWORD_DEFAULT));
                respond(401, ['error' => $wrong]);
            }
            if ($account['locked']) {
                respond(429, ['error' => "Too many wrong codes. Try again in {$account['minutes_left']} minutes."]);
            }
            if (strlen($code) !== CODE_LENGTH || !password_verify($code, $account['code_hash'])) {
                $failed = (int) $account['failed_attempts'] + 1;
                if ($failed >= MAX_FAILED_RESTORES) {
                    db()->prepare('UPDATE accounts SET failed_attempts = 0, locked_until = NOW() + INTERVAL ? MINUTE WHERE id = ?')
                        ->execute([LOCK_MINUTES, $account['id']]);
                    respond(429, ['error' => 'Too many wrong codes. Try again in ' . LOCK_MINUTES . ' minutes.']);
                }
                db()->prepare('UPDATE accounts SET failed_attempts = ? WHERE id = ?')->execute([$failed, $account['id']]);
                respond(401, ['error' => $wrong]);
            }

            db()->prepare('UPDATE accounts SET failed_attempts = 0, locked_until = NULL WHERE id = ?')->execute([$account['id']]);
            $stmt = db()->prepare('SELECT updated_at FROM backups WHERE account_id = ?');
            $stmt->execute([$account['id']]);
            $updatedAt = $stmt->fetchColumn();
            respond(200, [
                'username' => $account['username'],
                'fullName' => $account['full_name'],
                'token' => issueToken((int) $account['id']),
                'hasBackup' => (bool) $updatedAt,
                'updatedAt' => $updatedAt ?: null,
            ]);
        }

        case 'backup': {
            requireMethod('POST');
            $account = authenticate();
            rateLimit('backup', 240, 3600);
            $body = jsonBody(MAX_SNAPSHOT_BYTES);
            if (!is_array($body['snapshot'] ?? null) || ($body['snapshot']['version'] ?? null) !== 1) {
                respond(400, ['error' => 'Invalid backup.']);
            }
            db()->prepare(
                'INSERT INTO backups (account_id, snapshot, updated_at) VALUES (?, ?, NOW())
                 ON DUPLICATE KEY UPDATE snapshot = VALUES(snapshot), updated_at = NOW()'
            )->execute([$account['id'], json_encode($body['snapshot'], JSON_UNESCAPED_UNICODE)]);
            $fullName = is_string($body['fullName'] ?? null) ? trim($body['fullName']) : '';
            if ($fullName !== '' && mb_strlen($fullName) <= 120 && $fullName !== $account['full_name']) {
                db()->prepare('UPDATE accounts SET full_name = ? WHERE id = ?')->execute([$fullName, $account['id']]);
            }
            respond(200, ['updatedAt' => gmdate('c')]);
        }

        case 'snapshot': {
            requireMethod('GET');
            $account = authenticate();
            $stmt = db()->prepare('SELECT snapshot, updated_at FROM backups WHERE account_id = ?');
            $stmt->execute([$account['id']]);
            $row = $stmt->fetch();
            if (!$row) {
                respond(404, ['error' => 'No backup yet.']);
            }
            respond(200, ['snapshot' => json_decode($row['snapshot'], true), 'updatedAt' => $row['updated_at']]);
        }

        case 'photos': {
            requireMethod('GET');
            $account = authenticate();
            $files = glob(photoDir((int) $account['id']) . '/*') ?: [];
            respond(200, ['ids' => array_map('basename', $files)]);
        }

        case 'photo': {
            $account = authenticate();
            $dir = photoDir((int) $account['id']);
            $id = photoId();

            if ($_SERVER['REQUEST_METHOD'] === 'GET') {
                $file = "$dir/$id";
                if (!is_file($file)) {
                    respond(404, ['error' => 'Photo not found.']);
                }
                $type = (new finfo(FILEINFO_MIME_TYPE))->file($file) ?: 'application/octet-stream';
                header("Content-Type: $type");
                header('Content-Length: ' . filesize($file));
                header('Cache-Control: private, max-age=86400');
                readfile($file);
                exit;
            }

            requireMethod('POST');
            rateLimit('photo', 2000, 3600);
            $bytes = (string) file_get_contents('php://input', false, null, 0, MAX_PHOTO_BYTES + 1);
            if (strlen($bytes) > MAX_PHOTO_BYTES) {
                respond(413, ['error' => 'Photo is too large.']);
            }
            $info = @getimagesizefromstring($bytes);
            if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
                respond(400, ['error' => 'Only JPEG, PNG, or WebP photos can be backed up.']);
            }
            if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
                throw new RuntimeException("Could not create $dir");
            }
            if (!is_file("$dir/$id") && count(glob("$dir/*") ?: []) >= MAX_PHOTOS_PER_ACCOUNT) {
                respond(413, ['error' => 'Photo backup limit reached.']);
            }
            file_put_contents("$dir/$id", $bytes, LOCK_EX);
            respond(200, ['ok' => true]);
        }

        case 'delete': {
            requireMethod('POST');
            $account = authenticate();
            foreach (glob(photoDir((int) $account['id']) . '/*') ?: [] as $file) {
                unlink($file);
            }
            @rmdir(photoDir((int) $account['id']));
            db()->prepare('DELETE FROM accounts WHERE id = ?')->execute([$account['id']]); // cascades to tokens + backup
            respond(200, ['deleted' => true]);
        }

        default:
            respond(400, ['error' => 'Unknown action.']);
    }
} catch (Throwable $e) {
    error_log('[account] ' . $e->getMessage());
    respond(500, ['error' => 'Something went wrong on the server. Please try again.']);
}
