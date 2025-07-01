import type { Provider } from '../types';

interface ProviderInfo {
  provider: Provider;
  available: boolean;
  defaultModel?: string;
}

// Default models for each provider when none specified in config
const DEFAULT_MODELS: Record<Provider, string> = {
  perplexity: 'sonar-pro',
  gemini: 'gemini-2.5-pro',
  openai: 'gpt-4.1', // largest context window (1M tokens) so best chance of working
  anthropic: 'claude-sonnet-4-20250514',
  openrouter: 'google/gemini-2.5-pro', // largest context window (1M tokens) so best chance of working
  modelbox: 'google/gemini-2.5-pro', // largest context window (1M tokens) so best chance of working
  xai: 'grok-3-latest',
  apizh: 'gpt-4o-mini', // Default model for Chinese API relay service
  'apizh-coding': 'o3', // 编程和代码生成 - 最强编程模型
  'apizh-chinese': 'qwen3-235b-a22b', // 中文内容处理
  'apizh-analysis': 'claude-sonnet-4-20250514', // 数据分析和研究
  'apizh-creative': 'claude-opus-4-20250514', // 创意写作
  'apizh-math': 'o1', // 数学和科学推理
  'apizh-web': 'gemini-2.5-pro-exp-03-25', // 网络搜索
  'apizh-reasoning': 'o1-mini', // 逻辑推理
  'apizh-cost': 'gpt-4o-mini', // 成本效益优化
  'apizh-nix': 'gpt-4.1-2025-04-14', // Nix包管理
};

// Task-specific model recommendations for APIZH provider
export const APIZH_TASK_MODELS: Record<string, string> = {
  web: 'gemini-2.5-pro-exp-03-25',
  repo: 'claude-sonnet-4-20250514',
  plan_file: 'gpt-4o-mini',
  plan_thinking: 'claude-opus-4-20250514',
  doc: 'gpt-4o',
  ask: 'gpt-4o-mini',
  browser: 'claude-sonnet-4-20250514',
  coding: 'claude-opus-4-20250514-thinking',
  chinese: 'qwen3-235b-a22b',
  analysis: 'claude-sonnet-4-20250514',
  math: 'o1-mini',
  reasoning: 'o1',
  creative: 'claude-opus-4-20250514',
  'long-context': 'gpt-4.1',
};

// APIZH 4大智能代理角色配置 (对标原版vibe-tools推荐)
export const APIZH_AGENT_ROLES: Record<
  string,
  { provider: Provider; model: string; description: string }
> = {
  coding: {
    provider: 'apizh-coding',
    model: 'o3', // 最强的编程模型，专长代码生成和架构设计
    description: '🛠️ 编程专家 - 代码生成、调试、架构设计专家',
  },
  'web-search': {
    provider: 'apizh-web',
    model: 'gemini-2.5-pro-exp-03-25', // 替代Perplexity，网络搜索专家
    description: '🔍 网络搜索专家 - 实时信息检索、市场调研专家',
  },
  tooling: {
    provider: 'apizh-analysis',
    model: 'claude-sonnet-4-20250514', // 替代Claude 4 Sonnet，工具操作专家
    description: '⚙️ 工具操作专家 - MCP集成、系统操作、工具链管理',
  },
  'large-context': {
    provider: 'apizh-reasoning',
    model: 'gemini-2.5-pro-exp-03-25', // 替代Gemini Flash 2.5，大上下文处理
    description: '📚 大上下文专家 - 系统分析、长文档处理、战略规划',
  },
  nix: {
    provider: 'apizh-nix',
    model: 'gpt-4.1-2025-04-14', // Nix包管理专家
    description: '🛠️ Nix专家 - Flake配置、环境管理专家',
  },
};

// Provider preference order for each command type
export const PROVIDER_PREFERENCE: Record<string, Provider[]> = {
  web: ['apizh-web', 'perplexity', 'gemini', 'modelbox', 'openrouter', 'apizh'],
  repo: [
    'apizh-analysis',
    'gemini',
    'modelbox',
    'openrouter',
    'openai',
    'perplexity',
    'anthropic',
    'xai',
    'apizh',
  ],
  plan_file: [
    'apizh-cost',
    'gemini',
    'modelbox',
    'openrouter',
    'openai',
    'perplexity',
    'anthropic',
    'xai',
    'apizh',
  ],
  plan_thinking: [
    'apizh-reasoning',
    'openai',
    'modelbox',
    'openrouter',
    'gemini',
    'anthropic',
    'perplexity',
    'xai',
    'apizh',
  ],
  doc: [
    'apizh-analysis',
    'gemini',
    'modelbox',
    'openrouter',
    'openai',
    'perplexity',
    'anthropic',
    'xai',
    'apizh',
  ],
  ask: [
    'apizh-cost',
    'openai',
    'modelbox',
    'openrouter',
    'gemini',
    'anthropic',
    'perplexity',
    'apizh',
  ],
  browser: [
    'apizh-analysis',
    'anthropic',
    'openai',
    'modelbox',
    'openrouter',
    'gemini',
    'perplexity',
    'apizh',
  ],
};

export function getDefaultModel(provider: Provider): string {
  return DEFAULT_MODELS[provider];
}

export function getAllProviders(): ProviderInfo[] {
  const isApizhAvailable = !!process.env.APIZH_API_KEY;

  return [
    {
      provider: 'perplexity',
      available: !!process.env.PERPLEXITY_API_KEY,
      defaultModel: DEFAULT_MODELS.perplexity,
    },
    {
      provider: 'gemini',
      available: !!process.env.GEMINI_API_KEY,
      defaultModel: DEFAULT_MODELS.gemini,
    },
    {
      provider: 'openai',
      available: !!process.env.OPENAI_API_KEY,
      defaultModel: DEFAULT_MODELS.openai,
    },
    {
      provider: 'anthropic',
      available: !!process.env.ANTHROPIC_API_KEY,
      defaultModel: DEFAULT_MODELS.anthropic,
    },
    {
      provider: 'openrouter',
      available: !!process.env.OPENROUTER_API_KEY,
      defaultModel: DEFAULT_MODELS.openrouter,
    },
    {
      provider: 'modelbox',
      available: !!process.env.MODELBOX_API_KEY,
      defaultModel: DEFAULT_MODELS.modelbox,
    },
    {
      provider: 'xai',
      available: !!process.env.XAI_API_KEY,
      defaultModel: DEFAULT_MODELS.xai,
    },
    {
      provider: 'apizh',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS.apizh,
    },
    // APIZH specialized variants
    {
      provider: 'apizh-coding',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-coding'],
    },
    {
      provider: 'apizh-chinese',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-chinese'],
    },
    {
      provider: 'apizh-analysis',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-analysis'],
    },
    {
      provider: 'apizh-creative',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-creative'],
    },
    {
      provider: 'apizh-math',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-math'],
    },
    {
      provider: 'apizh-web',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-web'],
    },
    {
      provider: 'apizh-reasoning',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-reasoning'],
    },
    {
      provider: 'apizh-cost',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-cost'],
    },
    {
      provider: 'apizh-nix',
      available: isApizhAvailable,
      defaultModel: DEFAULT_MODELS['apizh-nix'],
    },
  ];
}

export function getProviderInfo(provider: string): ProviderInfo | undefined {
  return getAllProviders().find((p) => p.provider === provider);
}

export function isProviderAvailable(provider: string): boolean {
  return !!getProviderInfo(provider)?.available;
}

export function getAvailableProviders(): ProviderInfo[] {
  return getAllProviders().filter((p) => p.available);
}

export function getNextAvailableProvider(
  commandType: keyof typeof PROVIDER_PREFERENCE,
  currentProvider?: Provider
): Provider | undefined {
  const preferenceOrder = PROVIDER_PREFERENCE[commandType];
  if (!preferenceOrder) {
    throw new Error(`Unknown command type: ${commandType}`);
  }

  const availableProviders = getAllProviders();

  // If currentProvider is specified, start looking from the next provider in the preference order
  const startIndex = currentProvider ? preferenceOrder.indexOf(currentProvider) + 1 : 0;

  // Look through remaining providers in preference order
  for (let i = startIndex; i < preferenceOrder.length; i++) {
    const provider = preferenceOrder[i];
    const providerInfo = availableProviders.find((p) => p.provider === provider);
    if (providerInfo?.available) {
      return provider;
    } else {
      console.log(`Provider ${provider} is not available`);
    }
  }

  return undefined;
}
