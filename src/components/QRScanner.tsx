'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  const [scale, setScale] = useState(1);
  const [duplicateMessage, setDuplicateMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const sessionScannedCodesRef = useRef<Set<string>>(new Set());
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  const processingCodeRef = useRef<boolean>(false);

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
      pauseScanning();
    } finally {
      processingCodeRef.current = false;
    }
  }, [onScanSuccess]);

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
              width: { min: 1920, ideal: 1920, max: 3840 },
              height: { min: 1080, ideal: 1080, max: 2160 },
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
                // jsQRの設定
                const scanWithJsQR = () => {
                  if (!video || !canvasRef.current || !isScanning) return;
                  
                  const canvas = canvasRef.current;
                  const context = canvas.getContext('2d');
                  if (!context) return;

                  // キャンバスのサイズをビデオに合わせる
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                  
                  // ビデオフレームをキャンバスに描画
                  context.drawImage(video, 0, 0, canvas.width, canvas.height);
                  
                  // 画像データを取得
                  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                  
                  // jsQRでスキャン
                  const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                  });

                  if (code) {
                    console.log('jsQRで検出されたコード:', {
                      text: code.data,
                      format: 'QR_CODE'
                    });
                    processScannedCode(code.data);
                  }
                };

                // jsQRのスキャンループを開始
                const jsQRInterval = setInterval(scanWithJsQR, 33);

                // ZXingはバックアップとして設定
                const hints = new Map();
                hints.set('TRY_HARDER', true);
                hints.set('POSSIBLE_FORMATS', ['QR_CODE']);
                hints.set('CHARACTER_SET', 'UTF-8');
                codeReaderRef.current.hints = hints;

                await codeReaderRef.current.decodeFromVideoDevice(
                  undefined,
                  video,
                  (result, error) => {
                    if (error) {
                      console.error('ZXingスキャンエラー:', error);
                      return;
                    }
                    if (result && isScanning) {
                      const code = result.getText();
                      console.log('ZXingで検出されたコード:', {
                        text: code,
                        format: result.getBarcodeFormat()
                      });
                      processScannedCode(code);
                    }
                  }
                );

                // クリーンアップ関数
                return () => {
                  clearInterval(jsQRInterval);
                  if (codeReaderRef.current) {
                    // ZXingのクリーンアップ
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
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [onScanSuccess, isScanning, processScannedCode]);

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

            canvas.width = width;
            canvas.height = height;

            // 画像を描画（高品質設定）
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(img, 0, 0, width, height);

            // === ここでcanvas内容を新しいタブで目視確認 ===
            const debugDataUrl = canvas.toDataURL('image/png');
            window.open(debugDataUrl);

            // ZXingのhintsを設定
            const hints = new Map();
            hints.set('TRY_HARDER', true);
            hints.set('POSSIBLE_FORMATS', [
              'QR_CODE',
              'EAN_13',
              'EAN_8',
              'UPC_A',
              'UPC_E',
              'CODE_39',
              'CODE_93',
              'CODE_128',
              'ITF',
              'CODABAR'
            ]);
            hints.set('CHARACTER_SET', 'UTF-8');
            codeReaderRef.current.hints = hints;

            // ZXingで検出（0°→180°のみ）
            let result = null;
            context.save();
            context.setTransform(1, 0, 0, 1, 0, 0); // リセット
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(img, 0, 0, width, height);
            context.restore();
            const dataUrl = canvas.toDataURL('image/png', 1.0);
            try {
              result = await codeReaderRef.current.decodeFromImageUrl(dataUrl);
            } catch {}
            if (!result) {
              context.save();
              context.clearRect(0, 0, canvas.width, canvas.height);
              context.translate(canvas.width / 2, canvas.height / 2);
              context.rotate(Math.PI); // 180°回転
              context.drawImage(img, -width / 2, -height / 2, width, height);
              context.restore();
              const dataUrl180 = canvas.toDataURL('image/png', 1.0);
              try {
                result = await codeReaderRef.current.decodeFromImageUrl(dataUrl180);
              } catch {}
            }
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

            // ZXingで失敗した場合はcanvasを元画像で再描画してからjsQRを呼ぶ
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(img, 0, 0, width, height);
            const currentImageData = context.getImageData(0, 0, width, height);
            // グレースケール＋コントラスト強調
            const data = currentImageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
              const contrast = 2.0;
              const contrasted = Math.min(255, Math.max(0, (avg - 128) * contrast + 128));
              data[i] = data[i + 1] = data[i + 2] = contrasted;
            }
            context.putImageData(currentImageData, 0, 0);
            const jsQRResult = jsQR(currentImageData.data, width, height, { inversionAttempts: "attemptBoth" });
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
          {duplicateMessage && (
            <div className="p-2 bg-yellow-900 border border-yellow-700 rounded-lg text-yellow-300 mb-2 flex items-center justify-center">
              {duplicateMessage}
            </div>
          )}
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