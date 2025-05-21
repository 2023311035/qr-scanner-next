'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const QRScanner = dynamic(() => import('@/components/QRScanner'), {
  ssr: false,
});

export default function Home() {
  const [scannedResults, setScannedResults] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const handleScanSuccess = (decodedText: string) => {
    setScannedResults((prev) => [decodedText, ...prev].slice(0, 10));
  };

  const handleStartScan = () => {
    setIsScanning(true);
  };

  const handleStopScan = () => {
    setIsScanning(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-12 text-gray-800 dark:text-white">
          QRコードスキャナー
        </h1>

        {!isScanning ? (
          <div className="text-center mb-8">
            <button
              onClick={handleStartScan}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors duration-200 inline-flex items-center space-x-2 relative"
            >
              <div className="absolute inset-0 border-2 border-white rounded-lg -m-1"></div>
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>QRコードスキャン</span>
            </button>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              ブラウザのカメラを使用してQRコードをスキャンします
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">スキャン中</h2>
              <button
                onClick={handleStopScan}
                className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              >
                スキャンを停止
              </button>
            </div>
            <QRScanner onScanSuccess={handleScanSuccess} />
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white text-center">
            スキャン済みQRコード
          </h2>
          {scannedResults.length > 0 ? (
            <ul className="space-y-3">
              {scannedResults.map((result, index) => (
                <li
                  key={index}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <a
                    href={result}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {result}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              スキャンされたQRコードはここに表示されます
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
