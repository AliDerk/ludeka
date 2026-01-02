        // ===== ОЧЕРЕДЬ ЗАКАЗОВ =====
        
        // Конфигурация
        const QUEUE_CONFIG = {
            sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9GFUc83lUcJoHGqrgmWtSgkIy7LKvNfwXFQwnkC_yvcWqZVSS90tQRVQrPpZZp-PUNZw8hdUut_Oj/pub?output=csv',
            cacheKey: 'ludekard_queue_cache',
            cacheDuration: 5 * 60 * 1000, // 5 минут
            refreshInterval: 2 * 60 * 1000 // 2 минуты
        };
        
        // Глобальная переменная для статуса комиссий
        let commissionsOpen = true; // По умолчанию открыты
        
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
                // Разделяем строки
                const rows = csvText.split('\n');
                
                // Извлекаем статус комиссий из ячейки G1 (первая строка, 7-й столбец)
                let commissionsStatusValue = 'YES'; // Значение по умолчанию
                if (rows[0]) {
                    const firstRowColumns = rows[0].split(',');
                    if (firstRowColumns.length > 6) {
                        commissionsStatusValue = firstRowColumns[6].trim().toUpperCase();
                    }
                }
                
                // Обновляем глобальную переменную статуса комиссий
                this.updateCommissionsStatus(commissionsStatusValue);
                
                // Парсим данные, начиная со 2-й строки
                const dataRows = rows.slice(1); // Пропускаем первую строку со статусом
                const data = [];
                
                for (let i = 0; i < dataRows.length; i++) {
                    if (!dataRows[i] || dataRows[i].trim() === '') continue;
                    
                    const columns = dataRows[i].split(',');
                    if (columns.length < 2) continue;
                    
                    // Создаем объект заказа
                    const order = {
                        position: parseInt(columns[0]) || i + 1,
                        client: columns[1] ? columns[1].trim() : '',
                        description: columns[2] ? columns[2].trim() : '',
                        status: this.normalizeStatus(columns[3] ? columns[3].trim() : ''),
                        deadline: columns[4] ? columns[4].trim() : '',
                        price: columns[5] ? columns[5].trim() : '',
                        priority: columns[6] ? columns[6].trim() : ''
                    };
                    
                    // Добавляем только если есть клиент
                    if (order.client && order.client !== '') {
                        data.push(order);
                    }
                }
                
                return data;
            }
            
            updateCommissionsStatus(statusValue) {
                const statusUpper = statusValue.toUpperCase().trim();
                
                // YES варианты
                if (statusUpper === 'YES' || 
                    statusUpper === 'ДА' || 
                    statusUpper === 'OPEN' ||
                    statusUpper === 'ОТКРЫТО' ||
                    statusUpper === 'TRUE' ||
                    statusUpper === '1') {
                    commissionsOpen = true;
                } 
                // NO варианты
                else if (statusUpper === 'NO' || 
                    statusUpper === 'НЕТ' || 
                    statusUpper === 'CLOSED' ||
                    statusUpper === 'ЗАКРЫТО' ||
                    statusUpper === 'FALSE' ||
                    statusUpper === '0') {
                    commissionsOpen = false;
                }
                // По умолчанию - открыты
                else {
                    commissionsOpen = true;
                }
                
                // Обновляем отображение статуса комиссий на странице
                const commissionsStatusElement = document.getElementById('commissionsStatus');
                if (commissionsStatusElement) {
                    if (commissionsOpen) {
                        commissionsStatusElement.className = 'status status-open';
                        commissionsStatusElement.textContent = translations[currentLang]["commissions.status.open"];
                    } else {
                        commissionsStatusElement.className = 'status status-closed';
                        commissionsStatusElement.textContent = translations[currentLang]["commissions.status.closed"];
                    }
                }
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
                        // Только активные (без done), первые 5
                        this.filteredData = this.data
                            .filter(item => item.status !== 'done')
                            .slice(0, 5);
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
                    <div class="queue-card ${item.status}>
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
                    'working': translations[currentLang]["queue.status.working"],
                    'waiting': translations[currentLang]["queue.status.waiting"],
                    'done': translations[currentLang]["queue.status.done"],
                    'upcoming': translations[currentLang]["queue.status.upcoming"]
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
        
        // Инициализация очереди при загрузке страницы
        let queueManager = null;

        // Обновляем обработку формы заказа
        const form = document.getElementById('commissionForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                // Проверяем статус комиссий перед отправкой
                if (!commissionsOpen) {
                    const currentLang = document.querySelector('.language-btn.active').getAttribute('data-lang');
                    const errorMessage = currentLang === 'ru' ? 
                        'Комиссии закрыты. Приём заказов временно недоступен.' :
                        'Commissions are closed. Ordering is temporarily unavailable.';
                    alert(errorMessage);
                    return;
                }
                
                const formData = new FormData(form);
                
                try {
                    // Отправляем данные на Formspree
                    const response = await fetch(form.action, {
                        method: 'POST',
                        body: formData,
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        // Показываем модальное окно с благодарностью
                        showModal();
                        // Очищаем форму
                        form.reset();
                    } else {
                        // Если ошибка от Formspree
                        const currentLang = document.querySelector('.language-btn.active').getAttribute('data-lang');
                        const errorMessage = currentLang === 'ru' ? 
                            'Ошибка при отправке. Пожалуйста, попробуйте еще раз.' :
                            'Error sending request. Please try again.';
                        alert(errorMessage);
                    }
                } catch (error) {
                    // Если ошибка сети
                    const currentLang = document.querySelector('.language-btn.active').getAttribute('data-lang');
                    const errorMessage = currentLang === 'ru' ? 
                        'Ошибка сети. Пожалуйста, проверьте соединение.' :
                        'Network error. Please check your connection.';
                    alert(errorMessage);
                }
            });
        }
        
        document.addEventListener('DOMContentLoaded', () => {
            const savedLang = localStorage.getItem('preferredLanguage') || 'ru';
            changeLanguage(savedLang);
            
            // Инициализируем очередь
            queueManager = new QueueManager();
            queueManager.loadQueue();
        });
        
        // Обновляем переводы для очереди при смене языка
        const originalChangeLanguage = changeLanguage;
        changeLanguage = function(lang) {
            originalChangeLanguage(lang);
            if (queueManager) {
                queueManager.render();
            }
        };
    </script>
</body>
</html>
