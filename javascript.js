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
            commissionStatus: document.getElementById('commissionStatus') || document.querySelector('.status[data-i18n^="commissions.status"]')
        };
        
        console.log('Найден элемент статуса:', this.elements.commissionStatus);
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
        console.log('Первые 300 символов CSV:', csvText.substring(0, 300));
        
        // Разбиваем на строки, учитывая разные форматы переноса строк
        const rows = csvText.split(/\r?\n/).map(row => {
            return row.split(',').map(cell => {
                // Убираем кавычки и пробелы
                return cell.replace(/"/g, '').trim();
            });
        });
        
        console.log('Первая строка после парсинга:', rows[0]);
        console.log('Длина первой строки:', rows[0]?.length);
        
        // ПРОБЛЕМА: Ваш CSV показывает, что заголовки искажены
        // Решение: ищем "YES" в ЛЮБОЙ строке таблицы, не только в первой
        
        let commissionsOpen = false;
        console.log('=== ПОИСК "YES" В ТАБЛИЦЕ ===');
        
        // Ищем "YES" в ВСЕЙ таблице (первые 3 строки для надежности)
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
            console.log(`Строка ${i}:`, rows[i]);
            if (rows[i]) {
                for (let j = 0; j < rows[i].length; j++) {
                    const cell = rows[i][j];
                    const cellUpper = cell.toUpperCase();
                    console.log(`  Ячейка [${i}][${j}]: "${cell}" → "${cellUpper}"`);
                    
                    if (cellUpper === 'YES') {
                        commissionsOpen = true;
                        console.log(`✅ НАЙДЕНО "YES" в строке ${i}, столбце ${j}`);
                        break;
                    }
                }
            }
            if (commissionsOpen) break;
        }
        
        console.log('Итоговый статус комиссий:', commissionsOpen ? 'ОТКРЫТЫ' : 'ЗАКРЫТЫ');
        
        // Маппинг заголовков - предполагаем, что они в первой строке
        const headers = rows[0] ? rows[0].map(h => h.trim()) : [];
        console.log('Заголовки:', headers);
        
        // Пробуем определить заголовки автоматически
        const headerMap = {};
        if (headers.length > 0) {
            // Автоматическое определение столбцов
            for (let i = 0; i < headers.length; i++) {
                const header = headers[i].toLowerCase();
                if (header.includes('ne') || header.includes('номер') || header.includes('№')) {
                    headerMap[i] = 'position';
                } else if (header.includes('kmwerr') || header.includes('клиент') || header.includes('client')) {
                    headerMap[i] = 'client';
                } else if (header.includes('omvcanwe') || header.includes('описание') || header.includes('description')) {
                    headerMap[i] = 'description';
                } else if (header.includes('crazyc') || header.includes('craryc') || header.includes('статус') || header.includes('status')) {
                    headerMap[i] = 'status';
                } else if (header.includes('cook') || header.includes('cpox') || header.includes('срок') || header.includes('deadline')) {
                    headerMap[i] = 'deadline';
                } else if (header.includes('llena') || header.includes('ljena') || header.includes('цена') || header.includes('price')) {
                    headerMap[i] = 'price';
                }
            }
        }
        
        console.log('Автоматическое определение заголовков:', headerMap);
        
        const data = [];

        // Начинаем с индекса 1, пропуская заголовки
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i] || rows[i].length < 2) continue;

            const row = {};
            
            // Парсим строку с помощью автоматического определения или по индексу
            for (let j = 0; j < rows[i].length; j++) {
                const value = rows[i][j] ? rows[i][j].trim() : '';
                
                if (headerMap[j]) {
                    row[headerMap[j]] = value;
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

        console.log('Распарсено заказов:', data.length);
        console.log('=== КОНЕЦ ПАРСИНГА CSV ===');

        return {
            queueData: data,
            commissionsOpen: commissionsOpen
        };
    }

    normalizeStatus(status) {
        const statusLower = status.toLowerCase();
        
        // Расширенная проверка статусов
        if (statusLower.includes('working') || statusLower.includes('работа') || statusLower.includes('в процессе')) {
            return 'working';
        } else if (statusLower.includes('upcom') || statusLower.includes('скоро') || statusLower.includes('ckopo') || statusLower.includes('будет')) {
            return 'upcoming';
        } else if (statusLower.includes('waiting') || statusLower.includes('oxwqa') || statusLower.includes('ожида') || statusLower.includes('в очереди')) {
            return 'waiting';
        } else if (statusLower.includes('заверш') || statusLower.includes('done') || statusLower.includes('готов') || statusLower.includes('готово')) {
            return 'done';
        }
        
        return 'waiting';
    }

    processData(data, commissionsOpen) {
        console.log('processData вызван:', { 
            заказов: data.length, 
            статусКомиссий: commissionsOpen,
            текущийСтатус: this.commissionsOpen
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
        console.log('updateCommissionStatus вызван:', {
            элемент: this.elements.commissionStatus,
            текущийСтатус: this.commissionsOpen,
            currentLang: currentLang
        });
        
        const statusElement = this.elements.commissionStatus;
        if (!statusElement) {
            console.error('❌ Элемент commissionStatus не найден!');
            return;
        }

        if (this.commissionsOpen) {
            console.log('✅ Устанавливаем статус: ОТКРЫТЫ');
            statusElement.className = 'status status-open';
            statusElement.setAttribute('data-i18n', 'commissions.status.open');
            // Используем прямой текст для теста
            statusElement.textContent = '✓ Комиссии открыты';
            if (translations[currentLang] && translations[currentLang]["commissions.status.open"]) {
                statusElement.textContent = translations[currentLang]["commissions.status.open"];
            }
        } else {
            console.log('❌ Устанавливаем статус: ЗАКРЫТЫ');
            statusElement.className = 'status status-closed';
            statusElement.setAttribute('data-i18n', 'commissions.status.closed');
            // Используем прямой текст для теста
            statusElement.textContent = '✗ Комиссии закрыты';
            if (translations[currentLang] && translations[currentLang]["commissions.status.closed"]) {
                statusElement.textContent = translations[currentLang]["commissions.status.closed"];
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
    
    // Очищаем кэш принудительно для теста
    localStorage.removeItem('ludekard_queue_cache');
    
    const savedLang = localStorage.getItem('preferredLanguage') || 'ru';
    changeLanguage(savedLang);

    // Инициализируем очередь
    queueManager = new QueueManager();
    queueManager.loadQueue();
    
    // Принудительная проверка через 3 секунды
    setTimeout(() => {
        console.log('Принудительная проверка статуса через 3 секунды...');
        if (queueManager) {
            queueManager.loadQueue();
        }
    }, 3000);
});

// Обновляем переводы для очереди
function updateQueueTranslations() {
    console.log('Обновление переводов очереди...');
    if (queueManager) {
        queueManager.updateCommissionStatus();
        queueManager.render();
    }
}

// Модифицируем функцию changeLanguage
const originalChangeLanguage = window.changeLanguage;
window.changeLanguage = function(lang) {
    console.log('Смена языка на:', lang);
    if (originalChangeLanguage) {
        originalChangeLanguage(lang);
    }
    updateQueueTranslations();
};
