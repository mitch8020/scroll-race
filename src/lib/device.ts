export type DeviceClass =
  'iPhone' | 'iPad' | 'Android' | 'Windows' | 'Mac' | 'Other' | 'Unknown'

export type MobileDeviceClass = Extract<
  DeviceClass,
  'iPhone' | 'iPad' | 'Android'
>

export function classifyDevice(
  userAgent: string,
  maxTouchPoints = 0,
): DeviceClass {
  if (!userAgent) {
    return 'Unknown'
  }

  if (/iPhone/i.test(userAgent)) {
    return 'iPhone'
  }

  if (
    /iPad/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
  ) {
    return 'iPad'
  }

  if (/Android/i.test(userAgent)) {
    return 'Android'
  }

  if (/Windows/i.test(userAgent)) {
    return 'Windows'
  }

  if (/Macintosh/i.test(userAgent)) {
    return 'Mac'
  }

  return 'Other'
}

export function isMobileDeviceClass(
  device: string,
): device is MobileDeviceClass {
  return device === 'iPhone' || device === 'iPad' || device === 'Android'
}
