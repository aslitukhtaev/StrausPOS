<?php
/**
 * Sozlama. Bu faylni config.php deb nusxalang va to'ldiring. config.php GitHub'ga YUKLANMAYDI (.gitignore).
 * Token va maxfiy kalitni hech kimga bermang.
 */
return array(
    // @BotFather bergan token (masalan: 123456789:AAAA...)
    'token' => 'BOT_TOKEN_SHU_YERGA',

    // Kassa dasturidagi Sozlamalar → Telegram bot → "Maxfiy kalit" bilan BIR XIL bo'lishi shart.
    // Uzun tasodifiy qator qo'ying (masalan: php -r "echo bin2hex(random_bytes(24));")
    'secret' => 'UZUN_TASODIFIY_MAXFIY_KALIT',

    // Botga ulanish kodi: botga shu kodni yuborgan Telegram chat ulanadi (xohlagancha odam). Vaqti-vaqti bilan almashtiring.
    'pair_code' => '482913',

    // cron.php ni veb orqali chaqirish uchun kalit (CLI cron bo'lsa bo'sh qoldiring)
    'cron_key' => '',

    'timezone' => 'Asia/Tashkent',

    // "Bugun" hisoboti: Google jadvaldagi Apps Script veb-ilovasi havolasi va undagi KALIT (sheets/hisobot.gs).
    // Bo'sh qolsa Naqd va Massaj o'rniga "-" chiqadi.
    'sheet_url' => '',
    'sheet_key' => '',

    // "Bugun" hisobotidagi doimiy summalar. Uborka har ikki kunda, uborka_start — uborka kunlaridan biri.
    'ilhom' => 500000,
    'uborka' => 1500000,
    'uborka_start' => '2026-11-29',
    'prachka' => 200000,

    // Ma'lumotlar papkasi. Imkon bo'lsa veb-ildizdan TASHQARIDA bo'lsin.
    'data_dir' => __DIR__ . '/data',
);
