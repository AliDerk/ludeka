// ===== ОЧЕРЕДЬ ЗАКАЗОВ =====

// Конфигурация
const QUEUE_CONFIG = {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9GFUc83lUcJoHGqrgmWtSgkIy7LKvNfwXFQwnkC_yvcWqZVSS90tQRVQrPpZZp-PUNZw8hdUut_Oj/pub?output=csv',
    cacheKey: 'ludekard_queue_cache',
    cacheDuration: 5 * 60 * 1000, // 5 минут
    refreshInterval: 2 * 60 * 1000 // 2 минуты
};

// Класс управления очередью
class QueueManager {
    constructor() {
        this.data = [];
        this.filteredData = [];
        this.currentFilter = 'all';
        this.isLoading = false;
        
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
            lastUpdated: document.getElementById('lastUpdated')
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
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            // Проверяем кэш
            const cached = this.getCachedData();
            if (cached && Date.now() - cached.timestamp < QUEUE_CONFIG.cacheDuration) {
                console.log('Используем кэшированные данные');
                this.processData(cached.data);
                return;
            }
            
            // Загружаем новые данные
            console.log('Загружаем данные из Google Sheets...');
            const csvData = await this.fetchCSV(QUEUE_CONFIG.sheetUrl);
            const parsedData = this.parseCSV(csvData);
            
            // Сохраняем в кэш
            this.cacheData(parsedData);
            
            // Обрабатываем данные
            this.processData(parsedData);
            
        } catch (error) {
            console.error('Ошибка загрузки очереди:', error);
            this.showError();
            
            // Пробуем загрузить из кэша, даже если он устарел
            const cached = this.getCachedData();
            if (cached) {
                console.log('Используем устаревшие кэшированные данные');
                this.processData(cached.data);
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
        const rows = csvText.split('\n').map(row => row.split(','));
        
        // Предполагаем, что первая строка - заголовки
        const headers = rows[0] ? rows[0].map(h => h.trim()) : [];
        
        // Маппинг заголовков (предполагаемая структура)
        const headerMap = {
            'Номер': 'position',
            'Клиент': 'client',
            'Описание': 'description',
            'Статус': 'status',
            'Срок': 'deadline',
            'Цена': 'price',
            'Приоритет': 'priority'
        };
        
        // Парсим строки
        const data = [];
        
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i] || rows[i].length < 2) continue;
            
            const row = {};
            
            for (let j = 0; j < headers.length; j++) {
                const header = headers[j];
                const value = rows[i][j] ? rows[i][j].trim() : '';
                
                if (headerMap[header]) {
                    row[headerMap[header]] = value;
                } else {
                    // Если заголовок не распознан, сохраняем как есть
                    row[header] = value;
                }
            }
            
            // Нормализуем статус
            if (row.status) {
                row.status = this.normalizeStatus(row.status);
            } else {
                row.status = 'waiting';
            }
            
            // Если есть позиция, конвертируем в число
            if (row.position) {
                row.position = parseInt(row.position) || i;
            } else {
                row.position = i;
            }
            
            // Добавляем только если есть клиент
            if (row.client && row.client.trim() !== '') {
                data.push(row);
            }
        }
        
        return data;
    }
    
    normalizeStatus(status) {
        const statusLower = status.toLowerCase();
        
        if (statusLower.includes('работа') || statusLower.includes('working') || statusLower.includes('в процессе')) {
            return 'working';
        } else if (statusLower.includes('заверш') || statusLower.includes('done') || statusLower.includes('готов')) {
            return 'done';
        } else if (statusLower.includes('ожида') || statusLower.includes('waiting') || statusLower.includes('в очереди')) {
            return 'waiting';
        } else if (statusLower.includes('скоро') || statusLower.includes('upcoming') || statusLower.includes('будет')) {
            return 'upcoming';
        }
        
        return 'waiting';
    }
    
    processData(data) {
        this.data = data;
        this.applyFilter();
        this.updateCount();
        this.updateLastUpdated();
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
    // Исключаем завершённые заказы
    this.filteredData = this.data.filter(item => item.status !== 'done');
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
    cacheData(data) {
        try {
            const cache = {
                timestamp: Date.now(),
                data: data
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

// Переводы для очереди (добавьте в объект translations)
const queueTranslations = {
    ru: {
        "queue.title": "Очередь заказов",
        "queue.subtitle": "Текущие комиссии и их статус. Данные обновляются автоматически.",
        "queue.filter.all": "Все заказы",
        "queue.filter.working": "В работе",
        "queue.filter.waiting": "Ожидает",
        "queue.filter.done": "Завершены",
        "queue.filter.next": "Следующие в очереди",
        "queue.orders": "заказов в очереди",
        "queue.updated": "Обновлено:",
        "queue.loading": "Загружаем данные о заказах...",
        "queue.empty": "Нет активных заказов в очереди",
        "queue.error": "Не удалось загрузить очередь заказов",
        "queue.errorDetails": "Проверьте подключение к интернету и попробуйте обновить страницу",
        "queue.legend": "Обозначения:",
        "queue.status.working": "В работе",
        "queue.status.waiting": "Ожидает",
        "queue.status.done": "Завершено",
        "queue.status.upcoming": "Будет скоро",
        "queue.note": "Данные автоматически обновляются каждые 5 минут. Вы можете редактировать эту очередь в Google Таблице."
    },
    en: {
        "queue.title": "Commission Queue",
        "queue.subtitle": "Current commissions and their status. Data updates automatically.",
        "queue.filter.all": "All Orders",
        "queue.filter.working": "In Progress",
        "queue.filter.waiting": "Waiting",
        "queue.filter.done": "Completed",
        "queue.filter.next": "Upcoming",
        "queue.orders": "orders in queue",
        "queue.updated": "Updated:",
        "queue.loading": "Loading order data...",
        "queue.empty": "No active orders in queue",
        "queue.error": "Failed to load commission queue",
        "queue.errorDetails": "Check your internet connection and try refreshing the page",
        "queue.legend": "Legend:",
        "queue.status.working": "In Progress",
        "queue.status.waiting": "Waiting",
        "queue.status.done": "Completed",
        "queue.status.upcoming": "Coming Soon",
        "queue.note": "Data updates automatically every 5 minutes. You can edit this queue in Google Sheets."
    }
};

// Добавьте переводы в основной объект translations
Object.assign(translations.ru, queueTranslations.ru);
Object.assign(translations.en, queueTranslations.en);

// Инициализация очереди при загрузке страницы
let queueManager = null;

document.addEventListener('DOMContentLoaded', () => {
    // ... существующий код ...
    
    // Инициализируем очередь
    queueManager = new QueueManager();
    queueManager.loadQueue();
    
    // Обновляем переводы для очереди
    updateQueueTranslations();
});

function updateQueueTranslations() {
    // Эта функция будет вызвана при смене языка
    if (queueManager) {
        queueManager.render();
    }
}

// Добавьте вызов updateQueueTranslations в функцию changeLanguage
// В существующей функции changeLanguage добавьте:
function changeLanguage(lang) {
    // ... существующий код ...
    updateQueueTranslations(); // Добавьте эту строку
}
