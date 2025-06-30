import type { Command, CommandGenerator, CommandOptions } from '../types';
import { APIZHProvider } from '../providers/base';

export class ApizhModelsCommand implements Command {
  async *execute(query: string, options?: CommandOptions): CommandGenerator {
    const taskType = query.toLowerCase().trim();
    
    if (!taskType || taskType === 'help' || taskType === 'list') {
      yield this.showHelp();
      return;
    }

    // Handle specific queries
    if (taskType === 'categories') {
      yield this.showCategories();
      return;
    }

    if (taskType.startsWith('info:')) {
      const modelName = taskType.replace('info:', '').trim();
      yield this.showModelInfo(modelName);
      return;
    }

    // Get recommendations for task type
    const recommendations = APIZHProvider.getModelRecommendations(taskType, {
      language: this.detectLanguage(query),
      priority: this.detectPriority(query),
      complexity: this.detectComplexity(query)
    });

    if (recommendations) {
      yield this.formatRecommendations(taskType, recommendations);
    } else {
      yield this.showAvailableTaskTypes();
    }
  }

  private showHelp(): string {
    return `
# APIZH模型选择助手

## 使用方法
\`vibe-tools apizh-models <task-type>\`

## 支持的任务类型
• **coding** - 编程和代码生成
• **chinese-content** - 中文内容处理
• **analysis** - 数据分析和研究
• **creative-writing** - 创意写作
• **math-science** - 数学和科学推理
• **web-search** - 网络搜索和实时信息
• **long-context** - 长文档处理
• **general** - 通用任务

## 特殊命令
• **categories** - 按系列查看所有模型
• **info:model-name** - 查看特定模型详细信息
• **help** - 显示此帮助信息

## 示例
\`\`\`bash
vibe-tools apizh-models coding
vibe-tools apizh-models chinese-content
vibe-tools apizh-models info:deepseek-r1
vibe-tools apizh-models categories
\`\`\`

## 语言和优先级修饰符
在查询中可以包含以下关键词来优化推荐：
• **chinese/中文** - 优化中文处理
• **cost/成本** - 优先考虑成本效益
• **speed/速度** - 优先考虑响应速度
• **quality/质量** - 优先考虑输出质量
• **simple/复杂** - 任务复杂度
`;
  }

  private showCategories(): string {
    const categories = APIZHProvider.getModelsByCategory();
    let output = '# APIZH模型分类\n\n';

    Object.entries(categories).forEach(([family, models]) => {
      const familyNames: Record<string, string> = {
        'openai': '🔥 OpenAI系列',
        'anthropic': '🎯 Anthropic Claude系列',
        'deepseek': '🚀 DeepSeek系列 (中文优化)',
        'gemini': '🌐 Google Gemini系列',
        'qwen': '🇨🇳 通义千问系列 (中文原生)',
        'doubao': '🔮 字节豆包系列 (中文原生)'
      };

      output += `## ${familyNames[family] || family}\n`;
      models.forEach(model => {
        const info = APIZHProvider.getModelInfo(model);
        if (info) {
          const costIcon = { low: '💰', medium: '💰💰', high: '💰💰💰', premium: '💰💰💰💰' }[info.cost];
          const speedIcon = { fast: '⚡', medium: '🚀', slow: '🐌' }[info.speed];
          output += `• **${model}** ${costIcon} ${speedIcon} - ${info.bestFor.join(', ')}\n`;
        } else {
          output += `• **${model}**\n`;
        }
      });
      output += '\n';
    });

    output += `
## 图例
💰 = 低成本 | 💰💰 = 中等成本 | 💰💰💰 = 高成本 | 💰💰💰💰 = 顶级成本
⚡ = 快速 | 🚀 = 中等速度 | 🐌 = 较慢但更深思熟虑
`;

    return output;
  }

  private showModelInfo(modelName: string): string {
    const info = APIZHProvider.getModelInfo(modelName);
    
    if (!info) {
      return `❌ 未找到模型 "${modelName}" 的信息。

可用的详细信息模型：
${Object.keys(APIZHProvider.getModelsByCategory()).map(family => 
  APIZHProvider.getModelsByCategory()[family].join(', ')
).join('\n')}

使用 \`vibe-tools apizh-models categories\` 查看所有模型。`;
    }

    const costIcon = { low: '💰', medium: '💰💰', high: '💰💰💰', premium: '💰💰💰💰' }[info.cost];
    const speedIcon = { fast: '⚡', medium: '🚀', slow: '🐌' }[info.speed];
    const qualityIcon = { good: '⭐⭐⭐', excellent: '⭐⭐⭐⭐', premium: '⭐⭐⭐⭐⭐' }[info.quality];

    return `
# 📊 ${info.name} 详细信息

## 基本信息
• **模型系列**: ${info.family}
• **成本**: ${info.cost} ${costIcon}
• **速度**: ${info.speed} ${speedIcon}  
• **质量**: ${info.quality} ${qualityIcon}
• **上下文长度**: ${info.contextLength || '未知'}
• **中文友好**: ${info.chineseFriendly ? '✅' : '❌'}

## 核心能力
${info.capabilities.map(cap => `• ${cap}`).join('\n')}

## 最适合的任务
${info.bestFor.map(task => `🎯 ${task}`).join('\n')}

## 使用建议
\`\`\`bash
# 使用此模型进行问答
vibe-tools ask "你的问题" --provider=apizh --model=${info.name}

# 如果支持网络搜索
${info.capabilities.includes('web-search') ? 
  `vibe-tools web "搜索问题" --provider=apizh --model=${info.name}` : 
  '# 此模型不支持网络搜索'}
\`\`\`
`;
  }

  private formatRecommendations(taskType: string, recommendations: any): string {
    const primaryInfo = APIZHProvider.getModelInfo(recommendations.primary);
    
    let output = `# 🎯 ${taskType} 任务推荐\n\n`;
    
    output += `## 🏆 推荐模型: ${recommendations.primary}\n`;
    if (primaryInfo) {
      const costIcon = { low: '💰', medium: '💰💰', high: '💰💰💰', premium: '💰💰💰💰' }[primaryInfo.cost];
      const speedIcon = { fast: '⚡', medium: '🚀', slow: '🐌' }[primaryInfo.speed];
      output += `**${primaryInfo.family}系列** ${costIcon} ${speedIcon} - ${primaryInfo.bestFor.join(', ')}\n\n`;
    }
    
    output += `**推荐理由**: ${recommendations.reason}\n\n`;
    
    output += `## 🔄 备选模型\n`;
    recommendations.alternatives.forEach((alt: string) => {
      const altInfo = APIZHProvider.getModelInfo(alt);
      if (altInfo) {
        const costIcon = { low: '💰', medium: '💰💰', high: '💰💰💰', premium: '💰💰💰💰' }[altInfo.cost];
        const speedIcon = { fast: '⚡', medium: '🚀', slow: '🐌' }[altInfo.speed];
        output += `• **${alt}** ${costIcon} ${speedIcon} - ${altInfo.bestFor.join(', ')}\n`;
      } else {
        output += `• **${alt}**\n`;
      }
    });

    output += `\n## 💡 使用示例\n`;
    output += `\`\`\`bash\n`;
    output += `# 使用推荐模型\n`;
    output += `vibe-tools ask "你的${taskType}问题" --provider=apizh --model=${recommendations.primary}\n`;
    
    if (taskType === 'web-search') {
      output += `\n# 网络搜索\n`;
      output += `vibe-tools web "搜索内容" --provider=apizh\n`;
    }
    
    output += `\`\`\`\n`;

    return output;
  }

  private showAvailableTaskTypes(): string {
    return `
❌ 未识别的任务类型。

## 🎯 支持的任务类型
• **coding** - 编程和代码生成
• **chinese-content** - 中文内容处理  
• **analysis** - 数据分析和研究
• **creative-writing** - 创意写作
• **math-science** - 数学和科学推理
• **web-search** - 网络搜索和实时信息
• **long-context** - 长文档处理
• **general** - 通用任务

使用 \`vibe-tools apizh-models help\` 查看详细帮助。
`;
  }

  private detectLanguage(query: string): 'chinese' | 'english' | 'multilingual' {
    if (/[\u4e00-\u9fa5]/.test(query) || query.includes('中文') || query.includes('chinese')) {
      return 'chinese';
    }
    return 'multilingual';
  }

  private detectPriority(query: string): 'cost' | 'speed' | 'quality' {
    if (query.includes('cost') || query.includes('成本') || query.includes('便宜')) {
      return 'cost';
    }
    if (query.includes('speed') || query.includes('速度') || query.includes('快')) {
      return 'speed';
    }
    return 'quality';
  }

  private detectComplexity(query: string): 'simple' | 'medium' | 'complex' {
    if (query.includes('simple') || query.includes('简单') || query.includes('basic')) {
      return 'simple';
    }
    if (query.includes('complex') || query.includes('复杂') || query.includes('advanced')) {
      return 'complex';
    }
    return 'medium';
  }
}