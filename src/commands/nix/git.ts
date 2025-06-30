import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils, type NixEnvironmentInfo } from './utils.ts';

export class GitCommand implements Command {
  async *execute(query: string, options: CommandOptions): CommandGenerator {
    try {
      const envInfo = await NixUtils.detectEnvironment();

      const [action, ..._rest] = query.trim().split(' ');

      if (!action) {
        yield this.getHelpMessage();
        return;
      }

      switch (action.toLowerCase()) {
        case 'status':
          yield* this.checkStatus(envInfo);
          break;
        case 'add':
          yield* this.addFiles(envInfo);
          break;
        case 'fix':
          yield* this.fixGitIssues(envInfo);
          break;
        default:
          yield `未知的 git 操作: ${action}\n\n${this.getHelpMessage()}`;
      }
    } catch (error) {
      yield `❌ Git 操作失败: ${error instanceof Error ? error.message : String(error)}`;

      if (options.debug) {
        console.error('Git command error:', error);
      }
    }
  }

  private async *checkStatus(envInfo: NixEnvironmentInfo): CommandGenerator {
    yield `🔍 检查 Git 状态...\n`;

    yield `📋 Git 状态报告:
- Git 仓库: ${envInfo.hasGit ? '✅ 是' : '❌ 否'}
- flake.nix: ${envInfo.hasFlake ? '✅ 存在' : '❌ 不存在'}${envInfo.hasFlake ? (envInfo.flakeTracked ? ' (✅ 已跟踪)' : ' (❌ 未跟踪)') : ''}
- flake.lock: ${envInfo.lockTracked ? '✅ 已跟踪' : '❌ 未跟踪或不存在'}\n`;

    const statusMessage = NixUtils.getGitStatusMessage(envInfo);
    yield statusMessage;

    if (!envInfo.hasGit) {
      yield `\n💡 建议:
1. 初始化 git 仓库: git init
2. 添加 flake 文件: git add flake.nix
3. 提交初始版本: git commit -m "Initial flake configuration"`;
    }
  }

  private async *addFiles(envInfo: NixEnvironmentInfo): CommandGenerator {
    if (!envInfo.hasGit) {
      yield `❌ 当前目录不是 git 仓库

请先初始化 git 仓库:
  git init`;
      return;
    }

    yield `📁 添加 flake 文件到 git...\n`;

    const result = await NixUtils.addFlakeToGit();

    if (result.success) {
      yield `✅ ${result.message}

📋 已添加的文件:
- flake.nix (如果存在)
- flake.lock (如果存在)

💡 下一步:
  git commit -m "Add/update flake configuration"`;
    } else {
      yield `❌ ${result.message}`;
    }
  }

  private async *fixGitIssues(envInfo: NixEnvironmentInfo): CommandGenerator {
    yield `🔧 自动修复 Git 问题...\n`;

    let fixed = false;

    // 如果不是 git 仓库，提示初始化
    if (!envInfo.hasGit) {
      yield `⚠️  当前目录不是 git 仓库，无法自动修复。

请手动执行:
  git init
  git add flake.nix flake.lock
  git commit -m "Initial flake configuration"`;
      return;
    }

    // 添加未跟踪的 flake 文件
    if (envInfo.hasFlake && !envInfo.flakeTracked) {
      const addResult = await NixUtils.addFlakeToGit();
      if (addResult.success) {
        yield `✅ flake 文件已添加到 git\n`;
        fixed = true;
      } else {
        yield `❌ ${addResult.message}\n`;
      }
    }

    if (fixed) {
      yield `🎉 Git 问题已修复！

💡 建议提交更改:
  git commit -m "Add flake configuration"`;
    } else {
      yield `✅ 未发现需要修复的 Git 问题`;
    }
  }

  private getHelpMessage(): string {
    return `🐙 Nix Flake Git 助手

子命令:
  status    检查 git 和 flake 文件的跟踪状态
  add       将 flake 文件添加到 git
  fix       自动修复常见的 git 问题

用法示例:
  vibe-tools nix git status
  vibe-tools nix git add
  vibe-tools nix git fix

💡 重要提示: 
Nix flakes 只会处理已被 git 跟踪的文件，
请确保 flake.nix 和 flake.lock 已添加到 git。`;
  }
}
