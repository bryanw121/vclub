import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffFingerprints } from './schema-drift.mjs'

test('identical fingerprints have no differences', () => {
  assert.deepEqual(diffFingerprints({ 'table:a': '1', 'column:a.x': '2' }, { 'column:a.x': '2', 'table:a': '1' }), [])
})

test('reports objects missing on either side and changed definitions', () => {
  const live = { 'table:a': '1', 'function:f()': 'x', 'policy:public.a.p': 'p1' }
  const beta = { 'table:a': '1', 'function:f()': 'y', 'index:a_idx': 'i' }
  assert.deepEqual(diffFingerprints(live, beta, {}), [
    { key: 'function:f()', kind: 'defined differently' },
    { key: 'index:a_idx', kind: 'only on beta' },
    { key: 'policy:public.a.p', kind: 'only on live' },
  ])
})

test('allowed differences are ignored only on the side they are allowed', () => {
  const allowed = { 'cron:kudos-reminders': 'live' }
  assert.deepEqual(diffFingerprints({ 'cron:kudos-reminders': 'c' }, {}, allowed), [])
  assert.deepEqual(diffFingerprints({}, { 'cron:kudos-reminders': 'c' }, allowed), [
    { key: 'cron:kudos-reminders', kind: 'only on beta' },
  ])
  // A changed definition is never allowed.
  assert.deepEqual(diffFingerprints({ 'cron:kudos-reminders': 'a' }, { 'cron:kudos-reminders': 'b' }, allowed), [
    { key: 'cron:kudos-reminders', kind: 'defined differently' },
  ])
})
