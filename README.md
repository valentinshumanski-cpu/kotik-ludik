# Котик-лудик

Уютная Telegram Mini App про котика Алекса. Дизайн и решения — в [GDD.md](GDD.md), картинки — в [ASSETS.md](ASSETS.md).

## Запуск у себя

```bash
npm install
npm run dev
```

Открыть http://127.0.0.1:5173. Тесты логики: `npm test`. Сборка: `npm run build` (результат в `dist/`).

Картинки игры лежат в `public/assets/` и собираются из исходников `Refs/` командой `npm run assets` (обрезка полей, уменьшение, WebP).

## Структура

```
src/game/      логика без DOM: автомат (slot.js), состояние и правила (state.js)
src/data/      контент: места, вещи, породы
src/platform/  Telegram-адаптер и сохранения (localStorage + облако Telegram)
src/main.js    экран, анимации, панели
src/audio.js   синтез звуков
tests/         node --test
```

## Публикация (один раз)

1. Создать аккаунт на github.com и пустой репозиторий, например `kotik-ludik`.
2. В папке проекта:
   ```bash
   git init -b main
   git add .
   git commit -m "Stage 1: tech prototype"
   git remote add origin https://github.com/<логин>/kotik-ludik.git
   git push -u origin main
   ```
3. В репозитории: **Settings → Pages → Source: GitHub Actions**. После пуша игра появится по адресу `https://<логин>.github.io/kotik-ludik/` (вкладка Actions покажет ход сборки).

## Бот в Telegram

1. Написать [@BotFather](https://t.me/BotFather) → `/newbot` → имя и username бота.
2. `/mybots` → бот → **Bot Settings → Menu Button** → вставить адрес игры с GitHub Pages и подпись «Играть».
3. По желанию: **Bot Settings → Configure Mini App → Enable Mini App** с тем же адресом — тогда игру можно открыть ссылкой `t.me/<бот>/<имя>`.

Токен бота для этого не нужен и в проект не попадает.
