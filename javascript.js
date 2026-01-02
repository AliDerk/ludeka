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
        const rows = csvText.split('\n').map(row => row.split(','));

        // Проверяем статус комиссий в ячейке G1 (первая строка, седьмой столбец, индекс 6)
        let commissionsOpen = false;
        if (rows[0] && rows[0].length >= 7) {
            const commissionStatus = rows[0][6] ? rows[0][6].trim() : '';
            commissionsOpen = commissionStatus.toUpperCase() === 'YES';
        }

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
            // Последний столбец (G) не используется для данных заказов
        };

        const data = [];

        // Начинаем с индекса 1, пропуская заголовки
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i] || rows[i].length < 2) continue;

            const row = {};

            for (let j = 0; j < headers.length; j++) {
                const header = headers[j];
                const value = rows[i][j] ? rows[i][j].trim() : '';

                if (headerMap[header]) {
                    row[headerMap[header]] = value;
                }
            }

            // Нормализуем статус для вашей таблицы
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

            // Добавляем только если есть клиент и номер (из вашей таблицы видно, что номер в колонке A может быть пустым)
            if (row.client && row.client.trim() !== '') {
                data.push(row);
            }
        }

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
        } else if (statusLower.includes('скоро') || statusLower.includes('ckopo')) {
            return 'upcoming';
        } else if (statusLower.includes('oxwqa')) {
            return 'waiting';
        } else if (statusLower.includes('заверш') || statusLower.includes('done') || statusLower.includes('готов')) {
            return 'done';
        }
        
        return 'waiting';
    }

    processData(data, commissionsOpen) {
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
        const statusElement = this.elements.commissionStatus;
        if (!statusElement) return;

        if (this.commissionsOpen) {
            statusElement.className = 'status status-open';
            statusElement.setAttribute('data-i18n', 'commissions.status.open');
            statusElement.textContent = translations[currentLang]["commissions.status.open"];
        } else {
            statusElement.className = 'status status-closed';
            statusElement.setAttribute('data-i18n', 'commissions.status.closed');
            statusElement.textContent = translations[currentLang]["commissions.status.closed"];
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
    const savedLang = localStorage.getItem('preferredLanguage') || 'ru';
    changeLanguage(savedLang);

    // Если сохранён фильтр "all", и он показывает завершённые,
    // можно сбросить на активный
    const savedFilter = localStorage.getItem('queueFilter');
    if (!savedFilter || savedFilter === 'all') {
        localStorage.setItem('queueFilter', 'active');
    }

    // Инициализируем очередь
    queueManager = new QueueManager();
    queueManager.loadQueue();
});

// Обновляем переводы для очереди
function updateQueueTranslations() {
    if (queueManager) {
        queueManager.render();
        queueManager.updateCommissionStatus();
    }
}

// Добавьте вызов updateQueueTranslations в функцию changeLanguage
// В существующей функции changeLanguage добавьте:
function changeLanguage(lang) {
    // ... существующий код ...
    updateQueueTranslations(); // Добавьте эту строку
}
