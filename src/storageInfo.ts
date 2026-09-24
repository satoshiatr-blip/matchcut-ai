// 「動画が見つかりませんでした」の原因切り分け用：永続化許可の有無と使用量/上限を見る
export type StorageInfo = { persisted: boolean | null; usage: number | null; quota: number | null }

export async function getStorageInfo(): Promise<StorageInfo> {
  const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null
  const est = await navigator.storage?.estimate?.().catch(() => null)
  return { persisted, usage: est?.usage ?? null, quota: est?.quota ?? null }
}

// ホーム画面に追加して開いているか（iOSはSafariのタブより消されにくい）
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}
