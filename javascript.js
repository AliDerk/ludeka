// ===== ОЧЕРЕДЬ ЗАКАЗОВ =====

// Конфигурация
const QUEUE_CONFIG = {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9GFUc83lUcJoHGqrgmWtSgkIy7LKvNfwXFQwnkC_yvcWqZVSS90tQRVQrPpZZp-PUNZw8hdUut_Oj/pub?output=csv',
    cacheKey: 'ludekard_queue_cache',
    cacheDuration: 2 * 60 * 1000, // 2 минут
    refreshInterval: 2 * 60 * 1000 // 2 минуты
};

// Класс управления очередью
class QueueManager {
    constructor() {
        this.data = [];
        this.filteredData = [];
        this.currentFilter = 'all';
        this.isLoading = false;
        this.commissionsOpen = false; // Статус комиссий

        this.initElements();
        this.setupEventListeners();
    }

    initElements() {
        this.elements = {
            container: document.getElementById('queueItems'),
            loading: document.getElementById('queueLoading'),
            empty: document.getElementById('queueEmpty'),
            error: document.getElementById('queueError'),
            count: document.getElementById('queueCount'),
            lastUpdated: document.getElementById('lastUpdated'),
            commissionStatus: document.getElementById('commissionStatus') // Добавлен элемент статуса комиссий
        };
    }

    setupEventListeners() {
        // Фильтры
        document.querySelectorAll('.queue-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
        });

        // Автообновление
        setInterval(() => this.loadQueue(), QUEUE_CONFIG.refreshInterval);
    }

    async loadQueue() {
        console.log('🔄 Загрузка очереди...');
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();

        try {
            // Проверяем кэш
            const cached = this.getCachedData();
            if (cached && Date.now() - cached.timestamp < QUEUE_CONFIG.cacheDuration) {
                console.log('Используем кэшированные данные');
                this.processData(cached.data, cached.commissionsOpen);
                return;
            }

            // Загружаем новые данные
            console.log('Загружаем данные из Google Sheets...');
            const csvData = await this.fetchCSV(QUEUE_CONFIG.sheetUrl);
            const parsedData = this.parseCSV(csvData);

            // Сохраняем в кэш
            this.cacheData(parsedData.queueData, parsedData.commissionsOpen);

            // Обрабатываем данные
            this.processData(parsedData.queueData, parsedData.commissionsOpen);

        } catch (error) {
            console.error('Ошибка загрузки очереди:', error);
            this.showError();

            // Пробуем загрузить из кэша, даже если он устарел
            const cached = this.getCachedData();
            if (cached) {
                console.log('Используем устаревшие кэшированные данные');
                this.processData(cached.data, cached.commissionsOpen);
            }
        } finally {
            this.isLoading = false;
        }
    }

    async fetchCSV(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    }

    parseCSV(csvText) {
        console.log('=== ПАРСИНГ CSV ===');
        const rows = csvText.split('\n').map(row => row.split(','));
        
        // Проверяем статус комиссий в ячейке G1 (первая строка, седьмой столбец, индекс 6)
        let commissionsOpen = false;
        if (rows[0] && rows[0].length >= 7) {
            const commissionStatus = rows[0][6] ? rows[0][6].trim() : '';
            console.log('Ячейка G1:', rows[0][6]);
            console.log('Ячейка G1 после trim():', commissionStatus);
            commissionsOpen = commissionStatus.toUpperCase() === 'YES';
        }
        
        // Дополнительная проверка: ищем YES в любой ячейке первой строки
        if (!commissionsOpen && rows[0]) {
            for (let cell of rows[0]) {
                if (cell && cell.trim().toUpperCase() === 'YES') {
                    commissionsOpen = true;
                    console.log('Найден YES в другой ячейке:', cell);
                    break;
                }
            }
        }
        
        console.log('Статус комиссий:', commissionsOpen ? 'ОТКРЫТЫ' : 'ЗАКРЫТЫ');

        // Предполагаем, что первая строка - заголовки
        const headers = rows[0] ? rows[0].map(h => h.trim()) : [];

        // Маппинг заголовков для вашей таблицы
        const headerMap = {
            'Ne': 'position',
            'Kmwerr': 'client',
            'Omvcanwe': 'description',
            'Craryc': 'status',
            'Cpox': 'deadline',
            'Ljena': 'price'
        };

        const data = [];

        // Начинаем с индекса 1, пропуская заголовки
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i] || rows[i].length < 2) continue;

            const row = {};

            for (let j = 0; j < headers.length && j < rows[i].length; j++) {
                const header = headers[j];
                const value = rows[i][j] ? rows[i][j].trim() : '';

                if (headerMap[header]) {
                    row[headerMap[header]] = value;
                } else if (j === 0) {
                    row.position = value;
                } else if (j === 1) {
                    row.client = value;
                } else if (j === 2) {
                    row.description = value;
                } else if (j === 3) {
                    row.status = value;
                } else if (j === 4) {
                    row.deadline = value;
                } else if (j === 5) {
                    row.price = value;
                }
            }

            // Нормализуем статус
            if (row.status) {
                row.status = this.normalizeStatus(row.status);
            } else {
                row.status = 'waiting';
            }

            // Если есть позиция, конвертируем в число
            if (row.position && !isNaN(row.position)) {
                row.position = parseInt(row.position);
            } else if (row.client) {
                // Извлекаем номер из начала строки клиента (например "1 wake-up" -> 1)
                const match = row.client.match(/^(\d+)/);
                if (match) {
                    row.position = parseInt(match[1]);
                } else {
                    row.position = i;
                }
            } else {
                row.position = i;
            }

            // Добавляем только если есть клиент
            if (row.client && row.client.trim() !== '') {
                data.push(row);
            }
        }

        console.log('Распарсено заказов:', data.length);
        return {
            queueData: data,
            commissionsOpen: commissionsOpen
        };
    }

    normalizeStatus(status) {
        const statusLower = status.toLowerCase();
        
        // Для ваших статусов
        if (statusLower.includes('working')) {
            return 'working';
        } else if (statusLower.includes('скоро') || statusLower.includes('ckopo') || statusLower.includes('upcom')) {
            return 'upcoming';
        } else if (statusLower.includes('oxwqa') || statusLower.includes('waiting')) {
            return 'waiting';
        } else if (statusLower.includes('заверш') || statusLower.includes('done') || statusLower.includes('готов')) {
            return 'done';
        }
        
        return 'waiting';
    }

    processData(data, commissionsOpen) {
        console.log('Обработка данных:', { 
            заказов: data.length, 
            статусКомиссий: commissionsOpen 
        });
        
        this.data = data;
        this.commissionsOpen = commissionsOpen;

        this.applyFilter();
        this.updateCount();
        this.updateLastUpdated();
        this.updateCommissionStatus();
        this.render();
    }

    setFilter(filter) {
        this.currentFilter = filter;

        // Обновляем активную кнопку
        document.querySelectorAll('.queue-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        this.applyFilter();
        this.render();
    }

    applyFilter() {
        switch (this.currentFilter) {
            case 'all':
                // Только активные (без done)
                this.filteredData = this.data
                    .filter(item => item.status !== 'done');
                break;
            case 'working':
                this.filteredData = this.data.filter(item => item.status === 'working');
                break;
            case 'waiting':
                this.filteredData = this.data.filter(item => item.status === 'waiting');
                break;
            case 'done':
                this.filteredData = this.data.filter(item => item.status === 'done');
                break;
            case 'next':
                // Ближайшие 3 заказа в очереди (не завершенные)
                this.filteredData = this.data
                    .filter(item => item.status !== 'done')
                    .slice(0, 3);
                break;
            default:
                this.filteredData = [...this.data];
        }
    }

    updateCount() {
        if (this.elements.count) {
            this.elements.count.textContent = this.data.length;
        }
    }

    updateLastUpdated() {
        if (this.elements.lastUpdated) {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateString = now.toLocaleDateString();
            this.elements.lastUpdated.textContent = `${dateString} ${timeString}`;
        }
    }

    updateCommissionStatus() {
        console.log('Обновление статуса комиссий:', this.commissionsOpen);
        const statusElement = this.elements.commissionStatus;
        if (!statusElement) {
            console.error('Элемент статуса комиссий не найден');
            return;
        }

        if (this.commissionsOpen) {
            statusElement.className = 'status status-open';
            statusElement.textContent = '✓ Комиссии открыты';
            // Также обновляем перевод, если он доступен
            if (window.translations && window.currentLang && window.translations[window.currentLang]) {
                const text = window.translations[window.currentLang]["commissions.status.open"];
                if (text) statusElement.textContent = text;
            }
        } else {
            statusElement.className = 'status status-closed';
            statusElement.textContent = '✗ Комиссии закрыты';
            if (window.translations && window.currentLang && window.translations[window.currentLang]) {
                const text = window.translations[window.currentLang]["commissions.status.closed"];
                if (text) statusElement.textContent = text;
            }
        }
    }

    render() {
        if (!this.elements.container) return;

        if (this.filteredData.length === 0) {
            this.showEmpty();
            return;
        }

        this.hideAllMessages();

        // Сортируем по позиции
        const sortedData = [...this.filteredData].sort((a, b) => a.position - b.position);

        const cardsHTML = sortedData.map(item => this.createCardHTML(item)).join('');
        this.elements.container.innerHTML = cardsHTML;
    }

    createCardHTML(item) {
        const statusText = this.getStatusText(item.status);
        const deadlineHTML = item.deadline ? 
            `<div class="queue-deadline">📅 ${item.deadline}</div>` : '';

        const priceHTML = item.price ? 
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

    getStatusText(status) {
        const statusMap = {
            'working': 'В работе',
            'waiting': 'Ожидает',
            'done': 'Завершено',
            'upcoming': 'Будет скоро'
        };
        return statusMap[status] || status;
    }

    // Сообщения
    showLoading() {
        this.hideAllMessages();
        if (this.elements.loading) {
            this.elements.loading.style.display = 'block';
        }
        if (this.elements.container) {
            this.elements.container.innerHTML = '';
        }
    }

    showEmpty() {
        this.hideAllMessages();
        if (this.elements.empty) {
            this.elements.empty.style.display = 'block';
        }
        if (this.elements.container) {
            this.elements.container.innerHTML = '';
        }
    }

    showError() {
        this.hideAllMessages();
        if (this.elements.error) {
            this.elements.error.style.display = 'block';
        }
        if (this.elements.container) {
            this.elements.container.innerHTML = '';
        }
    }

    hideAllMessages() {
        if (this.elements.loading) this.elements.loading.style.display = 'none';
        if (this.elements.empty) this.elements.empty.style.display = 'none';
        if (this.elements.error) this.elements.error.style.display = 'none';
    }

    // Кэширование
    cacheData(data, commissionsOpen) {
        try {
            const cache = {
                timestamp: Date.now(),
                data: data,
                commissionsOpen: commissionsOpen
            };
            localStorage.setItem(QUEUE_CONFIG.cacheKey, JSON.stringify(cache));
        } catch (error) {
            console.warn('Не удалось сохранить данные в кэш:', error);
        }
    }

    getCachedData() {
        try {
            const cached = localStorage.getItem(QUEUE_CONFIG.cacheKey);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('Не удалось загрузить данные из кэша:', error);
            return null;
        }
    }
}

// Инициализация очереди при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализируем очередь...');
    
    // Очищаем кэш для теста
    localStorage.removeItem('ludekard_queue_cache');
    
    const savedLang = localStorage.getItem('preferredLanguage') || 'ru';
    if (typeof changeLanguage === 'function') {
        changeLanguage(savedLang);
    }

    // Инициализируем очередь
    window.queueManager = new QueueManager();
    window.queueManager.loadQueue();
    
    // Принудительная проверка через 3 секунды
    setTimeout(() => {
        console.log('Принудительная проверка статуса через 3 секунды...');
        if (window.queueManager) {
            window.queueManager.loadQueue();
        }
    }, 3000);
});

// Обновляем переводы для очереди
function updateQueueTranslations() {
    console.log('Обновление переводов очереди...');
    if (window.queueManager) {
        window.queueManager.updateCommissionStatus();
        window.queueManager.render();
    }
}

// Если функция changeLanguage существует, модифицируем её
if (typeof changeLanguage !== 'undefined') {
    const originalChangeLanguage = changeLanguage;
    window.changeLanguage = function(lang) {
        console.log('Смена языка на:', lang);
        const result = originalChangeLanguage(lang);
        updateQueueTranslations();
        return result;
    };
} else {
    // Создаем простую функцию changeLanguage если её нет
    window.changeLanguage = function(lang) {
        console.log('Смена языка на:', lang);
        localStorage.setItem('preferredLanguage', lang);
        updateQueueTranslations();
    };
}
