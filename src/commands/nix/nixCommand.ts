import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { loadEnv } from '../../config';
import { AssistCommand } from './assist.ts';

export class NixCommand implements Command {
  private assistCommand: AssistCommand;

  constructor() {
    this.assistCommand = new AssistCommand();
  }

  async *execute(query: string, options: CommandOptions): CommandGenerator {
    loadEnv();

    if (!query.trim()) {
      yield this.getHelpMessage();
      return;
    }

    try {
      // 直接将所有查询作为自然语言任务处理
      yield* this.assistCommand.execute(query, options);
    } catch (error) {
      console.error('执行 nix 命令时发生错误', error);
      throw error;
    }
  }

  private getHelpMessage(): string {
    return `🔧 Vibe-Tools Nix 助手

AI驱动的 Nix Flakes 管理工具，支持自然语言操作。

用法: vibe-tools nix "<你的问题或任务描述>"

示例:
  # 基础操作
  vibe-tools nix "进入开发环境"
  vibe-tools nix "构建项目"
  vibe-tools nix "检查我的 flake 配置是否有效"

  # 配置任务
  vibe-tools nix "为 Python 项目创建一个包含 Django 的 flake.nix"
  vibe-tools nix "在开发环境中添加 Docker 和 kubectl"
  vibe-tools nix "优化我的 Rust 开发环境以提高性能"

  # 问题解决
  vibe-tools nix "修复构建失败，缺少 gcc 编译器"
  vibe-tools nix "解决两个包之间的依赖冲突"
  vibe-tools nix "我的 flake 文件没有被 nix 识别"

  # 分析和学习
  vibe-tools nix "解释我的 flake.nix 中 buildInputs 的作用"
  vibe-tools nix "分析我当前的配置并建议改进"

💡 提示: 用自然语言描述任何 nix 相关任务，AI 会自动选择最佳方法执行。`;
  }
} 