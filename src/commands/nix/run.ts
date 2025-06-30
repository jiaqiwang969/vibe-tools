import type { Command, CommandGenerator, CommandOptions } from '../../types';
import { NixUtils } from './utils.ts';

export class RunCommand implements Command {
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

      yield `🚀 运行 Nix 应用...\n`;

      // 准备运行参数
      const runArgs = [];
      if (query.trim()) {
        // 如果提供了具体的运行目标
        runArgs.push(`.#${query.trim()}`);
      }

      // 执行 nix run
      const result = await NixUtils.executeNixCommand('run', runArgs);

      if (result.stdout) {
        yield `📱 应用输出:\n${result.stdout}\n`;
      }

      if (result.stderr) {
        yield `⚠️  运行信息:\n${result.stderr}\n`;
      }

      yield `✅ 应用执行完成！`;
    } catch (error) {
      yield `❌ 运行失败: ${error instanceof Error ? error.message : String(error)}`;

      if (options.debug) {
        console.error('Run command error:', error);
      }
    }
  }
}
