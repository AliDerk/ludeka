// ===== ОЧЕРЕДЬ ЗАКАЗОВ =====

// Конфигурация
const QUEUE_CONFIG = {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9GFUc83lUcJoHGqrgmWtSgkIy7LKvNfwXFQwnkC_yvcWqZVSS90tQRVQrPpZZp-PUNZw8hdUut_Oj/pub?output=csv',
    refreshInterval: 2 * 60 * 1000 // Обновление каждые 2 минуты
};

// Глобальные переменные для хранения данных
let queueData = [];
let commissionsStatus = false;
let currentFilter = 'all'; // Добавляем переменную для хранения текущего фильтра

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
            // Ищем "YES" в любой ячейке первой строки (более гибкий подход)
            for (let cell of rows[0]) {
                if (cell && cell.trim().toUpperCase() === 'YES') {
                    commissionsOpen = true;
                    console.log('✅ Найден YES в ячейке:', cell);
                    break;
                }
            }
            console.log('Статус комиссий:', commissionsOpen ? 'ОТКРЫТЫ' : 'ЗАКРЫТЫ');
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
        updateQueueDisplay('working');
        
        // Обновляем время последнего обновления
        updateLastUpdatedTime();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        showError();
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
    
    // ВОТ ИСПРАВЛЕНИЕ: при первом отображении сразу применяем фильтр "all"
    applyQueueFilter('all');
    
    // Активируем кнопку "all"
    const filterButtons = document.querySelectorAll('.queue-filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === 'all') {
            btn.classList.add('active');
        }
    });
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
            
            // Сохраняем текущий фильтр
            currentFilter = this.dataset.filter;
            
            // Применяем фильтр
            applyQueueFilter(currentFilter);
        });
    });
}

// Функция для применения фильтра
function applyQueueFilter(filterType) {
    const container = document.getElementById('queueItems');
    const emptyElement = document.getElementById('queueEmpty');
    
    if (!container || queueData.length === 0) return;
    
    let filteredData = [];
    
    switch (filterType) {
        case 'all':
            // Все заказы кроме завершенных (ВОТ ИСПРАВЛЕНИЕ)
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
        default:
            filteredData = [...queueData];
    }
    
    // Если после фильтрации нет данных, показываем сообщение
    if (filteredData.length === 0) {
        if (emptyElement) {
            emptyElement.style.display = 'block';
        }
        container.innerHTML = '';
        return;
    } else {
        if (emptyElement) {
            emptyElement.style.display = 'none';
        }
    }
    
    // Сортируем по позиции
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

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('Страница загружена, инициализируем очередь...');
    
    // Загружаем данные
    loadQueueData();
    
    // Настраиваем автообновление
    setInterval(loadQueueData, QUEUE_CONFIG.refreshInterval);
    
    // Настраиваем обработчики фильтров
    setupQueueFilters();
    
    // Кнопка ручного обновления (опционально)
    const refreshButton = document.createElement('button');
    refreshButton.textContent = '🔄 Обновить';
    refreshButton.style.cssText = `
        background: rgba(106, 90, 205, 0.7);
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 5px;
        cursor: pointer;
        margin-left: 1rem;
        font-size: 0.9rem;
    `;
    refreshButton.onclick = loadQueueData;
    
    // Добавляем кнопку рядом с информацией об обновлении
    const queueInfo = document.querySelector('.queue-info');
    if (queueInfo) {
        queueInfo.appendChild(refreshButton);
    }
});

// Интеграция с системой перевода
if (typeof changeLanguage !== 'undefined') {
    const originalChangeLanguage = changeLanguage;
    window.changeLanguage = function(lang) {
        originalChangeLanguage(lang);
        updateCommissionStatus();
        // При смене языка применяем текущий фильтр
        applyQueueFilter(currentFilter);
    };
}

// Простая функция для принудительного обновления (можно вызвать из консоли)
window.refreshQueue = function() {
    console.log('Принудительное обновление очереди...');
    loadQueueData();
};
