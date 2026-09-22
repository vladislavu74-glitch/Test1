// Перезаписывается build-скриптом (см. preBuildScripts в project.yml)
// перед каждой компиляцией — значения ниже только заглушка на случай,
// если скрипт почему-то не отработал.
enum BuildInfo {
    static let gitCommitHash = "unknown"
    static let builtAt = "unknown"
}
