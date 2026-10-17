<?php
/**
 * Shared helpers for the ohjeyti server scripts (account.php, admin.php).
 * Upload next to them, e.g. public_html/api/_lib.php. It only defines
 * functions, so requesting it directly does nothing.
 */

declare(strict_types=1);

if (!isset($config)) {
    $config = require dirname(__DIR__, 2) . '/ohjeyti-config.php';
}

if (!headers_sent()) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
}

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
const CODE_LENGTH = 16;

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

/** Fixed-window rate limit per client IP and action. */
function isRateLimited(string $action, int $max, int $windowSeconds): bool
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
    return (int) $stmt->fetchColumn() > $max;
}

function normalizeUsername(mixed $value): string
{
    return is_string($value) ? strtolower(trim($value)) : '';
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

function photoDir(int $accountId): string
{
    global $config;
    return rtrim($config['data_dir'], '/\\') . "/photos/$accountId";
}
