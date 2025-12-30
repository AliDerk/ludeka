// Добавьте в существующий скрипт
async function loadQueue() {
    const queueItems = document.getElementById('queueItems');
    const loading = document.querySelector('.queue-loading');
    
    try {
        // Ваша ссылка на Google Sheets (публичный режим!)
        const SHEET_ID = 'ВАШ_ID_TABЛИЦЫ';
        const SHEET_NAME = 'Очередь'; // Имя листа
        const url = `https://docs.google.com/spreadsheets/d/2PACX-1vS9GFUc83lUcJoHGqrgmWtSgkIy7LKvNfwXFQwnkC_yvcWqZVSS90tQRVQrPpZZp-PUNZw8hdUut_Oj/gviz/tq?tqx=out:json&sheet=queue Lu`;
        
        const response = await fetch(url);
        const text = await response.text();
        
        // Google Sheets возвращает JSON с префиксом
        const json = JSON.parse(text.substr(47).slice(0, -2));
        
        const rows = json.table.rows;
        queueItems.innerHTML = '';
        
        rows.forEach((row, index) => {
            // Предполагаем колонки: Клиент, Описание, Статус, Срок, Цена
            const client = row.c[0]?.v || '';
            const description = row.c[1]?.v || '';
            const status = (row.c[2]?.v || 'waiting').toLowerCase();
            const deadline = row.c[3]?.v || '';
            const price = row.c[4]?.v || '';
            
            if (!client) return; // Пропускаем пустые строки
            
            const card = document.createElement('div');
            card.className = `queue-card ${status}`;
            card.setAttribute('data-status', status);
            
            card.innerHTML = `
                <div class="queue-number">${index + 1}</div>
                <div class="queue-client">${client}</div>
                <div class="queue-description">${description}</div>
                <div class="queue-meta">
                    <div class="queue-status ${status}" data-i18n="queue.status.${status}">
                        ${getStatusText(status)}
                    </div>
                    <div class="queue-price">${price}</div>
                </div>
                ${deadline ? `<div class="queue-deadline">📅 ${deadline}</div>` : ''}
            `;
            
            queueItems.appendChild(card);
        });
        
        loading.style.display = 'none';
        setupQueueFilters();
        
    } catch (error) {
        console.error('Ошибка загрузки очереди:', error);
        queueItems.innerHTML = `
            <div class="queue-error">
                <p data-i18n="queue.error">Не удалось загрузить очередь заказов</p>
            </div>
        `;
        loading.style.display = 'none';
    }
}

function getStatusText(status) {
    const statusMap = {
        'working': 'В работе',
        'waiting': 'Ожидает',
        'done': 'Завершено'
    };
    return statusMap[status] || status;
}

function setupQueueFilters() {
    const filterButtons = document.querySelectorAll('.queue-filters .filter-btn');
    const queueCards = document.querySelectorAll('.queue-card');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Снимаем активный класс со всех кнопок
            filterButtons.forEach(btn => btn.classList.remove('active'));
            // Добавляем активный класс нажатой кнопке
            button.classList.add('active');
            
            const filterStatus = button.getAttribute('data-status');
            
            queueCards.forEach(card => {
                if (filterStatus === 'all' || card.getAttribute('data-status') === filterStatus) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// Вызовите при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadQueue();
    // Автообновление каждые 5 минут
    setInterval(loadQueue, 300000);
});
