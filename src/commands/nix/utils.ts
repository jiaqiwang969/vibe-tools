import { execAsync } from '../../utils/execAsync.ts';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface NixEnvironmentInfo {
  hasNix: boolean;
  hasFlake: boolean;
  nixVersion?: string;
  projectType?: string;
  error?: string;
  hasGit?: boolean;
  flakeTracked?: boolean;
  lockTracked?: boolean;
}

export class NixUtils {
  /**
   * 检测 Nix 环境状态
   */
  static async detectEnvironment(projectPath: string = process.cwd()): Promise<NixEnvironmentInfo> {
    const result: NixEnvironmentInfo = {
      hasNix: false,
      hasFlake: false,
    };

    try {
      // 检查 nix 是否已安装
      const nixCheck = await execAsync('which nix');
      if (nixCheck.stdout.trim()) {
        result.hasNix = true;

        // 获取 nix 版本
        try {
          const versionResult = await execAsync('nix --version');
          result.nixVersion = versionResult.stdout.trim();
        } catch (_e) {
          // 忽略版本获取失败
        }
      }
    } catch (_e) {
      result.hasNix = false;
    }

    try {
      // 检查是否有 flake.nix 文件
      const flakeFile = join(projectPath, 'flake.nix');
      await fs.access(flakeFile);
      result.hasFlake = true;

      // 尝试检测项目类型
      result.projectType = await this.detectProjectType(projectPath);

      // 检测 git 和文件跟踪状态
      const gitInfo = await this.detectGitStatus(projectPath);
      result.hasGit = gitInfo.hasGit;
      result.flakeTracked = gitInfo.flakeTracked;
      result.lockTracked = gitInfo.lockTracked;
    } catch (_e) {
      result.hasFlake = false;
    }

    return result;
  }

  /**
   * 检测项目类型
   */
  static async detectProjectType(projectPath: string): Promise<string> {
    const checkFiles = [
      { file: 'package.json', type: 'Node.js' },
      { file: 'requirements.txt', type: 'Python' },
      { file: 'pyproject.toml', type: 'Python' },
      { file: 'Cargo.toml', type: 'Rust' },
      { file: 'go.mod', type: 'Go' },
      { file: 'pom.xml', type: 'Java' },
      { file: 'build.gradle', type: 'Java' },
      { file: 'Gemfile', type: 'Ruby' },
      { file: 'composer.json', type: 'PHP' },
    ];

    for (const { file, type } of checkFiles) {
      try {
        await fs.access(join(projectPath, file));
        return type;
      } catch (_e) {
        // 继续检查下一个
      }
    }

    return 'Generic';
  }

  /**
   * 执行 nix 命令
   */
  static async executeNixCommand(
    command: string,
    args: string[] = []
  ): Promise<{ stdout: string; stderr: string }> {
    const fullCommand = `nix ${command} ${args.join(' ')}`.trim();
    return await execAsync(fullCommand);
  }

  /**
   * 读取 flake.nix 文件内容
   */
  static async readFlakeFile(projectPath: string = process.cwd()): Promise<string> {
    const flakeFile = join(projectPath, 'flake.nix');
    return await fs.readFile(flakeFile, 'utf-8');
  }

  /**
   * 写入 flake.nix 文件
   */
  static async writeFlakeFile(content: string, projectPath: string = process.cwd()): Promise<void> {
    const flakeFile = join(projectPath, 'flake.nix');
    await fs.writeFile(flakeFile, content, 'utf-8');
  }

  /**
   * 检查 flake 是否有效
   */
  static async validateFlake(
    projectPath: string = process.cwd()
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await this.executeNixCommand('flake', ['check', '--no-build', projectPath]);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检测 git 状态和文件跟踪情况
   */
  static async detectGitStatus(projectPath: string): Promise<{
    hasGit: boolean;
    flakeTracked: boolean;
    lockTracked: boolean;
  }> {
    const result = {
      hasGit: false,
      flakeTracked: false,
      lockTracked: false,
    };

    try {
      // 检查是否是 git 仓库
      await execAsync('git rev-parse --git-dir', { cwd: projectPath });
      result.hasGit = true;

      // 检查 flake.nix 是否被跟踪
      try {
        const flakeStatus = await execAsync('git ls-files flake.nix', { cwd: projectPath });
        result.flakeTracked = flakeStatus.stdout.trim() !== '';
      } catch (_e) {
        // 文件不存在或未被跟踪
      }

      // 检查 flake.lock 是否被跟踪
      try {
        const lockStatus = await execAsync('git ls-files flake.lock', { cwd: projectPath });
        result.lockTracked = lockStatus.stdout.trim() !== '';
      } catch (_e) {
        // 文件不存在或未被跟踪
      }
    } catch (_e) {
      // 不是 git 仓库
    }

    return result;
  }

  /**
   * 添加 flake 文件到 git
   */
  static async addFlakeToGit(
    projectPath: string = process.cwd()
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 检查是否是 git 仓库
      await execAsync('git rev-parse --git-dir', { cwd: projectPath });

      // 添加 flake.nix
      try {
        await execAsync('git add flake.nix', { cwd: projectPath });
      } catch (_e) {
        // flake.nix 可能不存在，忽略错误
      }

      // 添加 flake.lock (如果存在)
      try {
        await execAsync('git add flake.lock', { cwd: projectPath });
      } catch (_e) {
        // flake.lock 可能不存在，忽略错误
      }

      return { success: true, message: 'flake 文件已添加到 git' };
    } catch (error) {
      return {
        success: false,
        message: `添加到 git 失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 获取友好的错误消息
   */
  static getHelpMessage(envInfo: NixEnvironmentInfo): string {
    if (!envInfo.hasNix) {
      return `❌ Nix 未安装或不在 PATH 中
      
安装 Nix (推荐使用 Determinate Systems installer):
  curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

或者使用官方安装器:
  sh <(curl -L https://nixos.org/nix/install) --daemon

安装完成后重新启动终端，然后再试一次。`;
    }

    if (!envInfo.hasFlake) {
      return `📄 当前目录没有 flake.nix 文件

使用以下命令生成一个:
  vibe-tools nix init

或者手动创建一个基础的 flake.nix 文件。`;
    }

    // 检查 git 状态和文件跟踪
    if (envInfo.hasGit && envInfo.hasFlake && !envInfo.flakeTracked) {
      return `⚠️  flake.nix 文件未被 git 跟踪
      
💡 重要提示: Nix flakes 只会处理已被 git 跟踪的文件！

请运行以下命令将 flake 文件添加到 git:
  git add flake.nix
  git add flake.lock  # 如果存在的话

然后再尝试 nix 命令。`;
    }

    return '';
  }

  /**
   * 获取 git 状态的详细信息
   */
  static getGitStatusMessage(envInfo: NixEnvironmentInfo): string {
    if (!envInfo.hasGit) {
      return '⚠️  当前目录不是 git 仓库，建议初始化 git: git init';
    }

    const issues: string[] = [];

    if (envInfo.hasFlake && !envInfo.flakeTracked) {
      issues.push('❌ flake.nix 未被 git 跟踪');
    }

    if (envInfo.lockTracked === false) {
      // 只有当我们知道 lock 文件存在但未被跟踪时才提示
      try {
        const fs = require('fs');
        if (fs.existsSync('flake.lock')) {
          issues.push('❌ flake.lock 未被 git 跟踪');
        }
      } catch (_e) {
        // 忽略文件检查错误
      }
    }

    if (issues.length > 0) {
      return `${issues.join('\n')}

🔧 修复命令:
  git add flake.nix flake.lock`;
    }

    return '✅ git 状态正常';
  }
}
