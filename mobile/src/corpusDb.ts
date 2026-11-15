/** Synchronous statement operations live exclusively in the library worker. Android serves
 * this private URL from the verified, read-only database, including on the first offline boot. */
let accessKey = ''
export function connectCorpus(key: string) {
  accessKey = key
}

type Field = string | number | null
function query(sql: string, args: Field[], first: boolean): Record<string, Field>[] {
  const request = new XMLHttpRequest()
  request.open('GET', '/_study/corpus', false)
  request.setRequestHeader('X-Study-Key', accessKey)
  request.setRequestHeader('X-Study-Query', encodeURIComponent(JSON.stringify([sql, args, first])))
  request.send()
  if (request.status !== 200) throw new Error(request.responseText || 'The offline study query failed.')
  const [fields, rows]: [string[], Field[][]] = JSON.parse(request.responseText)
  return rows.map((row) => Object.fromEntries(fields.map((name, i) => [name, row[i]])))
}

export const corpusDb = {
  prepare(sql: string) {
    return {
      get: (...args: Field[]) => query(sql, args, true)[0],
      all: (...args: Field[]) => query(sql, args, false),
      iterate: (...args: Field[]) => query(sql, args, false).values()
    }
  }
}
