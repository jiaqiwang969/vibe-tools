import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';
import { createProvider } from '../../providers/base.ts';
import { loadConfig } from '../../config.ts';

export class AnalyzeCommand implements Command {
  async *execute(query: string, options: CommandOptions): CommandGenerator {
    try {
      // 检测环境
      const envInfo = await NixUtils.detectEnvironment();

      if (!envInfo.hasNix) {
        yield NixUtils.getHelpMessage(envInfo);
        return;
      }

      if (!envInfo.hasFlake) {
        yield NixUtils.getHelpMessage(envInfo);
        return;
      }

      yield `🔍 分析 flake.nix 配置...\n`;

      // 读取 flake.nix 内容
      const flakeContent = await NixUtils.readFlakeFile();

      // 检测项目类型
      const projectType = envInfo.projectType || 'Generic';

      yield `📋 项目信息:
- 类型: ${projectType}
- Nix 版本: ${envInfo.nixVersion || '未知'}

🤖 AI 分析中...\n`;

      // 准备 AI 提示
      const prompt = `作为一个 Nix Flakes 专家，请分析以下 flake.nix 配置文件，项目类型是 ${projectType}。

flake.nix 内容:
\`\`\`nix
${flakeContent}
\`\`\`

请提供以下分析:

1. **配置概览**: 简要描述这个 flake 的用途和结构
2. **依赖分析**: 分析 inputs 部分，识别所有外部依赖
3. **输出分析**: 分析 outputs 部分，识别提供的包、开发环境、应用等
4. **最佳实践检查**: 指出是否遵循了 Nix Flakes 最佳实践
5. **潜在问题**: 识别可能的问题或改进点
6. **建议**: 提供具体的改进建议

请用中文回答，并提供具体、可操作的建议。`;

      // 获取配置和创建 AI provider
      const config = loadConfig();
      const provider = createProvider(options.provider || 'apizh-analysis');

      // 调用 AI 分析
      const analysis = await provider.executePrompt(prompt, {
        model: options.model || config.repo?.model || 'claude-sonnet-4-20250514',
        maxTokens: options.maxTokens || 4000,
        debug: options.debug || false,
      });

      yield `🧠 AI 分析结果:\n\n${analysis}`;
    } catch (error) {
      yield `❌ 分析失败: ${error instanceof Error ? error.message : String(error)}`;

      if (options.debug) {
        console.error('Analyze command error:', error);
      }
    }
  }
}
