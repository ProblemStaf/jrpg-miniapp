FROM python:3.11-slim

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование файлов приложения
COPY *.py *.html *.css *.js ./

# Создание тома для базы данных
VOLUME ["/app/data"]

# Переменные окружения
ENV PYTHONUNBUFFERED=1
ENV PORT=5000

EXPOSE 5000

# Запуск приложения
CMD ["python", "server.py"]
