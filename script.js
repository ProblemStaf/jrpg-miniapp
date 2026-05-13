// Telegram WebApp инициализация
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Получение данных пользователя
const user = tg.initDataUnsafe?.user || {};
const startParam = new URLSearchParams(window.location.search).get('startapp');

// Состояние игры
let gameState = {
    user: null,
    inventory: {},
    quests: [],
    position: { x: 5, y: 5 },
    inBattle: false,
    currentEnemy: null
};

// Загрузка данных с сервера
async function loadGameData() {
    try {
        const response = await fetch('/api/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: user.id,
                username: user.username,
                start_param: startParam
            })
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const data = await response.json();
        gameState.user = data.user;
        gameState.inventory = data.inventory;
        gameState.quests = data.quests;
        
        updateUI();
        showNotification(`Добро пожаловать, ${gameState.user.username || 'Герой'}!`);
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка загрузки данных!', 'error');
    }
}

// Обновление интерфейса
function updateUI() {
    if (!gameState.user) return;
    
    document.getElementById('hp').textContent = `${gameState.user.hp}/${gameState.user.max_hp}`;
    document.getElementById('gold').textContent = gameState.user.gold;
    document.getElementById('level').textContent = gameState.user.level;
    document.getElementById('exp').textContent = `${gameState.user.exp}/${gameState.user.level * 100}`;
    
    // Обновление инвентаря
    const invEl = document.getElementById('inventory-list');
    if (invEl) {
        invEl.innerHTML = Object.entries(gameState.inventory)
            .map(([item, qty]) => `<div class="inv-item">${item}: ${qty}</div>`)
            .join('') || '<div>Пусто</div>';
    }
    
    // Прогресс опыта
    const expPercent = (gameState.user.exp / (gameState.user.level * 100)) * 100;
    const expBar = document.getElementById('exp-bar');
    if (expBar) expBar.style.width = `${expPercent}%`;
    
    // Полоска здоровья
    const hpPercent = (gameState.user.hp / gameState.user.max_hp) * 100;
    const hpBar = document.getElementById('hp-bar');
    if (hpBar) hpBar.style.width = `${hpPercent}%`;
}

// Ежедневная награда
async function claimDailyReward() {
    try {
        const response = await fetch('/api/daily_reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
            gameState.user = data.new_stats;
            updateUI();
            
            let msg = `🎁 Награда получена: +${data.gold} золота, +${data.exp} опыта!`;
            if (data.leveled_up) {
                msg += `\n⬆️ Уровень повышен до ${gameState.user.level}!`;
                tg.HapticFeedback.notificationOccurred('success');
            }
            showNotification(msg);
        } else {
            showNotification(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        showNotification('Ошибка сети', 'error');
    }
}

// Боевая система
async function fight(action) {
    if (!gameState.inBattle) {
        // Начало боя
        gameState.inBattle = true;
        gameState.currentEnemy = { hp: 50, maxHp: 50, name: 'Гоблин' };
        showBattleUI();
        return;
    }
    
    try {
        const response = await fetch('/api/fight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: user.id,
                action: action
            })
        });
        
        const data = await response.json();
        
        if (action === 'attack') {
            showBattleLog(`Вы нанесли ${data.player_dmg} урона!`);
            if (data.win) {
                showBattleLog(`🏆 Победа! +${data.rewards.gold} золота, +${data.rewards.exp} опыта`);
                gameState.user = data.user;
                updateUI();
                setTimeout(hideBattleUI, 2000);
                gameState.inBattle = false;
                tg.HapticFeedback.notificationOccurred('success');
            } else if (data.enemy_dmg) {
                showBattleLog(`Враг нанес ${data.enemy_dmg} урона!`);
                gameState.user = data.user;
                updateUI();
                tg.HapticFeedback.impactOccurred('medium');
                
                if (gameState.user.hp <= 0) {
                    showBattleLog('💀 Вы погибли! Возвращение в город...');
                    setTimeout(() => {
                        hideBattleUI();
                        gameState.inBattle = false;
                    }, 2000);
                }
            }
        } else if (action === 'heal') {
            if (data.healed) {
                showBattleLog(`💚 Исцеление на ${data.healed} HP!`);
                gameState.user = data.user;
                updateUI();
            } else if (data.error) {
                showBattleLog(data.error);
            }
        }
    } catch (error) {
        showNotification('Ошибка боя', 'error');
    }
}

// Крафт
async function craft(recipe) {
    try {
        const response = await fetch('/api/craft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: user.id,
                recipe: recipe
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`🔨 Создано: ${recipe}!`);
            // Перезагрузка инвентаря
            loadGameData();
            tg.HapticFeedback.notificationOccurred('success');
        } else {
            showNotification(data.error || 'Ошибка крафта', 'error');
        }
    } catch (error) {
        showNotification('Ошибка сети', 'error');
    }
}

// Лидерборд
async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const leaders = await response.json();
        
        const html = leaders.map((p, i) => 
            `<div class="leader-row ${i === 0 ? 'first' : ''}">
                <span class="rank">#${i+1}</span>
                <span class="name">${p.username || 'Аноним'}</span>
                <span class="stats">Lvl ${p.level} | ${p.gold}G</span>
            </div>`
        ).join('');
        
        document.getElementById('leaderboard-list').innerHTML = html;
    } catch (error) {
        console.error('Ошибка лидерборда:', error);
    }
}

// UI функции
function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

function showBattleUI() {
    const battleModal = document.getElementById('battle-modal');
    if (battleModal) {
        battleModal.style.display = 'flex';
        document.getElementById('enemy-name').textContent = gameState.currentEnemy.name;
        document.getElementById('enemy-hp').textContent = `${gameState.currentEnemy.hp}/${gameState.currentEnemy.maxHp}`;
    }
}

function hideBattleUI() {
    const battleModal = document.getElementById('battle-modal');
    if (battleModal) battleModal.style.display = 'none';
}

function showBattleLog(message) {
    const log = document.getElementById('battle-log');
    if (log) {
        log.innerHTML = `<div>${message}</div>` + log.innerHTML;
        if (log.children.length > 5) log.lastChild.remove();
    }
}

// Управление клавиатурой
document.addEventListener('keydown', (e) => {
    if (gameState.inBattle) return;
    
    const step = 1;
    switch(e.key) {
        case 'ArrowUp': gameState.position.y -= step; break;
        case 'ArrowDown': gameState.position.y += step; break;
        case 'ArrowLeft': gameState.position.x -= step; break;
        case 'ArrowRight': gameState.position.x += step; break;
        case ' ': claimDailyReward(); break; // Пробел для ежедневной награды
    }
    
    updatePlayerPosition();
});

function updatePlayerPosition() {
    const player = document.getElementById('player');
    if (player) {
        player.style.left = `${gameState.position.x * 40}px`;
        player.style.top = `${gameState.position.y * 40}px`;
    }
}

// Инициализация при загрузке
window.addEventListener('DOMContentLoaded', () => {
    loadGameData();
    loadLeaderboard();
    
    // Кнопки действий
    document.getElementById('daily-btn')?.addEventListener('click', claimDailyReward);
    document.getElementById('fight-btn')?.addEventListener('click', () => fight('attack'));
    document.getElementById('heal-btn')?.addEventListener('click', () => fight('heal'));
    
    // Рецепты крафта
    document.querySelectorAll('.craft-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const recipe = btn.dataset.recipe;
            craft(recipe);
        });
    });
});

// Темизация от Telegram
if (tg.colorScheme === 'dark') {
    document.body.classList.add('dark-theme');
} else {
    document.body.classList.add('light-theme');
}
