import { Alert, Platform } from 'react-native'
import { notifyError, notifyInfo } from '../utils/notify'
import { GENERIC_ERROR_MESSAGE } from '../constants/copy'
import { TOURNAMENT_GENERIC_ERROR } from '../constants/tournamentCopy'

describe('utils/notify', () => {
  const realOS = Platform.OS
  let alertSpy: jest.SpyInstance
  let webAlert: jest.Mock
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    webAlert = jest.fn()
    ;(global as unknown as { window: { alert: unknown } }).window.alert = webAlert
  })
  afterEach(() => {
    Platform.OS = realOS
    alertSpy.mockRestore()
  })

  it('uses Alert.alert on native', () => {
    Platform.OS = 'ios'
    notifyInfo('Saved', 'Done.')
    expect(alertSpy).toHaveBeenCalledWith('Saved', 'Done.')
    expect(webAlert).not.toHaveBeenCalled()
  })

  it('uses window.alert on web, where Alert.alert is a no-op', () => {
    Platform.OS = 'web'
    notifyInfo('Saved', 'Done.')
    expect(webAlert).toHaveBeenCalledWith('Saved\n\nDone.')
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('notifyError takes a message or an error, falling back to the shared copy', () => {
    Platform.OS = 'ios'
    notifyError('Oops', 'Specific.')
    notifyError('Oops', new Error('From server'))
    notifyError('Oops', { not: 'an error' })
    notifyError('Oops')
    expect(alertSpy.mock.calls.map(c => c[1])).toEqual(['Specific.', 'From server', GENERIC_ERROR_MESSAGE, GENERIC_ERROR_MESSAGE])
  })

  it('tournament copy points at the shared generic error', () => {
    expect(TOURNAMENT_GENERIC_ERROR).toBe(GENERIC_ERROR_MESSAGE)
  })
})
