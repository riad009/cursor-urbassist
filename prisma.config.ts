import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config as dotenvConfig } from 'dotenv'

// Load .env so prisma CLI commands can read DATABASE_URL, DIRECT_URL, etc.
dotenvConfig({ path: path.join(__dirname, '.env') })

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
})
