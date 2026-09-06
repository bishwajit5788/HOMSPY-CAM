export interface BrowserSupportInfo {
  isSupported: boolean;
  browserName: string;
  isChromium: boolean;
  isSecureContext: boolean;
  hasWebSerial: boolean;
  hasPermissionsApi: boolean;
  message: string;
  recommendation?: string;
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.serial !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext;
}

export function getBrowserSupportInfo(): BrowserSupportInfo {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const hasWebSerial = typeof navigator !== 'undefined' && typeof navigator.serial !== 'undefined';
  const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : false;
  const hasPermissionsApi = typeof navigator !== 'undefined' && typeof navigator.permissions?.query === 'function';

  let browserName = 'Unknown Browser';
  let isChromium = false;
  if (userAgent.includes('Edg/')) { browserName = 'Microsoft Edge'; isChromium = true; }
  else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) { browserName = 'Google Chrome'; isChromium = true; }
  else if (userAgent.includes('Firefox/')) browserName = 'Mozilla Firefox';
  else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) browserName = 'Apple Safari';
  else if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) { browserName = 'Opera'; isChromium = true; }

  if (hasWebSerial && isSecureContext) {
    return { isSupported: true, browserName, isChromium, isSecureContext, hasWebSerial, hasPermissionsApi, message: `${browserName} exposes Web Serial in a secure context.` };
  }

  const reasons = [
    !hasWebSerial ? 'Web Serial API is unavailable' : '',
    !isSecureContext ? 'the page is not running in a secure context (HTTPS or localhost)' : '',
  ].filter(Boolean).join('; ');
  return {
    isSupported: false, browserName, isChromium, isSecureContext, hasWebSerial, hasPermissionsApi,
    message: `${browserName} cannot use Web Serial here because ${reasons}.`,
    recommendation: 'Use a current Chromium-based desktop browser (Chrome, Edge, Brave, or Opera) over HTTPS or localhost. Browser extensions, enterprise policies, OS USB permissions, and mobile browsers may still restrict Web Serial.',
  };
}
