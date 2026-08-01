# Сборка .ipa через Azure DevOps (без Mac)

Репозиторий уже на GitHub — Azure Pipelines подключается к нему и гоняет `xcodebuild` на **hosted macOS**-агенте. Готовый `.ipa` скачивается как артефакт.

## Какой режим выбрать

| Режим | Когда | Что получаете |
| --- | --- | --- |
| **unsigned** (по умолчанию) | Есть Windows + [Sideloadly](https://sideloadly.io/) / AltStore, Apple ID | `MRTPlus-unsigned.ipa` → подписываете у себя |
| **signed** | Платный Apple Developer, есть `.p12` и `.mobileprovision` | Готовый подписанный `.ipa` из пайплайна |

Для вашего случая («собрать негде, подписать смогу») — **unsigned + Sideloadly**.

## 1. Создать pipeline в Azure DevOps

1. Зарегистрируйтесь на [dev.azure.com](https://dev.azure.com) (бесплатный аккаунт).
2. **New project** → **Pipelines** → **New pipeline**.
3. **GitHub** → авторизуйте и выберите `evil948/mrt-page-reader`.
4. **Existing Azure Pipelines YAML file** → `/azure-pipelines.yml`.
5. **Run**.

Первый прогон может занять очередь на `macOS-15` (бесплатный tier).

## 2. Скачать IPA

После успеха: run → **Artifacts** → **mrtplus-ipa** → скачать zip с `.ipa`.

## 3. Подписать на Windows (unsigned)

1. Установите [Sideloadly](https://sideloadly.io/).
2. Подключите iPhone (или используйте Wi‑Fi pairing).
3. Перетащите `MRTPlus-unsigned.ipa`, войдите Apple ID → Start.
4. На iPhone: **Настройки → Основные → VPN и управление устройством** — доверьте сертификат.

Бесплатный Apple ID: переподпись примерно раз в **7 дней**.

## 4. Режим signed (опционально)

Нужен **Apple Developer Program** ($99/год).

1. В Keychain / Apple Developer экспортируйте сертификат в `.p12` и скачайте Development/Ad Hoc `.mobileprovision` для bundle id `io.github.evil948.mrtplus`.
2. Azure DevOps → **Pipelines → Library → Secure files**:
   - загрузите файл как `mrtplus-ios.p12`
   - загрузите профиль как `mrtplus.mobileprovision`
   - **Authorize** для пайплайна.
3. **Pipelines → Library → Variable group** (или переменные пайплайна):
   - `P12_PASSWORD` — пароль `.p12` (**secret**)
   - `APPLE_TEAM_ID` — Team ID (10 символов)
4. При запуске pipeline: **Run pipeline** → параметр **Signing mode** = `signed`.

Имена Secure Files можно поменять в `azure-pipelines.yml` (`certSecureFile` / `profileSecureFile`).

## Лимиты Azure

- Microsoft-hosted macOS агенты есть в бесплатном плане, но с **квотой минут** и очередью.
- Private project: иногда нужен request на бесплатный parallel job.
- Public GitHub-репозиторий обычно проще по квотам.

Если минуты кончатся — тот же YAML почти 1:1 переносится в **GitHub Actions** (`macos-15`); репозиторий уже на GitHub.

## Ручной запуск только ios/

В YAML уже стоит `paths: ios/**` — коммиты вне `ios/` пайплайн не триггерят. Ручной **Run pipeline** всегда доступен.
