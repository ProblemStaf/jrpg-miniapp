from flask import Flask, request, jsonify
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, ContextTypes

app = Flask(__name__)
TOKEN = "8337587702:AAGMdqG25knEwe_xUSNm3mbc2Vto9E7RIlc"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[InlineKeyboardButton("Играть 🎮", web_app={"url": "https://problemstaf.github.io/jrpg-miniapp/"})]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text('Добро пожаловать в "Поиски Тайн"!', reply_markup=reply_markup)

@app.route('/webhook', methods=['POST'])
def webhook():
    # Обработка платежей и событий
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    application = Application.builder().token(TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.run_polling()
    app.run(port=5000)
