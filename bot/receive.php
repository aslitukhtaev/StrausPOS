<?php
/**
 * Kassa dasturidan (Delfin Sauna) keladigan so'rovlarni qabul qiladi: holat nusxasi + smena voqealari.
 * Himoya: sarlavha X-Bot-Secret config.php dagi 'secret' bilan bir xil bo'lishi shart. HTTPS tavsiya etiladi.
 */
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');

$secret = (string) (isset(cfg()['secret']) ? cfg()['secret'] : '');
$given = isset($_SERVER['HTTP_X_BOT_SECRET']) ? (string) $_SERVER['HTTP_X_BOT_SECRET'] : '';
if ($secret === '' || !hash_equals($secret, $given)) {
    http_response_code(403);
    echo json_encode(array('ok' => false, 'error' => 'secret'));
    exit;
}
if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('ok' => false, 'error' => 'POST kerak'));
    exit;
}

$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'error' => 'JSON noto\'g\'ri'));
    exit;
}

if (isset($in['snapshot']) && is_array($in['snapshot'])) {
    $snap = $in['snapshot'];
    $snap['received_at'] = time();
    write_json('snapshot.json', $snap);
}

$queued = 0;
if (isset($in['events']) && is_array($in['events'])) {
    foreach ($in['events'] as $ev) {
        if (queue_event($ev)) {
            $queued++;
        }
    }
}

// Darhol yuborishga urinish (cron ham har daqiqada qayta urinadi)
$sent = $queued > 0 ? deliver_outbox() : 0;

echo json_encode(array('ok' => true, 'queued' => $queued, 'sent' => $sent));
