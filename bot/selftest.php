<?php
/**
 * Bot mantiqini internet va haqiqiy token SIZ tekshiradi (Telegram so'rovlari soxta funksiya bilan ushlanadi).
 *   php bot/selftest.php
 */
$tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'delfinbot-test-' . getmypid();
@mkdir($tmp, 0775, true);
$GLOBALS['BOT_CONFIG'] = array('token' => 'TEST', 'secret' => 's3cret', 'pair_code' => '4242', 'timezone' => 'Asia/Tashkent', 'data_dir' => $tmp, 'sheet_url' => 'https://example.test/exec');
// Jadval so'rovi soxta: boshida javob yo'q
$GLOBALS['HTTP_STUB'] = function ($url) {
    return null;
};

$sent = array();
$updates = array();
$GLOBALS['TG_STUB'] = function ($method, $params) use (&$sent, &$updates) {
    if ($method === 'sendMessage') {
        $sent[] = $params;
        return array('ok' => true, 'result' => array());
    }
    if ($method === 'getUpdates') {
        $out = array();
        foreach ($updates as $u) {
            if ($u['update_id'] >= $params['offset']) {
                $out[] = $u;
            }
        }
        return array('ok' => true, 'result' => $out);
    }
    return array('ok' => true);
};

require __DIR__ . '/lib.php';

$fails = 0;
function check($cond, $label)
{
    global $fails;
    if (!$cond) {
        $fails++;
    }
    echo ($cond ? 'PASS ' : 'FAIL ') . $label . "\n";
}
function lastText()
{
    global $sent;
    return $sent ? $sent[count($sent) - 1]['text'] : '';
}
function msg($id, $chat, $text)
{
    return array('update_id' => $id, 'message' => array('chat' => array('id' => $chat), 'from' => array('first_name' => 'Ali'), 'text' => $text));
}

$payload = json_decode(file_get_contents(__DIR__ . '/tests/sample-payload.json'), true);
check(is_array($payload) && isset($payload['snapshot']), 'namuna yuklama o\'qildi');

// 1) Begona chat: kod so'raladi, ma'lumot berilmaydi
$updates = array(msg(1, 111, '/hisobot'));
process_updates();
check(strpos(lastText(), 'ulanish kodini') !== false, 'begona chatga kod so\'raladi');
check(count(chat_list()) === 0, 'begona chat ulanmadi');

// 2) Noto'g'ri kod
$updates = array(msg(1, 111, '/hisobot'), msg(2, 111, '9999'));
process_updates();
check(count(chat_list()) === 0, 'noto\'g\'ri kod ulamaydi');

// 3) To'g'ri kod
$updates = array(msg(1, 111, '/hisobot'), msg(2, 111, '9999'), msg(3, 111, '4242'));
process_updates();
check(count(chat_list()) === 1 && strpos(lastText(), 'Ulandingiz') !== false, 'to\'g\'ri kod chatni ulaydi');

// 4) Snapshot kelmagan
$updates = array(msg(4, 111, '📊 Joriy smena'));
process_updates();
check(strpos(lastText(), 'Hali ma\'lumot kelmagan') !== false, 'snapshot yo\'q — tushunarli javob');

// 5) receive.php mantiqi: snapshot + voqealar
$snap = $payload['snapshot'];
$snap['received_at'] = time();
write_json('snapshot.json', $snap);
$q = 0;
foreach ($payload['events'] as $ev) {
    if (queue_event($ev)) {
        $q++;
    }
}
check($q === 1, 'smena yopildi voqeasi navbatga tushdi');
check(queue_event($payload['events'][0]) === false, 'takroriy voqea qabul qilinmaydi');
$before = count($sent);
deliver_outbox();
check(count($sent) === $before + 1, 'xabar ulangan chatga yuborildi');
$closed = lastText();
foreach (array('Smena №1 yopildi', 'Kassir: Ega', 'yopdi: Kassir', 'avtomatik', 'Jami tushum: 140 000', 'Naqd: 50 000', 'Click: 90 000', 'Kassada bo\'lishi kerak naqd: 50 000', 'Topshirilishi kerak: 50 000') as $needle) {
    check(strpos($closed, $needle) !== false, 'yopilish xabarida: ' . $needle);
}
deliver_outbox();
check(count($sent) === $before + 1, 'xabar ikki marta yuborilmadi');

// 6) Buyruqlar
$cases = array(
    '📊 Joriy smena' => array('Joriy smena №2', 'Kassir: Kassir', 'Kassada bo\'lishi kerak naqd'),
    '/smenalar' => array('Oxirgi smenalar', '№2', '№1', 'Topshirilishi kerak'),
    '🚪 Xonalar' => array('1 ta band', 'VIP xona', '3 kishi', '600 000'),
    '/ostatka' => array('Bar qoldig\'i', 'Pista'),
    '📈 Bugun' => array('Bugun', 'Naqd: -', 'Click: -', 'Terminal: -', 'Massaj: -', 'Ilhom: 500 000', 'Prachka: 200 000'),
    '/yordam' => array('Joriy smena', 'Ostatka'),
    '/hisobot@delfin_bot' => array('Joriy smena №2'),
);
$id = 10;
foreach ($cases as $text => $needles) {
    $updates = array(msg($id++, 111, $text));
    process_updates();
    foreach ($needles as $n) {
        check(strpos(lastText(), $n) !== false, "'$text' javobida: $n");
    }
}

// 7) Eskirgan snapshot ogohlantirishi
$snap['received_at'] = time() - 3600;
write_json('snapshot.json', $snap);
$updates = array(msg($id++, 111, '/xonalar'));
process_updates();
check(strpos(lastText(), 'daqiqa oldingi') !== false, 'eski ma\'lumot ogohlantiriladi');

// 7b) Kunlik hisobot: jadval javobi soxta
$GLOBALS['HTTP_STUB'] = function ($url) {
    return json_encode(array('ok' => true, 'qoldi' => 4790000, 'massaj' => 125000));
};
$snap['today']['byMethod']['cash'] = 110000;
$snap['at'] = strtotime('2026-11-29 12:00:00') * 1000;
$today = cmd_today($snap);
foreach (array('29.11.2026', 'Naqd: 4 900 000', 'Massaj: 125 000', 'Uborka: 1 500 000') as $needle) {
    check(strpos($today, $needle) !== false, 'kunlik hisobotda: ' . $needle);
}
$snap['at'] = strtotime('2026-11-30 12:00:00') * 1000;
check(strpos(cmd_today($snap), 'Uborka: -') !== false, 'uborka kuni emas — "-"');

// 8) Ikkinchi odam ulanadi va keyingi xabarni oladi; chiqish
$updates = array(msg($id++, 222, '/start 4242'));
process_updates();
check(count(chat_list()) === 2, 'ikkinchi chat ulandi (/start kod)');
$ev2 = array('type' => 'shift_opened', 'at' => 1, 'row' => $payload['snapshot']['shift']);
queue_event($ev2);
$before = count($sent);
deliver_outbox();
check(count($sent) === $before + 2, 'smena ochildi xabari ikkala chatga');
$updates = array(msg($id++, 222, '/chiqish'));
process_updates();
check(count(chat_list()) === 1, 'chiqish chatni o\'chiradi');

// 9) Uzun xabar bo'linadi
$long = '';
for ($i = 0; $i < 400; $i++) {
    $long .= "Qator $i " . str_repeat('x', 20) . "\n";
}
$before = count($sent);
send(111, $long);
check(count($sent) > $before + 1, 'uzun xabar bo\'laklarga bo\'lindi');

// Tozalash
foreach (glob($tmp . '/*') as $f) {
    @unlink($f);
}
@rmdir($tmp);
echo $fails === 0 ? "\nHAMMASI YAXSHI\n" : "\nXATOLAR: $fails\n";
exit($fails === 0 ? 0 : 1);
