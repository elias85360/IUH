// Seed mock data without touching real data
import fs from 'node:fs/promises'
import path from 'node:path'
import devices from '../data/mocks/devices.json' assert { type: 'json' }

async function main() {
  const outDir = path.resolve('backend', 'data', 'seed')
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(path.join(outDir, 'devices.json'), JSON.stringify(devices, null, 2))
  console.log('Seed written to backend/data/seed')
}
main().catch((e) => { console.error(e); process.exit(1) })

 