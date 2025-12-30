// Упрощенный вариант с Tabletop.js
function initQueue() {
    const publicSpreadsheetUrl = 'https://docs.google.com/spreadsheets/d/2PACX-1vS9GFUc83lUcJoHGqrgmWtSgkIy7LKvNfwXFQwnkC_yvcWqZVSS90tQRVQrPpZZp-PUNZw8hdUut_Oj/edit?usp=sharing';
    
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
