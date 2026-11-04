// ------------------------------------------------------------
// Reading more than 1000 rows from Supabase.
//
// PostgREST returns at most 1000 rows per request (the project's
// max_rows), silently — a tag with 4,000 contacts came back as 1,000,
// so broadcasts counted and reached only 1,000 people. And a long
// `.in('id', [...])` list overflows the request URL. These helpers page
// through both.
// ------------------------------------------------------------

export const PAGE_SIZE = 1000
/** UUIDs per `.in(...)` request — keeps the URL well under limits. */
export const IN_CHUNK = 200

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Every row of a query, fetched page by page. `page(from, to)` must
 * apply `.range(from, to)` to a query with a stable `.order(...)`.
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}

/** Rows for a long list of keys, `IN_CHUNK` keys per request. */
export async function fetchInChunks<K, T>(keys: K[], fetch: (chunk: K[]) => PageResult<T>): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < keys.length; i += IN_CHUNK) {
    const { data, error } = await fetch(keys.slice(i, i + IN_CHUNK))
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
  }
  return rows
}
