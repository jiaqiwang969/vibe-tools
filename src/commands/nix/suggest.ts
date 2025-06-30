import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';
import { createProvider } from '../../providers/base.ts';
import { loadConfig } from '../../config.ts';

export class SuggestCommand implements Command {
  async *execute(query: string, options: CommandOptions): CommandGenerator {
    try {
      const envInfo = await NixUtils.detectEnvironment();
      
      if (!envInfo.hasNix) {
        yield NixUtils.getHelpMessage(envInfo);
        return;
      }

      if (!envInfo.hasFlake) {
        yield NixUtils.getHelpMessage(envInfo);
        return;
      }

      yield `💡 生成改进建议...\n`;

      const flakeContent = await NixUtils.readFlakeFile();
      const projectType = envInfo.projectType || 'Generic';
      
      const prompt = `作为 Nix Flakes 专家，请为以下 ${projectType} 项目的 flake.nix 配置提供具体的改进建议：

\`\`\`nix
${flakeContent}
\`\`\`

专注提供：
1. 性能优化建议
2. 安全性改进
3. 开发体验提升
4. 最新最佳实践
5. 具体的代码修改建议

请提供可直接实施的建议，用中文回答。`;

      const config = loadConfig();
      const provider = createProvider(options.provider || 'apizh-analysis');
      
      const suggestions = await provider.executePrompt(prompt, {
        model: options.model || 'claude-sonnet-4-20250514',
        maxTokens: options.maxTokens || 3000,
        debug: options.debug || false,
      });

      yield `🚀 改进建议:\n\n${suggestions}`;

    } catch (error) {
      yield `❌ 生成建议失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
} 