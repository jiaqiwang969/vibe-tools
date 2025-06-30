import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';
import { createProvider } from '../../providers/base.ts';

export class ExplainCommand implements Command {
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

      yield `📚 解释 flake.nix 配置...\n`;

      const flakeContent = await NixUtils.readFlakeFile();

      let prompt: string;

      if (query.trim()) {
        // 解释特定部分
        prompt = `作为 Nix Flakes 专家，请详细解释以下 flake.nix 配置中关于 "${query}" 的部分：

\`\`\`nix
${flakeContent}
\`\`\`

请特别关注：
1. 这部分配置的作用和目的
2. 每个参数的含义
3. 如何修改和定制
4. 相关的最佳实践

用中文回答，适合初学者理解。`;
      } else {
        // 解释整个配置
        prompt = `作为 Nix Flakes 专家，请详细解释以下 flake.nix 配置文件：

\`\`\`nix
${flakeContent}
\`\`\`

请逐部分解释：
1. 整体结构和设计思路
2. inputs 部分：每个依赖的作用
3. outputs 部分：每个输出的用途
4. 关键配置选项的含义
5. 如何修改和扩展

用中文回答，提供清晰易懂的解释。`;
      }

      const provider = createProvider(options.provider || 'apizh-analysis');

      const explanation = await provider.executePrompt(prompt, {
        model: options.model || 'claude-sonnet-4-20250514',
        maxTokens: options.maxTokens || 4000,
        debug: options.debug || false,
      });

      yield `📖 配置解释:\n\n${explanation}`;
    } catch (error) {
      yield `❌ 解释失败: ${error instanceof Error ? error.message : String(error)}`;

      if (options.debug) {
        console.error('Explain command error:', error);
      }
    }
  }
}
