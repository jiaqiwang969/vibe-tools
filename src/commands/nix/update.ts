import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';

export class UpdateCommand implements Command {
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

      yield `🔄 更新 Nix flake 依赖...\n`;
      
      // 准备更新参数
      const updateArgs = ['update'];
      if (query.trim()) {
        // 如果指定了特定的输入要更新
        updateArgs.push(query.trim());
      }
      
      // 执行 nix flake update
      const result = await NixUtils.executeNixCommand('flake', updateArgs);
      
      if (result.stdout) {
        yield `📦 更新输出:\n${result.stdout}\n`;
      }
      
      if (result.stderr) {
        yield `⚠️  更新信息:\n${result.stderr}\n`;
      }

      yield `✅ 依赖更新完成！

💡 提示: 
- flake.lock 文件已更新
- 建议运行 'vibe-tools nix check' 验证更新后的配置
- 提交 flake.lock 文件以保持团队同步`;

    } catch (error) {
      yield `❌ 更新失败: ${error instanceof Error ? error.message : String(error)}

🔧 可能的解决方案:
- 检查网络连接
- 验证 inputs 中的 URL 是否正确
- 尝试指定具体的输入进行更新`;
      
      if (options.debug) {
        console.error('Update command error:', error);
      }
    }
  }
} 