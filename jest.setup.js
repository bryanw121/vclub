// Pre-configure RNTL host component names to avoid auto-detection which breaks with React 19
// RNTL v11's detectHostComponentNames() uses react-test-renderer.create() outside of act(),
// which fails with React 19's stricter concurrency requirements.
const { configureInternal } = require('@testing-library/react-native/build/config')
configureInternal({
  hostComponentNames: { text: 'Text', textInput: 'TextInput' },
})
