<?php
/**
 * Delfin Sauna — Telegram bot (oddiy PHP, cron). Kutubxona: sozlama, fayl ombori, Telegram API, xabar matnlari, buyruqlar.
 *
 * Ishlash tartibi:
 *   - Kassa dasturi (Delfin Sauna) har daqiqada receive.php ga holat nusxasini (JSON) yuboradi — data/snapshot.json
 *   - Smena ochilganda/yopilganda dastur voqea yuboradi — navbatga (outbox) tushadi va ulangan chatlarga xabar bo'ladi
 *   - cron.php (har daqiqada) Telegramdan buyruqlarni oladi (getUpdates), snapshot asosida javob beradi va navbatni yuboradi
 * PHP 7.2+ (curl bo'lsa curl, bo'lmasa file_get_contents). Tashqi kutubxona yo'q.
 */

function cfg()
{
    static $c = null;
    if ($c === null) {
        if (isset($GLOBALS['BOT_CONFIG']) && is_array($GLOBALS['BOT_CONFIG'])) {
            $c = $GLOBALS['BOT_CONFIG'];
        } else {
            $f = __DIR__ . '/config.php';
            if (!is_file($f)) {
                http_response_code(500);
                echo "config.php topilmadi (config.example.php dan nusxa oling)\n";
                exit(1);
            }
            $c = require $f;
        }
        date_default_timezone_set(isset($c['timezone']) ? $c['timezone'] : 'Asia/Tashkent');
    }
    return $c;
}

/* ───────────── Fayl ombori (data/) ───────────── */

function data_path($name)
{
    $c = cfg();
    $dir = isset($c['data_dir']) ? $c['data_dir'] : (__DIR__ . '/data');
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . $name;
}

function read_json($name, $default)
{
    $f = data_path($name);
    if (!is_file($f)) {
        return $default;
    }
    $j = json_decode((string) file_get_contents($f), true);
    return $j === null ? $default : $j;
}

function write_json($name, $data)
{
    $r = @file_put_contents(
        data_path($name),
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
        LOCK_EX
    );
    if ($r === false) {
        $GLOBALS['TG_SEND_ERR'] = 'fayl yozib bo\x27lmadi: ' . $name . ' (papka/fayl huquqini tekshiring)';
        return false;
    }
    return true;
}

/** Bir vaqtda bitta jarayon (cron ustma-ust tushsa ham xabar ikki marta ketmasin) */
function with_lock($name, $fn)
{
    $fp = fopen(data_path($name), 'c');
    if (!$fp) {
        return $fn();
    }
    flock($fp, LOCK_EX);
    try {
        return $fn();
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

/* ───────────── Telegram API ───────────── */

function tg($method, $params = array(), $timeout = 20)
{
    if (isset($GLOBALS['TG_STUB']) && is_callable($GLOBALS['TG_STUB'])) {
        return call_user_func($GLOBALS['TG_STUB'], $method, $params);
    }
    $url = 'https://api.telegram.org/bot' . cfg()['token'] . '/' . $method;
    $body = json_encode($params, JSON_UNESCAPED_UNICODE);
    $res = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => array('Content-Type: application/json'),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
        ));
        $res = curl_exec($ch);
        if ($res === false) {
            $GLOBALS['TG_LAST_ERR'] = 'curl: ' . curl_error($ch);
        }
        curl_close($ch);
    } else {
        $ctx = stream_context_create(array('http' => array(
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $body,
            'timeout' => $timeout,
            'ignore_errors' => true,
        )));
        $res = @file_get_contents($url, false, $ctx);
        if ($res === false) {
            $e = error_get_last();
            $GLOBALS['TG_LAST_ERR'] = 'http: ' . ($e ? $e['message'] : 'ulanib bo\'lmadi');
        }
    }
    if (!is_string($res)) {
        return null;
    }
    $j = json_decode($res, true);
    return is_array($j) ? $j : null;
}

/** Xabar yuborish (4096 belgidan uzun bo'lsa qatorlar bo'yicha bo'lib). true — hammasi ketdi */
function send($chat, $text, $keyboard = null)
{
    $parts = array();
    $cur = '';
    foreach (explode("\n", $text) as $line) {
        if (strlen($cur) + strlen($line) + 1 > 3500 && $cur !== '') {
            $parts[] = $cur;
            $cur = '';
        }
        $cur .= ($cur === '' ? '' : "\n") . $line;
    }
    if ($cur !== '') {
        $parts[] = $cur;
    }
    $ok = true;
    foreach ($parts as $i => $p) {
        $params = array('chat_id' => $chat, 'text' => $p);
        if ($keyboard !== null && $i === count($parts) - 1) {
            $params['reply_markup'] = $keyboard;
        }
        $r = tg('sendMessage', $params);
        if (!$r || empty($r['ok'])) {
            $ok = false;
            $GLOBALS['TG_SEND_ERR'] = is_array($r) ? json_encode($r, JSON_UNESCAPED_UNICODE) : (isset($GLOBALS['TG_LAST_ERR']) ? $GLOBALS['TG_LAST_ERR'] : 'javob yoq');
        }
    }
    return $ok;
}

function main_keyboard()
{
    return array(
        'keyboard' => array(
            array(array('text' => '📊 Joriy smena'), array('text' => '🕒 Smenalar')),
            array(array('text' => '🚪 Xonalar'), array('text' => '🍺 Ostatka')),
            array(array('text' => '📈 Bugun')),
        ),
        'resize_keyboard' => true,
    );
}

/* ───────────── Matn formatlari ───────────── */

function money($n)
{
    return number_format((float) $n, 0, '', ' ');
}

function hm($ms)
{
    return date('H:i', intdiv((int) $ms, 1000));
}

function dm($ms)
{
    return date('d.m', intdiv((int) $ms, 1000));
}

function dur($ms)
{
    $m = max(0, intdiv((int) $ms, 60000));
    return intdiv($m, 60) . ' soat ' . ($m % 60) . ' daq';
}

function g($arr, $key, $default = 0)
{
    return isset($arr[$key]) ? $arr[$key] : $default;
}

/** Smena xulosasi qatorlari (joriy smena va yopilgan smena xabarida bir xil) */
function summary_lines($s)
{
    $m = g($s, 'byMethod', array());
    $L = array();
    $L[] = '💰 Jami tushum: ' . money(g($s, 'total'));
    $L[] = '   • Naqd: ' . money(g($m, 'cash'));
    $L[] = '   • Click: ' . money(g($m, 'card'));
    $L[] = '   • Terminal: ' . money(g($m, 'terminal'));
    $L[] = '   • Qarz: ' . money(g($m, 'debt'));
    if (g($s, 'discounts') > 0) {
        $L[] = '🏷 Chegirma: ' . money($s['discounts']) . ' (' . g($s, 'discountCount') . ' ta chekdan)';
    }
    if (g($s, 'voidedCount') > 0) {
        $L[] = '↩️ Bekor qilingan: ' . $s['voidedCount'] . ' ta, qaytarilgan pul ' . money(g($s, 'refunds'));
    }
    if (g($s, 'expenses') > 0) {
        $L[] = '➖ Xarajat: ' . money($s['expenses']);
    }
    if (g($s, 'waiterPayouts') + g($s, 'kitchenPayouts') > 0) {
        $L[] = '➖ Berilgan pul: ofitsiantlarga ' . money(g($s, 'waiterPayouts')) . ', oshxonaga ' . money(g($s, 'kitchenPayouts'));
    }
    if (g($s, 'debtCollected') > 0) {
        $L[] = '➕ Eski qarzlardan naqd: ' . money($s['debtCollected']);
    }
    $L[] = '🧾 Hisoblar: xona ' . g($s, 'sessionsCount') . ' ta, bar ' . g($s, 'barSalesCount') . ' ta';
    return $L;
}

function shift_title($sh)
{
    $closed = isset($sh['closedAt']) && $sh['closedAt'] !== null;
    $L = '👤 Kassir: ' . g($sh, 'openedByName', '—');
    if ($closed && g($sh, 'closedByName', '') !== '' && $sh['closedByName'] !== g($sh, 'openedByName', '')) {
        $L .= ' → yopdi: ' . $sh['closedByName'];
    }
    if ($closed && !empty($sh['autoClosed'])) {
        $L .= ' (keyingi kassir smena ochgani uchun avtomatik yopildi)';
    }
    return $L;
}

/** Smena yopilganda yuboriladigan xabar */
function shift_closed_text($row)
{
    $sh = $row['shift'];
    $s = isset($row['summary']) ? $row['summary'] : array();
    $L = array();
    $L[] = '🔒 Smena №' . $sh['id'] . ' yopildi';
    $L[] = shift_title($sh);
    $L[] = '🕒 ' . dm($sh['openedAt']) . ' ' . hm($sh['openedAt']) . ' – ' . hm($sh['closedAt']) . ' (' . dur($sh['closedAt'] - $sh['openedAt']) . ')';
    $L[] = '';
    foreach (summary_lines($s) as $x) {
        $L[] = $x;
    }
    $L[] = '';
    $L[] = '💵 Kassada bo\'lishi kerak naqd: ' . money(g($s, 'expectedCash'));
    $L[] = '📤 Topshirilishi kerak: ' . money(g($s, 'expectedCash')) . ' so\'m';
    return implode("\n", $L);
}

function shift_opened_text($row)
{
    $sh = $row['shift'];
    return "🔓 Smena №" . $sh['id'] . " ochildi\n👤 Kassir: " . g($sh, 'openedByName', '—') . "\n🕒 " . dm($sh['openedAt']) . ' ' . hm($sh['openedAt']);
}

function shift_short($row)
{
    $sh = $row['shift'];
    $s = isset($row['summary']) ? $row['summary'] : array();
    $open = !isset($sh['closedAt']) || $sh['closedAt'] === null;
    $m = g($s, 'byMethod', array());
    return ($open ? '🟢' : '⚪️') . ' №' . $sh['id'] . ' · ' . g($sh, 'openedByName', '—') . ' · ' . dm($sh['openedAt']) . ' ' . hm($sh['openedAt'])
        . '–' . ($open ? 'hozir' : hm($sh['closedAt']))
        . "\n   Jami " . money(g($s, 'total')) . ' · naqd ' . money(g($m, 'cash')) . ' · Click ' . money(g($m, 'card'))
        . ' · terminal ' . money(g($m, 'terminal')) . ' · qarz ' . money(g($m, 'debt'))
        . "\n   Topshirilishi kerak: " . money(g($s, 'expectedCash'));
}

function stale_note($snap)
{
    $age = time() - (int) g($snap, 'received_at', 0);
    if ($age > 600) {
        return "\n\n⚠️ Ma'lumot " . intdiv($age, 60) . " daqiqa oldingi — kassa dasturi o'chiq yoki internetsiz bo'lishi mumkin.";
    }
    return '';
}

function no_data_text()
{
    return "Hali ma'lumot kelmagan.\nKassa dasturida Sozlamalar → Telegram bot bo'limini to'ldiring.";
}

function cmd_help()
{
    return "Delfin Sauna boti. Tugmalar:\n"
        . "📊 Joriy smena — hozirgi smena va kassa\n"
        . "🕒 Smenalar — oxirgi smenalar\n"
        . "🚪 Xonalar — qaysi xona ochiq, qancha pul\n"
        . "🍺 Ostatka — bar qoldig'i\n"
        . "📈 Bugun — kunlik hisobot\n"
        . "/chiqish — botdan chiqish (xabarlar to'xtaydi)\n\n"
        . "Smena yopilganda hisobot o'zi keladi.";
}

function cmd_current($snap)
{
    $row = isset($snap['shift']) ? $snap['shift'] : null;
    if (!$row) {
        return "🔴 Smena yopiq — hozir ochiq smena yo'q." . stale_note($snap);
    }
    $sh = $row['shift'];
    $L = array();
    $L[] = '🟢 Joriy smena №' . $sh['id'] . ' (ochiq)';
    $L[] = shift_title($sh);
    $L[] = '🕒 ' . dm($sh['openedAt']) . ' ' . hm($sh['openedAt']) . ' dan · ' . dur((g($snap, 'at', 0)) - $sh['openedAt']);
    $L[] = '';
    foreach (summary_lines(isset($row['summary']) ? $row['summary'] : array()) as $x) {
        $L[] = $x;
    }
    $L[] = '';
    $L[] = '💵 Kassada bo\'lishi kerak naqd: ' . money(g(g($row, 'summary', array()), 'expectedCash'));
    return implode("\n", $L) . stale_note($snap);
}

function cmd_shifts($snap)
{
    $rows = isset($snap['shifts']) ? $snap['shifts'] : array();
    if (!$rows) {
        return "Hali smena ochilmagan." . stale_note($snap);
    }
    $L = array('🕒 Oxirgi smenalar:', '');
    foreach (array_slice($rows, 0, 4) as $r) {
        $L[] = shift_short($r);
        $L[] = '';
    }
    return rtrim(implode("\n", $L)) . stale_note($snap);
}

function cmd_rooms($snap)
{
    $rooms = isset($snap['rooms']) ? $snap['rooms'] : array();
    $open = array_values(array_filter($rooms, function ($r) {
        return !empty($r['open']);
    }));
    $L = array('🚪 Xonalar: ' . count($open) . ' ta band, ' . (count($rooms) - count($open)) . " ta bo'sh", '');
    $sum = 0;
    foreach ($open as $r) {
        $sum += g($r, 'total');
        $L[] = '🔵 ' . $r['name'] . ' — ' . g($r, 'guests') . ' kishi · ' . dur(g($snap, 'at', 0) - g($r, 'openedAt', g($snap, 'at', 0)))
            . ' · ' . money(g($r, 'total')) . (!empty($r['waiter']) ? ' · ' . $r['waiter'] : '');
    }
    foreach ($rooms as $r) {
        if (empty($r['open'])) {
            $L[] = '⚪️ ' . $r['name'] . " — bo'sh";
        }
    }
    if ($open) {
        $L[] = '';
        $L[] = 'Ochiq xonalardagi hisob: ' . money($sum);
    }
    return implode("\n", $L) . stale_note($snap);
}

function cmd_stock($snap)
{
    $items = isset($snap['stock']) ? $snap['stock'] : array();
    if (!$items) {
        return "Qoldig'i kuzatiladigan mahsulot yo'q." . stale_note($snap);
    }
    $L = array("🍺 Bar qoldig'i (" . count($items) . ' ta mahsulot):', '');
    foreach ($items as $p) {
        $L[] = (!empty($p['low']) ? '⚠️ ' : '• ') . $p['name'] . ' — ' . $p['stock'] . ' dona';
    }
    return implode("\n", $L) . stale_note($snap);
}

/**
 * Google jadvalidan bir kunlik ko'rsatkichlar (sheets/hisobot.gs veb-ilovasi).
 * Natija: array('qoldi' => ..., 'massaj' => ...) yoki null (sozlanmagan / javob yo'q).
 */
function sheet_day($date)
{
    $c = cfg();
    $url = isset($c['sheet_url']) ? trim((string) $c['sheet_url']) : '';
    if ($url === '') {
        return null;
    }
    $url .= (strpos($url, '?') === false ? '?' : '&')
        . http_build_query(array('key' => isset($c['sheet_key']) ? (string) $c['sheet_key'] : '', 'date' => $date), '', '&');
    $res = http_get($url);
    $j = is_string($res) ? json_decode($res, true) : null;
    if (!is_array($j) || empty($j['ok']) || !isset($j['qoldi'], $j['massaj'])) {
        return null;
    }
    return $j;
}

/** Oddiy GET (Apps Script boshqa manzilga yo'naltiradi — yo'naltirishga ergashiladi) */
function http_get($url, $timeout = 20)
{
    if (isset($GLOBALS['HTTP_STUB']) && is_callable($GLOBALS['HTTP_STUB'])) {
        return call_user_func($GLOBALS['HTTP_STUB'], $url);
    }
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => $timeout,
        ));
        $res = curl_exec($ch);
        curl_close($ch);
        return $res === false ? null : $res;
    }
    $ctx = stream_context_create(array('http' => array('timeout' => $timeout)));
    $res = @file_get_contents($url, false, $ctx);
    return $res === false ? null : $res;
}

/** Uborka har ikki kunda: boshlanish sanasidan juft kun o'tgan bo'lsa — shu kun uborka kuni */
function is_cleaning_day($date, $start)
{
    $diff = (new DateTime($start))->diff(new DateTime($date));
    return $diff->days % 2 === 0;
}

/** "Bugun": kunlik hisobot (kassa dasturi + Google jadval + doimiy summalar) */
function cmd_today($snap)
{
    $c = cfg();
    $t = isset($snap['today']) ? $snap['today'] : array();
    $m = g($t, 'byMethod', array());
    // Sana — kassa ma'lumoti olingan kun (naqd va jadval bir xil kunniki bo'lishi uchun)
    $at = (int) g($snap, 'at', 0);
    $ts = $at > 0 ? intdiv($at, 1000) : time();
    $date = date('Y-m-d', $ts);
    $sheet = sheet_day($date);
    $cleaning = is_cleaning_day($date, g($c, 'uborka_start', '2026-11-29'));
    $L = array(
        '📈 Bugun (' . date('d.m.Y', $ts) . ')',
        '',
        '💵 Naqd: ' . ($sheet === null ? '-' : money(g($m, 'cash') + $sheet['qoldi'])),
        '💳 Click: -',
        '🏧 Terminal: -',
        '💆 Massaj: ' . ($sheet === null ? '-' : money($sheet['massaj'])),
        '👤 Ilhom: ' . money(g($c, 'ilhom', 500000)),
        '🧹 Uborka: ' . ($cleaning ? money(g($c, 'uborka', 1500000)) : '-'),
        '🧺 Prachka: ' . money(g($c, 'prachka', 200000)),
    );
    return implode("\n", $L);
}

/* ───────────── Ulangan chatlar ───────────── */

function chat_list()
{
    return read_json('chats.json', array());
}

function chat_known($id)
{
    foreach (chat_list() as $c) {
        if ((string) $c['id'] === (string) $id) {
            return true;
        }
    }
    return false;
}

function chat_add($id, $name)
{
    $list = chat_list();
    foreach ($list as $c) {
        if ((string) $c['id'] === (string) $id) {
            return;
        }
    }
    $list[] = array('id' => $id, 'name' => $name, 'since' => time());
    write_json('chats.json', $list);
}

function chat_remove($id)
{
    $list = array_values(array_filter(chat_list(), function ($c) use ($id) {
        return (string) $c['id'] !== (string) $id;
    }));
    write_json('chats.json', $list);
}

/* ───────────── Buyruqlar ───────────── */

function normalize_command($text)
{
    $t = trim($text);
    $map = array(
        '📊 Joriy smena' => '/hisobot', '🕒 Smenalar' => '/smenalar', '🚪 Xonalar' => '/xonalar',
        '🍺 Ostatka' => '/ostatka', '📈 Bugun' => '/bugun',
    );
    if (isset($map[$t])) {
        return $map[$t];
    }
    $t = strtolower($t);
    // /buyruq@botnomi → /buyruq
    $t = preg_replace('/^(\/[a-z_]+)@\S+/', '$1', $t);
    return $t;
}

function snapshot_or_null()
{
    $s = read_json('snapshot.json', null);
    return is_array($s) ? $s : null;
}

function reply_for($cmd)
{
    if ($cmd === '/start' || $cmd === '/yordam' || $cmd === '/help') {
        return cmd_help();
    }
    $snap = snapshot_or_null();
    $map = array(
        '/hisobot' => 'cmd_current', '/smena' => 'cmd_current', '/smenalar' => 'cmd_shifts', '/xonalar' => 'cmd_rooms',
        '/ostatka' => 'cmd_stock', '/bugun' => 'cmd_today',
    );
    if (!isset($map[$cmd])) {
        return cmd_help();
    }
    if ($snap === null) {
        return no_data_text();
    }
    return call_user_func($map[$cmd], $snap);
}

function handle_message($m)
{
    if (!isset($m['chat']['id'])) {
        return;
    }
    $chat = $m['chat']['id'];
    $text = isset($m['text']) ? trim($m['text']) : '';
    $name = trim((isset($m['from']['first_name']) ? $m['from']['first_name'] : '') . ' ' . (isset($m['from']['last_name']) ? $m['from']['last_name'] : ''));
    $code = (string) (isset(cfg()['pair_code']) ? cfg()['pair_code'] : '');

    if (!chat_known($chat)) {
        if ($code !== '' && ($text === $code || $text === '/start ' . $code)) {
            chat_add($chat, $name);
            send($chat, "✅ Ulandingiz" . ($name !== '' ? ', ' . $name : '') . ".\nEndi smena hisobotlari shu yerga keladi.\n\n" . cmd_help(), main_keyboard());
        } else {
            send($chat, "🔒 Botdan foydalanish uchun ulanish kodini yuboring.\n(Kodni kassa egasidan oling.)");
        }
        return;
    }

    $cmd = normalize_command($text);
    if ($cmd === '/chiqish') {
        chat_remove($chat);
        send($chat, "Siz botdan chiqdingiz. Qayta ulanish uchun kodni yuboring.");
        return;
    }
    send($chat, reply_for($cmd), main_keyboard());
}

/** Webhook rejimi yoqilganmi (diagnoz.php?webhook=on yozadi) */
function webhook_enabled()
{
    $m = read_json('mode.json', array());
    return !empty($m['webhook']);
}

function webhook_secret()
{
    return substr(hash('sha256', 'wh|' . (string) (isset(cfg()['secret']) ? cfg()['secret'] : '') . '|' . (string) (isset(cfg()['token']) ? cfg()['token'] : '')), 0, 48);
}

function process_updates()
{
    if (webhook_enabled()) {
        return 0; // webhook rejimida xabarlarni webhook.php oladi
    }
    $st = read_json('offset.json', array('o' => 0));
    $offset = (int) g($st, 'o', 0);
    $res = tg('getUpdates', array('offset' => $offset, 'timeout' => 0, 'allowed_updates' => array('message')));
    if (!$res || empty($res['ok'])) {
        // Webhook o'rnatilgan bo'lsa getUpdates ishlamaydi — olib tashlaymiz
        if (is_array($res) && isset($res['description']) && stripos((string) $res['description'], 'webhook') !== false) {
            tg('deleteWebhook');
        }
        return 0;
    }
    $n = 0;
    foreach ($res['result'] as $u) {
        $offset = max($offset, (int) $u['update_id'] + 1);
        // Avval offset saqlanadi: saqlab bo'lmasa javob BERILMAYDI (aks holda har daqiqa takrorlanardi)
        if (!write_json('offset.json', array('o' => $offset))) {
            return $n;
        }
        if (isset($u['message'])) {
            try {
                handle_message($u['message']);
            } catch (Throwable $e) {
                $GLOBALS['TG_SEND_ERR'] = 'xabarni ishlashda xato: ' . $e->getMessage();
            }
            $n++;
        }
    }
    return $n;
}

/* ───────────── Voqealar navbati (smena ochildi/yopildi) ───────────── */

/** Dasturdan kelgan voqeani navbatga qo'yish (bir xil voqea ikki marta qo'yilmaydi) */
function queue_event($ev)
{
    if (!is_array($ev) || !isset($ev['type']) || !isset($ev['row']['shift']['id'])) {
        return false;
    }
    $id = $ev['type'] . ':' . $ev['row']['shift']['id'];
    if ($ev['type'] === 'shift_closed') {
        $text = shift_closed_text($ev['row']);
    } elseif ($ev['type'] === 'shift_opened') {
        $text = shift_opened_text($ev['row']);
    } else {
        return false;
    }
    return with_lock('outbox.lck', function () use ($id, $text) {
        $box = read_json('outbox.json', array('seen' => array(), 'items' => array()));
        if (in_array($id, $box['seen'], true)) {
            return false;
        }
        $box['seen'][] = $id;
        $box['seen'] = array_slice($box['seen'], -300);
        $box['items'][] = array('id' => $id, 'text' => $text, 'created' => time(), 'sent' => array());
        write_json('outbox.json', $box);
        return true;
    });
}

/** Navbatdagi xabarlarni ulangan chatlarga yuborish. Yuborilmaganlari keyingi safar qayta uriniladi (48 soatgacha). */
function deliver_outbox()
{
    return with_lock('outbox.lck', function () {
        $box = read_json('outbox.json', array('seen' => array(), 'items' => array()));
        $chats = chat_list();
        $left = array();
        $sentCount = 0;
        foreach ($box['items'] as $it) {
            $done = true;
            foreach ($chats as $c) {
                if (in_array($c['id'], $it['sent'], true)) {
                    continue;
                }
                if (send($c['id'], $it['text'])) {
                    $it['sent'][] = $c['id'];
                    $sentCount++;
                } else {
                    $done = false;
                }
            }
            if (!$chats) {
                $done = false;
            }
            if (!$done && (time() - (int) $it['created']) < 48 * 3600) {
                $left[] = $it;
            }
        }
        $box['items'] = $left;
        write_json('outbox.json', $box);
        return $sentCount;
    });
}
