const { startGenerator } = require('../generator')

function startMock({ store, config }) {
  const gen = startGenerator({ store, config })
  return {
    stop: () => gen.stop(),
    id: 'mock',
  }
} 

module.exports = { startMock }