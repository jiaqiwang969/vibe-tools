import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';
import { createProvider } from '../../providers/base.ts';

export class TroubleshootCommand implements Command {
  async *execute(query: string, options: CommandOptions): CommandGenerator {
    try {
      yield `🔧 诊断 Nix 环境问题...\n`;

      const envInfo = await NixUtils.detectEnvironment();

      // 基础环境检查
      yield `📋 环境诊断报告:\n`;
      yield `- Nix 安装状态: ${envInfo.hasNix ? '✅ 已安装' : '❌ 未安装'}\n`;
      yield `- Nix 版本: ${envInfo.nixVersion || '未知'}\n`;
      yield `- Flake 文件: ${envInfo.hasFlake ? '✅ 存在' : '❌ 不存在'}\n`;
      yield `- 项目类型: ${envInfo.projectType || '未检测到'}\n\n`;

      // 如果有特定问题描述，使用 AI 诊断
      if (query.trim()) {
        yield `🤖 AI 诊断中...\n`;

        let context = `环境信息：
- Nix 已安装: ${envInfo.hasNix}
- 有 flake.nix: ${envInfo.hasFlake}
- 项目类型: ${envInfo.projectType}`;

        if (envInfo.hasFlake) {
          try {
            const flakeContent = await NixUtils.readFlakeFile();
            context += `\n\nflake.nix 内容:\n\`\`\`nix\n${flakeContent}\n\`\`\``;
          } catch (_e) {
            context += '\n\n注意：无法读取 flake.nix 文件';
          }
        }

        const prompt = `作为 Nix 专家，请帮助诊断以下问题：

问题描述：${query}

${context}

请提供：
1. 问题原因分析
2. 具体解决步骤
3. 预防措施
4. 相关资源链接

用中文回答，提供具体可执行的解决方案。`;

        const provider = createProvider(options.provider || 'apizh-analysis');

        const diagnosis = await provider.executePrompt(prompt, {
          model: options.model || 'claude-sonnet-4-20250514',
          maxTokens: options.maxTokens || 3000,
          debug: options.debug || false,
        });

        yield `🩺 AI 诊断结果:\n\n${diagnosis}`;
      } else {
        // 通用诊断检查
        yield `🔍 执行通用检查...\n`;

        const issues: string[] = [];

        if (!envInfo.hasNix) {
          issues.push('❌ Nix 未安装');
        }

        if (!envInfo.hasFlake) {
          issues.push('❌ 当前目录没有 flake.nix 文件');
        }

        if (envInfo.hasFlake) {
          try {
            const validation = await NixUtils.validateFlake();
            if (!validation.isValid) {
              issues.push(`❌ Flake 验证失败: ${validation.error}`);
            }
          } catch (_e) {
            issues.push('❌ 无法验证 flake 配置');
          }
        }

        if (issues.length === 0) {
          yield `✅ 未发现明显问题！

💡 如果遇到具体问题，请使用：
vibe-tools nix troubleshoot "具体问题描述"`;
        } else {
          yield `⚠️  发现以下问题:\n\n${issues.join('\n')}\n\n🔧 建议解决方案:\n`;

          if (!envInfo.hasNix) {
            yield `1. 安装 Nix: curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install\n`;
          }

          if (!envInfo.hasFlake) {
            yield `2. 生成 flake.nix: vibe-tools nix init\n`;
          }
        }
      }
    } catch (error) {
      yield `❌ 诊断失败: ${error instanceof Error ? error.message : String(error)}`;

      if (options.debug) {
        console.error('Troubleshoot command error:', error);
      }
    }
  }
}
