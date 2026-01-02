// ===== ОЧЕРЕДЬ ЗАКАЗОВ =====

// Конфигурация
const QUEUE_CONFIG = {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9GFUc83lUcJoHGqrgmWtSgkIy7LKvNfwXFQwnkC_yvcWqZVSS90tQRVQrPpZZp-PUNZw8hdUut_Oj/pub?gid=0&single=true&output=csv',
    cacheKey: 'ludekard_queue_cache',
    cacheDuration: 3 * 60 * 1000, // 3 минуты
    refreshInterval: 2 * 60 * 1000 // 2 минуты
};

// Глобальные переменные для хранения данных
let queueData = [];
let commissionsStatus = false; // false = закрыты, true = открыты

// Функция для загрузки данных из Google Таблицы
async function loadQueueData() {
    console.log('🔄 Загрузка данных из таблицы...');
    
    try {
        // Загружаем CSV
        const response = await fetch(QUEUE_CONFIG.sheetUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        
        // Парсим CSV
        const rows = csvText.split('\n').map(row => row.split(','));
        
        // Проверяем статус комиссий в G1 (первая строка, седьмой столбец)
        let commissionsOpen = false;
        if (rows[0] && rows[0].length >= 7) {
            const commissionStatus = rows[0][6] ? rows[0][6].trim() : '';
            commissionsOpen = commissionStatus.toUpperCase() === 'YES';
            console.log('Статус комиссий в G1:', commissionStatus, '->', commissionsOpen ? 'ОТКРЫТЫ' : 'ЗАКРЫТЫ');
        }
        
        // Сохраняем статус в глобальную переменную
        commissionsStatus = commissionsOpen;
        
        // Парсим данные заказов (начиная со второй строки)
        const data = [];
        
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i] || rows[i].length < 2) continue;
            
            // Создаем объект заказа
            const order = {
                position: rows[i][0] ? rows[i][0].trim() : i,
                client: rows[i][1] ? rows[i][1].trim() : '',
                description: rows[i][2] ? rows[i][2].trim() : '',
                status: rows[i][3] ? rows[i][3].trim().toLowerCase() : 'waiting',
                deadline: rows[i][4] ? rows[i][4].trim() : '',
                price: rows[i][5] ? rows[i][5].trim() : ''
            };
            
            // Нормализуем статус
            if (order.status.includes('working')) {
                order.status = 'working';
            } else if (order.status.includes('upcom') || order.status.includes('скоро') || order.status.includes('ckopo')) {
                order.status = 'upcoming';
            } else if (order.status.includes('done') || order.status.includes('заверш') || order.status.includes('готов')) {
                order.status = 'done';
            } else {
                order.status = 'waiting';
            }
            
            // Преобразуем позицию в число
            order.position = parseInt(order.position) || i;
            
            // Добавляем заказ, если есть клиент
            if (order.client && order.client.trim() !== '') {
                data.push(order);
            }
        }
        
        // Сохраняем данные в глобальную переменную
        queueData = data;
        
        console.log(`✅ Загружено ${data.length} заказов`);
        
        // Обновляем HTML
        updateCommissionStatus();
        updateQueueDisplay();
        
        // Обновляем время последнего обновления
        updateLastUpdatedTime();
        
        // Сохраняем в кэш
        saveToCache(data, commissionsOpen);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        showError();
        
        // Пробуем загрузить из кэша
        const cached = loadFromCache();
        if (cached) {
            console.log('Используем кэшированные данные');
            queueData = cached.data;
            commissionsStatus = cached.commissionsOpen;
            updateCommissionStatus();
            updateQueueDisplay();
        }
    }
}

// Функция для обновления статуса комиссий в HTML
function updateCommissionStatus() {
    const statusElement = document.getElementById('commissionStatus');
    if (!statusElement) {
        console.error('Элемент commissionStatus не найден');
        return;
    }
    
    if (commissionsStatus) {
        // Комиссии открыты
        statusElement.className = 'status status-open';
        statusElement.textContent = '✓ Комиссии открыты';
        statusElement.setAttribute('data-i18n', 'commissions.status.open');
    } else {
        // Комиссии закрыты
        statusElement.className = 'status status-closed';
        statusElement.textContent = '✗ Комиссии закрыты';
        statusElement.setAttribute('data-i18n', 'commissions.status.closed');
    }
    
    console.log('Обновлен статус комиссий:', commissionsStatus ? 'ОТКРЫТЫ' : 'ЗАКРЫТЫ');
}

// Функция для обновления отображения очереди в HTML
function updateQueueDisplay() {
    const container = document.getElementById('queueItems');
    const countElement = document.getElementById('queueCount');
    const loadingElement = document.getElementById('queueLoading');
    const emptyElement = document.getElementById('queueEmpty');
    
    if (!container) {
        console.error('Элемент queueItems не найден');
        return;
    }
    
    // Скрываем загрузку
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
    
    // Обновляем счетчик
    if (countElement) {
        countElement.textContent = queueData.length;
    }
    
    // Проверяем, есть ли данные
    if (queueData.length === 0) {
        if (emptyElement) {
            emptyElement.style.display = 'block';
        }
        container.innerHTML = '';
        return;
    }
    
    // Скрываем сообщение о пустой очереди
    if (emptyElement) {
        emptyElement.style.display = 'none';
    }
    
    // Сортируем по позиции
    const sortedData = [...queueData].sort((a, b) => a.position - b.position);
    
    // Создаем HTML для карточек
    const cardsHTML = sortedData.map(item => createQueueCardHTML(item)).join('');
    container.innerHTML = cardsHTML;
    
    // Добавляем обработчики для фильтров
    setupQueueFilters();
}

// Функция для создания HTML карточки заказа
function createQueueCardHTML(item) {
    const statusText = getStatusText(item.status);
    const deadlineHTML = item.deadline && item.deadline !== '--' ? 
        `<div class="queue-deadline">📅 ${item.deadline}</div>` : '';
    
    const priceHTML = item.price && item.price !== '--' ? 
        `<div class="queue-price">${item.price}</div>` : '';
    
    return `
        <div class="queue-card ${item.status}">
            <div class="queue-card-header">
                <div class="queue-position">${item.position}</div>
                <div class="queue-client">${item.client}</div>
            </div>
            <div class="queue-description">${item.description || 'Без описания'}</div>
            <div class="queue-details">
                <div class="queue-status ${item.status}">${statusText}</div>
                <div class="queue-meta">
                    ${deadlineHTML}
                    ${priceHTML}
                </div>
            </div>
        </div>
    `;
}

// Функция для получения текста статуса
function getStatusText(status) {
    const statusMap = {
        'working': 'В работе',
        'waiting': 'Ожидает',
        'done': 'Завершено',
        'upcoming': 'Будет скоро'
    };
    return statusMap[status] || status;
}

// Функция для настройки фильтров очереди
function setupQueueFilters() {
    const filterButtons = document.querySelectorAll('.queue-filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Убираем активный класс у всех кнопок
            filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Добавляем активный класс текущей кнопке
            this.classList.add('active');
            
            // Применяем фильтр
            applyQueueFilter(this.dataset.filter);
        });
    });
}

// Функция для применения фильтра
function applyQueueFilter(filterType) {
    const container = document.getElementById('queueItems');
    if (!container || queueData.length === 0) return;
    
    let filteredData = [...queueData];
    
    switch (filterType) {
        case 'all':
            // Все активные заказы (без завершенных)
            filteredData = queueData.filter(item => item.status !== 'done');
            break;
        case 'working':
            filteredData = queueData.filter(item => item.status === 'working');
            break;
        case 'waiting':
            filteredData = queueData.filter(item => item.status === 'waiting');
            break;
        case 'done':
            filteredData = queueData.filter(item => item.status === 'done');
            break;
        case 'next':
            // Ближайшие 3 заказа (не завершенные)
            filteredData = queueData
                .filter(item => item.status !== 'done')
                .slice(0, 3);
            break;
    }
    
    // Сортируем
    const sortedData = [...filteredData].sort((a, b) => a.position - b.position);
    
    // Обновляем отображение
    const cardsHTML = sortedData.map(item => createQueueCardHTML(item)).join('');
    container.innerHTML = cardsHTML;
}

// Функция для обновления времени последнего обновления
function updateLastUpdatedTime() {
    const lastUpdatedElement = document.getElementById('lastUpdated');
    if (lastUpdatedElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = now.toLocaleDateString();
        lastUpdatedElement.textContent = `${dateString} ${timeString}`;
    }
}

// Функция для показа ошибки
function showError() {
    const errorElement = document.getElementById('queueError');
    const loadingElement = document.getElementById('queueLoading');
    
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
    
    if (errorElement) {
        errorElement.style.display = 'block';
    }
}

// Функция для сохранения в кэш
function saveToCache(data, commissionsOpen) {
    try {
        const cache = {
            timestamp: Date.now(),
            data: data,
            commissionsOpen: commissionsOpen
        };
        localStorage.setItem(QUEUE_CONFIG.cacheKey, JSON.stringify(cache));
    } catch (error) {
        console.warn('Не удалось сохранить в кэш:', error);
    }
}

// Функция для загрузки из кэша
function loadFromCache() {
    try {
        const cached = localStorage.getItem(QUEUE_CONFIG.cacheKey);
        if (!cached) return null;
        
        const cache = JSON.parse(cached);
        
        // Проверяем, не устарели ли данные
        if (Date.now() - cache.timestamp > QUEUE_CONFIG.cacheDuration) {
            return null;
        }
        
        return cache;
    } catch (error) {
        console.warn('Не удалось загрузить из кэша:', error);
        return null;
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('Страница загружена, инициализируем очередь...');
    
    // Загружаем данные
    loadQueueData();
    
    // Настраиваем автообновление
    setInterval(loadQueueData, QUEUE_CONFIG.refreshInterval);
    
    // Принудительное обновление при клике на секцию очереди
    const queueSection = document.getElementById('queue');
    if (queueSection) {
        queueSection.addEventListener('click', function(e) {
            if (e.target.classList.contains('queue-link')) {
                loadQueueData();
            }
        });
    }
});

// Интеграция с системой перевода
if (typeof changeLanguage !== 'undefined') {
    const originalChangeLanguage = changeLanguage;
    window.changeLanguage = function(lang) {
        originalChangeLanguage(lang);
        updateCommissionStatus();
        updateQueueDisplay();
    };
}
