import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';

export class BuildCommand implements Command {
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

      yield `🔨 构建 Nix 项目...\n`;

      // 准备构建参数
      const buildArgs = [];
      if (query.trim()) {
        // 如果提供了具体的构建目标
        buildArgs.push(`.#${query.trim()}`);
      }

      // 执行 nix build
      const result = await NixUtils.executeNixCommand('build', buildArgs);

      if (result.stdout) {
        yield `📦 构建输出:\n${result.stdout}\n`;
      }

      if (result.stderr) {
        yield `⚠️  构建信息:\n${result.stderr}\n`;
      }

      yield `✅ 构建完成！

💡 提示: 
- 构建结果已链接到当前目录的 'result' 符号链接
- 使用 'ls -la result' 查看构建输出
- 使用 'vibe-tools nix run' 来运行构建的应用`;
    } catch (error) {
      yield `❌ 构建失败: ${error instanceof Error ? error.message : String(error)}`;

      if (options.debug) {
        console.error('Build command error:', error);
      }
    }
  }
}
