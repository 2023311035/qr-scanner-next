'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedCodes, setLastScannedCodes] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const sessionScannedCodesRef = useRef<Set<string>>(new Set());
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // スキャン処理を一時停止する関数
  const pauseScanning = () => {
    setIsScanning(false);
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    scanTimeoutRef.current = setTimeout(() => {
      setIsScanning(true);
    }, 1000);
  };

  useEffect(() => {
    let video: HTMLVideoElement | null = null;
    const initializeCamera = async () => {
      try {
        setIsInitializing(true);
        setCameraError('');
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
          const codeReader = new BrowserMultiFormatReader();
          codeReaderRef.current = codeReader;

          // カメラストリームの取得（高解像度設定）
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { min: 1280, ideal: 1280, max: 1280 },
              height: { min: 720, ideal: 720, max: 720 },
              frameRate: { min: 30, ideal: 60, max: 120 },
              aspectRatio: { ideal: 1.777777778 }
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
                // ZXingの検出精度を向上させる設定
                const hints = new Map();
                hints.set('TRY_HARDER', true);
                hints.set('POSSIBLE_FORMATS', [
                  'QR_CODE',
                  'DATA_MATRIX',
                  'AZTEC',
                  'PDF_417',
                  'MAXICODE'
                ]);
                hints.set('CHARACTER_SET', 'UTF-8');
                hints.set('PURE_BARCODE', false);
                hints.set('NEED_RESULT_POINT_CALLBACK', true);
                codeReaderRef.current.hints = hints;

                await codeReaderRef.current.decodeFromVideoDevice(
                  undefined,
                  video,
                  (result, error) => {
                    if (error) {
                      console.error('スキャンエラー:', error);
                      return;
                    }
                    if (result && isScanning) {
                      const code = result.getText();
                      console.log('検出されたコード:', {
                        text: code,
                        format: result.getBarcodeFormat()
                      });
                      
                      // 重複チェックを厳密に行う
                      if (sessionScannedCodesRef.current.has(code)) {
                        console.log('重複コードを検出 - 無視します:', code);
                        return;
                      }

                      // 新しいコードの場合のみ処理を実行
                      sessionScannedCodesRef.current.add(code);

                      // 履歴に追加
                      setScannedCodes(prev => {
                        const newSet = new Set(prev);
                        newSet.add(code);
                        return new Set(Array.from(newSet).slice(-10));
                      });

                      setLastScannedCodes(prev => {
                        const newCodes = [...prev, code];
                        return newCodes.slice(-5);
                      });

                      // コールバックを呼び出し
                      onScanSuccess(code);

                      // 重複を防ぐために一時的にスキャンを停止
                      pauseScanning();
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
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [onScanSuccess, isScanning]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // ZXingの初期化を確認
      if (!codeReaderRef.current) {
        console.log('ZXingを初期化中...');
        try {
          codeReaderRef.current = new BrowserMultiFormatReader();
          console.log('ZXing初期化成功');
        } catch (error) {
          console.error('ZXing初期化エラー:', error);
          setCameraError('QRコードスキャナーの初期化に失敗しました。ページを再読み込みしてください。');
          return;
        }
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) return;

        const img = new Image();
        img.onload = async () => {
          if (canvasRef.current && codeReaderRef.current) {
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context) return;

            // キャンバスのサイズを画像に合わせる（最大サイズを制限）
            const maxSize = 3840; // 最大サイズを増加
            let width = img.width;
            let height = img.height;
            
            if (width > maxSize || height > maxSize) {
              if (width > height) {
                height = Math.round((height * maxSize) / width);
                width = maxSize;
              } else {
                width = Math.round((width * maxSize) / height);
                height = maxSize;
              }
            }

            canvas.width = width;
            canvas.height = height;

            // 画像を描画（高品質設定）
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(img, 0, 0, width, height);

            // まずオリジナル画像でQR検出を試す
            let result = null;
            let attempts = 0;
            const maxAttempts = 8;
            let dataUrl = canvas.toDataURL('image/png', 1.0);

            // ZXingのhintsをQR_CODE専用に
            const hints = new Map();
            hints.set('TRY_HARDER', true);
            hints.set('POSSIBLE_FORMATS', ['QR_CODE']);
            hints.set('CHARACTER_SET', 'UTF-8');
            hints.set('PURE_BARCODE', true);
            codeReaderRef.current.hints = hints;

            // オリジナル画像で検出
            while (!result && attempts < maxAttempts) {
              try {
                if (attempts > 0) {
                  context.save();
                  context.translate(canvas.width / 2, canvas.height / 2);
                  if (attempts <= 4) {
                    context.rotate((Math.PI / 2) * attempts);
                  }
                  if (attempts > 4) {
                    const scale = attempts === 5 ? 1.2 : attempts === 6 ? 0.8 : 1.5;
                    context.scale(scale, scale);
                  }
                  context.drawImage(img, -width / 2, -height / 2, width, height);
                  context.restore();
                }
                // ZXing
                try {
                  result = await codeReaderRef.current.decodeFromImageUrl(dataUrl);
                  if (result) break;
                } catch {}
                // jsQR
                try {
                  const currentImageData = context.getImageData(0, 0, width, height);
                  const jsQRResult = jsQR(currentImageData.data, width, height, { inversionAttempts: "attemptBoth" });
                  if (jsQRResult) {
                    result = {
                      getText: () => jsQRResult.data,
                      getBarcodeFormat: () => 'QR_CODE'
                    };
                    break;
                  }
                } catch {}
              } catch {}
              attempts++;
            }

            // オリジナルで失敗した場合のみグレースケール変換して再度試す
            if (!result) {
              const imageData = context.getImageData(0, 0, width, height);
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = avg; data[i + 1] = avg; data[i + 2] = avg;
              }
              context.putImageData(imageData, 0, 0);
              dataUrl = canvas.toDataURL('image/png', 1.0);
              attempts = 0;
              while (!result && attempts < maxAttempts) {
                try {
                  if (attempts > 0) {
                    context.save();
                    context.translate(canvas.width / 2, canvas.height / 2);
                    if (attempts <= 4) {
                      context.rotate((Math.PI / 2) * attempts);
                    }
                    if (attempts > 4) {
                      const scale = attempts === 5 ? 1.2 : attempts === 6 ? 0.8 : 1.5;
                      context.scale(scale, scale);
                    }
                    context.drawImage(img, -width / 2, -height / 2, width, height);
                    context.restore();
                  }
                  // ZXing
                  try {
                    result = await codeReaderRef.current.decodeFromImageUrl(dataUrl);
                    if (result) break;
                  } catch {}
                  // jsQR
                  try {
                    const currentImageData = context.getImageData(0, 0, width, height);
                    const jsQRResult = jsQR(currentImageData.data, width, height, { inversionAttempts: "attemptBoth" });
                    if (jsQRResult) {
                      result = {
                        getText: () => jsQRResult.data,
                        getBarcodeFormat: () => 'QR_CODE'
                      };
                      break;
                    }
                  } catch {}
                } catch {}
                attempts++;
              }
            }

            // 結果処理は従来通り
            if (result) {
              const code = result.getText();
              console.log('画像から検出されたコード:', {
                text: code,
                format: result.getBarcodeFormat(),
                imageSize: { width, height },
                timestamp: new Date().toISOString()
              });

              // 重複チェック
              if (sessionScannedCodesRef.current.has(code)) {
                console.log('重複コードを検出 - 無視します:', code);
                return;
              }

              // 新しいコードの場合のみ処理を実行
              sessionScannedCodesRef.current.add(code);

              // 履歴に追加
              setScannedCodes(prev => {
                const newSet = new Set(prev);
                newSet.add(code);
                return new Set(Array.from(newSet).slice(-10));
              });

              setLastScannedCodes(prev => {
                const newCodes = [...prev, code];
                return newCodes.slice(-5);
              });

              // コールバックを呼び出し
              onScanSuccess(code);
            } else {
              console.log('画像からコードを検出できませんでした:', {
                attempts,
                imageSize: { width, height },
                timestamp: new Date().toISOString()
              });
              // エラーメッセージを表示
              setCameraError('QRコードを検出できませんでした。画像の品質やQRコードの状態を確認してください。');
            }
          }
        };
        img.src = e.target.result as string;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('ファイル読み込みエラー:', error);
      setCameraError('ファイルの読み込み中にエラーが発生しました。');
    }
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
          <div className="mt-4 space-y-4">
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
              {[...lastScannedCodes].reverse().map((code, idx) => (
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
              onClick={() => {
                setScannedCodes(new Set());
                sessionScannedCodesRef.current = new Set();
              }}
              className="text-sm px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              履歴をクリア
            </button>
          </div>
          <ul className="space-y-2 max-h-[440px] overflow-y-auto pr-2">
            {Array.from(scannedCodes).reverse().map((code, index) => (
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