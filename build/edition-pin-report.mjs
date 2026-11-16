import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const base = process.env.BASE_SHA || 'HEAD^'
const hasBase = !/^0+$/.test(base)
const directories = git('ls-tree', 'HEAD:data/editions').split('\n')
const report = ['### Edition data changes', '', '| Edition | Pinned data | Supplementary published tags | Verified occurrence links | Verses without a restoration link |', '| --- | --- | ---: | ---: | ---: |']
for (const entry of directories) {
  const match = /^160000 commit ([0-9a-f]+)\t([a-z]+)$/.exec(entry)
  if (!match) throw new Error(`Unexpected entry under data/editions: ${entry}`)
  const [, revision, slug] = match
  const directory = `data/editions/${slug}`
  const previous = hasBase ? git('ls-tree', base, directory).match(/^160000 commit ([0-9a-f]+)\t/)?.[1] : undefined
  if (previous === revision) continue
  const current = JSON.parse(readFileSync(`${directory}/coverage.json`, 'utf8'))
  const old = previous ? JSON.parse(git('-C', directory, 'show', `${previous}:coverage.json`)) : null
  const count = key => {
    const value = current.totals[key]
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Missing count for ${current.edition}: ${key}`)
    if (!old) return String(value)
    const change = value - old.totals[key]
    return `${value} (${change > 0 ? '+' : ''}${change})`
  }
  const repo = `https://github.com/mando222/bible-data-${slug}`
  const link = previous ? `${repo}/compare/${previous}...${revision}` : `${repo}/blob/${revision}/coverage.json`
  report.push(`| ${current.edition} | [${revision.slice(0, 8)}](${link}) | ${count('publishedTags')} | ${count('alignmentLinks')} | ${count('versesWithoutRestoration')} |`)
}
const message = report.length === 4 ? 'No edition pins changed.' : report.join('\n')
console.log(message)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, message + '\n')
