import { Platform } from 'react-native'
import { confirmDestructive } from '../utils/confirm'

describe('confirmDestructive', () => {
  const originalPlatform = Platform.OS

  afterEach(() => {
    Platform.OS = originalPlatform
    jest.restoreAllMocks()
  })

  it('on web calls onConfirm when window.confirm is true', () => {
    Platform.OS = 'web'
    const confirmFn = jest.fn().mockReturnValue(true)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirmFn })
    const onConfirm = jest.fn()

    confirmDestructive('Title', 'Message', 'Do it', onConfirm)

    expect(confirmFn).toHaveBeenCalledWith('Title\n\nMessage')
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('on web does not call onConfirm when window.confirm is false', () => {
    Platform.OS = 'web'
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: jest.fn().mockReturnValue(false),
    })
    const onConfirm = jest.fn()

    confirmDestructive('Title', 'Message', 'Do it', onConfirm)

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
