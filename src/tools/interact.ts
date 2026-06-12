/**
 * UI interaction tools
 */

import type { AutomationDriver } from '../drivers/automation-driver.js';
import type { ElementSelector, TypeTextParams, PressKeyParams, WaitForElementParams, ToolResponse } from '../types.js';

/**
 * Click an element by CSS selector
 */
export async function clickElement(
  driver: AutomationDriver,
  params: ElementSelector
): Promise<ToolResponse<{ message: string }>> {
  try {
    const button = params.button ?? 'left';
    await driver.clickElement(params.selector, button);

    return {
      success: true,
      data: {
        message: `${button === 'left' ? 'Clicked' : `${button}-clicked`} element: ${params.selector}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Type text into an input element
 */
export async function typeText(
  driver: AutomationDriver,
  params: TypeTextParams
): Promise<ToolResponse<{ message: string }>> {
  try {
    await driver.typeText(params.selector, params.text, params.clear);

    return {
      success: true,
      data: {
        message: `Typed text into element: ${params.selector}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Press a key or key chord (e.g. Enter, Ctrl+C, Ctrl+L, ArrowUp)
 */
export async function pressKey(
  driver: AutomationDriver,
  params: PressKeyParams
): Promise<ToolResponse<{ message: string }>> {
  try {
    await driver.pressKey(params.keys, params.selector);

    const desc = Array.isArray(params.keys) ? params.keys.join('+') : params.keys;
    return {
      success: true,
      data: {
        message: `Pressed key: ${desc}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Wait for an element to appear
 */
export async function waitForElement(
  driver: AutomationDriver,
  params: WaitForElementParams
): Promise<ToolResponse<{ message: string }>> {
  try {
    await driver.waitForElement(params.selector, params.timeout);

    return {
      success: true,
      data: {
        message: `Element found: ${params.selector}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get text content of an element
 */
export async function getElementText(
  driver: AutomationDriver,
  params: ElementSelector
): Promise<ToolResponse<{ text: string }>> {
  try {
    const text = await driver.getElementText(params.selector);

    return {
      success: true,
      data: {
        text,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
