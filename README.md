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

Сборка не подписана Mozilla — так задумано для раздачи с GitHub (вариант «свой `.xpi`»).

**Вариант A — временно (удобно попробовать)**

1. Скачайте репозиторий или клонируйте его.
2. Откройте Firefox → `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on…** → выберите [`extension/manifest.json`](extension/manifest.json).
4. Расширение живёт до перезапуска Firefox.

**Вариант B — файл `.xpi`**

1. Возьмите `mrt-plus-*.xpi` из [Releases](https://github.com/evil948/mrt-page-reader/releases)  
   или соберите сами: `powershell -File tools/build-extension.ps1`.
2. Установка «постоянно» в обычном Firefox требует подписи Mozilla. Без подписи:
   - временно через `about:debugging` (укажите `.xpi` или `manifest.json`);
   - либо Firefox Developer Edition / Nightly с `xpinstall.signatures.required = false` (на свой страх и риск).

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
