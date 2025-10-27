// Registry of known metrics used in the IoT dashboard.
// This module centralizes information about each metric such as
// human‑friendly names, default units, approximate ranges and precision.
// Applications can import this registry to display consistent labels
// and perform unit conversions in a single place.

export const METRICS = {
  U: {
    name: 'Voltage',
    unit: 'V',
    min: 0,
    max: 260,
    precision: 1,
  }, 
  I: {
    name: 'Current',
    unit: 'A',
    min: 0,
    max: 30,
    precision: 1,
  },
  P: {
    name: 'Power',
    unit: 'W',
    min: 0,
    max: 5000,
    precision: 0,
  },
  E: {
    name: 'Energy',
    unit: 'Wh',
    min: 0,
    max: null,
    precision: 0,
  },
  F: {
    name: 'Frequency',
    unit: 'Hz',
    min: 40,
    max: 60,
    precision: 1,
  },
  pf: {
    name: 'Power Factor',
    unit: '',
    min: 0,
    max: 1,
    precision: 2,
  },
  temp: {
    name: 'Temperature',
    unit: '°C',
    min: -20,
    max: 60,
    precision: 1,
  },
  humid: {
    name: 'Humidity',
    unit: '%',
    min: 0,
    max: 100,
    precision: 0,
  },
}

/**
 * Retrieve a metric definition by its key.
 * If the key is unknown, a default definition is returned with the
 * provided key as name and no unit or range.
 * @param {string} key
 */
export function getMetricInfo(key) {
  return METRICS[key] || { name: key, unit: '', min: null, max: null, precision: 1 }
}