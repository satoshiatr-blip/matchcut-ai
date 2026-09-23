// 小さなデータ（BGMファイル・チーム名簿）に加え、試合動画そのものも IndexedDB に置く。
// アプリを開き直しても動画を選び直さなくて済むが、その分iPhoneの容量を使う点に注意
const DB = 'matchcut-ai'
const STORE = 'files'

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

// 接続を開けっぱなしにしない（溜まるとDBの削除・再オープンが詰まる）。使い終わったら必ず閉じる
async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  let db: IDBDatabase | null = null
  try {
    db = await open()
    return await new Promise<T | null>(resolve => {
      const tx = db!.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  } finally {
    db?.close()
  }
}

export async function idbGet<T>(key: string): Promise<T | null> {
  return withStore<T>('readonly', store => store.get(key))
}

export async function idbSet(key: string, value: unknown) {
  if (value == null) await withStore('readwrite', store => store.delete(key))
  else await withStore('readwrite', store => store.put(value, key))
}

export const loadBgm = () => idbGet<File>('bgm')
export const saveBgm = (f: File | null) => idbSet('bgm', f)

// 試合動画。key は sourceKey（ファイル名+サイズ）と揃える
const videoKey = (key: string) => `video:${key}`
export const loadSourceVideo = (key: string) => idbGet<File>(videoKey(key))
export const saveSourceVideo = (key: string, f: File) => idbSet(videoKey(key), f)
export const deleteSourceVideo = (key: string) => idbSet(videoKey(key), null)
