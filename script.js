document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram?.WebApp;
    const player = document.getElementById('player');
    const dialogBox = document.getElementById('dialogText');
    const donateBtn = document.getElementById('btnDonate');

    // Инициализация WebApp
    if (tg) {
        tg.expand();
        tg.ready();
        tg.MainButton.textColor = '#FFFFFF';
        tg.MainButton.color = '#8a6d3b';
        
        // Данные пользователя
        const user = tg.initDataUnsafe?.user;
        if (user) {
            showText(`Здравствуй, ${user.first_name}! Готов к приключениям?`);
        }
    } else {
        showText('⚠️ Запущено вне Telegram!');
    }

    // Простая механика перемещения
    let playerPos = { x: 50, y: 80 };
    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case 'ArrowUp': playerPos.y = Math.max(20, playerPos.y - 5); break;
            case 'ArrowDown': playerPos.y = Math.min(80, playerPos.y + 5); break;
            case 'ArrowLeft': playerPos.x = Math.max(10, playerPos.x - 5); break;
            case 'ArrowRight': playerPos.x = Math.min(90, playerPos.x + 5); break;
        }
        updatePlayerPosition();
        checkLocationEvents();
    });

    function updatePlayerPosition() {
        player.style.left = `${playerPos.x}%`;
        player.style.bottom = `${playerPos.y}%`;
    }

    function showText(text) {
        dialogBox.textContent = text;
    }

    function checkLocationEvents() {
        // Пример события при достижении координат
        if (playerPos.x > 70 && playerPos.y < 30) {
            showText('🔥 Ты нашел древний артефакт! Нажми на кнопку поддержки, чтобы получить зелье восстановления.');
        }
    }

    // Интеграция Telegram Stars
    donateBtn.addEventListener('click', () => {
        if (!tg) return;
        
        tg.openInvoice('https://yourdomain.com/create_invoice.php?amount=5', (status) => {
            if (status === 'paid') {
                showText('✨ Благодаря твоей поддержке получен магический амулет! +50 HP');
                // Обновление игровых данных
                if (localStorage.getItem('gameData')) {
                    const data = JSON.parse(localStorage.getItem('gameData'));
                    data.hp = (data.hp || 100) + 50;
                    localStorage.setItem('gameData', JSON.stringify(data));
                }
            } else {
                showText('😕 Платеж не завершен');
            }
        });
    });

    // Сохранение прогресса
    document.getElementById('btnSave').addEventListener('click', () => {
        const gameData = {
            position: playerPos,
            lastSave: new Date().toISOString(),
            artifacts: 1
        };
        localStorage.setItem('gameData', JSON.stringify(gameData));
        showText('💾 Прогресс сохранен!');
    });

    // Загрузка прогресса
    const savedData = localStorage.getItem('gameData');
    if (savedData) {
        const data = JSON.parse(savedData);
        playerPos = data.position || playerPos;
        updatePlayerPosition();
        showText(`📅 Последнее сохранение: ${new Date(data.lastSave).toLocaleTimeString()}`);
    }
});
