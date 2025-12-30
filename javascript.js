// Упрощенный вариант с Tabletop.js
function initQueue() {
    const publicSpreadsheetUrl = 'https://docs.google.com/spreadsheets/d/ВАШ_ID/edit?usp=sharing';
    
    Tabletop.init({
        key: publicSpreadsheetUrl,
        callback: showQueue,
        simpleSheet: true
    });
}

function showQueue(data) {
    // data - массив объектов из таблицы
    console.log(data); // Проверьте структуру данных
    // ... далее как в предыдущем примере
}
