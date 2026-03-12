require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Токен бота из переменных окружения
const TOKEN = process.env.TELEGRAM_TOKEN;

// Полный путь к kilo
const KILO_PATH = process.env.KILO_PATH || '/Users/vlad/.nvm/versions/node/v20.18.0/bin/kilo';

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
        
        // Добавляем PATH для корректного выполнения команд
        const execOptions = {
            cwd,
            timeout,
            env: { ...process.env, PATH: '/Users/vlad/.nvm/versions/node/v20.18.0/bin:/usr/local/bin:/usr/bin:/bin' }
        };
        
        // Уведомление о начале выполнения
        const messageId = bot.sendMessage(chatId, `🔄 *Выполняется:*\n\`${command}\``, {
            parse_mode: 'Markdown'
        }).then(m => m.message_id);
        
        console.log(`[${chatId}] Выполнение: ${command}`);
        
        exec(command, execOptions, (error, stdout, stderr) => {
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
        
        await runCommand(`${KILO_PATH} run --auto "${kiloPrompt}"`, chatId, { cwd: projectPath });
        
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
        '*Основные команды:*\n\n' +
        '/create myapp — Создать проект с именем myapp\n' +
        '/list — Показать все проекты\n' +
        '/delete myapp — Удалить проект myapp\n' +
        '/status — Проверить статус Kilo CLI\n\n' +
        '*Kilo команды:*\n\n' +
        '/run Создай REST API — Выполнить произвольный запрос\n\n' +
        '*Примеры:*\n\n' +
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
        await runCommand(`${KILO_PATH} run --auto "${command}"`, chatId);
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