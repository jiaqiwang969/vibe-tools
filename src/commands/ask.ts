import type { Command, CommandGenerator, CommandOptions, Provider } from '../types';
import { loadEnv, loadConfig, defaultMaxTokens } from '../config';
import { createProvider } from '../providers/base';
import { ProviderError, ModelNotFoundError } from '../errors';
import { getAllProviders } from '../utils/providerAvailability';
import type { ModelOptions } from '../providers/base';
import { fetchDocContent } from '../utils/fetch-doc.ts';

export class AskCommand implements Command {
  private config;
  constructor() {
    // Load environment variables and configuration.
    loadEnv();
    this.config = loadConfig();
  }

  async *execute(query: string, options?: CommandOptions): CommandGenerator {
    // Get available providers
    const availableProviders = getAllProviders().filter((p) => p.available);

    // If no providers are available, throw an error
    if (availableProviders.length === 0) {
      throw new ProviderError(
        "No AI providers are currently available. Please run 'vibe-tools install' to set up your API keys."
      );
    }

    // Use provided provider, then config provider, then default to the first available one
    const providerName = options?.provider || (this.config as any).apizh?.provider || 'apizh';

    // Check if the requested provider is available
    const providerInfo = getAllProviders().find((p) => p.provider === providerName);
    if (!providerInfo) {
      throw new ProviderError(
        `Invalid provider: ${providerName}.\n` +
          'Available providers:\n' +
          availableProviders.map((p) => `- ${p.provider}`).join('\n')
      );
    }
    if (!providerInfo.available) {
      throw new ProviderError(
        `The ${providerName} provider is not available. Please set ${providerName.toUpperCase()}_API_KEY in your environment.\n` +
          'Currently available providers:\n' +
          availableProviders.map((p) => `- ${p.provider}`).join('\n')
      );
    }

    // Use provided model or get default model for the provider
    let model: string = options?.model || '';
    if (!model) {
      // For APIZH provider (base), let the provider handle model selection to show recommendations
      if (providerName === 'apizh') {
        // Create the provider instance early to use its model selection
        const tempProvider = createProvider(providerName);
        const tempOptions: ModelOptions = {
          model: '', // Empty to trigger provider's model recommendation
          maxTokens: options?.maxTokens || defaultMaxTokens,
          debug: options?.debug,
        };
        // Type assertion since we know APIZH provider has getModel method
        model = (await (tempProvider as any).getModel(tempOptions)) || 'gpt-4o-mini';
      } else if (providerName.startsWith('apizh-')) {
        // For specialized APIZH variants, use the pre-configured model
        const apizhModels: Record<string, string> = {
          'apizh-coding': 'claude-opus-4-20250514-thinking',
          'apizh-chinese': 'qwen3-235b-a22b',
          'apizh-analysis': 'claude-sonnet-4-20250514',
          'apizh-creative': 'claude-opus-4-20250514',
          'apizh-math': 'o1',
          'apizh-web': 'gemini-2.5-pro-exp-03-25',
          'apizh-reasoning': 'o1-mini',
          'apizh-cost': 'gpt-4o-mini',
        };

        model = apizhModels[providerName] || 'gpt-4o-mini';

        // Show which specialized configuration is being used
        const taskNames: Record<string, string> = {
          'apizh-coding': '编程和代码生成',
          'apizh-chinese': '中文内容处理',
          'apizh-analysis': '数据分析和研究',
          'apizh-creative': '创意写作',
          'apizh-math': '数学和科学推理',
          'apizh-web': '网络搜索',
          'apizh-reasoning': '逻辑推理',
          'apizh-cost': '成本效益优化',
        };

        console.log(
          `🎯 Using ${providerName} (${taskNames[providerName] || '专用配置'}) with model: ${model}`
        );
      } else {
        // Default models for other providers
        const otherProviderModels: Record<string, string> = {
          openai: 'gpt-4.1',
          anthropic: 'claude-sonnet-4-20250514',
          gemini: 'gemini-2.5-pro',
          perplexity: 'sonar-pro',
          openrouter: 'openai/gpt-4.1',
          modelbox: 'openai/gpt-4.1',
          xai: 'grok-3-latest',
          apizh: 'gpt-4o-mini',
        };

        model = otherProviderModels[providerName] || 'gpt-4.1';
        console.log(`No model specified, using default model for ${providerName}: ${model}`);
      }
    }

    // Create the provider instance
    const provider = createProvider(providerName);
    const maxTokens = options?.maxTokens || defaultMaxTokens;

    let finalQuery = query;
    let docContent = '';

    // Check if the --with-doc flag is used and is an array
    if (options?.withDoc && Array.isArray(options.withDoc) && options.withDoc.length > 0) {
      const docContents: string[] = [];
      console.log(`Fetching and extracting text from ${options.withDoc.length} document(s)...`);
      for (const docUrl of options.withDoc) {
        if (typeof docUrl !== 'string' || !docUrl.trim()) {
          console.error(`Warning: Invalid URL provided in --with-doc: "${docUrl}". Skipping.`);
          continue;
        }
        try {
          console.log(`Fetching from: ${docUrl}`);
          const cleanedText = await fetchDocContent(docUrl, options.debug ?? false);
          if (cleanedText && cleanedText.trim().length > 0) {
            docContents.push(cleanedText);
            console.log(`Successfully extracted content from: ${docUrl}`);
          } else {
            console.warn(
              `fetchDocContent returned empty or whitespace-only text for ${docUrl}. Skipping.`
            );
          }
        } catch (fetchExtractError) {
          console.error(
            `Error during document fetch/extraction for ${docUrl}: ${fetchExtractError instanceof Error ? fetchExtractError.message : String(fetchExtractError)}`
          );
          console.error('Skipping this document due to error.');
        }
      }

      if (docContents.length > 0) {
        // Combine content from all documents
        docContent = docContents.join('\\n\\n---\\n\\n'); // Separator between documents
        const escapedDocContent = docContent.replace(/`/g, '\\\\`'); // Escape backticks
        finalQuery = `Document Content:\\n\`\`\`\\n${escapedDocContent}\\n\`\`\`\\n\\nQuestion:\\n${query}`;
        console.log(
          `Successfully added content from ${docContents.length} document(s) to the query.`
        );
      } else {
        console.warn(
          'No content successfully extracted from any provided --with-doc URLs. Proceeding without document context.'
        );
      }
    } else if (options?.withDoc) {
      // Handle case where --with-doc might be provided but not as a valid array (e.g., empty array, wrong type)
      console.error(
        'Warning: --with-doc provided but not in the expected format (array of URLs). Proceeding without document context.'
      );
    }

    let answer: string;
    try {
      // Build the model options
      const modelOptions: ModelOptions = {
        model,
        maxTokens,
        debug: options?.debug,
        systemPrompt:
          'You are a helpful assistant. Answer the following question directly and concisely.',
        reasoningEffort: options?.reasoningEffort ?? this.config.reasoningEffort,
        webSearch: options?.webSearch,
      };

      // Execute the prompt with the provider using the potentially modified query
      answer = await provider.executePrompt(finalQuery, modelOptions);

      // Track token count if provider returns it
      if ('tokenUsage' in provider && provider.tokenUsage) {
        const { promptTokens, completionTokens } = provider.tokenUsage;
        options?.debug &&
          console.log(
            `[AskCommand] Attempting to track telemetry with promptTokens: ${promptTokens}, completionTokens: ${completionTokens}`
          );
        options?.trackTelemetry?.({
          promptTokens,
          completionTokens,
          provider: providerName,
          model,
        });
      } else {
        options?.debug && console.log('[AskCommand] tokenUsage not found on provider instance.');
        // Still track provider and model even if token usage isn't available
        options?.trackTelemetry?.({
          provider: providerName,
          model,
        });
      }
    } catch (error) {
      throw new ProviderError(
        error instanceof Error ? error.message : 'Unknown error during ask command execution',
        error
      );
    }

    // Yield the answer as the result
    yield answer;
  }
}
