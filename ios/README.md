# MRT+ для iPhone

Мини-браузер с закладками новостных сайтов и встроенной озвучкой (Yandex Uniproxy — те же голоса, что в Firefox-расширении).

**Требования:** iOS 17+, Apple ID. Локальная сборка — macOS + Xcode 15+. **Без Mac:** [GitHub Actions](GITHUB_ACTIONS.md) (рекомендуется) или [Azure DevOps](AZURE.md).

## Быстрый старт без Mac (рекомендуется с Windows)

1. GitHub → **Actions** → **iOS IPA** → **Run workflow** ([инструкция](GITHUB_ACTIONS.md)).
2. Скачайте артефакт `MRTPlus-unsigned.ipa`.
3. Подпись на Windows через [Sideloadly](https://sideloadly.io/) своим Apple ID.
4. На iPhone доверьте сертификат разработчика.

## Быстрый старт (Xcode → iPhone)

1. Скопируйте репозиторий на Mac (или клонируйте).
2. Откройте [`MRTPlus.xcodeproj`](MRTPlus.xcodeproj).
3. В настройках таргета **MRTPlus** → **Signing & Capabilities**:
   - включите **Automatically manage signing**;
   - выберите свой **Team** (личный Apple ID достаточно).
4. Подключите iPhone, выберите его как Run destination.
5. **Product → Run** (⌘R).

На iPhone: **Настройки → Основные → VPN и управление устройством** — доверьте сертификат разработчика, если система попросит.

Бесплатный Apple ID переподписывает приложение примерно раз в **7 дней** (снова Run из Xcode или AltStore).

## Что умеет MVP

- Несколько вкладок с сайтами
- Закладки (Лента, РИА, РБК, Медуза, …) + добавление своего URL
- Кнопка **Озвучить** — извлечение статьи и синтез голосами Яндекса
- Пауза / стоп / выбор голоса, подсветка абзацев на странице

## Сборка .ipa (для AltStore / Sideloadly)

```bash
cd ios
xcodebuild -scheme MRTPlus -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/MRTPlus.xcarchive archive

xcodebuild -exportArchive \
  -archivePath build/MRTPlus.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ExportOptions.plist
```

Минимальный `ExportOptions.plist` для development:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>development</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>ВАШ_TEAM_ID</string>
</dict>
</plist>
```

Либо в Xcode: **Product → Archive** → **Distribute App** → **Development** / **Ad Hoc**.

## Перегенерация проекта (опционально)

Если правили структуру файлов и есть [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
cd ios && xcodegen generate
```

Спека: [`project.yml`](project.yml).

## Ограничения

- Озвучка идёт через неофициальный Uniproxy (как desktop MRT+); API может измениться.
- На iOS предпочитаем формат **mp3**; Ogg Opus с desktop-канала нативно почти не играет — при пустом/битом mp3 увидите ошибку воспроизведения.
- Не для App Store: неофициальный TTS и ключ Translate desktop с высокой вероятностью отклонят.
- Локально собрать `.ipa` с Windows нельзя — используйте [GitHub Actions](GITHUB_ACTIONS.md) или Mac.

## Структура

```
ios/
  MRTPlus.xcodeproj/
  MRTPlus/
    Browser/          # WKWebView, вкладки
    Bookmarks/        # закладки
    TTS/              # Uniproxy + плеер + сессия озвучки
    Resources/extract.js
```
