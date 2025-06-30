import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';
import { createProvider } from '../../providers/base.ts';
import { loadConfig } from '../../config.ts';

export class FixCommand implements Command {
  async *execute(query: string, options: CommandOptions): CommandGenerator {
    try {
      const envInfo = await NixUtils.detectEnvironment();

      if (!envInfo.hasNix) {
        yield NixUtils.getHelpMessage(envInfo);
        return;
      }

      yield `🔧 Nix 配置修复工具\n`;

      let problemDescription = query.trim();
      let flakeContent = '';
      let validationResult;

      // 如果有 flake.nix，读取并验证
      if (envInfo.hasFlake) {
        try {
          flakeContent = await NixUtils.readFlakeFile();
          validationResult = await NixUtils.validateFlake();

          if (!problemDescription && !validationResult.isValid) {
            problemDescription = validationResult.error || '检测到 flake 验证失败';
          }
        } catch (_e) {
          problemDescription = problemDescription || '无法读取或验证 flake.nix 文件';
        }
      } else if (!problemDescription) {
        problemDescription = '当前目录没有 flake.nix 文件';
      }

      yield `🔍 问题检测: ${problemDescription}\n`;
      yield `🤖 AI 分析修复方案中...\n`;

      // 获取错误详情（如果可能）
      let errorDetails = '';
      if (
        (envInfo.hasFlake && query.includes('error')) ||
        query.includes('失败') ||
        query.includes('错误')
      ) {
        try {
          // 尝试运行 nix flake check 获取详细错误
          const checkResult = await NixUtils.executeNixCommand('flake', ['check']);
          errorDetails = checkResult.stderr || checkResult.stdout;
        } catch (error) {
          errorDetails = error instanceof Error ? error.message : String(error);
        }
      }

      const prompt = `作为 Nix 专家，请帮助修复以下问题：

**问题描述：** ${problemDescription}

**环境信息：**
- Nix 版本: ${envInfo.nixVersion || '未知'}
- 项目类型: ${envInfo.projectType || '未知'}
- 有 flake.nix: ${envInfo.hasFlake}

${
  flakeContent
    ? `**当前 flake.nix 内容：**
\`\`\`nix
${flakeContent}
\`\`\``
    : ''
}

${
  errorDetails
    ? `**错误详情：**
\`\`\`
${errorDetails}
\`\`\``
    : ''
}

请提供：

1. **问题诊断**：分析问题的根本原因
2. **修复方案**：具体的修复步骤
3. **修复后的完整配置**：如果需要修改 flake.nix，请提供完整的修复后文件内容
4. **验证命令**：修复后应该运行的验证命令
5. **预防措施**：如何避免类似问题

要求：
- 用中文回答
- 提供可直接使用的代码
- 确保修复方案符合最新的 Nix Flakes 最佳实践
- 如果问题无法自动修复，说明需要手动干预的部分`;

      const config = loadConfig();
      const provider = createProvider(options.provider || config.nix?.provider || 'apizh');

      const model = options.model || config.nix?.model || 'gpt-4.1-2025-04-14';

      const response = await provider.executePrompt(prompt, {
        model,
        maxTokens: options.maxTokens || 5000,
        debug: options.debug || false,
      });

      yield `🛠️  修复建议:\n\n${response}\n\n`;

      // 提供后续操作建议
      yield `🚀 后续操作:
1. 根据上述建议修改配置文件
2. 运行 'vibe-tools nix check' 验证修复
3. 运行 'vibe-tools nix develop' 测试开发环境
4. 如果还有问题，使用 'vibe-tools nix assist "具体问题"' 获取更多帮助`;
    } catch (error) {
      yield `❌ 修复分析失败: ${error instanceof Error ? error.message : String(error)}

🔧 手动排查建议:
1. 检查 flake.nix 语法是否正确
2. 确认所有依赖是否可访问
3. 运行 'nix flake check --show-trace' 获取详细错误信息
4. 使用 'vibe-tools nix troubleshoot' 进行基础诊断`;

      if (options.debug) {
        console.error('Fix command error:', error);
      }
    }
  }
}
