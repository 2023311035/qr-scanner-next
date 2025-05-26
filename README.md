# QRコードスキャナー

## 概要
このプロジェクトは、Webブラウザ上で動作する高精度なQRコード・バーコードスキャナーアプリケーションです。デバイスのカメラを使用してリアルタイムでQRコードやバーコードをスキャンし、その内容を表示・管理することができます。

## 主な機能
- リアルタイムQRコード・バーコードスキャン
  - 高解像度カメラ対応（iPhone 15の48MPカメラ等）
  - 60fpsの滑らかな動画処理
  - 複数のQRコードを同時に検出
- 画像ファイルからのQRコード・バーコード読み取り
- スキャン履歴の管理
- レスポンシブデザイン対応
- ダークモード対応

## 技術スタック
- Next.js 14
- TypeScript
- jsQR
- zbar.wasm
- @zxing/library
- Tailwind CSS
- shadcn/ui

## 動作環境
- モダンブラウザ（Chrome, Safari, Firefox等）
- カメラ機能をサポートするデバイス
- モバイルデバイス（iOS, Android）対応

## セットアップ手順
1. リポジトリのクローン
```bash
git clone https://github.com/2023311035/qr-scanner-next.git
```

2. 依存関係のインストール
```bash
npm install
```

3. 開発サーバーの起動
```bash
npm run dev
```

4. ビルド
```bash
npm run build
```

## 使用方法
1. カメラを起動し、QRコードやバーコードをスキャン
2. スキャンしたコードの内容が表示されます
3. 画像ファイルからも読み取り可能
4. スキャン履歴は自動的に保存されます

## カメラ設定
- 解像度: 最大8064x6048（48MP相当）
- フレームレート: 60fps
- アスペクト比: 4:3
- スキャン間隔: 50ms

## 注意事項
- カメラの使用許可が必要です
- 高解像度のカメラを推奨します
- 良好な照明条件での使用を推奨します

## デプロイメント
このプロジェクトはVercelで自動デプロイされています。mainブランチへのプッシュで自動的にデプロイが実行されます。

## 開発者向け情報
- ホットリロードによる開発効率の向上
- TypeScriptによる型安全な開発
- VercelのGeistフォントを使用した最適化されたタイポグラフィ
- shadcn/uiによるモダンなUIコンポーネント

## ライセンス
MITライセンス

This is a QR code scanner web application built with Next.js.

## Features

- QR code scanning using device camera
- Support for multiple cameras
- Real-time scanning
- Scan history
- Automatic deployment with Vercel

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Run development server: `npm run dev`

## Deployment

This project is automatically deployed to Vercel. Any changes pushed to the main branch will trigger a new deployment.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 機能説明

このプロジェクトは Next.js を使用した Web アプリケーションです。主な機能は以下の通りです：

### 開発環境
- Next.js 14 を使用した最新のフロントエンド開発環境
- TypeScript による型安全な開発
- Vercel の Geist フォントを使用した最適化されたタイポグラフィ

### 主な機能
- ホットリロードによる開発効率の向上
- ページの自動更新機能
- モダンな開発体験を提供する開発サーバー
- `app/page.tsx` からのページ編集機能

### デプロイメント
- Vercel プラットフォームとの完全な互換性
- 簡単なデプロイプロセス
- 自動的なビルドと最適化

このプロジェクトは、モダンなウェブアプリケーション開発のためのベストプラクティスに従って構築されています。


