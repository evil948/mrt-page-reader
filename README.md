# MRT+

Озвучка открытой статьи голосами Яндекса **прямо во вкладке**: подсветка абзаца, оценка времени, `Alt+R`, компактная кнопка ▶.

Без панели [MRT](https://alkohole.github.io/machine-reading-text/) и без лишнего клика «Старт».

| | |
| --- | --- |
| **Версия** | 1.7.0 |
| **Горячая клавиша** | `Alt+R` |
| **Установка** | Firefox-расширение **или** Tampermonkey |

---

## Установка

### 1. Firefox (расширение, без Tampermonkey)

**Рекомендуется:** скачайте **signed** `.xpi` из [Releases](https://github.com/evil948/mrt-page-reader/releases) и откройте файл — Firefox установит дополнение (нужна подпись AMO, см. ниже «Подпись AMO»).

**Временно, без подписи**

1. Клонируйте репозиторий.
2. Firefox → `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on…** → [`extension/manifest.json`](extension/manifest.json).
4. Живёт до перезапуска Firefox.

После установки откройте статью → маленькая **▶** в углу или `Alt+R`.  
ПКМ по странице → пункты **MRT+** в контекстном меню.

### 2. Tampermonkey (userscript)

1. Установите [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/).
2. Откройте скрипт:  
   **[➜ Install mrt-page-reader.user.js](https://raw.githubusercontent.com/evil948/mrt-page-reader/main/mrt-page-reader.user.js)**
3. Обновите страницу статьи (`F5`).

Обновления userscript подтягиваются через `@updateURL` / `@downloadURL`.

> Не ставьте расширение и userscript одновременно на одну вкладку — будет две панели.

---

## Возможности

- Текст статьи: заголовок, абзацы, подзаголовки, короткие реплики
- Голоса Яндекса (только те, что реально отвечают через Uniproxy)
- Подсветка текущего фрагмента и оценка оставшегося времени
- Пауза / продолжение / стоп
- Озвучка выделенного текста
- Предзагрузка следующего блока во время воспроизведения
- Компактная кнопка ▶; полное меню — по клику или во время озвучки

## Управление

| Действие | Как |
| --- | --- |
| Открыть / свернуть меню | кнопка ▶ / × |
| Старт / пауза / продолжение | кнопка или `Alt+R` |
| Стоп | ■ Стоп или пункт меню |
| Смена голоса | список в панели |
| Только выделение | ПКМ → MRT+ / меню TM |

## Разработка

```text
mrt-page-reader.user.js   # исходник логики (Tampermonkey)
extension/                # Firefox WebExtension
tools/build-extension.ps1 # собирает content.js + dist/mrt-plus-VERSION.xpi
```

```powershell
powershell -File tools/build-extension.ps1
```

`extension/content.js` генерируется из userscript — править руками не нужно.

### Подпись AMO (чтобы `.xpi` ставился кликом)

1. Ключи: https://addons.mozilla.org/developers/addon/api/key/
2. Скопируйте `tools/amo-credentials.local.ps1.example` → `tools/amo-credentials.local.ps1` и вставьте JWT issuer / secret (файл в `.gitignore`).
3. Нужен [Node.js](https://nodejs.org/) (LTS).
4. Запуск:

```powershell
powershell -File tools/sign-extension.ps1
```

Появится `dist/mrt-plus-VERSION-signed.xpi` — его можно класть в GitHub Releases. Канал **unlisted** (самораздача, не витрина AMO).

## Как это работает

Тот же канал синтеза, что у MRT / Yandex Translate (Uniproxy), но Ogg Opus играет **на странице**. Жест «Озвучить» / `Alt+R` сразу разрешает автозвук.

## Устранение проблем

- **Нет звука / ошибка TTS** — обновите до последней версии, перезагрузите вкладку, смените голос.
- **Голоса вроде Levitan** — в списке только рабочие id; часть старых имён MRT недоступна.
- **Не тот текст** — снимите случайное выделение или используйте «озвучить выделенное».
- **Расширение пропало после перезапуска** — temporary add-on так устроен; нужен signed build или Developer Edition (см. выше).

## Благодарности

Идея и голоса — [Alkohole/machine-reading-text](https://github.com/Alkohole/machine-reading-text) (MRT) и Yandex Translate TTS.

## Лицензия

[MIT](LICENSE). API Яндекса может измениться; проект предоставляется «как есть», для личного использования.
