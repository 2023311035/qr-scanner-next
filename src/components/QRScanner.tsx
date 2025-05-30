'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedCodes, setLastScannedCodes] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const codeReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const sessionScannedCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let video: HTMLVideoElement | null = null;
    const initializeCamera = async () => {
      try {
        setIsInitializing(true);
        setCameraError('');
        // セッション開始時にスキャン済みコードをリセット
        sessionScannedCodesRef.current = new Set();

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('お使いのブラウザはカメラへのアクセスをサポートしていません。');
          setIsInitializing(false);
          return;
        }

        // 利用可能なカメラデバイスを確認
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('利用可能なカメラデバイス:', videoDevices);

        if (videoDevices.length === 0) {
          setCameraError('カメラデバイスが見つかりません。');
          setIsInitializing(false);
          return;
        }

        // ZXingの初期化
        try {
          console.log('ZXing初期化開始');
          const codeReader = new BrowserQRCodeReader();
          codeReaderRef.current = codeReader;

          // カメラストリームの取得
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 }
            }
          });

          if (videoRef.current) {
            video = videoRef.current;
            video.srcObject = stream;
            await video.play();
            const settings = stream.getVideoTracks()[0].getSettings();
            console.log('カメラストリーム取得成功:', {
              width: settings.width,
              height: settings.height,
              frameRate: settings.frameRate,
              deviceId: settings.deviceId
            });
          }

          // バーコードスキャンの開始
          const scanCode = async () => {
            if (video && codeReaderRef.current) {
              try {
                console.log('スキャン開始...');
                await codeReaderRef.current.decodeFromVideoDevice(
                  undefined,
                  video,
                  (result, error) => {
                    if (error) {
                      console.error('スキャンエラー:', error);
                      return;
                    }
                    if (result) {
                      const code = result.getText();
                      // セッション中に既にスキャン済みのコードは無視
                      if (sessionScannedCodesRef.current.has(code)) {
                        console.log('セッション中に既にスキャン済みのコードを無視:', code);
                        return;
                      }
                      sessionScannedCodesRef.current.add(code);
                      console.log('検出されたコード:', {
                        text: code,
                        timestamp: new Date().toISOString(),
                        format: result.getBarcodeFormat()
                      });
                      // 履歴に追加
                      setScannedCodes(prev => {
                        const arr = Array.from(prev);
                        arr.push(code);
                        return new Set(arr.slice(-10));
                      });
                      setLastScannedCodes(prev => {
                        const newCodes = [...prev, code];
                        return newCodes.slice(-5);
                      });
                      onScanSuccess(code);
                    }
                  }
                );
                console.log('ZXingスキャン開始成功');
              } catch (error) {
                console.error('ZXingスキャンエラー:', error);
              }
            }
          };

          await scanCode();
          setIsInitializing(false);
        } catch (error) {
          console.error('ZXing初期化エラー:', error);
          setCameraError('バーコードスキャナーの初期化に失敗しました。');
          setIsInitializing(false);
        }
      } catch (error) {
        console.error('予期せぬエラー:', error);
        setCameraError('予期せぬエラーが発生しました。ブラウザを再読み込みして再度お試しください。');
        setIsInitializing(false);
      }
    };

    initializeCamera();

    return () => {
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onScanSuccess]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        if (canvasRef.current && codeReaderRef.current) {
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          if (context) {
            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0);
            
            try {
              const img = new Image();
              img.src = canvas.toDataURL();
              await new Promise((resolve) => {
                img.onload = resolve;
              });
              const result = await codeReaderRef.current.decodeFromImageUrl(img.src);
              if (result) {
                const code = result.getText();
                if (!scannedCodes.has(code)) {
                  setScannedCodes(prev => {
                    const arr = Array.from(prev);
                    arr.push(code);
                    return new Set(arr.slice(-10));
                  });
                  setLastScannedCodes([code]);
                  onScanSuccess(code);
                }
              }
            } catch (error) {
              console.error('画像からのバーコード読み取りエラー:', error);
            }
          }
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const isValidUrl = (string: string) => {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-gray-900 rounded-xl shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-4">QRコード・バーコードスキャナー</h2>
      </div>
      {isInitializing && (
        <div className="p-4 bg-blue-900 border border-blue-700 rounded-lg text-blue-300 mb-4 flex items-center">
          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          カメラを初期化中です...
        </div>
      )}
      {cameraError ? (
        <div className="p-4 bg-red-900 border border-red-700 rounded-lg text-red-300 mb-4 flex items-center">
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {cameraError}
        </div>
      ) : (
        <>
          <div className="relative w-full" style={{ height: '70vh', maxWidth: '400px', margin: '0 auto' }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover rounded-lg"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
          </div>
          <div className="mt-4">
            <label className="block w-full p-4 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
              <span className="text-white">画像ファイルから読み取る</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </>
      )}
      <div className="mt-6 space-y-6">
        {lastScannedCodes.length > 0 && (
          <div className="p-4 bg-gray-800 border border-green-700 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-2 text-green-400">最新のスキャン結果:</h3>
            <ul className="space-y-1">
              {lastScannedCodes.map((code, idx) => (
                <li key={idx}>
                  {isValidUrl(code) ? (
                    <a 
                      href={code} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 break-all hover:underline"
                    >
                      {code}
                    </a>
                  ) : (
                    <p className="break-all text-gray-300">{code}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="bg-gray-800 p-4 rounded-lg shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-white">スキャン履歴:</h3>
            <button
              onClick={() => setScannedCodes(new Set())}
              className="text-sm px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              履歴をクリア
            </button>
          </div>
          <ul className="space-y-2 max-h-[440px] overflow-y-auto pr-2">
            {Array.from(scannedCodes).map((code, index) => (
              <li key={index} className="p-3 bg-gray-700 rounded-md shadow-sm hover:shadow-md transition-shadow duration-200">
                {isValidUrl(code) ? (
                  <a 
                    href={code} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 break-all hover:underline"
                  >
                    {code}
                  </a>
                ) : (
                  <p className="break-all text-gray-300">{code}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
} 