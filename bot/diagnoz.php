<?php
/**
 * Tashxis sahifasi: https://sayt/delfin/diagnoz.php?key=<config.php dagi cron_key>
 * Token, Telegramga ulanish, webhook, papka huquqi va oxirgi holatni ko'rsatadi. Tokenni ko'rsatmaydi.
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

function line($ok, $label, $info = '')
{
    echo ($ok ? '[OK]   ' : '[XATO] ') . $label . ($info !== '' ? ' — ' . $info : '') . "\n";
}

$c = cfg();
echo "Delfin bot tashxisi\n===================\n";
line(version_compare(PHP_VERSION, '7.2', '>='), 'PHP versiyasi', PHP_VERSION);
line(function_exists('curl_init'), 'curl kengaytmasi', function_exists('curl_init') ? 'bor' : 'yo\'q (file_get_contents ishlatiladi)');
line(ini_get('allow_url_fopen') == 1 || function_exists('curl_init'), 'tashqi so\'rovlar', 'allow_url_fopen=' . ini_get('allow_url_fopen'));

$tok = (string) (isset($c['token']) ? $c['token'] : '');
$tokOk = $tok !== '' && strpos($tok, 'BOT_TOKEN') === false && preg_match('/^\d+:[A-Za-z0-9_-]{30,}$/', $tok);
line($tokOk, 'config.php dagi token shakli', $tokOk ? 'tokenning boshi: ' . substr($tok, 0, 10) . '...' : 'token yozilmagan yoki noto\'g\'ri (namuna qiymat qolgan bo\'lishi mumkin)');
line(!empty($c['secret']) && strpos((string) $c['secret'], 'TASODIFIY') === false, 'secret', !empty($c['secret']) ? 'qo\'yilgan' : 'bo\'sh');
line(!empty($c['pair_code']), 'pair_code', isset($c['pair_code']) ? (string) $c['pair_code'] : 'bo\'sh');

$dir = isset($c['data_dir']) ? $c['data_dir'] : __DIR__ . '/data';
$probe = $dir . DIRECTORY_SEPARATOR . 'probe.tmp';
$w = @file_put_contents($probe, 'x') !== false;
@unlink($probe);
line($w, 'data papkasiga yozish', $dir);

echo "data/ fayllari:\n";
foreach (glob($dir . '/*') as $f) {
    $own = function_exists('posix_getpwuid') && @fileowner($f) !== false ? (@posix_getpwuid(fileowner($f))['name'] ?? fileowner($f)) : '?';
    echo '   ' . basename($f) . '  egasi=' . $own . '  yozish=' . (is_writable($f) ? 'ha' : 'YO\'Q') . "\n";
}
$me0 = function_exists('posix_geteuid') && function_exists('posix_getpwuid') ? (@posix_getpwuid(posix_geteuid())['name'] ?? '?') : '?';
echo '   (hozirgi jarayon foydalanuvchisi: ' . $me0 . ")\n";

// Webhook yoqish/o'chirish
if (isset($_GET['webhook'])) {
    if ($_GET['webhook'] === 'on') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $whUrl = 'https://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/webhook.php';
        $r = tg('setWebhook', array('url' => $whUrl, 'secret_token' => webhook_secret(), 'allowed_updates' => array('message'), 'max_connections' => 4), 20);
        if (is_array($r) && !empty($r['ok'])) {
            write_json('mode.json', array('webhook' => true));
            line(true, 'webhook YOQILDI', $whUrl);
        } else {
            line(false, 'webhook yoqilmadi', is_array($r) ? json_encode($r, JSON_UNESCAPED_UNICODE) : $GLOBALS['TG_LAST_ERR']);
        }
    } else {
        $r = tg('deleteWebhook', array(), 15);
        write_json('mode.json', array('webhook' => false));
        line(is_array($r) && !empty($r['ok']), 'webhook O\'CHIRILDI (cron rejimi)');
    }
}
echo 'Rejim: ' . (webhook_enabled() ? 'WEBHOOK (darhol javob)' : 'cron (har daqiqa)') . "\n";

$GLOBALS['TG_LAST_ERR'] = '';
$me = tg('getMe', array(), 15);
if ($me && !empty($me['ok'])) {
    line(true, 'Telegramga ulanish va token', 'bot: @' . $me['result']['username']);
} else {
    $why = $GLOBALS['TG_LAST_ERR'] !== '' ? $GLOBALS['TG_LAST_ERR'] : (is_array($me) ? json_encode($me, JSON_UNESCAPED_UNICODE) : 'javob yo\'q');
    line(false, 'Telegramga ulanish', $why);
    echo "   Agar 'curl: Connection timed out' / 'Could not resolve host' bo'lsa: hosting api.telegram.org ga chiqa olmaydi (hosting yoki provayder bloklagan).\n";
    echo "   Agar 401 Unauthorized bo'lsa: config.php dagi token noto'g'ri.\n";
}

$wh = tg('getWebhookInfo', array(), 15);
if ($wh && !empty($wh['ok'])) {
    $url = (string) $wh['result']['url'];
    line($url === '', 'webhook', $url === '' ? 'yo\'q (to\'g\'ri)' : 'O\'RNATILGAN: ' . $url . ' — deleteWebhook kerak');
    echo '       kutayotgan xabarlar: ' . (int) $wh['result']['pending_update_count'] . "\n";
}

$st = read_json('offset.json', array('o' => 0));
echo 'offset.json: ' . json_encode($st) . "\n";

// Jonli tekshiruv: navbatdagi xabarlarni O'QIYDI, lekin o'chirmaydi (offset o'zgarmaydi)
$GLOBALS['TG_LAST_ERR'] = '';
$peek = webhook_enabled() ? array('ok' => true, 'result' => array()) : tg('getUpdates', array('offset' => (int) (isset($st['o']) ? $st['o'] : 0), 'timeout' => 0, 'limit' => 10, 'allowed_updates' => array('message')), 15);
if (!is_array($peek)) {
    line(false, 'getUpdates', $GLOBALS['TG_LAST_ERR'] !== '' ? $GLOBALS['TG_LAST_ERR'] : 'javob yo\'q');
} elseif (empty($peek['ok'])) {
    line(false, 'getUpdates', json_encode($peek, JSON_UNESCAPED_UNICODE));
} else {
    line(true, 'getUpdates', count($peek['result']) . ' ta xabar navbatda (offset dan keyin)');
    foreach ($peek['result'] as $u) {
        $m = isset($u['message']) ? $u['message'] : array();
        echo '       update_id=' . $u['update_id'] . ' chat=' . (isset($m['chat']['id']) ? $m['chat']['id'] : '?') . ' matn="' . (isset($m['text']) ? $m['text'] : '') . "\"\n";
    }
}
// Offset eskirgan bo'lsa (xabarlar offset dan oldingi raqamda) — tiklash: ?reset=1
if (isset($_GET['reset'])) {
    write_json('offset.json', array('o' => 0));
    echo "offset.json nolga tushirildi.\n";
}

// Ulangan chatga sinov xabari: ?send=1
foreach (chat_list() as $ch) {
    echo 'Ulangan chat: ' . $ch['id'] . ' (' . (isset($ch['name']) ? $ch['name'] : '') . ")\n";
    if (isset($_GET['send'])) {
        $GLOBALS['TG_LAST_ERR'] = '';
        $r = tg('sendMessage', array('chat_id' => $ch['id'], 'text' => 'Sinov xabari ✅'), 15);
        line(is_array($r) && !empty($r['ok']), 'sendMessage → ' . $ch['id'], is_array($r) ? json_encode($r, JSON_UNESCAPED_UNICODE) : $GLOBALS['TG_LAST_ERR']);
    }
}
$snap = read_json('snapshot.json', null);
if (is_array($snap) && isset($snap['received_at'])) {
    line(true, 'kassa dasturidan oxirgi ma\'lumot', date('Y-m-d H:i:s', (int) $snap['received_at']) . ' (' . round((time() - (int) $snap['received_at']) / 60) . ' daqiqa oldin)');
} else {
    line(false, 'kassa dasturidan ma\'lumot', 'hali kelmagan');
}
echo 'Chatlar soni: ' . count(chat_list()) . "\n";
