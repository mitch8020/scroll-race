import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createProductionScaleData } from './production-data.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outputDirectory = join(here, '..', '.readiness-runtime')
const outputPath = join(outputDirectory, 'production-scale.json')
const data = createProductionScaleData()

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

console.log(
  JSON.stringify(
    {
      outputPath,
      profile: data.profile,
    },
    null,
    2,
  ),
)
