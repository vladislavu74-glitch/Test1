// Общий конструктор клиента Anthropic для агентов поиска (aiSourceSearchAgent,
// hiringResourceAgent) — при заданном ANTHROPIC_PROXY_URL заворачивает запросы
// через SOCKS5-релей (обход гео-ограничения Anthropic API для российских IP,
// см. комментарий у config.anthropicProxyUrl).
//
// Anthropic SDK по умолчанию использует глобальный fetch (undici), у которого
// нет поддержки SOCKS5 "из коробки" (только HTTP CONNECT через ProxyAgent) —
// поэтому здесь передаётся собственная реализация fetch на node-fetch v2,
// которая понимает http.Agent-совместимые агенты вроде SocksProxyAgent.
import Anthropic from '@anthropic-ai/sdk';
import nodeFetch, { type RequestInfo, type RequestInit } from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { config } from '../config';

function createProxiedFetch(proxyUrl: string): typeof fetch {
  const agent = new SocksProxyAgent(proxyUrl);
  return ((input: RequestInfo, init?: RequestInit) =>
    nodeFetch(input, { ...init, agent })) as unknown as typeof fetch;
}

export function createAnthropicClient(): Anthropic {
  if (!config.anthropicProxyUrl) {
    return new Anthropic({ apiKey: config.anthropicApiKey });
  }

  return new Anthropic({
    apiKey: config.anthropicApiKey,
    fetch: createProxiedFetch(config.anthropicProxyUrl),
  });
}
