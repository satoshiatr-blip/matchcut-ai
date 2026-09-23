# MATCHCUT AI

保護者がiPhoneで撮った試合動画を、プロの試合のハイライト風に編集するPWA。
[MATCHCUT](https://github.com/satoshiatr-blip/matchcut) の全機能に加えて、AIによる見せ場候補の提案と選手名の非表示に対応。
動画の読み込み・解析・編集・書き出しはすべて端末内で行い、外部へは送信しない。

- 使う: https://satoshiatr-blip.github.io/matchcut-ai/ （Safariで開き「ホーム画面に追加」）
- 技術: Vite + React + TypeScript + Tailwind CSS、[mediabunny](https://github.com/Vanilagy/mediabunny)（WebCodecs）

## MATCHCUTとの違い

- **歓声のピーク検出**：試合の音声を解析し、音量が大きくなった場所を「見返す場所」の候補として提案する（機械学習は使わず、音量の変化だけを見る単純な仕組み）。あくまで見返す場所の目安で、シーンとして採用するかどうかは必ず人が確認・タップして決める。風・雑談・実況・他コートの音などでも反応することがある
- **選手名の非表示**：書き出しの「映像」設定から、テロップの選手名（背番号・名前）だけを消せる。種類（GOAL・NICE SAVEなど）の表示は残る。広く共有するときの匿名化に

## 開発

```bash
npm install
npm run dev -- --mode pc   # PCのブラウザで確認（http://localhost:5183）
npm run dev                # iPhone実機でLAN越しに確認（https、port 5182）
```
