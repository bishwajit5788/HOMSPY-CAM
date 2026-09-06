export interface BrowserSupportInfo {
  isSupported: boolean;
  browserName: string;
  isChromium: boolean;
  message: string;
  recommendation?: string;
}

/**
 * Checks if the Web Serial API is natively available in the current browser window.
 */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Returns detailed diagnostic information regarding Web Serial browser support.
 */
export function getBrowserSupportInfo(): BrowserSupportInfo {
  const supported = isWebSerialSupported();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  let browserName = 'Unknown Browser';
  let isChromium = false;

  if (userAgent.includes('Edg/')) {
    browserName = 'Microsoft Edge';
    isChromium = true;
  } else if (userAgent.includes('Chrome/')) {
    browserName = 'Google Chrome';
    isChromium = true;
  } else if (userAgent.includes('Firefox/')) {
    browserName = 'Mozilla Firefox';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    browserName = 'Apple Safari';
  } else if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) {
    browserName = 'Opera';
    isChromium = true;
  }

  if (supported) {
    return {
      isSupported: true,
      browserName,
      isChromium,
      message: `${browserName} supports the Web Serial API natively.`,
    };
  }

  return {
    isSupported: false,
    browserName,
    isChromium: false,
    message: `${browserName} does not support the Web Serial API.`,
    recommendation:
      'Please use a Chromium-based desktop browser such as Google Chrome, Microsoft Edge, Brave, or Opera on Windows, macOS, Linux, or ChromeOS.',
  };
}
