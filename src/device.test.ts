import { describe, expect, it } from 'vitest'

import { classifyDevice, isMobileDeviceClass } from './lib/device'

describe('device eligibility', () => {
  it('recognizes supported phones and tablets', () => {
    expect(classifyDevice('Mozilla/5.0 (iPhone)')).toBe('iPhone')
    expect(classifyDevice('Mozilla/5.0 (iPad)')).toBe('iPad')
    expect(classifyDevice('Mozilla/5.0 (Linux; Android 14)')).toBe('Android')
    expect(classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5)).toBe(
      'iPad',
    )

    expect(isMobileDeviceClass('iPhone')).toBe(true)
    expect(isMobileDeviceClass('iPad')).toBe(true)
    expect(isMobileDeviceClass('Android')).toBe(true)
  })

  it('classifies desktop and unknown clients as ineligible', () => {
    expect(classifyDevice('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows')
    expect(classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(
      'Mac',
    )
    expect(classifyDevice('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Other')
    expect(classifyDevice('')).toBe('Unknown')

    expect(isMobileDeviceClass('Windows')).toBe(false)
    expect(isMobileDeviceClass('Mac')).toBe(false)
    expect(isMobileDeviceClass('Other')).toBe(false)
    expect(isMobileDeviceClass('Unknown')).toBe(false)
  })
})
