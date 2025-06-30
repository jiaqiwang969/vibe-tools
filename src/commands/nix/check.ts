import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';

export class CheckCommand implements Command {
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

      yield `🔍 检查 Nix flake...\n`;

      // 执行 nix flake check
      const result = await NixUtils.executeNixCommand('flake', ['check']);

      if (result.stdout) {
        yield `✅ 检查结果:\n${result.stdout}\n`;
      }

      if (result.stderr) {
        yield `⚠️  检查信息:\n${result.stderr}\n`;
      }

      yield `✅ Flake 检查完成！

💡 提示: 
- 如果有错误，请检查 flake.nix 配置
- 使用 'vibe-tools nix troubleshoot' 获取诊断建议`;
    } catch (error) {
      yield `❌ 检查失败: ${error instanceof Error ? error.message : String(error)}

🔧 常见问题解决方案:
- 检查 flake.nix 语法是否正确
- 确保所有依赖都已正确声明
- 使用 'vibe-tools nix troubleshoot' 获取详细诊断`;

      if (options.debug) {
        console.error('Check command error:', error);
      }
    }
  }
}
