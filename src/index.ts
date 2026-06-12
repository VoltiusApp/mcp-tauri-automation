#!/usr/bin/env node

/**
 * MCP Server for Tauri Application Automation
 *
 * This server provides tools for automating Tauri desktop applications
 * through the Model Context Protocol (MCP).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TauriDriver } from './tauri-driver.js';
import { AndroidDriver } from './drivers/android/android-driver.js';
import type { AutomationDriver } from './drivers/automation-driver.js';
import { launchApp, closeApp, getAppState } from './tools/launch.js';
import { captureScreenshot } from './tools/screenshot.js';
import { clickElement, typeText, pressKey, waitForElement, getElementText } from './tools/interact.js';
import { executeTauriCommand } from './tools/state.js';
import type { TauriAutomationConfig } from './types.js';

// Parse config from environment variables
const config: TauriAutomationConfig = {
  appPath: process.env.TAURI_APP_PATH,
  screenshotDir: process.env.TAURI_SCREENSHOT_DIR,
  webdriverPort: process.env.TAURI_WEBDRIVER_PORT ? parseInt(process.env.TAURI_WEBDRIVER_PORT) : undefined,
  defaultTimeout: process.env.TAURI_DEFAULT_TIMEOUT ? parseInt(process.env.TAURI_DEFAULT_TIMEOUT) : undefined,
  tauriDriverPath: process.env.TAURI_DRIVER_PATH,
};

// Initialize driver based on PLATFORM env
const platform = (process.env.PLATFORM ?? 'desktop').toLowerCase();
const driver: AutomationDriver = platform === 'android'
  ? new AndroidDriver({
      adbPath: process.env.ANDROID_ADB_PATH,
      appId: process.env.ANDROID_APP_ID,
      mainActivity: process.env.ANDROID_MAIN_ACTIVITY,
      serial: process.env.ANDROID_SERIAL,
      forwardPort: process.env.ANDROID_FORWARD_PORT ? Number(process.env.ANDROID_FORWARD_PORT) : undefined,
    })
  : new TauriDriver(config);

// Create MCP server
const server = new Server(
  {
    name: 'mcp-tauri-automation',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'launch_app',
        description: 'Launch the app. Desktop: via tauri-driver (needs tauri-driver running). Android: via adb (starts the activity and attaches to the WebView CDP socket). appPath is ignored on Android (configured by env).',
        inputSchema: {
          type: 'object',
          properties: {
            appPath: {
              type: 'string',
              description: 'Path to the Tauri application binary',
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional command-line arguments to pass to the application',
            },
            env: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Optional environment variables to set for the application',
            },
          },
          required: ['appPath'],
        },
      },
      {
        name: 'close_app',
        description: 'Close the currently running Tauri application gracefully',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'capture_screenshot',
        description: 'Capture a screenshot of the application window. Returns base64-encoded PNG image data by default.',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Optional filename (without extension) to save the screenshot. If not provided, a timestamp will be used.',
            },
            returnBase64: {
              type: 'boolean',
              description: 'Whether to return base64 image data (true) or save to file and return path (false). Default: true',
              default: true,
            },
          },
        },
      },
      {
        name: 'click_element',
        description: 'Click a UI element identified by a CSS selector. Use button:"right" to open context menus.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector to identify the element to click (e.g., "#button-id", ".button-class", "button[name=submit]")',
            },
            button: {
              type: 'string',
              enum: ['left', 'right', 'middle'],
              description: 'Mouse button to click with. Defaults to "left". Use "right" for a context-menu (right) click.',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'type_text',
        description: 'Type text into an input field or editable element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector to identify the input element',
            },
            text: {
              type: 'string',
              description: 'Text to type. Newlines ("\\n") are sent as Enter keypresses, so multi-line input submits multiple lines (e.g. in a terminal).',
            },
            clear: {
              type: 'boolean',
              description: 'Whether to clear existing text before typing. Default: false',
              default: false,
            },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'press_key',
        description: 'Press a key or key chord that type_text cannot send: Enter, Tab, Escape, Backspace, arrows, Home/End, or modifier chords like Ctrl+C / Ctrl+L. Sends to the focused element (pass a selector to focus first).',
        inputSchema: {
          type: 'object',
          properties: {
            keys: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
              description: 'A single key ("Enter", "ArrowUp", "Escape") or an array forming a chord where leading entries are modifiers, e.g. ["Control","c"] for Ctrl+C, ["Control","l"] for Ctrl+L.',
            },
            selector: {
              type: 'string',
              description: 'Optional CSS selector to click/focus before pressing the key.',
            },
          },
          required: ['keys'],
        },
      },
      {
        name: 'wait_for_element',
        description: 'Wait for an element to appear in the DOM. Useful for handling async UI states.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector to wait for',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds. Default: 5000',
              default: 5000,
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'get_element_text',
        description: 'Get the text content of an element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector to identify the element',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'execute_tauri_command',
        description: 'Execute a Tauri IPC command. The command must be exposed in the Tauri app\'s src-tauri/src/main.rs file.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Name of the Tauri command to execute',
            },
            args: {
              type: 'object',
              description: 'Arguments to pass to the command',
              additionalProperties: true,
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'get_app_state',
        description: 'Get the current state of the application, including whether it\'s running, session info, and page details',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'launch_app': {
        const result = await launchApp(driver, args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'close_app': {
        const result = await closeApp(driver);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'capture_screenshot': {
        const result = await captureScreenshot(driver, args as any);

        if (result.success && result.data?.base64) {
          // Return both text description and image
          return {
            content: [
              {
                type: 'text',
                text: result.data.message,
              },
              {
                type: 'image',
                data: result.data.base64,
                mimeType: 'image/png',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'click_element': {
        const result = await clickElement(driver, args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'type_text': {
        const result = await typeText(driver, args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'press_key': {
        const result = await pressKey(driver, args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'wait_for_element': {
        const result = await waitForElement(driver, args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_element_text': {
        const result = await getElementText(driver, args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'execute_tauri_command': {
        const result = await executeTauriCommand(driver, args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_app_state': {
        const result = await getAppState(driver);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Cleanup handler
async function cleanup() {
  try {
    const state = driver.getAppState();
    if (state.isRunning) {
      console.error('Cleaning up: Closing application...');
      await driver.closeApp();
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Tauri Automation server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
