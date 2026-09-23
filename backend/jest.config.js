/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  // socks-proxy-agent публикуется только как ESM — Jest (в отличие от Node
  // напрямую) не умеет его парсить через ts-jest/CommonJS; тестам реальный
  // SOCKS5-агент не нужен, см. tests/__mocks__/socks-proxy-agent.js.
  moduleNameMapper: {
    '^socks-proxy-agent$': '<rootDir>/tests/__mocks__/socks-proxy-agent.js',
  },
};
