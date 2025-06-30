import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';
import { createProvider } from '../../providers/base.ts';
import { loadConfig } from '../../config.ts';

export class AssistCommand implements Command {
  async *execute(query: string, options: CommandOptions): CommandGenerator {
    try {
      if (!query.trim()) {
        yield `💬 Nix AI 助手

请描述您需要帮助的 Nix 相关任务，例如：
- "帮我修复构建错误"
- "为 React 项目优化开发环境"
- "添加 Python 和 PostgreSQL 支持"
- "解决依赖冲突问题"
- "设置 CI/CD 配置"

用法: vibe-tools nix assist "您的问题或任务描述"`;
        return;
      }

      const envInfo = await NixUtils.detectEnvironment();
      
      yield `🤖 Nix AI 助手启动中...\n`;
      yield `📋 环境状态: Nix ${envInfo.hasNix ? '✅' : '❌'} | Flake ${envInfo.hasFlake ? '✅' : '❌'} | 项目: ${envInfo.projectType || '未知'}\n`;

      // 构建上下文
      let context = `环境信息：
- Nix 已安装: ${envInfo.hasNix}
- Nix 版本: ${envInfo.nixVersion || '未知'}
- 有 flake.nix: ${envInfo.hasFlake}
- 项目类型: ${envInfo.projectType || '未检测到'}
- 工作目录: ${process.cwd()}`;

      // 如果有 flake.nix，包含其内容
      if (envInfo.hasFlake) {
        try {
          const flakeContent = await NixUtils.readFlakeFile();
          context += `\n\n当前 flake.nix 内容:\n\`\`\`nix\n${flakeContent}\n\`\`\``;
        } catch (e) {
          context += '\n\n注意：无法读取 flake.nix 文件';
        }
      }

      // 检查是否有其他相关文件
      try {
        const { execAsync } = await import('../../utils/execAsync.ts');
        const lsResult = await execAsync('ls -la');
        context += `\n\n当前目录文件:\n${lsResult.stdout}`;
      } catch (e) {
        // 忽略文件列表获取失败
      }

      const prompt = `作为资深 Nix 专家和开发顾问，请帮助用户解决以下问题：

**用户请求：** ${query}

**当前环境：**
${context}

请提供：
1. **问题分析**：理解用户的需求和当前状况
2. **解决方案**：提供具体、可执行的步骤
3. **代码示例**：如果需要修改配置，提供完整的代码
4. **执行命令**：列出需要运行的具体命令
5. **验证方法**：如何确认解决方案生效
6. **后续建议**：相关的最佳实践和优化建议

要求：
- 用中文回答
- 提供具体可执行的解决方案
- 如果需要修改文件，提供完整的文件内容
- 优先使用最新的 Nix Flakes 最佳实践
- 考虑项目的实际需求和环境`;

      const config = loadConfig();
      
      // 使用专门的 nix 配置或默认配置
      const provider = createProvider(
        options.provider || 
        config.nix?.provider || 
        'apizh' // 默认使用 apizh
      );
      
      const model = options.model || 
        config.nix?.model || 
        'gpt-4.1-2025-04-14'; // 使用指定的模型
      
      const maxTokens = options.maxTokens || 
        config.nix?.maxTokens || 
        6000;

      yield `🧠 使用模型: ${model}\n`;

      const response = await provider.executePrompt(prompt, {
        model,
        maxTokens,
        debug: options.debug || false,
      });

      yield `💡 AI 助手回复:\n\n${response}\n\n`;
      
      yield `✨ 需要更多帮助？
- 使用 vibe-tools nix assist "其他问题" 继续咨询
- 使用 vibe-tools nix troubleshoot 进行问题诊断  
- 使用 vibe-tools nix analyze 分析当前配置`;

    } catch (error) {
      yield `❌ AI 助手失败: ${error instanceof Error ? error.message : String(error)}`;
      
      if (options.debug) {
        console.error('Assist command error:', error);
      }
    }
  }
} 