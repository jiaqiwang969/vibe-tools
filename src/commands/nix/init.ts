import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';
import { createProvider } from '../../providers/base.ts';

export class InitCommand implements Command {
  async *execute(query: string, options: CommandOptions): CommandGenerator {
    try {
      const envInfo = await NixUtils.detectEnvironment();

      if (!envInfo.hasNix) {
        yield NixUtils.getHelpMessage(envInfo);
        return;
      }

      const projectType = query.trim() || envInfo.projectType || 'Generic';

      yield `🚀 为 ${projectType} 项目生成 flake.nix...\n`;

      // 如果已有 flake.nix，询问是否覆盖
      if (envInfo.hasFlake) {
        yield `⚠️  当前目录已存在 flake.nix 文件。
        
使用 'vibe-tools nix analyze' 分析现有配置，
或使用 'vibe-tools nix suggest' 获取改进建议。

如需重新生成，请先备份现有文件。`;
        return;
      }

      // 使用 AI 生成适合项目类型的 flake.nix
      const prompt = `作为 Nix Flakes 专家，请为 ${projectType} 项目生成一个完整、实用的 flake.nix 配置文件。

要求：
1. 使用最新的 Nix Flakes 最佳实践
2. 包含适合 ${projectType} 项目的开发环境配置
3. 包含构建配置（如果适用）
4. 使用 flake-utils 简化多系统支持
5. 添加详细的注释说明
6. 包含常用的开发工具

请只返回 flake.nix 文件的内容，不要包含其他解释文字。`;

      const provider = createProvider(options.provider || 'apizh-coding');

      const flakeContent = await provider.executePrompt(prompt, {
        model: options.model || 'claude-sonnet-4-20250514',
        maxTokens: options.maxTokens || 2000,
        debug: options.debug || false,
      });

      // 清理生成的内容，确保只包含 nix 代码
      const cleanedContent = this.cleanFlakeContent(flakeContent);

      // 写入文件
      await NixUtils.writeFlakeFile(cleanedContent);

      // 检查 git 状态
      const gitInfo = await NixUtils.detectGitStatus(process.cwd());

      yield `✅ flake.nix 已生成！

📋 生成的配置包含：
- ${projectType} 项目的开发环境
- 多系统支持 (使用 flake-utils)
- 常用开发工具
- 详细的注释说明

🔧 下一步：`;

      if (gitInfo.hasGit) {
        yield `1. 添加到 git: vibe-tools nix git add
2. 提交配置: git commit -m "Add flake configuration"
3. 运行 'vibe-tools nix check' 验证配置
4. 运行 'vibe-tools nix develop' 进入开发环境`;
      } else {
        yield `1. 初始化 git: git init
2. 添加文件: vibe-tools nix git add  
3. 提交配置: git commit -m "Initial flake configuration"
4. 运行 'vibe-tools nix check' 验证配置
5. 运行 'vibe-tools nix develop' 进入开发环境`;
      }

      yield `

💡 提示：
- Nix flakes 需要文件被 git 跟踪才能工作
- 建议创建 .envrc 文件以启用 direnv 自动环境加载：
  echo "use flake" > .envrc
  direnv allow`;
    } catch (error) {
      yield `❌ 生成 flake.nix 失败: ${error instanceof Error ? error.message : String(error)}`;

      if (options.debug) {
        console.error('Init command error:', error);
      }
    }
  }

  private cleanFlakeContent(content: string): string {
    // 移除可能的 markdown 代码块标记
    let cleaned = content.replace(/```nix\n?/g, '').replace(/```\n?/g, '');

    // 确保以 { 开头
    if (!cleaned.trim().startsWith('{')) {
      const startIndex = cleaned.indexOf('{');
      if (startIndex !== -1) {
        cleaned = cleaned.substring(startIndex);
      }
    }

    return cleaned.trim();
  }
}
