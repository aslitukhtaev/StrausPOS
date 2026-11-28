<?php
/**
 * Telegram webhook: xabar kelishi bilan darhol javob beradi (cron kutilmaydi).
 * Yoqish: diagnoz.php?key=...&webhook=on   |   O'chirish: &webhook=off
 */
require __DIR__ . '/lib.php';

$expect = webhook_secret();
$given = isset($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN']) ? (string) $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] : '';
if (!hash_equals($expect, $given)) {
    http_response_code(403);
    exit;
}

$u = json_decode((string) file_get_contents('php://input'), true);
http_response_code(200);
header('Content-Type: application/json');
echo '{"ok":true}';
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}

if (!is_array($u) || !isset($u['update_id'])) {
    exit;
}
with_lock('updates.lck', function () use ($u) {
    $st = read_json('wh_last.json', array('id' => 0));
    if ((int) $u['update_id'] <= (int) g($st, 'id', 0)) {
        return; // takroriy
    }
    write_json('wh_last.json', array('id' => (int) $u['update_id']));
    if (isset($u['message'])) {
        try {
            handle_message($u['message']);
        } catch (Throwable $e) {
            // jim
        }
    }
});
