<?php
/**
 * Cron: har daqiqada ishga tushiring.
 *   * * * * * php /yo'l/bot/cron.php >/dev/null 2>&1
 * (veb orqali: https://sayt/bot/cron.php?key=<config.php dagi cron_key>)
 * Vazifasi: Telegramdan buyruqlarni olib javob berish va navbatdagi smena xabarlarini yuborish.
 */
require __DIR__ . '/lib.php';

if (PHP_SAPI !== 'cli') {
    $key = (string) (isset(cfg()['cron_key']) ? cfg()['cron_key'] : '');
    $given = isset($_GET['key']) ? (string) $_GET['key'] : '';
    if ($key === '' || !hash_equals($key, $given)) {
        http_response_code(403);
        exit;
    }
    header('Content-Type: text/plain; charset=utf-8');
}
@set_time_limit(50);

$n = with_lock('updates.lck', function () {
    return process_updates();
});
$sent = deliver_outbox();
echo 'ok updates=' . $n . ' sent=' . $sent . "\n";
if (!empty($GLOBALS['TG_SEND_ERR'])) {
    echo 'yuborish xatosi: ' . $GLOBALS['TG_SEND_ERR'] . "\n";
}
