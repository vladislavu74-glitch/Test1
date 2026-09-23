// Ручной мок для Jest: реальный пакет socks-proxy-agent публикуется только
// как ESM (package.json "type": "module"), что ломает парсинг в jest'е,
// работающем через ts-jest/CommonJS (сам Node это умеет через новый
// require(esm), а вот Jest — нет). Тесты никогда не устанавливают реальное
// SOCKS5-соединение, поэтому достаточно заглушки с тем же именем экспорта.
class SocksProxyAgent {
  constructor(uri) {
    this.uri = uri;
  }
}

module.exports = { SocksProxyAgent };
