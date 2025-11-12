<?php
// Требуется установка через composer: composer require telegram-bot/api
require __DIR__ . '/vendor/autoload.php';

use TelegramBot\Api\Client;
use TelegramBot\Api\Types\Payments\LabeledPrice;

$bot = new Client('YOUR_BOT_TOKEN');
$amount = isset($_GET['amount']) ? (int)$_GET['amount'] : 5; // Количество Stars

try {
    $prices = [new LabeledPrice("Поддержка игры", $amount * 100)]; // 1 Star = 100 единиц
    
    $bot->sendInvoice(
        $_GET['chat_id'], // Должен передаваться из JS
        '🌟 Поддержка "Поисков Тайн"',
        'Твоя поддержка поможет развивать игру!',
        'donation_payload',
        'STARS_PROVIDER_TOKEN', // Специальный токен для Stars
        'RUB', // Обязательный параметр, но для Stars игнорируется
        $prices,
        null,
        null,
        null,
        true // Указывает, что это Stars
    );
    
    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
