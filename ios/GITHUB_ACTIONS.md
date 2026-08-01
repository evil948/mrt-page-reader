# Сборка .ipa через GitHub Actions (без Mac и без Azure)

Готовый IPA: [Releases](https://github.com/evil948/mrt-page-reader/releases) (ставьте свежий `ios-x.y.z`, старое приложение с iPhone лучше удалить перед установкой).

Репозиторий уже на GitHub — Actions гоняет `xcodebuild` на **macos-15** и отдаёт артефакт. Подпись — у вас на Windows (Sideloadly).

Azure DevOps здесь не нужен.

## Как собрать самому

1. Откройте репозиторий на GitHub → вкладка **Actions**.
2. Слева: workflow **iOS IPA**.
3. **Run workflow** → **Run workflow** (ветка `main`).
4. Дождитесь зелёной галочки (5–15 мин, иногда очередь на macOS).
5. Внутри run → **Artifacts** → **mrtplus-ipa** → скачайте zip с `MRTPlus-unsigned.ipa`.

Также стартует сам при пуше в `ios/**` или в этот workflow-файл.

## Подпись на Windows

1. [Sideloadly](https://sideloadly.io/)
2. IPA + Apple ID → установить на iPhone
3. На телефоне: **Настройки → Основные → VPN и управление устройством** — доверьте сертификат

Бесплатный Apple ID: переподпись примерно раз в 7 дней.

## Лимиты

- Публичный репозиторий: macOS-минуты GitHub ограничены, для редких сборок обычно хватает.
- Если Actions выключены: **Settings → Actions → General** → разрешите workflows.

Файл workflow: [`.github/workflows/ios-ipa.yml`](../.github/workflows/ios-ipa.yml)
