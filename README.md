# MRT+

Озвучка открытой статьи голосами Яндекса **прямо во вкладке**: подсветка абзаца, таймер, `Alt+R`, компактная кнопка ▶.

Без панели [MRT](https://alkohole.github.io/machine-reading-text/) и без лишнего клика «Старт».

| | |
| --- | --- |
| **Версия** | [1.7.1](https://github.com/evil948/mrt-page-reader/releases/tag/v1.7.1) |
| **Горячая клавиша** | `Alt+R` |
| **Firefox** | подписанное расширение (`.xpi`) |
| **Chrome / другие** | [Tampermonkey](#2-tampermonkey-userscript) |

---

## Установка

### 1. Firefox (рекомендуется)

**[⬇ Скачать MRT+ 1.7.1 для Firefox](https://github.com/evil948/mrt-page-reader/releases/download/v1.7.1/mrt-plus-1.7.1-signed.xpi)**

1. Скачайте файл и откройте его (или перетащите в окно Firefox).
2. Подтвердите установку дополнения.
3. Откройте статью → маленькая **▶** в углу или `Alt+R`.

ПКМ по странице → пункты меню **MRT+**.

Все [релизы](https://github.com/evil948/mrt-page-reader/releases).

<details>
<summary>Временная установка без .xpi (для разработки)</summary>

1. Клонируйте репозиторий.
2. Firefox → `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on…** → [`extension/manifest.json`](extension/manifest.json).
4. Живёт до перезапуска Firefox.

</details>

### 2. Tampermonkey (userscript)

Для Chrome, Яндекс.Браузера и т.п. — или если предпочитаете userscript.

1. Установите [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/).
2. Откройте: **[➜ Install mrt-page-reader.user.js](https://raw.githubusercontent.com/evil948/mrt-page-reader/main/mrt-page-reader.user.js)**
3. Обновите страницу статьи (`F5`).

> Не ставьте расширение и userscript одновременно — будет две панели.

---

## Возможности

- Текст статьи: заголовок, абзацы, подзаголовки, короткие реплики
- Голоса Яндекса (только те, что реально отвечают через Uniproxy)
- Подсветка текущего фрагмента и оценка оставшегося времени
- Пауза / продолжение / стоп, озвучка выделенного
- Предзагрузка следующего блока во время воспроизведения
- Компактная кнопка ▶; полное меню — по клику или во время озвучки

## Управление

| Действие | Как |
| --- | --- |
| Открыть / свернуть меню | кнопка ▶ / × |
| Старт / пауза / продолжение | кнопка или `Alt+R` |
| Стоп | ■ Стоп или пункт меню |
| Смена голоса | список в панели |
| Только выделение | ПКМ → MRT+ / меню Tampermonkey |

## Как это работает

Тот же канал синтеза, что у MRT / Yandex Translate (Uniproxy), но Ogg Opus играет **на странице**. Жест «Озвучить» / `Alt+R` сразу разрешает автозвук.

## Устранение проблем

- **Нет звука / ошибка TTS** — обновите до последней версии, перезагрузите вкладку, смените голос.
- **Голоса вроде Levitan** — в списке только рабочие id; часть старых имён MRT недоступна.
- **Не тот текст** — снимите случайное выделение или используйте «озвучить выделенное».
- **Firefox пишет «непроверенное дополнение»** — ставьте файл `*-signed.xpi` из Releases, не сырую сборку без подписи AMO.
- **После перехода на другую новость всё ещё читает старую** — обновите до 1.7.1+; при смене URL озвучка сбрасывается.

## Разработка

```text
mrt-page-reader.user.js     # исходник логики
extension/                  # Firefox WebExtension
tools/build-extension.ps1   # content.js + unsigned .xpi
tools/sign-extension.ps1    # подпись AMO (unlisted) → signed .xpi
```

```powershell
powershell -File tools/build-extension.ps1
powershell -File tools/sign-extension.ps1   # нужен tools/amo-credentials.local.ps1
```

Ключи AMO: https://addons.mozilla.org/developers/addon/api/key/  
Шаблон: [`tools/amo-credentials.local.ps1.example`](tools/amo-credentials.local.ps1.example) → `amo-credentials.local.ps1` (в `.gitignore`).

`extension/content.js` генерируется из userscript — править руками не нужно.

## Благодарности

Идея и голоса — [Alkohole/machine-reading-text](https://github.com/Alkohole/machine-reading-text) (MRT) и Yandex Translate TTS.

## Лицензия

[MIT](LICENSE). API Яндекса может измениться; проект предоставляется «как есть».
