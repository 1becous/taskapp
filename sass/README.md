# SCSS Структура проекту

Ця папка містить всі SCSS файли, організовані за логічними компонентами.

## Структура файлів

### 📁 Основні файли

- **`main.scss`** - Головний файл, який імпортує всі інші файли
- **`var.scss`** - Змінні (кольори, розміри, відступи, анімації)
- **`settings.scss`** - Базові налаштування та reset стилі

### 📁 Компоненти

- **`components.scss`** - Стилі для UI компонентів (інструкції, кнопки, поля вводу)
- **`layout.scss`** - Основний layout та блоки завдань
- **`tasks.scss`** - Стилі для завдань та drag & drop функціональності

### 📁 Утиліти та додатки

- **`animations.scss`** - Анімації та keyframes
- **`utilities.scss`** - Утилітарні класи (flex, margins, colors, etc.)
- **`responsive.scss`** - Media queries для адаптивного дизайну

## Порядок імпорту

```scss
// main.scss
@import 'var.scss';           // Змінні (спочатку)
@import 'settings.scss';       // Базові налаштування
@import 'animations.scss';     // Анімації
@import 'components.scss';     // Компоненти
@import 'layout.scss';         // Layout
@import 'tasks.scss';          // Завдання
@import 'utilities.scss';      // Утиліти
@import 'responsive.scss';     // Responsive (останній)
```

## Змінні

### Кольори
- `$primary-color: #090040` - Основний колір
- `$secondary-color: #120279` - Додатковий колір
- `$accent-color: #FFCC00` - Акцентний колір
- `$white: #ffffff` - Білий
- `$black: #000000` - Чорний

### Розміри
- `$border-radius-small: 5px`
- `$border-radius-medium: 8px`
- `$border-radius-large: 10px`
- `$border-radius-xl: 15px`

### Відступи
- `$spacing-xs: 5px`
- `$spacing-sm: 8px`
- `$spacing-md: 10px`
- `$spacing-lg: 15px`
- `$spacing-xl: 20px`
- `$spacing-xxl: 21px`

### Анімації
- `$transition-fast: 0.2s ease`
- `$transition-medium: 0.3s ease`

## Як використовувати

1. Додайте нові змінні в `var.scss`
2. Створіть нові компоненти в відповідних файлах
3. Додайте responsive стилі в `responsive.scss`
4. Імпортуйте нові файли в `main.scss`

## Компіляція

Для компіляції SCSS в CSS використовуйте:
```bash
sass sass/main.scss css/main.css
```

Або для автоматичного оновлення:
```bash
sass --watch sass/main.scss css/main.css
``` 