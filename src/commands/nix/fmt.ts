import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';

export class FmtCommand implements Command {
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

      yield `🎨 格式化 Nix 代码...\n`;

      // 执行 nix fmt
      const result = await NixUtils.executeNixCommand('fmt', []);

      if (result.stdout) {
        yield `✨ 格式化输出:\n${result.stdout}\n`;
      }

      if (result.stderr) {
        yield `⚠️  格式化信息:\n${result.stderr}\n`;
      }

      yield `✅ 代码格式化完成！

💡 提示: 
- 所有 Nix 文件已按照 flake.nix 中定义的格式化器进行格式化
- 如果没有定义格式化器，可能使用了默认的 nixpkgs-fmt`;
    } catch (error) {
      yield `❌ 格式化失败: ${error instanceof Error ? error.message : String(error)}

🔧 可能的解决方案:
- 确保在 flake.nix 中定义了 formatter
- 检查格式化器是否正确安装
- 尝试手动安装 nixpkgs-fmt: nix-env -iA nixpkgs.nixpkgs-fmt`;

      if (options.debug) {
        console.error('Fmt command error:', error);
      }
    }
  }
}
