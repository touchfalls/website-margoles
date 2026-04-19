# Check Rates

Сайт для проверки средних оценок фильмов из публичного watchlist на Letterboxd.

## Структура проекта

```
project/
│
├── index.html              ← Главная страница (home + check rates)
│
└── src/
    ├── css/
    │   ├── base.css        ← Переменные цветов, сброс стилей
    │   ├── layout.css      ← Шапка, секции, карточка
    │   ├── home.css        ← Аватарки и навигация (главный экран)
    │   ├── check.css       ← Форма, статус, прогресс, результаты
    │   └── support.css     ← Страница поддержки
    │
    ├── js/
    │   └── check.js        ← Вся логика парсинга и UI
    │
    ├── media/
    │   ├── avatar-1.jpg    ← Аватарка moonuwolf (замени своей)
    │   └── avatar-2.jpg    ← Аватарка touchfalls (замени своей)
    │
    └── support/
        └── index.html      ← Страница /support с разработчиками
```

## Как запустить

Просто открой `index.html` в браузере.  
Для production — залей файлы на хостинг.  
URL страницы support: `yourdomain.xyz/src/support/`

## Что нужно заменить

1. **Аватарки**: положи свои картинки в `src/media/` с именами `avatar-1.jpg` и `avatar-2.jpg`
2. **Telegram ссылки**: в `src/support/index.html` замени `href="#"` на `https://t.me/твой_ник`

## Как работает парсинг

1. Из ссылки достаётся username
2. Все страницы watchlist загружаются через CORS-прокси [allorigins.win](https://allorigins.win)
3. Для каждого фильма загружается его страница и извлекается средняя оценка
4. Результат сортируется по убыванию оценки
