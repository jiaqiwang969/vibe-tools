import type { Command, CommandGenerator, CommandOptions, Provider, Config } from '../types';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../config';
import { generateRules } from '../vibe-rules';
import { consola } from 'consola';
import { colors } from 'consola/utils';
import { JsonInstallCommand } from './jsonInstall';
import { ensurePlaywrightBrowsers } from './browser/utils';
import {
  VIBE_HOME_DIR,
  VIBE_HOME_ENV_PATH,
  VIBE_HOME_CONFIG_PATH,
  CLAUDE_HOME_DIR,
  CODEX_GLOBAL_INSTRUCTIONS_PATH,
  CODEX_LOCAL_INSTRUCTIONS_FILENAME,
  LOCAL_ENV_PATH,
  LOCAL_CONFIG_PATH,
  updateRulesSection,
  ensureDirectoryExists,
  clearScreen,
  writeKeysToFile,
  checkLocalDependencies,
  getVibeToolsLogo,
  collectRequiredProviders,
  parseProviderModel,
  setupClinerules,
  handleLegacyMigration,
  shouldRunNonInteractive,
  isRunningInCursor,
  getExistingConfig,
  getDefaultConfigForNonInteractive,
} from '../utils/installUtils';
import { setTelemetryStatus, TELEMETRY_DATA_DESCRIPTION, isTelemetryEnabled } from '../telemetry';
import { APIZH_AGENT_ROLES } from '../utils/providerAvailability';

interface InstallOptions extends CommandOptions {
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  global?: boolean;
}

export class InstallCommand implements Command {
  private async *setupApiKeys(
    requiredProviders: Provider[],
    nonInteractive = false
  ): CommandGenerator {
    try {
      loadEnv(); // Load existing env files if any

      // Record to store keys
      const keys: Record<string, string> = {};

      // Now ask for each required provider
      const askedForApizh = new Set<string>(); // 记录已经询问过的密钥

      for (const provider of requiredProviders) {
        // 对于APIZH系列提供商，统一使用APIZH_API_KEY
        const envKey = provider.toLowerCase().startsWith('apizh')
          ? 'APIZH_API_KEY'
          : `${provider.toUpperCase()}_API_KEY`;

        // 如果已经询问过这个密钥，跳过
        if (askedForApizh.has(envKey)) {
          continue;
        }
        askedForApizh.add(envKey);

        const currentValue = process.env[envKey];

        if (currentValue) {
          consola.success(
            `Using existing ${colors.cyan(envKey.replace('_API_KEY', ''))} API key from environment.`
          );
          keys[envKey] = currentValue;
        } else {
          // Skip if SKIP_SETUP is set
          if (process.env.SKIP_SETUP) {
            consola.warn(
              `No ${colors.cyan(envKey.replace('_API_KEY', ''))} API key found in environment. You may need to set it manually.`
            );
            continue;
          }

          // Ask for API key with interactive prompt
          const displayName = envKey.replace('_API_KEY', '');
          const key = await consola.prompt(`${colors.cyan(displayName)} API Key:`, {
            type: 'text',
            placeholder: 'sk-...',
            validate: (value: string) => value.length > 0 || 'Press Enter to skip',
          });

          if (key && typeof key === 'string') {
            keys[envKey] = key;
            consola.success(`${colors.cyan(displayName)} API key set`);
          } else {
            consola.warn(`Skipped ${colors.cyan(displayName)} API key`);
          }
        }
      }

      // Check if user provided at least one key
      const hasAtLeastOneKey = Object.values(keys).some((value) => !!value);

      if (!hasAtLeastOneKey) {
        consola.warn(`No API keys were provided. You'll need to set them up manually later.`);
        return;
      }

      // Skip writing to files in non-interactive mode (CI environments)
      if (nonInteractive) {
        consola.info(
          `Skipping API key file storage in non-interactive mode (using environment variables only)`
        );
        return;
      }

      // Try to write to home directory first, fall back to local if it fails
      try {
        writeKeysToFile(VIBE_HOME_ENV_PATH, keys);
        consola.success(`API keys saved to ${colors.cyan(VIBE_HOME_ENV_PATH)}`);
      } catch (error) {
        consola.error(`${colors.red('Failed to write to home directory:')}`, error);
        writeKeysToFile(LOCAL_ENV_PATH, keys);
        consola.success(
          `API keys saved to ${colors.cyan(LOCAL_ENV_PATH)} in the current directory`
        );
      }
    } catch (error) {
      consola.error(`${colors.red('Error setting up API keys:')}`, error);
      yield 'Error setting up API keys. You can add them later manually.\n';
    }
  }

  private async checkExistingGlobalConfig(): Promise<Config | null> {
    const globalConfigPath = VIBE_HOME_CONFIG_PATH;
    if (existsSync(globalConfigPath)) {
      try {
        const configContent = readFileSync(globalConfigPath, 'utf-8');
        return JSON.parse(configContent) as Config;
      } catch (error) {
        consola.error(`Error reading global config: ${error}`);
      }
    }
    return null;
  }

  private async checkExistingLocalConfig(): Promise<Config | null> {
    const localConfigPath = LOCAL_CONFIG_PATH;
    if (existsSync(localConfigPath)) {
      try {
        const configContent = readFileSync(localConfigPath, 'utf-8');
        return JSON.parse(configContent) as Config;
      } catch (error) {
        consola.error(`Error reading local config: ${error}`);
      }
    }
    return null;
  }

  private async createConfig(
    config: {
      ide?: string;
      coding?: { provider: Provider; model: string };
      websearch?: { provider: Provider; model: string };
      tooling?: { provider: Provider; model: string };
      largecontext?: { provider: Provider; model: string };
      nix?: { provider: Provider; model: string };
    },
    nonInteractive = false,
    preferLocal = false
  ): Promise<{ isLocalConfig: boolean }> {
    const finalConfig: Config = {
      web: {},
      plan: {
        fileProvider: 'gemini',
        thinkingProvider: 'openai',
      },
      repo: {
        provider: 'gemini',
      },
      doc: {
        provider: 'perplexity',
      },
    };

    // Add ide if present
    if (config.ide) {
      finalConfig.ide = config.ide.toLowerCase();
    }

    if (config.coding) {
      finalConfig.repo = {
        provider: config.coding.provider,
        model: config.coding.model,
      };
    }

    if (config.tooling) {
      finalConfig.plan = {
        fileProvider: config.tooling.provider,
        thinkingProvider: config.tooling.provider,
        fileModel: config.tooling.model,
        thinkingModel: config.tooling.model,
      };
    }

    if (config.websearch) {
      finalConfig.web = {
        provider: config.websearch.provider,
        model: config.websearch.model,
      };
    }

    if (config.largecontext) {
      // This could apply to several commands that need large context
      if (!finalConfig.doc) finalConfig.doc = { provider: 'perplexity' };
      finalConfig.doc.provider = config.largecontext.provider;
      finalConfig.doc.model = config.largecontext.model;
    }

    if (config.nix) {
      finalConfig.nix = {
        provider: config.nix.provider,
        model: config.nix.model,
        maxTokens: 6000, // Default for nix command
      };
    }

    // Ensure the VIBE_HOME_DIR exists
    ensureDirectoryExists(VIBE_HOME_DIR);

    // Prepare message about IDE rules location
    let rulesLocationMessage = '';
    if (config.ide === 'codex' || config.ide === 'claude-code') {
      rulesLocationMessage =
        config.ide === 'codex'
          ? `\nNote: For Codex, choosing 'Global' will save rules to ${CODEX_GLOBAL_INSTRUCTIONS_PATH}, and 'Local' will save to ./${CODEX_LOCAL_INSTRUCTIONS_FILENAME}`
          : `\nNote: For Claude Code, choosing 'Global' will save rules to ${CLAUDE_HOME_DIR}/CLAUDE.md, and 'Local' will save to ./CLAUDE.md`;
    }

    // Ask user where to save the config or use default for non-interactive
    let isLocalConfig: boolean;

    if (nonInteractive) {
      isLocalConfig = preferLocal;
      consola.info(
        `Configuration will be saved ${isLocalConfig ? 'locally' : 'globally'} (auto-detected)`
      );
    } else {
      consola.info('');
      const answer = await consola.prompt(
        `Where would you like to save the configuration?${rulesLocationMessage}`,
        {
          type: 'select',
          options: [
            { value: 'global', label: `Global config (${VIBE_HOME_CONFIG_PATH})` },
            { value: 'local', label: `Local config (${LOCAL_CONFIG_PATH})` },
          ],
        }
      );
      isLocalConfig = answer === 'local';
    }
    const configPath = isLocalConfig ? LOCAL_CONFIG_PATH : VIBE_HOME_CONFIG_PATH;

    // Ensure all provider names are lowercase before writing
    if (finalConfig.repo?.provider) {
      finalConfig.repo.provider = finalConfig.repo.provider.toLowerCase() as Provider;
    }
    if (finalConfig.plan?.fileProvider) {
      finalConfig.plan.fileProvider = finalConfig.plan.fileProvider.toLowerCase() as Provider;
    }
    if (finalConfig.plan?.thinkingProvider) {
      finalConfig.plan.thinkingProvider =
        finalConfig.plan.thinkingProvider.toLowerCase() as Provider;
    }
    if (finalConfig.web?.provider) {
      finalConfig.web.provider = finalConfig.web.provider.toLowerCase() as Provider;
    }
    if (finalConfig.doc?.provider) {
      finalConfig.doc.provider = finalConfig.doc.provider.toLowerCase() as Provider;
    }

    try {
      writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
      consola.success(`Configuration saved to ${colors.cyan(configPath)}`);
      return { isLocalConfig };
    } catch (error) {
      consola.error(`Error writing config to ${colors.cyan(configPath)}:`, error);
      throw error; // Rethrow to be caught by the main execute block
    }
  }

  private async handleIDERules(
    absolutePath: string,
    selectedIde: string,
    isLocalConfig: boolean
  ): Promise<void> {
    // Handle IDE-specific rules setup using switch-case
    // Declare variables outside switch to avoid lexical declaration errors
    let rulesPath: string;
    let rulesTemplate: string;
    let rulesDir: string;
    let cursorPath: string;

    switch (selectedIde) {
      case 'cursor':
        // For cursor, create the new directory structure
        // Create necessary directories
        rulesDir = join(absolutePath, '.cursor', 'rules');
        ensureDirectoryExists(rulesDir);

        // Write the rules file directly to the new location
        cursorPath = join(rulesDir, 'vibe-tools.mdc');
        try {
          writeFileSync(cursorPath, generateRules('cursor'));
          consola.success(`Rules written to ${colors.cyan(cursorPath)}`);
        } catch (error) {
          consola.error(`${colors.red('Error writing rules for cursor:')}`, error);
          throw error;
        }
        break;

      case 'claude-code':
        rulesTemplate = generateRules('claude-code');
        rulesPath = isLocalConfig
          ? join(absolutePath, 'CLAUDE.md')
          : join(CLAUDE_HOME_DIR, 'CLAUDE.md');
        ensureDirectoryExists(join(rulesPath, '..'));
        updateRulesSection(rulesPath, rulesTemplate);
        consola.success(`Claude Code rules updated in ${colors.cyan(rulesPath)}`);
        break;

      case 'codex':
        rulesTemplate = generateRules('codex');
        rulesPath = isLocalConfig
          ? join(absolutePath, CODEX_LOCAL_INSTRUCTIONS_FILENAME)
          : CODEX_GLOBAL_INSTRUCTIONS_PATH;
        ensureDirectoryExists(join(rulesPath, '..'));
        updateRulesSection(rulesPath, rulesTemplate);
        consola.success(`Codex instructions updated in ${colors.cyan(rulesPath)}`);
        break;

      case 'windsurf':
        rulesPath = join(absolutePath, '.windsurfrules');
        rulesTemplate = generateRules('windsurf');
        ensureDirectoryExists(join(rulesPath, '..'));
        updateRulesSection(rulesPath, rulesTemplate);
        consola.success(`Updated .windsurfrules at ${colors.cyan(rulesPath)}`);
        break;

      case 'cline':
      case 'roo':
        await setupClinerules(absolutePath, selectedIde, generateRules);
        break;
    }
  }

  async *execute(targetPath: string, options?: InstallOptions): CommandGenerator {
    // If JSON option is provided, use the JSON installer
    if (options?.json) {
      const jsonInstaller = new JsonInstallCommand();
      for await (const message of jsonInstaller.execute(targetPath, options)) {
        yield message;
      }
      return;
    }

    const absolutePath = join(process.cwd(), targetPath);

    try {
      // Check if we should run in non-interactive mode
      const runNonInteractive = shouldRunNonInteractive();

      if (!runNonInteractive) {
        // Clear the screen for a clean start
        clearScreen();

        // Welcome message
        const logo = getVibeToolsLogo();

        consola.box({
          title: '🚀 Welcome to Vibe-Tools Setup!',
          titleColor: 'white',
          borderColor: 'green',
          style: {
            padding: 2,
            borderStyle: 'rounded',
          },
          message: logo,
        });
      }
      // Load env AFTER displaying welcome message
      loadEnv();

      // Check for local dependencies first
      const dependencyWarning = await checkLocalDependencies(absolutePath);
      if (dependencyWarning) {
        consola.warn(dependencyWarning);
      }

      // Handle legacy migration *before* asking for new setup
      yield* handleLegacyMigration();

      if (runNonInteractive) {
        consola.info(
          `${colors.cyan('🤖 Non-interactive mode detected')} - Using auto-configuration`
        );

        // Set telemetry to enabled by default in CI environments
        if (isTelemetryEnabled() === null) {
          setTelemetryStatus(true);
          consola.info(`Anonymous diagnostics ${colors.green('enabled')} (CI default)`);
        }

        // Check for existing configuration
        const { config: existingConfig, isLocal: existingIsLocal } = getExistingConfig();

        if (existingConfig) {
          consola.success(`Using existing ${existingIsLocal ? 'local' : 'global'} configuration`);

          // Create config from existing one, but detect IDE if running in Cursor
          const selectedIde = isRunningInCursor() ? 'cursor' : existingConfig.ide || 'cursor';

          const config = {
            ide: selectedIde,
            coding: existingConfig.repo
              ? {
                  provider: existingConfig.repo.provider as Provider,
                  model: existingConfig.repo.model || 'gemini-2.5-flash',
                }
              : undefined,
            websearch:
              existingConfig.web && existingConfig.web.provider
                ? {
                    provider: existingConfig.web.provider as Provider,
                    model: existingConfig.web.model || 'sonar-pro',
                  }
                : undefined,
            tooling:
              existingConfig.plan && existingConfig.plan.thinkingProvider
                ? {
                    provider: existingConfig.plan.thinkingProvider as Provider,
                    model: existingConfig.plan.thinkingModel || 'claude-sonnet-4-20250514',
                  }
                : undefined,
            largecontext:
              existingConfig.doc && existingConfig.doc.provider
                ? {
                    provider: existingConfig.doc.provider as Provider,
                    model: existingConfig.doc.model || 'gemini-2.5-pro',
                  }
                : undefined,
            nix:
              existingConfig.nix && existingConfig.nix.provider
                ? {
                    provider: existingConfig.nix.provider as Provider,
                    model: existingConfig.nix.model || 'gpt-4.1-2025-04-14',
                  }
                : undefined,
          };

          // Skip to API key setup and config creation
          const requiredProviders = collectRequiredProviders(config);
          yield* this.setupApiKeys(requiredProviders, true);
          const { isLocalConfig } = await this.createConfig(config, true, existingIsLocal);

          // Install Playwright browsers
          if (!process.env.SKIP_PLAYWRIGHT) {
            await ensurePlaywrightBrowsers();
          }

          // Handle IDE rules
          await this.handleIDERules(absolutePath, selectedIde, isLocalConfig);

          // Success message
          consola.success(
            `${colors.green('✨ Non-interactive installation completed!')} Configuration: ${colors.cyan(isLocalConfig ? 'Local' : 'Global')}, IDE: ${colors.cyan(selectedIde)}`
          );
          return;
        } else {
          // Use defaults for new installation
          consola.info('No existing configuration found - using recommended defaults');
          const defaultConfig = getDefaultConfigForNonInteractive();

          // Skip to API key setup and config creation
          const requiredProviders = collectRequiredProviders(defaultConfig);
          yield* this.setupApiKeys(requiredProviders, true);
          const { isLocalConfig } = await this.createConfig(defaultConfig, true, false); // Default to global

          // Install Playwright browsers
          if (!process.env.SKIP_PLAYWRIGHT) {
            await ensurePlaywrightBrowsers();
          }

          // Handle IDE rules
          await this.handleIDERules(absolutePath, defaultConfig.ide, isLocalConfig);

          // Success message
          consola.success(
            `${colors.green('✨ Non-interactive installation completed!')} Configuration: ${colors.cyan(isLocalConfig ? 'Local' : 'Global')}, IDE: ${colors.cyan(defaultConfig.ide)}`
          );
          return;
        }
      }

      // Ask about telemetry/diagnostics only if status is undetermined or disabled
      const currentTelemetryStatus = isTelemetryEnabled();

      // Only prompt if undetermined (null) or explicitly disabled (false)
      if (currentTelemetryStatus === null || currentTelemetryStatus === false) {
        const diagnosticsChoice = await consola.prompt(
          'Would you like to enable anonymous usage diagnostics to help improve vibe-tools?',
          {
            type: 'select',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
              { value: 'more_info', label: 'What data do you track?' },
            ],
            initial: 'yes', // Default to YES
          }
        );

        // If they want more info, show the details and re-prompt
        if (diagnosticsChoice === 'more_info') {
          consola.info(`\n${colors.bold('Anonymous Diagnostics Details')}`);
          consola.info(TELEMETRY_DATA_DESCRIPTION.trim().replace(/^\s+/gm, '  ')); // Indent description

          // Re-prompt after showing details
          const enableAfterDetails = await consola.prompt('Enable anonymous diagnostics?', {
            type: 'confirm',
            initial: false, // Default to NO
          });
          setTelemetryStatus(!!enableAfterDetails); // Set status based on user choice
          consola.info(
            `Anonymous diagnostics ${enableAfterDetails ? colors.green('enabled') : colors.yellow('disabled')}. You can change this later using the VIBE_TOOLS_NO_TELEMETRY environment variable.\n`
          );
        } else {
          // Handle direct yes/no answer
          const enableTelemetry = diagnosticsChoice === 'yes';
          setTelemetryStatus(enableTelemetry); // Set status based on user choice
          consola.info(
            `Anonymous diagnostics ${enableTelemetry ? colors.green('enabled') : colors.yellow('disabled')}. You can change this later using the VIBE_TOOLS_NO_TELEMETRY environment variable.\n`
          );
        }
      }
      // Silently continue if telemetry is already enabled

      // Check for existing global config before asking for preferences
      const hasExistingLocalConfig = existsSync(LOCAL_CONFIG_PATH);
      const existingGlobalConfig = await this.checkExistingGlobalConfig();
      let useExistingGlobal = false;
      let useExistingLocal = false;

      if (existingGlobalConfig) {
        if (runNonInteractive) {
          if (hasExistingLocalConfig) {
            useExistingLocal = true;
            consola.info('Using existing local configuration (non-interactive mode)');
          } else {
            useExistingGlobal = !!existingGlobalConfig;
            consola.info('Using existing global configuration (non-interactive mode)');
          }
        } else {
          useExistingGlobal = await consola.prompt(
            'Found existing global configuration. Would you like to use it?',
            { type: 'confirm' }
          );
        }
      }

      // Ask for IDE preference
      let ideInitial = 'cursor';
      if (useExistingLocal) {
        const existingLocalConfig = await this.checkExistingLocalConfig();
        if (existingLocalConfig?.ide) {
          ideInitial = existingLocalConfig.ide;
        }
      } else if (useExistingGlobal && existingGlobalConfig?.ide) {
        ideInitial = existingGlobalConfig.ide;
      }

      const selectedIde = await consola.prompt('Which IDE will you be using with vibe-tools?', {
        type: 'select',
        options: [
          { value: 'cursor', label: 'Cursor', hint: 'recommended' },
          { value: 'claude-code', label: 'Claude Code' },
          { value: 'codex', label: 'Codex' },
          { value: 'windsurf', label: 'Windsurf' },
          { value: 'cline', label: 'Cline' },
          { value: 'roo', label: 'Roo' },
        ],
        initial: ideInitial,
      });

      // Create initial config with defaults
      let config: {
        ide?: string;
        coding?: { provider: Provider; model: string };
        websearch?: { provider: Provider; model: string };
        tooling?: { provider: Provider; model: string };
        largecontext?: { provider: Provider; model: string };
        nix?: { provider: Provider; model: string };
      } = {
        ide: selectedIde,
      };

      // If using existing local config, use those values as defaults
      if (useExistingLocal) {
        const existingLocalConfig = await this.checkExistingLocalConfig();
        if (existingLocalConfig) {
          config = {
            ide: selectedIde,
            coding: existingLocalConfig.repo
              ? {
                  provider: existingLocalConfig.repo.provider as Provider,
                  model: existingLocalConfig.repo.model || '',
                }
              : undefined,
            websearch:
              existingLocalConfig.web && existingLocalConfig.web.provider
                ? {
                    provider: existingLocalConfig.web.provider as Provider,
                    model: existingLocalConfig.web.model || '',
                  }
                : undefined,
            tooling:
              existingLocalConfig.plan && existingLocalConfig.plan.thinkingProvider
                ? {
                    provider: existingLocalConfig.plan.thinkingProvider as Provider,
                    model: existingLocalConfig.plan.thinkingModel || '',
                  }
                : undefined,
            largecontext:
              existingLocalConfig.doc && existingLocalConfig.doc.provider
                ? {
                    provider: existingLocalConfig.doc.provider as Provider,
                    model: existingLocalConfig.doc.model || '',
                  }
                : undefined,
            nix:
              existingLocalConfig.nix && existingLocalConfig.nix.provider
                ? {
                    provider: existingLocalConfig.nix.provider as Provider,
                    model: existingLocalConfig.nix.model || '',
                  }
                : undefined,
          };

          consola.success('Using existing local configuration values as defaults');
        }
      }
      // If using existing global config, use those values as defaults
      else if (useExistingGlobal && existingGlobalConfig) {
        config = {
          ide: selectedIde,
          coding: existingGlobalConfig.repo
            ? {
                provider: existingGlobalConfig.repo.provider as Provider,
                model: existingGlobalConfig.repo.model || '',
              }
            : undefined,
          websearch:
            existingGlobalConfig.web && existingGlobalConfig.web.provider
              ? {
                  provider: existingGlobalConfig.web.provider as Provider,
                  model: existingGlobalConfig.web.model || '',
                }
              : undefined,
          tooling:
            existingGlobalConfig.plan && existingGlobalConfig.plan.thinkingProvider
              ? {
                  provider: existingGlobalConfig.plan.thinkingProvider as Provider,
                  model: existingGlobalConfig.plan.thinkingModel || '',
                }
              : undefined,
          largecontext:
            existingGlobalConfig.doc && existingGlobalConfig.doc.provider
              ? {
                  provider: existingGlobalConfig.doc.provider as Provider,
                  model: existingGlobalConfig.doc.model || '',
                }
              : undefined,
          nix:
            existingGlobalConfig.nix && existingGlobalConfig.nix.provider
              ? {
                  provider: existingGlobalConfig.nix.provider as Provider,
                  model: existingGlobalConfig.nix.model || '',
                }
              : undefined,
        };

        consola.success('Using existing configuration values as defaults');
      } else {
        // Ask for model preferences only if not using existing config
        consola.info('\nSelect your preferred models for different tasks:');

        // Coding (repo command)
        const coding = await consola.prompt('Coding Agent - Code Crafter & Bug Blaster:', {
          type: 'select',
          options: [
            {
              value: `${APIZH_AGENT_ROLES.coding.provider}:${APIZH_AGENT_ROLES.coding.model}`,
              label: `🇨🇳 APIZH ${APIZH_AGENT_ROLES.coding.description} - ${APIZH_AGENT_ROLES.coding.model}`,
              hint: 'recommended',
            },
            {
              value: 'gemini:gemini-2.5-flash',
              label: 'Gemini Flash 2.5',
              hint: 'fast',
            },
            {
              value: 'anthropic:claude-sonnet-4-20250514',
              label: 'Claude 4 Sonnet',
              hint: 'balanced',
            },
            {
              value: 'anthropic:claude-opus-4-20250514',
              label: 'Claude 4 Opus',
              hint: 'expensive',
            },
            { value: 'perplexity:sonar-pro', label: 'Perplexity Sonar Pro' },
            { value: 'openai:gpt-4.1', label: 'GPT-4.1' },
            {
              value: 'openrouter:anthropic/claude-sonnet-4',
              label: 'OpenRouter - Claude 4 Sonnet',
            },
          ],
          initial: `${APIZH_AGENT_ROLES.coding.provider}:${APIZH_AGENT_ROLES.coding.model}`,
        });

        // Web search (web command)
        const websearch = await consola.prompt(
          'Web Search Agent - Deep Researcher & Web Wanderer:',
          {
            type: 'select',
            options: [
              {
                value: `${APIZH_AGENT_ROLES['web-search'].provider}:${APIZH_AGENT_ROLES['web-search'].model}`,
                label: `🇨🇳 APIZH ${APIZH_AGENT_ROLES['web-search'].description} - ${APIZH_AGENT_ROLES['web-search'].model}`,
                hint: 'recommended',
              },
              { value: 'perplexity:sonar-pro', label: 'Perplexity Sonar Pro', hint: 'classic' },
              { value: 'perplexity:sonar', label: 'Perplexity Sonar', hint: 'fast' },
              { value: 'gemini:gemini-2.5-flash', label: 'Gemini Flash 2.5' },
              {
                value: 'openrouter:perplexity/sonar-pro',
                label: 'OpenRouter - Perplexity Sonar Pro',
              },
            ],
            initial: `${APIZH_AGENT_ROLES['web-search'].provider}:${APIZH_AGENT_ROLES['web-search'].model}`,
          }
        );

        // Tooling (plan command)
        const tooling = await consola.prompt('Tooling Agent - Gear Turner & MCP Master:', {
          type: 'select',
          options: [
            {
              value: `${APIZH_AGENT_ROLES.tooling.provider}:${APIZH_AGENT_ROLES.tooling.model}`,
              label: `🇨🇳 APIZH ${APIZH_AGENT_ROLES.tooling.description} - ${APIZH_AGENT_ROLES.tooling.model}`,
              hint: 'recommended',
            },
            {
              value: 'anthropic:claude-sonnet-4-20250514',
              label: 'Claude 4 Sonnet',
              hint: 'classic',
            },
            {
              value: 'gemini:gemini-2.5-pro',
              label: 'Gemini Pro 2.5',
              hint: 'balanced',
            },
            { value: 'openai:gpt-4o', label: 'GPT-4o' },
            {
              value: 'openrouter:anthropic/claude-sonnet-4',
              label: 'OpenRouter - Claude 4 Sonnet',
            },
          ],
          initial: `${APIZH_AGENT_ROLES.tooling.provider}:${APIZH_AGENT_ROLES.tooling.model}`,
        });

        // Large context (doc command)
        const largecontext = await consola.prompt(
          'Large Context Agent - Systems Thinker & Expert Planner:',
          {
            type: 'select',
            options: [
              {
                value: `${APIZH_AGENT_ROLES['large-context'].provider}:${APIZH_AGENT_ROLES['large-context'].model}`,
                label: `🇨🇳 APIZH ${APIZH_AGENT_ROLES['large-context'].description} - ${APIZH_AGENT_ROLES['large-context'].model}`,
                hint: 'recommended',
              },
              {
                value: 'gemini:gemini-2.5-pro',
                label: 'Gemini Pro 2.5',
                hint: 'classic',
              },
              {
                value: 'anthropic:claude-sonnet-4-20250514',
                label: 'Claude 4 Sonnet',
              },
              { value: 'perplexity:sonar', label: 'Perplexity Sonar' },
              { value: 'openai:gpt-4o', label: 'GPT-4o' },
            ],
            initial: `${APIZH_AGENT_ROLES['large-context'].provider}:${APIZH_AGENT_ROLES['large-context'].model}`,
          }
        );

        // Nix (nix command)
        const nix = await consola.prompt('Nix Agent - Flake Manager & Environment Builder:', {
          type: 'select',
          options: [
            {
              value: `${APIZH_AGENT_ROLES.nix.provider}:${APIZH_AGENT_ROLES.nix.model}`,
              label: `🇨🇳 APIZH ${APIZH_AGENT_ROLES.nix.description} - ${APIZH_AGENT_ROLES.nix.model}`,
              hint: 'recommended',
            },
            {
              value: 'anthropic:claude-sonnet-4-20250514',
              label: 'Claude 4 Sonnet',
              hint: 'balanced',
            },
            {
              value: 'gemini:gemini-2.5-pro',
              label: 'Gemini Pro 2.5',
              hint: 'fast',
            },
            { value: 'openai:gpt-4o', label: 'GPT-4o' },
            {
              value: 'openrouter:anthropic/claude-sonnet-4',
              label: 'OpenRouter - Claude 4 Sonnet',
            },
          ],
          initial: `${APIZH_AGENT_ROLES.nix.provider}:${APIZH_AGENT_ROLES.nix.model}`,
        });

        // Collect all selected options into a config object
        config = {
          ide: selectedIde,
          coding: parseProviderModel(coding as string),
          websearch: parseProviderModel(websearch as string),
          tooling: parseProviderModel(tooling as string),
          largecontext: parseProviderModel(largecontext as string),
          nix: parseProviderModel(nix as string),
        };
      }

      // Create a more compact and readable display of the configuration
      const formatProviderInfo = (provider: string, model: string) => {
        // Safety check for undefined values
        if (!provider || !model) {
          return `${colors.red('Unknown provider/model')}`;
        }
        // Trim the provider prefix from the model name if it exists
        const modelDisplay = model.includes('/') ? model.split('/').pop() : model;
        return `${colors.cyan(provider.charAt(0).toUpperCase() + provider.slice(1))} ${colors.gray('→')} ${colors.green(modelDisplay || model)}`;
      };

      const configDisplay = Object.entries(config)
        .map(([key, value]) => {
          if (key === 'ide') return `IDE: ${colors.magenta(String(value))}`;
          if (!value) return null; // Skip undefined values
          const configVal = value as { provider: string; model: string };
          // Safety check for configVal properties
          if (!configVal || !configVal.provider || !configVal.model) {
            return null; // Skip invalid configurations
          }
          // Format key as "Coding:" instead of "coding:"
          const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
          return `${colors.yellow(formattedKey)}: ${formatProviderInfo(configVal.provider, configVal.model)}`;
        })
        .filter(Boolean) // Remove null entries
        .join('\n  • ');

      consola.box({
        title: '📋 Your Configuration',
        titleColor: 'white',
        borderColor: 'green',
        style: {
          padding: 2,
          borderStyle: 'rounded',
        },
        message: `  • ${configDisplay}`,
      });

      // Identify required providers
      const requiredProviders = collectRequiredProviders(config);

      // Setup API keys
      for await (const message of this.setupApiKeys(requiredProviders, runNonInteractive)) {
        yield message;
      }

      // Create config file and get its location preference
      const { isLocalConfig } = await this.createConfig(config, false, useExistingLocal);

      // Install Playwright browsers (Chromium) unless explicitly skipped
      if (!process.env.SKIP_PLAYWRIGHT) {
        await ensurePlaywrightBrowsers();
      }

      // Handle IDE-specific rules setup
      await this.handleIDERules(absolutePath, selectedIde, isLocalConfig);

      // Installation completed
      consola.box({
        title: '🎉 Installation Complete!',
        titleColor: 'white',
        borderColor: 'green',
        style: {
          padding: 2,
          borderStyle: 'rounded',
        },
        message: [
          `${colors.green('Vibe-Tools has been successfully configured!')}`,
          '',
          `📋 Configuration: ${colors.cyan(isLocalConfig ? 'Local' : 'Global')}`,
          `🔧 IDE: ${colors.cyan(selectedIde)}`,
          '',
          `${colors.yellow('Get started with:')}`,
          `  ${colors.green('vibe-tools repo')} ${colors.white('"Explain this codebase"')}`,
          `  ${colors.green('vibe-tools web')} ${colors.white('"Search for something online"')}`,
          `  ${colors.green('vibe-tools plan')} ${colors.white('"Create implementation plan"')}`,
          `  ${colors.green('vibe-tools doc')} ${colors.white('"Think about a system"')}`,
          `  ${colors.green('vibe-tools nix')} ${colors.white('"为项目创建flake.nix文件"')}`,
        ].join('\n'),
      });

      consola.success('✨ All done! Vibe-Tools is ready to rock. ✨');
      consola.info(
        `\n${colors.cyan('Tip:')} Ask your AI agent to use vibe-tools web to find out what the latest OpenAI news is.\n`
      );
    } catch (error) {
      consola.box({
        title: '❌ Installation Failed',
        titleColor: 'white',
        borderColor: 'red',
        style: {
          padding: 2,
          borderStyle: 'rounded',
        },
        message: [
          `Error: ${colors.red(error instanceof Error ? error.message : 'Unknown error')}`,
          '',
          `${colors.yellow('Possible solutions:')}`,
          `• ${colors.cyan('Check if you have appropriate permissions')}`,
          `• ${colors.cyan('Ensure your environment is correctly set up')}`,
          '',
          `If you need assistance, reach out to the vibe-tools team or try re-running the installation.`,
        ].join('\n'),
      });
    }
  }
}
