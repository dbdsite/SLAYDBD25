// Анти-копирование защита
(function() {
    if (window.location.hostname !== 'dbdsite.github.io' && 
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1') {
        document.body.innerHTML = '<div style="text-align:center;padding:50px;color:#D4AF37;font-size:24px;">⚠️ Несанкционированный доступ запрещен!</div>';
    }
})();
              
// ============================================
// CONFIGURATION - НАСТРОЙКИ
// ============================================
const CONFIG = {
    // URL Google Apps Script (ОБЯЗАТЕЛЬНО ЗАМЕНИТЬ!)
    GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby0cb30654qh3QFHtvHi5weg_tKrP5FqKJzhQ4Yv2D5p_P1eBdgHEZMwdTrbEOyB2Xa/exec',
    
    // Локальные настройки (не содержат секретов!)
    TELEGRAM_CHANNEL_URL: 'https://t.me/slaydbd2025',
    SUPPORT_URL: 'https://dalink.to/slaydbd25',
    
    // Включение/выключение кнопок
    BUTTONS: {
        SUGGEST_STREAMER: true,
        NOMINATE_STREAMER: false,
        STREAMERS_LIST: true,
        NOMINEES_LIST: false,
        SUPPORT_FUND: true,
        INFO: true,
        VOTES_COUNT: true,
        CONTACT_SUPPORT: true
    }
};

// ============================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================
let currentNomination = '';
let currentStreamers = [];
let winner = null;
let voterData = {};
let supportUserTelegram = '';
let selectedStreamerForVote = { name: '', twitch: '' };
let streamersVoteTelegram = '';
let streamersFromSheet = [];

// КАПЧА ПЕРЕМЕННЫЕ
let captchaAnswer = 0;
let captchaVerified = false;

// 🆕 SESSION TOKEN ДЛЯ ЗАЩИТЫ ОТ БОТОВ
let sessionToken = null;

const NOMINATION_NAMES = {
    'best_streamer': 'Лучший ДБД стример года',
    'best_guide': 'Лучший гайд контент',
    'best_entertainment': 'Лучший развлекательный контент',
    'viewers_choice': 'Приз зрительских симпатий'
};

// ============================================
// TELEGRAM VALIDATOR - ОБЯЗАТЕЛЬНЫЙ @
// ============================================

// Валидация Telegram логина (пользователь САМ должен написать @)
function validateTelegramLogin(value) {
    const trimmed = value.trim();
    
    // Проверяем что начинается с @
    if (!trimmed.startsWith('@')) {
        return { 
            valid: false, 
            error: 'Telegram логин должен начинаться с @ (например: @username)' 
        };
    }
    
    // Проверяем минимальную длину (@ + минимум 5 символов)
    if (trimmed.length < 6) {
        return { 
            valid: false, 
            error: 'Telegram логин слишком короткий (минимум 5 символов после @)' 
        };
    }
    
    // Проверяем максимальную длину (@ + максимум 32 символа)
    if (trimmed.length > 33) {
        return { 
            valid: false, 
            error: 'Telegram логин слишком длинный (максимум 32 символа после @)' 
        };
    }
    
    // Проверяем допустимые символы (буквы, цифры, подчеркивание)
    const usernameRegex = /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
    if (!usernameRegex.test(trimmed)) {
        return { 
            valid: false, 
            error: 'Telegram логин может содержать только латинские буквы, цифры и _ (должен начинаться с буквы)' 
        };
    }
    
    return { 
        valid: true, 
        value: trimmed,  // Это поле должно быть value, а не formatted
        formatted: trimmed  // Добавляем formatted для обратной совместимости
    };
}

// ============================================
// НАСТРОЙКА TELEGRAM ИНПУТОВ
// ============================================
function setupTelegramInputs() {
    // Находим все поля для ввода Telegram
    const telegramInputs = document.querySelectorAll('input[id*="Telegram"], input[id*="telegram"]');
    
    telegramInputs.forEach(input => {
        // Убираем предыдущие обработчики (если были)
        input.removeEventListener('input', handleTelegramInput);
        input.removeEventListener('blur', handleTelegramBlur);
        
        // Добавляем новые обработчики
        input.addEventListener('input', handleTelegramInput);
        input.addEventListener('blur', handleTelegramBlur);
        
        // Устанавливаем placeholder если его нет
        if (!input.placeholder) {
            input.placeholder = '@username';
        }
    });
}

function handleTelegramInput(e) {
    const input = e.target;
    let value = input.value;
    
    // Убираем пробелы в начале
    value = value.trimStart();
    
    // Если пользователь начал вводить без @, не мешаем ему
    // Но показываем подсказку
    if (value.length > 0 && !value.startsWith('@')) {
        input.style.borderColor = '#ff6b6b';
    } else {
        input.style.borderColor = '';
    }
    
    input.value = value;
}

function handleTelegramBlur(e) {
    const input = e.target;
    let value = input.value.trim();
    
    // При потере фокуса сбрасываем стиль
    input.style.borderColor = '';
    
    // Если поле не пустое и не начинается с @, можно добавить подсказку
    // Но НЕ добавляем @ автоматически - пользователь должен сам
    if (value.length > 0 && !value.startsWith('@')) {
        // Можно показать tooltip или оставить как есть
        // Валидация произойдёт при отправке
    }
}

// ============================================
// КАПЧА - ЗАЩИТА ОТ НАКРУТКИ
// ============================================
function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    
    // Выбираем операцию (только + и - для простоты, чтобы не было отрицательных результатов)
    const useAddition = Math.random() > 0.5;
    
    let question, answer;
    
    if (useAddition) {
        question = `${num1} + ${num2}`;
        answer = num1 + num2;
    } else {
        // Для вычитания делаем так, чтобы результат был положительным
        const bigger = Math.max(num1, num2);
        const smaller = Math.min(num1, num2);
        question = `${bigger} - ${smaller}`;
        answer = bigger - smaller;
    }
    
    captchaAnswer = answer;
    captchaVerified = false;
    
    return question;
}

function verifyCaptcha(userAnswer) {
    const parsed = parseInt(userAnswer, 10);
    if (isNaN(parsed)) {
        return false;
    }
    captchaVerified = (parsed === captchaAnswer);
    return captchaVerified;
}

function refreshCaptcha() {
    const captchaQuestion = document.getElementById('captchaQuestion');
    if (captchaQuestion) {
        captchaQuestion.textContent = generateCaptcha();
    }
    const captchaInput = document.getElementById('captchaInput');
    if (captchaInput) {
        captchaInput.value = '';
    }
    captchaVerified = false;
}

// ============================================
// BROWSER FINGERPRINT (УЛУЧШЕННЫЙ)
// ============================================
function generateFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    const canvasData = canvas.toDataURL();
    
    const fingerprint = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 'unknown',
        navigator.platform || 'unknown',
        canvasData.slice(-100)  // 🆕 Берём больше данных
    ].join('|');
    
    // 🆕 УЛУЧШЕННЫЙ ХЕШ (длиннее и без подозрительного префикса)
    let hash1 = 0;
    let hash2 = 0;
    for (let i = 0; i < fingerprint.length; i++) {
        const char = fingerprint.charCodeAt(i);
        hash1 = ((hash1 << 5) - hash1) + char;
        hash1 = hash1 & hash1;
        hash2 = ((hash2 << 7) + hash2) ^ char;
        hash2 = hash2 & hash2;
    }
    
    // Формируем длинный fingerprint (минимум 20 символов)
    const part1 = Math.abs(hash1).toString(36);
    const part2 = Math.abs(hash2).toString(36);
    const part3 = Date.now().toString(36);
    
    return part1 + part2 + part3;  // Без префикса fp_
}

function getFingerprint() {
    let fp = localStorage.getItem('deviceFingerprint');
    
    // 🆕 Проверяем что fingerprint достаточно длинный и валидный
    if (!fp || fp.length < 20 || fp.startsWith('fp_')) {
        fp = generateFingerprint();
        localStorage.setItem('deviceFingerprint', fp);
    }
    
    return fp;
}

// ============================================
// SESSION TOKEN - ЗАЩИТА ОТ БОТОВ
// ============================================
async function initSession() {
    try {
        const response = await fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL + '?action=getSessionToken');
        
        if (!response.ok) {
            throw new Error('Failed to get session token');
        }
        
        const data = await response.json();
        sessionToken = data.token;
        console.log('✅ Session token получен');
        
    } catch (error) {
        console.error('❌ Ошибка получения session token:', error);
        sessionToken = null;
    }
}

// ============================================
// PLACEHOLDER IMAGES (SVG Data URI)
// ============================================
const PLACEHOLDER = {
    AVATAR_120: 'data:image/svg+xml,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
            <rect fill="#1a1a2e" width="120" height="120" rx="10"/>
            <circle fill="#16213e" cx="60" cy="45" r="22"/>
            <ellipse fill="#16213e" cx="60" cy="95" rx="30" ry="22"/>
            <text fill="#d4af37" font-family="Arial" font-size="10" x="60" y="118" text-anchor="middle">No Image</text>
        </svg>
    `),
    
    AVATAR_150: 'data:image/svg+xml,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
            <rect fill="#1a1a2e" width="150" height="150" rx="12"/>
            <circle fill="#16213e" cx="75" cy="55" r="28"/>
            <ellipse fill="#16213e" cx="75" cy="115" rx="38" ry="28"/>
            <text fill="#d4af37" font-family="Arial" font-size="12" x="75" y="145" text-anchor="middle">No Image</text>
        </svg>
    `),
    
    AVATAR_200: 'data:image/svg+xml,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#1a1a2e"/>
                    <stop offset="100%" style="stop-color:#16213e"/>
                </linearGradient>
            </defs>
            <rect fill="url(#bg)" width="200" height="200" rx="15"/>
            <circle fill="#0f3460" cx="100" cy="75" r="38"/>
            <ellipse fill="#0f3460" cx="100" cy="155" rx="50" ry="35"/>
            <text fill="#d4af37" font-family="Arial" font-size="14" x="100" y="195" text-anchor="middle">No Image</text>
        </svg>
    `),
    
    AVATAR_50: 'data:image/svg+xml,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">
            <rect fill="#1a1a2e" width="50" height="50" rx="6"/>
            <circle fill="#16213e" cx="25" cy="18" r="10"/>
            <ellipse fill="#16213e" cx="25" cy="40" rx="14" ry="10"/>
        </svg>
    `),
    
    AVATAR_100: 'data:image/svg+xml,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
            <rect fill="#1a1a2e" width="100" height="100" rx="8"/>
            <circle fill="#16213e" cx="50" cy="38" r="18"/>
            <ellipse fill="#16213e" cx="50" cy="78" rx="25" ry="18"/>
            <text fill="#d4af37" font-family="Arial" font-size="9" x="50" y="96" text-anchor="middle">No Image</text>
        </svg>
    `)
};

function handleImageError(img, size = 120) {
    img.onerror = null;
    const placeholders = {
        50: PLACEHOLDER.AVATAR_50,
        100: PLACEHOLDER.AVATAR_100,
        120: PLACEHOLDER.AVATAR_120,
        150: PLACEHOLDER.AVATAR_150,
        200: PLACEHOLDER.AVATAR_200
    };
    img.src = placeholders[size] || PLACEHOLDER.AVATAR_120;
}

// ============================================
// COOKIES & LOCAL STORAGE
// ============================================
function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Strict';
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
    return null;
}

function hasAlreadyActed(actionType) {
    return localStorage.getItem(actionType) || getCookie(actionType);
}

function markAsActed(actionType) {
    const fp = getFingerprint();
    const data = { fingerprint: fp, timestamp: Date.now() };
    localStorage.setItem(actionType, JSON.stringify(data));
    setCookie(actionType, fp, 365);
}

// ============================================
// API ЗАПРОСЫ К GOOGLE APPS SCRIPT
// ============================================
async function apiRequest(action, data = {}) {
    try {
        const response = await fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify({
                action: action,
                fingerprint: getFingerprint(),
                sessionToken: sessionToken,  // 🆕 ДОБАВЛЯЕМ SESSION TOKEN
                ...data
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse response:', text);
            return { error: 'Invalid response format' };
        }
        
    } catch (error) {
        console.error(`API Error (${action}):`, error);
        return { error: error.message };
    }
}

async function apiGet(action) {
    try {
        const response = await fetch(`${CONFIG.GOOGLE_APPS_SCRIPT_URL}?action=${action}`, {
            method: 'GET',
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse response:', text);
            return { error: 'Invalid response format' };
        }
        
    } catch (error) {
        console.error(`API GET Error (${action}):`, error);
        return { error: error.message };
    }
}

// ============================================
// LOADING OVERLAY
// ============================================
function showLoadingOverlay(text = 'Загрузка...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.9);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                flex-direction: column;
                gap: 20px;
            ">
                <div style="
                    width: 50px;
                    height: 50px;
                    border: 4px solid rgba(212, 175, 55, 0.3);
                    border-top-color: #d4af37;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                "></div>
                <p id="loadingText" style="color: #d4af37; font-size: 1.2rem;">${text}</p>
            </div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
        document.body.appendChild(overlay);
    } else {
        const textEl = document.getElementById('loadingText');
        if (textEl) textEl.textContent = text;
        overlay.style.display = 'block';
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    createIntroParticles();
    
    // Настраиваем автоформатирование Telegram полей
    setupTelegramInputs();
    
    // 🆕 ПОЛУЧАЕМ SESSION TOKEN (защита от ботов)
    await initSession();
    
    // Проверяем доступность API
    const pingResult = await apiGet('ping');
    if (pingResult.error) {
        console.warn('API недоступен, будет использована локальная база');
    } else {
        console.log('✅ API доступен:', pingResult.timestamp);
    }
    
    setTimeout(() => {
        const intro = document.getElementById('introOverlay');
        if (intro) intro.classList.add('hidden');
    }, 4500);
    
    checkVotedNominations();
});

function createIntroParticles() {
    const container = document.getElementById('introParticles');
    if (!container) return;
    for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 3 + 's';
        particle.style.animationDuration = (2 + Math.random() * 2) + 's';
        container.appendChild(particle);
    }
}

// ============================================
// NAVIGATION
// ============================================
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    
    if (sectionId === 'streamersListSection') {
        loadStreamersFromSheet();
    }
    
    // Повторно настраиваем Telegram инпуты (для динамически созданных)
    setTimeout(setupTelegramInputs, 100);
    
    window.scrollTo(0, 0);
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    // Сбрасываем капчу при закрытии
    captchaVerified = false;
}

function showModal(modalId, text = null) {
    const modal = document.getElementById(modalId);
    
    if (text) {
        const textElement = document.getElementById(modalId + 'Text');
        if (textElement) textElement.textContent = text;
    }
    
    // Устанавливаем высокий z-index для окон ошибок
    if (modalId === 'errorModal' || modalId === 'disabledModal') {
        modal.style.zIndex = '9999';
    }
    
    modal.classList.add('active');
    
    // Фокус на кнопку закрытия
    const closeBtn = modal.querySelector('button');
    if (closeBtn) closeBtn.focus();
}

// ============================================
// BUTTON HANDLER
// ============================================
function handleButton(buttonType) {
    const buttonMap = {
        'suggest': { enabled: CONFIG.BUTTONS.SUGGEST_STREAMER, action: handleSuggestStreamer, name: 'Предложить стримера' },
        'nominate': { enabled: CONFIG.BUTTONS.NOMINATE_STREAMER, action: handleVote, name: 'Номинировать стримера' },
        'streamersList': { enabled: CONFIG.BUTTONS.STREAMERS_LIST, action: () => showSection('streamersListSection'), name: 'Список стримеров' },
        'nomineesList': { enabled: CONFIG.BUTTONS.NOMINEES_LIST, action: () => { showSection('nomineesListSection'); loadNominees(); }, name: 'Список номинантов' },
        'fund': { enabled: CONFIG.BUTTONS.SUPPORT_FUND, action: () => showSection('fundSection'), name: 'Поддержать фонд' },
        'info': { enabled: CONFIG.BUTTONS.INFO, action: () => showSection('infoSection'), name: 'Информация' },
        'votes': { enabled: CONFIG.BUTTONS.VOTES_COUNT, action: () => { showSection('votesSection'); loadVotes(); }, name: 'Количество голосов' },
        'support': { enabled: CONFIG.BUTTONS.CONTACT_SUPPORT, action: openSupportModal, name: 'Связаться с поддержкой' }
    };

    const button = buttonMap[buttonType];
    
    if (!button.enabled) {
        showDisabledModal( `Раздел "${button.name}" пока что недоступен.`);
        return;
    }
    
    button.action();
}

// ============================================
// ЗАГРУЗКА СТРИМЕРОВ
// ============================================
async function loadStreamersFromSheet() {
    const loadingEl = document.getElementById('streamersLoading');
    const errorEl = document.getElementById('streamersError');
    const gridEl = document.getElementById('streamersGrid');
    
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    gridEl.innerHTML = '';
    
    try {
        const result = await apiGet('getStreamers');
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        streamersFromSheet = result;
        loadingEl.style.display = 'none';
        renderStreamers(result.length > 0 ? result : STREAMERS_DB);
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        loadingEl.style.display = 'none';
        
        if (typeof STREAMERS_DB !== 'undefined') {
            renderStreamers(STREAMERS_DB);
        } else {
            errorEl.style.display = 'block';
        }
    }
}

function renderStreamers(streamers) {
    const gridEl = document.getElementById('streamersGrid');
    const hasVoted = hasAlreadyActed('streamersListVoted');
    
    if (streamers.length === 0) {
        gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #d4af37;"><p>Список стримеров пока пуст</p></div>`;
        return;
    }
    
    gridEl.innerHTML = streamers.map(streamer => `
        <div class="streamer-list-card">
            <img src="${streamer.image || PLACEHOLDER.AVATAR_120}" 
                 alt="${streamer.name}" 
                 class="streamer-list-image" 
                 onerror="handleImageError(this, 120)">
            <h3 class="streamer-list-name">${streamer.name}</h3>
            <div class="streamer-buttons">
                <a href="${streamer.twitch}" target="_blank" class="streamer-list-link">
                    <i class="fab fa-twitch"></i> TWITCH
                </a>
                <button class="streamer-vote-btn" 
                        onclick="openStreamersVoteModal('${escapeHtmlAttr(streamer.name)}', '${escapeHtmlAttr(streamer.twitch)}')"
                        ${hasVoted ? 'disabled' : ''}>
                    ${hasVoted ? '✓ Голос отдан' : '🗳️ Проголосовать'}
                </button>
            </div>
        </div>
    `).join('');
}

function escapeHtmlAttr(text) {
    return String(text).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ============================================
// ГОЛОСОВАНИЕ ЗА СТРИМЕРА (СПИСОК) С КАПЧЕЙ
// ============================================
function openStreamersVoteModal(streamerName, streamerTwitch) {
    if (hasAlreadyActed('streamersListVoted')) {
        showStreamersVoteStep('streamersVoteAlready');
        document.getElementById('streamersVoteModal').classList.add('active');
        return;
    }
    
    selectedStreamerForVote = { name: streamerName, twitch: streamerTwitch };
    
    document.getElementById('voteStreamerName').textContent = streamerName;
    document.getElementById('voteStreamerNameConfirm').textContent = streamerName;
    document.getElementById('streamersVoteTelegram').value = '';
    
    // Сбрасываем капчу
    captchaVerified = false;
    
    showStreamersVoteStep('streamersVoteStep1');
    document.getElementById('streamersVoteModal').classList.add('active');
    
    // Настраиваем Telegram input
    setTimeout(setupTelegramInputs, 100);
}

function closeStreamersVoteModal() {
    document.getElementById('streamersVoteModal').classList.remove('active');
    selectedStreamerForVote = { name: '', twitch: '' };
    streamersVoteTelegram = '';
    captchaVerified = false;
}

function showStreamersVoteStep(stepId) {
    ['streamersVoteStep1', 'streamersVoteStep2', 'streamersVoteCaptcha', 'streamersVoteStep3', 'streamersVoteAlready'].forEach(step => {
        const el = document.getElementById(step);
        if (el) el.style.display = step === stepId ? 'block' : 'none';
    });
}

function streamersVoteStep2() {
    const telegramInput = document.getElementById('streamersVoteTelegram');
    let telegram = telegramInput.value.trim();
    
    if (!telegram) {
        showErrorModal('Введите ваш Telegram логин');
        return;
    }
    
    // Форматируем и валидируем
    const validation = validateTelegramLogin(telegram);
    if (!validation.valid) {
        showErrorModal(validation.error);
        return;
    }
    
    // Обновляем значение в поле отформатированным логином
    telegramInput.value = validation.value;  // Используем validation.value
    streamersVoteTelegram = validation.value;  // Используем validation.value
    
    // Переходим к капче
    showStreamersVoteStep('streamersVoteCaptcha');
    refreshCaptcha();
}

function streamersVoteCheckCaptcha() {
    const captchaInput = document.getElementById('captchaInput');
    const userAnswer = captchaInput.value.trim();
    
    if (!userAnswer) {
        showErrorModal('Введите ответ на задачу');
        return;
    }
    
    if (!verifyCaptcha(userAnswer)) {
        showErrorModal('Неверный ответ! Попробуйте ещё раз.');
        refreshCaptcha();
        return;
    }
    
    // Капча пройдена - переходим к подтверждению
    showStreamersVoteStep('streamersVoteStep2');
}

async function submitStreamersVote() {
    // Проверяем что капча была пройдена
    if (!captchaVerified) {
        showErrorModal('Пожалуйста, пройдите проверку');
        showStreamersVoteStep('streamersVoteCaptcha');
        refreshCaptcha();
        return;
    }
    
    showLoadingOverlay('Отправка голоса...');
    
    const result = await apiRequest('vote', {
        streamerName: selectedStreamerForVote.name,
        telegram: streamersVoteTelegram
    });
    
    hideLoadingOverlay();
    
    if (result.error) {
        if (result.code === 'DUPLICATE') {
            showErrorModal('Вы уже голосовали!');
            markAsActed('streamersListVoted');
        } else {
            showErrorModal('Ошибка: ' + result.error);
        }
        return;
    }
    
    if (result.success) {
        markAsActed('streamersListVoted');
        showStreamersVoteStep('streamersVoteStep3');
        updateVoteButtons();
    } else {
        showErrorModal('Ошибка отправки. Попробуйте позже.');
    }
}

function updateVoteButtons() {
    document.querySelectorAll('.streamer-vote-btn').forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = '✓ Голос отдан';
    });
}

// ============================================
// КОЛИЧЕСТВО ГОЛОСОВ
// ============================================
async function loadVotes() {
    const container = document.getElementById('votesContainer');
    container.innerHTML = '<p style="text-align: center; color: #d4af37;">Загрузка...</p>';
    
    try {
        const streamers = await apiGet('getStreamers');
        
        if (streamers.error) {
            throw new Error(streamers.error);
        }
        
        const sortedStreamers = [...streamers].sort((a, b) => (b.votes || 0) - (a.votes || 0));
        const maxVotes = sortedStreamers[0]?.votes || 1;
        
        container.innerHTML = sortedStreamers.map((streamer, index) => {
            const percentage = ((streamer.votes || 0) / maxVotes) * 100;
            const position = index + 1;
            const isTop3 = position <= 3;
            const medals = ['🥇', '🥈', '🥉'];
            
            return `
                <div class="vote-item">
                    <div class="vote-position ${isTop3 ? 'top-3' : ''}">
                        ${isTop3 ? medals[position - 1] : position}
                    </div>
                    <img src="${streamer.image || PLACEHOLDER.AVATAR_50}" 
                         alt="${streamer.name}" 
                         class="vote-avatar"
                         onerror="handleImageError(this, 50)">
                    <div class="vote-info">
                        <div class="vote-name">${streamer.name}</div>
                        <div class="vote-bar-container">
                            <div class="vote-bar" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                    <div class="vote-count">${streamer.votes || 0}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Ошибка загрузки голосов:', error);
        container.innerHTML = '<p style="text-align: center; color: #ff6b6b;">Ошибка загрузки данных</p>';
    }
}

// ============================================
// ПРЕДЛОЖИТЬ СТРИМЕРА
// ============================================
function handleSuggestStreamer() {
    if (hasAlreadyActed('hasSuggested')) {
        showSection('suggestSection');
        document.getElementById('suggestStep1').style.display = 'none';
        document.getElementById('suggestStep2').style.display = 'none';
        document.getElementById('suggestSuccess').style.display = 'none';
        document.getElementById('alreadySuggested').style.display = 'block';
        return;
    }

    showSection('suggestSection');
    document.getElementById('suggestStep1').style.display = 'block';
    document.getElementById('suggestStep2').style.display = 'none';
    document.getElementById('suggestSuccess').style.display = 'none';
    document.getElementById('alreadySuggested').style.display = 'none';
    
    setTimeout(setupTelegramInputs, 100);
}

function suggestStep2() {
    const telegramInput = document.getElementById('userTelegram');
    const twitch = document.getElementById('userTwitch').value.trim();
    let telegram = telegramInput.value.trim();

    if (!telegram || !twitch) {
        showErrorModal('Пожалуйста, заполните все поля!');
        return;
    }

    // Валидация Telegram
    const validation = validateTelegramLogin(telegram);
    if (!validation.valid) {
        showErrorModal(validation.error);
        return;
    }
    
    telegramInput.value = validation.value;  // Используем validation.value

    document.getElementById('suggestStep1').style.display = 'none';
    document.getElementById('suggestStep2').style.display = 'block';
}

async function submitSuggestion() {
    const userTelegram = document.getElementById('userTelegram').value.trim();
    const userTwitch = document.getElementById('userTwitch').value.trim();
    const streamerNick = document.getElementById('streamerNick').value.trim();
    const streamerTwitch = document.getElementById('streamerTwitch').value.trim();

    if (!streamerNick || !streamerTwitch) {
        showErrorModal('Пожалуйста, заполните все поля!');
        return;
    }

    showLoadingOverlay('Отправка предложения...');

    const result = await apiRequest('suggest', {
        userTelegram: userTelegram,
        userTwitch: userTwitch,
        streamerNick: streamerNick,
        streamerTwitch: streamerTwitch
    });

    hideLoadingOverlay();

    if (result.success) {
        markAsActed('hasSuggested');
        document.getElementById('suggestStep2').style.display = 'none';
        document.getElementById('suggestSuccess').style.display = 'block';
    } else {
        if (result.code === 'DUPLICATE') {
            showErrorModal('Вы уже отправляли предложение!');
            markAsActed('hasSuggested');
        } else {
            showErrorModal( 'Ошибка отправки: ' + (result.error || 'Попробуйте позже'));
        }
    }
}

// ============================================
// ГОЛОСОВАНИЕ В НОМИНАЦИЯХ
// ============================================
function handleVote() {
    showSection('voteSection');
}

function checkVotedNominations() {
    ['best_streamer', 'best_guide', 'best_entertainment', 'viewers_choice'].forEach(nom => {
        const btn = document.querySelector(`[data-nomination="${nom}"]`);
        if (btn && hasAlreadyActed(`voted_${nom}`)) {
            btn.classList.add('voted');
        }
    });
}

function startVoting(nomination) {
    if (hasAlreadyActed(`voted_${nomination}`)) {
        currentNomination = nomination;
        showSection('votingProcess');
        document.getElementById('voterVerification').style.display = 'none';
        document.getElementById('bracketVoting').style.display = 'none';
        document.getElementById('winnerDisplay').style.display = 'none';
        document.getElementById('voteSuccess').style.display = 'none';
        document.getElementById('alreadyVoted').style.display = 'block';
        document.getElementById('currentNominationTitle').textContent = NOMINATION_NAMES[nomination];
        return;
    }

    currentNomination = nomination;
    document.getElementById('currentNominationTitle').textContent = NOMINATION_NAMES[nomination];
    showSection('votingProcess');
    
    document.getElementById('voterVerification').style.display = 'block';
    document.getElementById('bracketVoting').style.display = 'none';
    document.getElementById('winnerDisplay').style.display = 'none';
    document.getElementById('alreadyVoted').style.display = 'none';
    document.getElementById('voteSuccess').style.display = 'none';
    
    setTimeout(setupTelegramInputs, 100);
}

function startBracket() {
    const nick = document.getElementById('voterNick').value.trim();
    const telegramInput = document.getElementById('voterTelegram');
    const twitch = document.getElementById('voterTwitch').value.trim();
    let telegram = telegramInput.value.trim();

    if (!nick || !telegram || !twitch) {
        showErrorModal('Пожалуйста, заполните все поля!');
        return;
    }

    // Валидация Telegram
    const validation = validateTelegramLogin(telegram);
    if (!validation.valid) {
        showErrorModal(validation.error);
        return;
    }
    
    telegramInput.value = validation.value;  // Используем validation.value
    telegram = validation.value;  // Используем validation.value

    voterData = { nick, telegram, twitch };
    
    const sourceStreamers = streamersFromSheet.length > 0 ? streamersFromSheet : STREAMERS_DB;
    currentStreamers = [...sourceStreamers].sort(() => Math.random() - 0.5);

    document.getElementById('voterVerification').style.display = 'none';
    document.getElementById('bracketVoting').style.display = 'block';

    showNextMatch();
}

function showNextMatch() {
    if (currentStreamers.length === 1) {
        winner = currentStreamers[0];
        showWinner();
        return;
    }

    const remainingInRound = currentStreamers.length;
    document.getElementById('roundInfo').textContent = `Осталось стримеров: ${remainingInRound}`;
    
    const total = streamersFromSheet.length || STREAMERS_DB.length;
    const progress = ((total - remainingInRound) / (total - 1)) * 100;
    document.getElementById('progressFill').style.width = progress + '%';

    const streamer1 = currentStreamers[0];
    const streamer2 = currentStreamers[1];

    document.getElementById('streamersBattle').innerHTML = `
        <div class="streamer-card" onclick="selectStreamer(0)">
            <img src="${streamer1.image || PLACEHOLDER.AVATAR_150}" 
                 alt="${streamer1.name}" 
                 class="streamer-image" 
                 onerror="handleImageError(this, 150)">
            <h3 class="streamer-name">${streamer1.name}</h3>
            <a href="${streamer1.twitch}" target="_blank" class="streamer-link" onclick="event.stopPropagation()">
                <i class="fab fa-twitch"></i> Twitch
            </a>
        </div>
        <span class="vs-text">VS</span>
        <div class="streamer-card" onclick="selectStreamer(1)">
            <img src="${streamer2.image || PLACEHOLDER.AVATAR_150}" 
                 alt="${streamer2.name}" 
                 class="streamer-image"
                 onerror="handleImageError(this, 150)">
            <h3 class="streamer-name">${streamer2.name}</h3>
            <a href="${streamer2.twitch}" target="_blank" class="streamer-link" onclick="event.stopPropagation()">
                <i class="fab fa-twitch"></i> Twitch
            </a>
        </div>
    `;
}

function selectStreamer(index) {
    const selectedStreamer = currentStreamers[index];
    currentStreamers.splice(0, 2);
    currentStreamers.push(selectedStreamer);
    currentStreamers = currentStreamers.sort(() => Math.random() - 0.5);
    setTimeout(() => showNextMatch(), 300);
}

function showWinner() {
    document.getElementById('bracketVoting').style.display = 'none';
    document.getElementById('winnerDisplay').style.display = 'block';
    
    document.getElementById('winnerCard').innerHTML = `
        <img src="${winner.image || PLACEHOLDER.AVATAR_200}" 
             alt="${winner.name}" 
             class="streamer-image"
             onerror="handleImageError(this, 200)">
        <h3 class="streamer-name">${winner.name}</h3>
        <a href="${winner.twitch}" target="_blank" class="streamer-link">
            <i class="fab fa-twitch"></i> Twitch
        </a>
    `;
}

async function submitVote() {
    showLoadingOverlay('Отправка голоса...');

    const result = await apiRequest('nominationVote', {
        nomination: currentNomination,
        voterNick: voterData.nick,
        voterTelegram: voterData.telegram,
        voterTwitch: voterData.twitch,
        winnerName: winner.name,
        winnerTwitch: winner.twitch
    });

    hideLoadingOverlay();

    if (result.success) {
        markAsActed(`voted_${currentNomination}`);
        document.getElementById('winnerDisplay').style.display = 'none';
        document.getElementById('voteSuccess').style.display = 'block';
        checkVotedNominations();
    } else {
        if (result.code === 'DUPLICATE') {
            showErrorModal( 'Вы уже голосовали в этой номинации!');
            markAsActed(`voted_${currentNomination}`);
        } else {
            showErrorModal( 'Ошибка отправки: ' + (result.error || 'Попробуйте позже'));
        }
    }
}

function backToNominations() {
    showSection('voteSection');
    document.getElementById('voterNick').value = '';
    document.getElementById('voterTelegram').value = '';
    document.getElementById('voterTwitch').value = '';
    voterData = {};
    currentStreamers = [];
    winner = null;
}

// ============================================
// ПОДДЕРЖКА
// ============================================
function openSupportModal() {
    const lastSent = localStorage.getItem('supportLastSent') || getCookie('supportLastSent');
    
    if (lastSent) {
        const timePassed = Date.now() - parseInt(lastSent);
        const hoursLeft = 24 - (timePassed / (1000 * 60 * 60));
        
        if (hoursLeft > 0) {
            showSupportStep('supportAlreadySent');
            const hours = Math.floor(hoursLeft);
            const minutes = Math.floor((hoursLeft - hours) * 60);
            document.getElementById('supportCooldown').textContent = 
                hours > 0 ? `${hours} ч. ${minutes} мин.` : `${minutes} мин.`;
            document.getElementById('supportModal').classList.add('active');
            return;
        }
    }
    
    showSupportStep('supportStep1');
    document.getElementById('supportTelegram').value = '';
    document.getElementById('supportMessage').value = '';
    document.getElementById('supportModal').classList.add('active');
    
    setTimeout(setupTelegramInputs, 100);
}

function showSupportStep(stepId) {
    ['supportStep1', 'supportStep2', 'supportStep3', 'supportStep4', 'supportAlreadySent'].forEach(step => {
        const el = document.getElementById(step);
        if (el) el.style.display = step === stepId ? 'block' : 'none';
    });
}

function supportStep2() {
    const telegramInput = document.getElementById('supportTelegram');
    let telegram = telegramInput.value.trim();
    
    if (!telegram) {
        showErrorModal('Введите ваш Telegram логин');
        return;
    }
    
    // Валидация Telegram
    const validation = validateTelegramLogin(telegram);
    if (!validation.valid) {
        showErrorModal(validation.error);
        return;
    }
    
    telegramInput.value = validation.value;  // Используем validation.value
    supportUserTelegram = validation.value;  // Используем validation.value
    showSupportStep('supportStep2');
}

function supportStep3() {
    showSupportStep('supportStep3');
}

async function submitSupport() {
    const message = document.getElementById('supportMessage').value.trim();
    
    if (!message) {
        showErrorModal( 'Введите ваше сообщение');
        return;
    }
    
    if (message.length < 10) {
        showErrorModal( 'Сообщение слишком короткое (минимум 10 символов)');
        return;
    }

    showLoadingOverlay('Отправка сообщения...');

    const result = await apiRequest('support', {
        telegram: supportUserTelegram,
        message: message
    });

    hideLoadingOverlay();
    
    if (result.success) {
        const timestamp = Date.now().toString();
        localStorage.setItem('supportLastSent', timestamp);
        setCookie('supportLastSent', timestamp, 1);
        showSupportStep('supportStep4');
    } else {
        showErrorModal( 'Ошибка отправки: ' + (result.error || 'Попробуйте позже'));
    }
}

// ============================================
// NOMINEES
// ============================================
function loadNominees() {
    const grid = document.getElementById('nomineesGrid');
    const sourceStreamers = streamersFromSheet.length > 0 ? streamersFromSheet : STREAMERS_DB;
    
    grid.innerHTML = sourceStreamers.map(streamer => `
        <div class="nominee-card" onclick="openNomineeProfile(${streamer.id})">
            <img src="${streamer.image || PLACEHOLDER.AVATAR_100}" 
                 alt="${streamer.name}" 
                 class="nominee-card-image"
                 onerror="handleImageError(this, 100)">
            <h3 class="nominee-card-name">${streamer.name}</h3>
            <p class="nominee-card-hint">Нажмите для подробностей</p>
        </div>
    `).join('');
}

function openNomineeProfile(streamerId) {
    const sourceStreamers = streamersFromSheet.length > 0 ? streamersFromSheet : STREAMERS_DB;
    const streamer = sourceStreamers.find(s => s.id === streamerId);
    if (!streamer) return;

    document.getElementById('nomineeProfileImage').src = streamer.profileImage || streamer.image;
    document.getElementById('nomineeProfileImage').alt = streamer.name;
    document.getElementById('nomineeProfileName').textContent = streamer.name;
    document.getElementById('nomineeProfileTwitch').href = streamer.twitch;

    let interviewHTML = '<p style="color: #d4af37;">Интервью скоро появится...</p>';

    if (streamer.interview && streamer.interview.q1) {
        interviewHTML = '';
        
        for (let i = 1; i <= 3; i++) {
            const q = streamer.interview[`q${i}`];
            const a = streamer.interview[`a${i}`];
            
            if (q && a) {
                interviewHTML += `
                    <div class="interview-item">
                        <p class="interview-question">${q}</p>
                        <p class="interview-answer">${a}</p>
                    </div>
                `;
            }
        }
        
        if (interviewHTML === '') {
            interviewHTML = '<p style="color: #d4af37;">Интервью скоро появится...</p>';
        }
    }

    document.getElementById('nomineeInterviewContent').innerHTML = interviewHTML;
    document.getElementById('nomineeProfileModal').classList.add('active');
}

// ============================================
// FALLBACK STREAMERS DATABASE
// ============================================
const STREAMERS_DB = [
    {
        id: 1,
        name: "Spc_tgc",
        image: "https://static-cdn.jtvnw.net/jtv_user_pictures/f983d142-d6e5-46cf-80d9-f9c5cd6c6836-profile_image-70x70.png",
        profileImage: "https://static-cdn.jtvnw.net/jtv_user_pictures/f983d142-d6e5-46cf-80d9-f9c5cd6c6836-profile_image-70x70.png",
        twitch: "https://twitch.tv/spc_tgc",
        votes: 30,
        interview: {
            q1: "Как давно стримишь?",
            a1: "Достаточно давно, больше 5 лет.",
            q2: "Что самое важное в стриме?",
            a2: "Взаимодействие с коммьюнити и качественный контент.",
            q3: "Пожелание зрителям?",
            a3: "Спасибо за вашу поддержку и активность!"
        }
    },
    {
        id: 2,
        name: "MogilevTM",
        image: "https://static-cdn.jtvnw.net/jtv_user_pictures/183376cf-247a-433e-91bd-22fcd30d3901-profile_image-70x70.jpeg",
        profileImage: "https://static-cdn.jtvnw.net/jtv_user_pictures/183376cf-247a-433e-91bd-22fcd30d3901-profile_image-70x70.jpeg",
        twitch: "https://twitch.tv/mogilevtm",
        votes: 22,
        interview: {
            q1: "Почему начал стримить?",
            a1: "Хотел делиться своим игровым опытом.",
            q2: "Твой главный секрет успеха?",
            a2: "Регулярность и постоянное самосовершенствование.",
            q3: "Планы на будущее?",
            a3: "Расти дальше и пробовать новые форматы."
        }
    }
];

// ============================================
// НОВАЯ ФУНКЦИЯ ДЛЯ ПРАВИЛЬНОГО ПОКАЗА ОШИБОК
// ============================================
function showErrorModal(text) {
    const modal = document.getElementById('errorModal');
    const textElement = document.getElementById('errorModalText');
    
    if (textElement) {
        textElement.textContent = text;
    }
    
    // Устанавливаем самый высокий z-index
    modal.style.zIndex = '99999';
    modal.classList.add('active');
    
    // Фокус на кнопку закрытия
    const closeBtn = modal.querySelector('button');
    if (closeBtn) closeBtn.focus();
    
    // Прокручиваем к окну ошибки
    modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showDisabledModal(text) {
    const modal = document.getElementById('disabledModal');
    const textElement = document.getElementById('disabledModalText');
    
    if (textElement) {
        textElement.textContent = text;
    }
    
    // Устанавливаем самый высокий z-index
    modal.style.zIndex = '99999';
    modal.classList.add('active');
    
    // Фокус на кнопку закрытия
    const closeBtn = modal.querySelector('button');
    if (closeBtn) closeBtn.focus();
    
    // Прокручиваем к окну ошибки
    modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Обновляем функцию closeModal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        // Сбрасываем z-index после закрытия
        setTimeout(() => {
            modal.style.zIndex = '';
        }, 300);
    }
    
    // Сбрасываем капчу при закрытии
    if (modalId === 'streamersVoteModal') {
        captchaVerified = false;
    }
}

// Функции для модального окна поддержки фонда
        function showSupportFundModal() {
            document.getElementById('supportFundModal').style.display = 'flex';
        }
        
        function togglePaymentMethod(method) {
            const content = document.getElementById(method + 'Content');
            if (content.style.display === 'block') {
                content.style.display = 'none';
            } else {
                content.style.display = 'block';
                // Автоматически подстраиваем высоту iframe
                if (method === 'donatepay') {
                    content.querySelector('iframe').style.height = '220px';
                }
            }
        }
        
        function toggleCardNumber() {
            const content = document.getElementById('cardContent');
            const button = document.getElementById('cardButton');
            
            if (content.style.display === 'none') {
                // Показываем номер карты и меняем текст кнопки
                content.style.display = 'block';
                button.querySelector('.payment-name').textContent = '2204 1202 0195 2187';
                button.querySelector('.payment-arrow').textContent = '▲';
            } else {
                // Скрываем номер карты и возвращаем исходный текст
                content.style.display = 'none';
                button.querySelector('.payment-name').textContent = 'По номеру карты';
                button.querySelector('.payment-arrow').textContent = '▼';
            }
        }
        
        function copyCardNumber() {
            const cardNumber = document.getElementById('cardNumber').textContent;
            navigator.clipboard.writeText(cardNumber.replace(/\s/g, ''))
                .then(() => {
                    const copySuccess = document.getElementById('copySuccess');
                    copySuccess.style.display = 'block';
                    setTimeout(() => {
                        copySuccess.style.display = 'none';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Ошибка копирования: ', err);
                });
        }
        
        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

    // ============================================
    // ANTI-DEVTOOLS PROTECTION
    // ============================================
    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && e.key === 'u')) {
            e.preventDefault();
            return false;
        }
    });

    (function() {
        const threshold = 160;
        let devtoolsOpen = false;

        const checkDevTools = () => {
            const widthThreshold = window.outerWidth - window.innerWidth > threshold;
            const heightThreshold = window.outerHeight - window.innerHeight > threshold;

            if (widthThreshold || heightThreshold) {
                if (!devtoolsOpen) {
                    devtoolsOpen = true;
                    document.body.innerHTML = `
                        <div style="
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            background: #000000;
                            color: #D4AF37;
                            font-size: 2rem;
                            font-family: 'Montserrat', sans-serif;
                            text-align: center;
                            padding: 20px;
                            flex-direction: column;
                            gap: 20px;
                        ">
                            <div style="font-size: 5rem;">⚠️</div>
                            <div>Просмотр кода запрещён!</div>
                            <div style="font-size: 1rem; opacity: 0.7;">Закройте инструменты разработчика</div>
                        </div>
                    `;
                }
            } else {
                devtoolsOpen = false;
            }
        };

        setInterval(checkDevTools, 500);
        
        // Дополнительная проверка через debugger
        const detectDebugger = () => {
            const start = performance.now();
            debugger;
            const end = performance.now();
            if (end - start > 100) {
                document.body.innerHTML = `
                    <div style="
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        background: #000000;
                        color: #D4AF37;
                        font-size: 2rem;
                        font-family: sans-serif;
                        text-align: center;
                        padding: 20px;
                    ">
                        ⚠️ Просмотр кода запрещён!
                    </div>
                `;
            }
        };
        
        // Отключаем console методы
        const disableConsole = () => {
            const noop = () => undefined;
            const methods = ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir', 'dirxml', 'group', 'groupEnd', 'time', 'timeEnd', 'assert', 'profile'];
            methods.forEach(method => {
                window.console[method] = noop;
            });
        };
        
        disableConsole();
    })();

    // ============================================
    // DISABLE TEXT SELECTION AND DRAG
    // ============================================
    document.addEventListener('selectstart', e => e.preventDefault());
    document.addEventListener('dragstart', e => e.preventDefault());

    // ============================================
    // INITIALIZATION
    // ============================================
    console.log('%c⚠️ СТОП!', 'color: red; font-size: 50px; font-weight: bold;');
    console.log('%cЭто функция браузера предназначена для разработчиков.', 'font-size: 18px;');
