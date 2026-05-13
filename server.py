import os
import asyncio
import sqlite3
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes
from dotenv import load_dotenv
import logging

# Загрузка переменных окружения
load_dotenv()

# Конфигурация
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://your-domain.com")
PORT = int(os.getenv("PORT", 5000))
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

if not TELEGRAM_BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN не найден в переменных окружения!")

# Настройка логирования
logging.basicConfig(level=logging.INFO if DEBUG else logging.WARNING)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='.')

# --- База данных SQLite ---
DB_NAME = 'game.db'

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    
    # Таблица пользователей
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        gold INTEGER DEFAULT 100,
        hp INTEGER DEFAULT 100,
        max_hp INTEGER DEFAULT 100,
        exp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        last_daily TEXT,
        referrer_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # Таблица инвентаря
    c.execute('''CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        item_name TEXT,
        quantity INTEGER DEFAULT 1,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    
    # Таблица квестов
    c.execute('''CREATE TABLE IF NOT EXISTS quests (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        quest_name TEXT,
        status TEXT DEFAULT 'active',
        progress INTEGER DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    
    # Таблица достижений
    c.execute('''CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        achievement_name TEXT,
        unlocked BOOLEAN DEFAULT FALSE,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    
    conn.commit()
    conn.close()
    logger.info("База данных инициализирована")

def get_db_connection():
    conn = sqlite3.connect(DB_NAME, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    return conn

# --- Вспомогательные функции ---
def get_or_create_user(telegram_id, username=None, referrer_id=None):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = c.fetchone()
    
    if not user:
        c.execute('''INSERT INTO users (telegram_id, username, referrer_id) 
                     VALUES (?, ?, ?)''', (telegram_id, username, referrer_id))
        conn.commit()
        
        # Стартовые предметы
        c.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        new_user_id = c.fetchone()[0]
        c.execute("INSERT INTO inventory (user_id, item_name, quantity) VALUES (?, ?, ?)", 
                  (new_user_id, 'Зелье лечения', 3))
        c.execute("INSERT INTO inventory (user_id, item_name, quantity) VALUES (?, ?, ?)", 
                  (new_user_id, 'Деревянный меч', 1))
        conn.commit()
        
        # Бонус рефереру
        if referrer_id:
            c.execute("SELECT id FROM users WHERE telegram_id = ?", (referrer_id,))
            ref_user = c.fetchone()
            if ref_user:
                c.execute("UPDATE users SET gold = gold + 50 WHERE id = ?", (ref_user[0],))
                c.execute("INSERT INTO inventory (user_id, item_name, quantity) VALUES (?, ?, ?)", 
                          (ref_user[0], 'Кристалл удачи', 1))
                conn.commit()
                logger.info(f"Реферальный бонус выдан пользователю {referrer_id}")
    
    conn.close()
    return True

# --- API Эндпоинты ---

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/style.css')
def css():
    return send_from_directory('.', 'style.css')

@app.route('/script.js')
def js():
    return send_from_directory('.', 'script.js')

@app.route('/api/init', methods=['POST'])
def api_init():
    data = request.json
    telegram_id = data.get('id')
    username = data.get('username')
    referrer_id = data.get('start_param')
    
    if not telegram_id:
        return jsonify({'error': 'Telegram ID required'}), 400
        
    get_or_create_user(telegram_id, username, referrer_id)
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = dict(c.fetchone())
    
    c.execute("SELECT item_name, quantity FROM inventory WHERE user_id = ?", (user['id'],))
    inventory = {row['item_name']: row['quantity'] for row in c.fetchall()}
    
    c.execute("SELECT quest_name, status, progress FROM quests WHERE user_id = ?", (user['id'],))
    quests = [dict(row) for row in c.fetchall()]
    
    conn.close()
    
    return jsonify({
        'user': user,
        'inventory': inventory,
        'quests': quests
    })

@app.route('/api/daily_reward', methods=['POST'])
def api_daily_reward():
    data = request.json
    telegram_id = data.get('id')
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = c.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    
    last_daily = user['last_daily']
    now = datetime.now()
    
    if last_daily:
        last_date = datetime.fromisoformat(last_daily)
        if now - last_date < timedelta(hours=24):
            conn.close()
            return jsonify({'error': 'Already claimed today', 'next_claim': str(last_date + timedelta(hours=24))}), 400
    
    reward_gold = 100 + (user['level'] * 10)
    reward_exp = 50 + (user['level'] * 5)
    
    c.execute("UPDATE users SET gold = gold + ?, exp = exp + ?, last_daily = ? WHERE id = ?",
              (reward_gold, reward_exp, now.isoformat(), user['id']))
    
    c.execute("SELECT * FROM users WHERE id = ?", (user['id'],))
    updated_user = dict(c.fetchone())
    leveled_up = False
    
    if updated_user['exp'] >= updated_user['level'] * 100:
        c.execute("UPDATE users SET level = level + 1, max_hp = max_hp + 20, hp = max_hp + 20 WHERE id = ?", (user['id'],))
        leveled_up = True
        c.execute("INSERT INTO inventory (user_id, item_name, quantity) VALUES (?, ?, ?)",
                  (user['id'], 'Зелье опыта', 1))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'gold': reward_gold,
        'exp': reward_exp,
        'leveled_up': leveled_up,
        'new_stats': dict(updated_user) if not leveled_up else {**updated_user, 'level': updated_user['level']+1}
    })

@app.route('/api/craft', methods=['POST'])
def api_craft():
    data = request.json
    telegram_id = data.get('id')
    recipe = data.get('recipe')
    
    recipes = {
        "Зелье маны": {"Трава": 2, "Вода": 1},
        "Стальной меч": {"Железо": 3, "Дерево": 2},
        "Броня": {"Кожа": 5, "Железо": 2}
    }
    
    if recipe not in recipes:
        return jsonify({'error': 'Неизвестный рецепт'}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
    user = c.fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    
    user_id = user[0]
    can_craft = True
    required = recipes[recipe]
    
    for item, qty in required.items():
        c.execute("SELECT quantity FROM inventory WHERE user_id = ? AND item_name = ?", (user_id, item))
        res = c.fetchone()
        if not res or res[0] < qty:
            can_craft = False
            break
    
    if not can_craft:
        conn.close()
        return jsonify({'error': 'Недостаточно ресурсов'}), 400
        
    for item, qty in required.items():
        c.execute("UPDATE inventory SET quantity = quantity - ? WHERE user_id = ? AND item_name = ?", (qty, user_id, item))
        c.execute("DELETE FROM inventory WHERE user_id = ? AND item_name = ? AND quantity = 0", (user_id, item))
    
    c.execute("INSERT INTO inventory (user_id, item_name, quantity) VALUES (?, ?, 1)", (user_id, recipe))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'crafted': recipe})

@app.route('/api/fight', methods=['POST'])
def api_fight():
    data = request.json
    telegram_id = data.get('id')
    action = data.get('action')
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = dict(c.fetchone())
    
    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    
    enemy_hp = 50
    enemy_dmg = 10
    result = {}
    
    if action == 'attack':
        dmg = 10 + (user['level'] * 2)
        enemy_hp -= dmg
        result['player_dmg'] = dmg
        result['enemy_hp'] = max(0, enemy_hp)
        
        if enemy_hp <= 0:
            gold_gain = 20
            exp_gain = 30
            c.execute("UPDATE users SET gold = gold + ?, exp = exp + ? WHERE id = ?", (gold_gain, exp_gain, user['id']))
            result['win'] = True
            result['rewards'] = {'gold': gold_gain, 'exp': exp_gain}
        else:
            c.execute("UPDATE users SET hp = hp - ? WHERE id = ?", (enemy_dmg, user['id']))
            result['enemy_dmg'] = enemy_dmg
            
    elif action == 'heal':
        c.execute("SELECT quantity FROM inventory WHERE user_id = ? AND item_name = 'Зелье лечения'", (user['id'],))
        potion = c.fetchone()
        if potion and potion[0] > 0:
            c.execute("UPDATE inventory SET quantity = quantity - 1 WHERE user_id = ? AND item_name = 'Зелье лечения'", (user['id'],))
            heal_amt = 50
            c.execute("UPDATE users SET hp = MIN(max_hp, hp + ?) WHERE id = ?", (heal_amt, user['id']))
            result['healed'] = heal_amt
        else:
            result['error'] = 'Нет зелий!'
            
    conn.commit()
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    updated_user = dict(c.fetchone())
    conn.close()
    
    result['user'] = updated_user
    return jsonify(result)

@app.route('/api/leaderboard', methods=['GET'])
def api_leaderboard():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT username, level, gold FROM users ORDER BY level DESC, gold DESC LIMIT 10")
    leaders = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(leaders)

# --- Telegram Bot ---
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    referrer_id = args[0] if args else None
    
    webapp_url = WEB_APP_URL
    if referrer_id:
        webapp_url += f"?startapp={referrer_id}"
    
    keyboard = [[InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=webapp_url))]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        f"Привет, {update.effective_user.first_name}! Добро пожаловать в Поиски Тайн!\n"
        f"Нажми кнопку ниже, чтобы начать игру.",
        reply_markup=reply_markup
    )

def run_bot():
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start_command))
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    init_db()
    logger.info(f"Запуск сервера на порту {PORT}...")
    
    bot_thread = asyncio.new_event_loop()
    asyncio.set_event_loop(bot_thread)
    bot_thread.run_in_executor(None, run_bot)
    
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
