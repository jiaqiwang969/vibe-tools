import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';

export class DevelopCommand implements Command {
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

      yield `🔧 进入 Nix 开发环境...\n`;

      // 执行 nix develop
      const result = await NixUtils.executeNixCommand('develop', []);

      if (result.stdout) {
        yield `✅ 开发环境输出:\n${result.stdout}\n`;
      }

      if (result.stderr) {
        yield `⚠️  警告信息:\n${result.stderr}\n`;
      }

      yield `✨ 开发环境已准备就绪！
      
💡 提示: 在这个环境中，您可以访问 flake.nix 中定义的所有开发工具。
使用 'exit' 命令退出开发环境。`;
    } catch (error) {
      yield `❌ 进入开发环境失败: ${error instanceof Error ? error.message : String(error)}`;

      if (options.debug) {
        console.error('Develop command error:', error);
      }
    }
  }
}
