# Полный гайд: Telegram-бот для управления Kilo CLI

## Содержание

1. [Введение](#введение)
2. [Подготовка окружения](#подготовка-окружения)
3. [Установка и настройка Kilo CLI](#установка-и-настройка-kilo-cli)
4. [Создание Telegram-бота](#создание-telegram-бота)
5. [Настройка проекта бота](#настройка-проекта-бота)
6. [Написание кода бота](#написание-кода-бота)
7. [Запуск и тестирование](#запуск-и-тестирование)
8. [Расширенные возможности](#расширенные-возможности)
9. [Устранение проблем](#устранение-проблем)

---

## Введение

В этом гайде мы создадим Telegram-бота, который умеет:

- Управлять Kilo CLI для автоматического создания проектов
- Создавать Express-проекты с шаблонизатором Pug
- Выполнять произвольные команды через Kilo
- Управлять несколькими проектами одновременно

### Архитектура решения

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Telegram      │────▶│   Node.js       │────▶│   Kilo CLI      │
│   пользователь  │     │   Telegram Bot  │     │   (автономный)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   Файловая      │
                        │   система       │
                        └─────────────────┘
```

---

## Подготовка окружения

### Шаг 1: Проверка установленных инструментов

Перед началом убедитесь, что у вас установлены:

- **Node.js** (версия 18 или выше)
- **npm** (обычно устанавливается вместе с Node.js)
- **Telegram-аккаунт**

Проверьте установку:

```bash
node --version
# Должно вывести: v18.x.x или выше

npm --version
# Должно вывести: 9.x.x или выше
```

### Шаг 2: Создание рабочей директории

Создайте директорию для проекта и перейдите в неё:

```bash
mkdir telegram-kilo-bot
cd telegram-kilo-bot
```

---

## Установка и настройка Kilo CLI

### Шаг 1: Установка Kilo CLI глобально

```bash
npm install -g @kilocode/cli
```

### Шаг 2: Проверка установки

```bash
kilo --version
```

### Шаг 3: Настройка аутентификации

Для использования Kilo CLI необходимо войти в систему:

```bash
kilo auth
```

Команда предложит вам:

1. Войти с существующим аккаунтом
2. Создать новый аккаунт
3. Использовать собственный API-ключ

Выберите подходящий вариант и следуйте инструкциям.

### Шаг 4: Проверка работоспособности

```bash
kilo --help
```

Должен появиться список доступных команд.

---

## Создание Telegram-бота

### Шаг 1: Регистрация бота в Telegram

1. Откройте Telegram и найдите пользователя **@BotFather**
2. Отправьте ему команду `/newbot`
3. Следуйте инструкциям:
   - Введите имя бота (например, `Kilo Project Bot`)
   - Введите username бота (должен заканчиваться на `bot`, например: `kilo_project_bot`)
4. **Сохраните токен** — он понадобится позже

### Шаг 2: Настройка бота (опционально)

Отправьте `/setdescription` боту @BotFather для установки описания:

```bash
Команды:
/create [имя] - Создать Express + Pug проект
/list - Список проектов
/run [команда] - Выполнить команду через Kilo
/status - Проверить статус Kilo CLI
```

---

## Настройка проекта бота

### Шаг 1: Инициализация npm-проекта

```bash
npm init -y
```

### Шаг 2: Установка зависимостей

Установите необходимые пакеты:

```bash
npm install node-telegram-bot-api dotenv
```

Пояснение:

- `node-telegram-bot-api` — библиотека для создания Telegram-ботов
- `dotenv` — для загрузки переменных окружения из `.env` файла

### Шаг 3: Создание структуры проекта

Создайте следующую структуру файлов:

```text
telegram-kilo-bot/
├── bot.js              # Основной файл бота
├── .env                # Переменные окружения
├── package.json        # Зависимости проекта
└── projects/           # Директория для проектов (создастся автоматически)
```

### Шаг 4: Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
TELEGRAM_TOKEN=your_telegram_bot_token_here
```

**Важно:** Замените `your_telegram_bot_token_here` на токен, полученный от @BotFather.

---

## Написание кода бота

### Основной файл bot.js

Создайте файл `bot.js` со следующим содержимым:

```javascript
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Токен бота из переменных окружения
const TOKEN = process.env.TELEGRAM_TOKEN;

// Проверка наличия токена
if (!TOKEN) {
    console.error('❌ Ошибка: TELEGRAM_TOKEN не найден в .env файле');
    process.exit(1);
}

// Инициализация бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Директория для проектов
const PROJECTS_DIR = path.join(__dirname, 'projects');

// Создание директории для проектов, если её нет
if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    console.log('📁 Создана директория для проектов');
}

// Функция выполнения команды с выводом в Telegram
function runCommand(command, chatId, options = {}) {
    return new Promise((resolve, reject) => {
        const { cwd = PROJECTS_DIR, timeout = 300000 } = options; // Таймаут 5 минут по умолчанию
        
        // Уведомление о начале выполнения
        const messageId = bot.sendMessage(chatId, `🔄 *Выполняется:*\n\`${command}\``, {
            parse_mode: 'Markdown'
        }).then(m => m.message_id);
        
        console.log(`[${chatId}] Выполнение: ${command}`);
        
        exec(command, { cwd, timeout }, (error, stdout, stderr) => {
            if (error) {
                const errorMessage = `❌ *Ошибка:*\n\`${error.message}\``;
                bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
                console.error(`[${chatId}] Ошибка: ${error.message}`);
                reject(error);
                return;
            }
            
            // Формирование результата
            let result = '✅ *Выполнено*\n\n';
            
            if (stdout) {
                // Ограничиваем вывод, если слишком длинный
                const output = stdout.length > 3500 
                    ? stdout.substring(0, 3500) + '\n\n... (вывод обрезан)' 
                    : stdout;
                result += `\`\`\`\n${output}\n\`\`\``;
            }
            
            if (stderr) {
                result += `\n⚠️ *Предупреждения:*\n\`${stderr.substring(0, 500)}\``;
            }
            
            bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
            console.log(`[${chatId}] Выполнено успешно`);
            resolve(stdout);
        });
    });
}

// Функция создания Express + Pug проекта
async function createExpressProject(projectName, chatId) {
    const projectPath = path.join(PROJECTS_DIR, projectName);
    
    // Проверка на существование проекта
    if (fs.existsSync(projectPath)) {
        bot.sendMessage(chatId, `⚠️ Проект "${projectName}" уже существует!`);
        return false;
    }
    
    try {
        // Шаг 1: Создание директории проекта
        bot.sendMessage(chatId, `📁 *Создание директории проекта: ${projectName}*`, {
            parse_mode: 'Markdown'
        });
        fs.mkdirSync(projectPath);
        
        // Шаг 2: Инициализация package.json
        await runCommand('npm init -y', chatId, { cwd: projectPath });
        
        // Шаг 3: Установка зависимостей
        bot.sendMessage(chatId, '📦 *Установка зависимостей (express, pug)*', {
            parse_mode: 'Markdown'
        });
        await runCommand('npm install express pug', chatId, { cwd: projectPath });
        
        // Шаг 4: Запуск Kilo для создания структуры проекта
        const kiloPrompt = `
            Создай полноценный Express.js сервер с использованием Pug шаблонизатора.
            
            Требования:
            1. Основной файл app.js с настройкой Express
            2. Директория views/ с шаблонами layout.pug и index.pug
            3. Маршруты для главной страницы (/ и /about)
            4. Статические файлы из директории public/
            5. Обработка ошибок 404 и 500
            6. Использование переменных окружения для порта
            
            Настрой app.set('view engine', 'pug') и app.set('views', path.join(__dirname, 'views'))
        `;
        
        bot.sendMessage(chatId, '🤖 *Запуск Kilo для создания структуры проекта...*', {
            parse_mode: 'Markdown'
        });
        
        await runCommand(`kilo run --auto "${kiloPrompt}"`, chatId, { cwd: projectPath });
        
        bot.sendMessage(chatId, 
            `🎉 *Проект "${projectName}" успешно создан!*\n\n` +
            `📂 Расположение: \`./projects/${projectName}\`\n` +
            `🚀 Для запуска: \`cd projects/${projectName} && node app.js\``,
            { parse_mode: 'Markdown' }
        );
        
        return true;
        
    } catch (error) {
        bot.sendMessage(chatId, `❌ Ошибка при создании проекта: ${error.message}`);
        return false;
    }
}

// ==================== КОМАНДЫ БОТА ====================

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;
    
    bot.sendMessage(chatId, 
        `Привет, ${firstName}! 👋\n\n` +
        '🤖 *Kilo CLI Telegram Bot*\n\n' +
        'Я помогу тебе создавать проекты с помощью Kilo CLI.\n\n' +
        '*Доступные команды:*\n\n' +
        '📦 /create [имя] — Создать Express + Pug проект\n' +
        '📂 /list — Список проектов\n' +
        '🗑️ /delete [имя] — Удалить проект\n' +
        '▶️ /run [команда] — Выполнить команду через Kilo\n' +
        'ℹ️ /status — Статус Kilo CLI\n' +
        '📖 /help — Справка',
        { parse_mode: 'Markdown' }
    );
});

// Команда /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId, 
        '*📖 Справка*\n\n' +
        '*Основные команды:*\n' +
        '/create myapp — Создать проект с именем myapp\n' +
        '/list — Показать все проекты\n' +
        '/delete myapp — Удалить проект myapp\n' +
        '/status — Проверить статус Kilo CLI\n\n' +
        '*Kilo команды:*\n' +
        '/run Создай REST API — Выполнить произвольный запрос\n\n' +
        '*Примеры:*\n' +
        '/create shop\n' +
        '/create blog --pug\n' +
        '/run Добавь аутентификацию',
        { parse_mode: 'Markdown' }
    );
});

// Команда /create
bot.onText(/\/create\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const projectName = match[1].trim().replace(/[^a-zA-Z0-9-_]/g, '');
    
    if (!projectName) {
        bot.sendMessage(chatId, '⚠️ Укажите имя проекта: /create [имя]');
        return;
    }
    
    if (projectName.length > 50) {
        bot.sendMessage(chatId, '⚠️ Имя проекта слишком длинное (макс. 50 символов)');
        return;
    }
    
    await createExpressProject(projectName, chatId);
});

// Команда /list
bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!fs.existsSync(PROJECTS_DIR)) {
        bot.sendMessage(chatId, '📂 Проектов пока нет');
        return;
    }
    
    const projects = fs.readdirSync(PROJECTS_DIR)
        .filter(p => {
            try {
                return fs.statSync(path.join(PROJECTS_DIR, p)).isDirectory();
            } catch {
                return false;
            }
        });
    
    if (projects.length === 0) {
        bot.sendMessage(chatId, '📂 Проектов пока нет\n\nИспользуйте /create [имя] для создания проекта');
    } else {
        const list = projects.map(p => {
            const stats = fs.statSync(path.join(PROJECTS_DIR, p));
            const date = stats.mtime.toLocaleDateString('ru-RU');
            return `📁 *${p}*\n   └─ Создан: ${date}`;
        }).join('\n\n');
        
        bot.sendMessage(chatId, `📂 *Проекты (${projects.length}):*\n\n${list}`, {
            parse_mode: 'Markdown'
        });
    }
});

// Команда /delete
bot.onText(/\/delete\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const projectName = match[1].trim();
    const projectPath = path.join(PROJECTS_DIR, projectName);
    
    if (!fs.existsSync(projectPath)) {
        bot.sendMessage(chatId, `⚠️ Проект "${projectName}" не найден`);
        return;
    }
    
    // Удаление директории
    fs.rmSync(projectPath, { recursive: true, force: true });
    
    bot.sendMessage(chatId, `🗑️ Проект "${projectName}" удалён`);
});

// Команда /run
bot.onText(/\/run\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const command = match[1].trim();
    
    if (!command) {
        bot.sendMessage(chatId, '⚠️ Укажите команду: /run [запрос]');
        return;
    }
    
    try {
        await runCommand(`kilo run --auto "${command}"`, chatId);
    } catch (error) {
        // Ошибка уже обработана в runCommand
    }
});

// Команда /status
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    
    // Проверка версии Kilo
    exec('kilo --version', (error, stdout, stderr) => {
        let status = '';
        
        if (error) {
            status = '❌ *Kilo CLI не установлен*';
        } else {
            status = `✅ *Kilo CLI:* \`${stdout.trim()}\``;
        }
        
        // Проверка версии Node.js
        exec('node --version', (err, nodeVersion) => {
            const nodeStatus = err 
                ? 'Node.js: неизвестно' 
                : `Node.js: \`${nodeVersion.trim()}\``;
            
            bot.sendMessage(chatId, 
                `${status}\n${nodeStatus}`,
                { parse_mode: 'Markdown' }
            );
        });
    });
});

// Обработка ошибок polling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, error.message);
});

// Уведомление о запуске
console.log('🤖 Telegram-бот запущен и готов к работе!');
console.log(`📂 Проекты будут создаваться в: ${PROJECTS_DIR}`);
```

---

## Запуск и тестирование

### Шаг 1: Запуск бота

```bash
node bot.js
```

Вы должны увидеть:

```text
🤖 Telegram-бот запущен и готов к работе!
📂 Проекты будут создаваться в: /path/to/telegram-kilo-bot/projects
```

### Шаг 2: Тестирование бота

1. Откройте Telegram и найдите вашего бота по username
2. Отправьте `/start`
3. Проверьте команды:
   - `/status` — проверка статуса Kilo CLI
   - `/list` — просмотр проектов
   - `/create testproject` — создание тестового проекта

### Шаг 3: Пример работы

Отправьте боту:

```text
/create myexpressapp
```

Бот последовательно:

1. 📁 Создаст директорию `projects/myexpressapp`
2. 📦 Инициализирует npm проект
3. 📦 Установит express и pug
4. 🤖 Запустит Kilo для создания структуры проекта
5. 🎉 Сообщит об успешном завершении

---

## Расширенные возможности

### Добавление inline-клавиатуры

```javascript
// Команда для показа меню
bot.onText(/\/menu/, (msg) => {
    const chatId = msg.chat.id;
    
    const options = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: '📦 Создать проект', callback_data: 'create' }],
                [{ text: '📂 Список проектов', callback_data: 'list' }],
                [{ text: 'ℹ️ Статус', callback_data: 'status' }]
            ]
        })
    };
    
    bot.sendMessage(chatId, 'Выберите действие:', options);
});

// Обработка callback-запросов
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    switch (data) {
        case 'create':
            bot.sendMessage(chatId, 'Введите имя проекта: /create [имя]');
            break;
        case 'list':
            bot.emit('text', { chat: { id: chatId }, text: '/list' });
            break;
        case 'status':
            bot.emit('text', { chat: { id: chatId }, text: '/status' });
            break;
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
});
```

### Логирование в файл

Добавьте в начало файла:

```javascript
const logStream = fs.createWriteStream(path.join(__dirname, 'bot.log'), { flags: 'a' });

function log(message) {
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ${message}\n`);
    console.log(`[${timestamp}] ${message}`);
}

// Использование: log('Пользователь создал проект');
```

### Защита от злоупотреблений

```javascript
// Ограничение количества проектов на пользователя
const userProjects = new Map();

bot.onText(/\/create (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const projectName = match[1].trim();
    
    // Проверка лимита
    const userProjectCount = userProjects.get(chatId) || 0;
    if (userProjectCount >= 10) {
        bot.sendMessage(chatId, '⚠️ Достигнут лимит проектов (10). Удалите старые проекты.');
        return;
    }
    
    // Увеличиваем счётчик
    userProjects.set(chatId, userProjectCount + 1);
    
    // ... остальной код создания проекта
});
```

---

## Устранение проблем

### Ошибка: "TELEGRAM_TOKEN не найден"

**Проблема:** В файле `.env` не указан токен или файл отсутствует.

**Решение:**

1. Проверьте наличие файла `.env` в корне проекта

2. Убедитесь, что токен указан правильно:

   ```.env
   TELEGRAM_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

### Ошибка: "kilo: command not found"

**Проблема:** Kilo CLI не установлен глобально.

**Решение:**

```bash
npm install -g @kilocode/cli
```

### Ошибка: "polling_error"

**Проблема:** Бот не может подключиться к Telegram.

**Решение:**

1. Проверьте интернет-соединение
2. Убедитесь, что токен бота валидный
3. Попробуйте перезапустить бота

### Ошибка таймаута при выполнении команды

**Проблема:** Kilo выполняется слишком долго.

**Решение:** Увеличьте таймаут в функции `runCommand`:

```javascript
await runCommand(command, chatId, { timeout: 600000 }); // 10 минут
```

### Бот не отвечает

**Проблема:** Polling не запустился.

**Решение:**

1. Проверьте, запущен ли бот: `node bot.js`
2. Проверьте консоль на наличие ошибок
3. Перезапустите бота: остановите (Ctrl+C) и запустите снова

---

## Структура готового проекта

После завершения всех шагов у вас будет:

```text
telegram-kilo-bot/
├── bot.js              # Основной код бота (200+ строк)
├── .env                # Токен Telegram-бота
├── package.json        # Зависимости
├── package-lock.json   # Lock-файл npm
├── bot.log             # Логи (после запуска)
└── projects/           # Созданные проекты
    ├── project1/
    │   ├── app.js
    │   ├── views/
    │   │   ├── layout.pug
    │   │   └── index.pug
    │   ├── public/
    │   └── package.json
    └── project2/
        └── ...
```

---

## Следующие шаги

После создания базового бота вы можете:

1. **Добавить больше команд** — например, `/build`, `/deploy`
2. **Интегрировать с Git** — автоматический коммит созданных проектов
3. **Добавить Docker** — контейнеризация созданных приложений
4. **Развернуть бота** — использовать PM2 для запуска в продакшене

### Деплой бота на продакшен

```bash
# Установка PM2
npm install -g pm2

# Запуск бота
pm2 start bot.js --name telegram-kilo-bot

# Автоперезапуск при ошибках
pm2 start bot.js --name telegram-kilo-bot --watch

# Просмотр логов
pm2 logs telegram-kilo-bot
```

---

## Полезные ссылки

- [Документация node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
- [Kilo CLI документация](https://kilo.ai/docs/cli)
- [Express.js](https://expressjs.com/)
- [Pug шаблонизатор](https://pugjs.org/)

---

**Гайд создан для версии

node-telegram-bot-api@latest и Kilo CLI@latest**
