'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import jsQR from 'jsqr';

// ZXingの型定義
interface ZXingResult {
  getText: () => string;
  getBarcodeFormat: () => BarcodeFormat;
  getResultPoints: () => Array<{
    getX: () => number;
    getY: () => number;
  }>;
}

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedCodes, setLastScannedCodes] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const sessionScannedCodesRef = useRef<Set<string>>(new Set());
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  const processingCodeRef = useRef<boolean>(false);
  const [isImageMode, setIsImageMode] = useState(false);

  // コード処理を一元化する関数
  const processScannedCode = useCallback((code: string) => {
    if (processingCodeRef.current) return;
    processingCodeRef.current = true;
    try {
      if (sessionScannedCodesRef.current.has(code)) {
        return;
      }
      sessionScannedCodesRef.current.add(code);
      setScannedCodes(prev => {
        const newSet = new Set(prev);
        newSet.add(code);
        return new Set(Array.from(newSet).slice(-10));
      });
      setLastScannedCodes(prev => {
        if (prev.includes(code)) return prev;
        const newCodes = [...prev, code];
        return newCodes.slice(-5);
      });
      onScanSuccess(code);
    } finally {
      processingCodeRef.current = false;
    }
  }, [onScanSuccess]);

  // スキャン処理を一時停止する関数
  const pauseScanning = () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
  };

  // ピンチズームの処理をuseCallbackでラップ
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistanceRef.current !== null) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      const delta = currentDistance / lastTouchDistanceRef.current;
      const newScale = Math.min(Math.max(scale * delta, 1), 3);
      setScale(newScale);
      lastTouchDistanceRef.current = currentDistance;
    }
  }, [scale]);

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      lastTouchDistanceRef.current = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
    }
  };

  const handleTouchEnd = () => {
    lastTouchDistanceRef.current = null;
  };

  useEffect(() => {
    let video: HTMLVideoElement | null = null;
    const initializeCamera = async () => {
      try {
        setIsInitializing(true);
        setCameraError('');
        sessionScannedCodesRef.current = new Set();
        setIsImageMode(false);

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('お使いのブラウザはカメラへのアクセスをサポートしていません。');
          setIsInitializing(false);
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('利用可能なカメラデバイス:', videoDevices);

        if (videoDevices.length === 0) {
          setCameraError('カメラデバイスが見つかりません。');
          setIsInitializing(false);
          return;
        }

        try {
          console.log('ZXing初期化開始');
          const codeReader = new BrowserMultiFormatReader();
          codeReaderRef.current = codeReader;

          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { min: 640, ideal: 1280, max: 1280 },
              height: { min: 480, ideal: 720, max: 720 },
              frameRate: { min: 15, ideal: 15, max: 15 }
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

          const scanCode = async () => {
            if ((video && codeReaderRef.current) || isImageMode) {
              try {
                console.log('スキャン開始...');
                const scanWithJsQR = () => {
                  if ((!video && !isImageMode) || !canvasRef.current) return;
                  const canvas = canvasRef.current;
                  const context = canvas.getContext('2d', { alpha: false });
                  if (!context) return;
                  let width, height;
                  if (isImageMode) {
                    width = canvas.width;
                    height = canvas.height;
                  } else {
                    if (!video) return;
                    width = video.videoWidth;
                    height = video.videoHeight;
                    canvas.width = width;
                    canvas.height = height;
                    context.drawImage(video, 0, 0, width, height);
                  }
                  const imageData = context.getImageData(0, 0, width, height);
                  
                  const codes = [];
                  
                  while (true) {
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                      inversionAttempts: "dontInvert"
                    });
                    
                    if (!code) break;
                    
                    codes.push(code.data);
                    
                    const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = code.location;
                    const x = Math.min(topLeftCorner.x, bottomLeftCorner.x);
                    const y = Math.min(topLeftCorner.y, topRightCorner.y);
                    const w = Math.max(topRightCorner.x, bottomRightCorner.x) - x;
                    const h = Math.max(bottomLeftCorner.y, bottomRightCorner.y) - y;
                    
                    context.fillStyle = 'white';
                    context.fillRect(x, y, w, h);
                    const newImageData = context.getImageData(0, 0, width, height);
                    imageData.data.set(newImageData.data);
                  }
                  
                  codes.forEach(code => {
                    processScannedCode(code);
                  });
                };

                const scanWithZXing = async () => {
                  if (!video || !canvasRef.current) return;
                  const canvas = canvasRef.current;
                  const context = canvas.getContext('2d', { alpha: false });
                  if (!context) return;

                  const width = video.videoWidth;
                  const height = video.videoHeight;
                  canvas.width = width;
                  canvas.height = height;
                  context.drawImage(video, 0, 0, width, height);

                  const codes: Array<{ code: string; format: BarcodeFormat; points: { x: number; y: number }[] }> = [];

                  while (true) {
                    try {
                      const result = await codeReaderRef.current?.decodeFromCanvas(canvas);
                      if (!result) break;

                      const code = result.getText();
                      const format = result.getBarcodeFormat();
                      const points = (result as ZXingResult).getResultPoints().map((point: { getX: () => number; getY: () => number }) => ({
                        x: point.getX(),
                        y: point.getY()
                      }));

                      codes.push({ code, format, points });

                      if (points.length >= 4) {
                        const x = Math.min(...points.map((p: { x: number; y: number }) => p.x));
                        const y = Math.min(...points.map((p: { x: number; y: number }) => p.y));
                        const w = Math.max(...points.map((p: { x: number; y: number }) => p.x)) - x;
                        const h = Math.max(...points.map((p: { x: number; y: number }) => p.y)) - y;

                        const padding = 10;
                        context.fillStyle = 'white';
                        context.fillRect(
                          Math.max(0, x - padding),
                          Math.max(0, y - padding),
                          Math.min(width - x + padding, w + padding * 2),
                          Math.min(height - y + padding, h + padding * 2)
                        );
                      }
                    } catch {
                      break;
                    }
                  }

                  codes.forEach(({ code }) => {
                    processScannedCode(code);
                  });
                };

                // jsQRとZXingを交互に実行
                let isJsQR = true;
                const scanInterval = setInterval(() => {
                  if (isJsQR) {
                    scanWithJsQR();
                  } else {
                    scanWithZXing();
                  }
                  isJsQR = !isJsQR;
                }, 500);

                return () => {
                  clearInterval(scanInterval);
                  if (codeReaderRef.current) {
                    codeReaderRef.current = null;
                  }
                };
              } catch (error) {
                console.error('スキャンエラー:', error);
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
      const timeoutRef = scanTimeoutRef.current;
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    };
  }, [isImageMode, processScannedCode]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener('touchstart', handleTouchStart);
      video.addEventListener('touchmove', handleTouchMove);
      video.addEventListener('touchend', handleTouchEnd);

      return () => {
        video.removeEventListener('touchstart', handleTouchStart);
        video.removeEventListener('touchmove', handleTouchMove);
        video.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [scale, handleTouchMove]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImageMode(true);

    try {
      // ZXingの初期化を確認
      if (!codeReaderRef.current) {
        console.log('ZXingを初期化中...');
        try {
          codeReaderRef.current = new BrowserMultiFormatReader();
          console.log('ZXing初期化成功');
        } catch (error) {
          console.error('ZXing初期化エラー:', error);
          setCameraError('バーコードスキャナーの初期化に失敗しました。ページを再読み込みしてください。');
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
            const maxSize = 3840;
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

            // ★canvasのサイズをimgのピクセルサイズに必ず合わせる
            canvas.width = width;
            canvas.height = height;

            // 画像を描画（高品質設定）
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(img, 0, 0, width, height);

            // ★canvas内容を目視確認
            window.open(canvas.toDataURL('image/png'));

            // --- QRコード用: グレースケール＋コントラスト強調したImageDataでjsQR ---
            const imageData = context.getImageData(0, 0, width, height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              const avg = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
              const contrast = 2.0;
              const contrasted = Math.min(255, Math.max(0, (avg - 128) * contrast + 128));
              imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = contrasted;
            }
            // jsQRは加工後ImageDataで呼ぶ
            const jsQRResult = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
            if (jsQRResult) {
              const code = jsQRResult.data;
              console.log('画像から検出されたコード（jsQR）:', {
                text: code,
                format: 'QR_CODE',
                imageSize: { width, height },
                timestamp: new Date().toISOString()
              });
              if (sessionScannedCodesRef.current.has(code)) {
                return;
              }
              sessionScannedCodesRef.current.add(code);
              setScannedCodes(prev => {
                const newSet = new Set(prev);
                newSet.add(code);
                return new Set(Array.from(newSet).slice(-10));
              });
              setLastScannedCodes(prev => {
                if (prev.includes(code)) return prev;
                const newCodes = [...prev, code];
                return newCodes.slice(-5);
              });
              onScanSuccess(code);
              pauseScanning();
              return;
            }

            // --- バーコード用: 元画像のままcanvasを再描画してZXing ---
            context.drawImage(img, 0, 0, width, height); // 元画像で上書き
            try {
              const result = await codeReaderRef.current.decodeFromImageUrl(canvas.toDataURL());
              if (result) {
                const code = result.getText();
                console.log('画像から検出されたコード（ZXing）:', {
                  text: code,
                  format: result.getBarcodeFormat(),
                  imageSize: { width, height },
                  timestamp: new Date().toISOString()
                });
                if (sessionScannedCodesRef.current.has(code)) {
                  return;
                }
                sessionScannedCodesRef.current.add(code);
                setScannedCodes(prev => {
                  const newSet = new Set(prev);
                  newSet.add(code);
                  return new Set(Array.from(newSet).slice(-10));
                });
                setLastScannedCodes(prev => {
                  if (prev.includes(code)) return prev;
                  const newCodes = [...prev, code];
                  return newCodes.slice(-5);
                });
                onScanSuccess(code);
                pauseScanning();
                return;
              }
            } catch (err) {
              console.log('ZXingによる画像デコード失敗:', err);
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
          <div className="relative w-full overflow-hidden" style={{ height: '70vh', maxWidth: '400px', margin: '0 auto' }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover rounded-lg transition-transform duration-200"
              style={{ transform: `scale(${scale})`, objectFit: 'cover', willChange: 'transform', backfaceVisibility: 'hidden' }}
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
                    sessionScannedCodesRef.current = new Set(); // 履歴クリア時のみ
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
        </>
      )}
    </div>
  );
} 