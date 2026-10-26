import { execSync } from 'node:child_process'

const LIMIT = 100
const TARGET = 90
const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
const n = files.length
console.log(`Tracked files: ${n} (target <= ${TARGET}, hard limit < ${LIMIT})`)
if (n >= LIMIT) {
  console.error('FAIL: tracked-file limit reached.')
  process.exit(1)
}
if (n > TARGET) console.warn('WARNING: above the 90-file target.')
