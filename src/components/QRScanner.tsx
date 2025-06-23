'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  const [scannedCodes, setScannedCodes] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [scale, setScale] = useState(1);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const sessionScannedCodesRef = useRef<Set<string>>(new Set());
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  const processingCodeRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const isScanningRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const memoryCleanupRef = useRef<NodeJS.Timeout | null>(null);
  const lastCleanupTimeRef = useRef(0);

  // メモリクリーンアップ関数
  const cleanupMemory = useCallback(() => {
    const now = performance.now();
    // 最後のクリーンアップから30秒以上経過している場合のみ実行
    if (now - lastCleanupTimeRef.current >= 30000) {
      if (memoryCleanupRef.current) {
        clearTimeout(memoryCleanupRef.current);
      }
      memoryCleanupRef.current = setTimeout(() => {
        // 最新の20件のみを保持
        setScannedCodes(prev => prev.slice(-20));
        lastCleanupTimeRef.current = now;
      }, 1000);
    }
  }, []);

  // コード処理を一元化する関数
  const processScannedCode = useCallback((code: string) => {
    if (processingCodeRef.current) return;
    processingCodeRef.current = true;
    try {
      const now = Date.now();
      // 同じコードが5秒以内に再度スキャンされた場合は無視
      if (code === lastScannedCode && now - lastScanTimestamp < 5000) {
        return;
      }
      // セッション中に既にスキャンされたコードは処理しない
      if (sessionScannedCodesRef.current.has(code)) {
        return;
      }
      // 新しいコードをセッション履歴に追加
      sessionScannedCodesRef.current.add(code);
      setLastScannedCode(code);
      setLastScanTimestamp(now);
      setScannedCodes(prev => {
        if (prev.includes(code)) return prev; // すでに履歴にあれば追加しない
        const newCodes = [...prev, code];
        return newCodes.slice(-20);
      });
      onScanSuccess(code);
      cleanupMemory();
    } finally {
      processingCodeRef.current = false;
    }
  }, [onScanSuccess, cleanupMemory, lastScannedCode, lastScanTimestamp]);

  // カメラストリームの初期化
  const initializeCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('お使いのブラウザはカメラへのアクセスをサポートしていません。');
      return null;
    }

    try {
      sessionScannedCodesRef.current.clear();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { min: 1280, ideal: 1920, max: 2560 },
          height: { min: 720, ideal: 1080, max: 1440 },
          frameRate: { min: 24, ideal: 30, max: 60 },
          aspectRatio: { ideal: 1.777777778 }
        }
      });

      streamRef.current = stream;
      return stream;
    } catch (error) {
      console.error('カメラ初期化エラー:', error);
      setCameraError('カメラの初期化に失敗しました。');
      return null;
    }
  }, []);

  // カメラストリームの停止
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      // カメラ停止時にセッション履歴をクリア
      sessionScannedCodesRef.current.clear();
    }
  }, []);

  // コンポーネントのアンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      if (memoryCleanupRef.current) {
        clearTimeout(memoryCleanupRef.current);
      }
      stopCamera();
      sessionScannedCodesRef.current.clear();
    };
  }, [stopCamera]);

  useEffect(() => {
    let video: HTMLVideoElement | null = null;
    let isInitialized = false;

    const setupCamera = async () => {
      if (isInitialized) return;
      
      try {
        setIsInitializing(true);
        setCameraError('');
        sessionScannedCodesRef.current = new Set();

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('利用可能なカメラデバイス:', videoDevices);

        if (videoDevices.length === 0) {
          setCameraError('カメラデバイスが見つかりません。');
          setIsInitializing(false);
          return;
        }

        try {
          if (!codeReaderRef.current) {
            console.log('ZXing初期化開始');
            const codeReader = new BrowserMultiFormatReader();
            codeReader.hints.set(
              DecodeHintType.POSSIBLE_FORMATS,
              [
                BarcodeFormat.QR_CODE,
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.UPC_A,
                BarcodeFormat.UPC_E,
                BarcodeFormat.CODE_39,
                BarcodeFormat.CODE_93,
                BarcodeFormat.CODE_128,
                BarcodeFormat.ITF,
                BarcodeFormat.CODABAR,
                BarcodeFormat.PDF_417,
                BarcodeFormat.AZTEC,
                BarcodeFormat.DATA_MATRIX
              ]
            );
            codeReader.hints.set(DecodeHintType.TRY_HARDER, true);
            codeReader.hints.set(DecodeHintType.PURE_BARCODE, false);
            codeReader.hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8');
            codeReaderRef.current = codeReader;
          }

          const stream = await initializeCamera();
          if (!stream) {
            setIsInitializing(false);
            return;
          }

          if (videoRef.current) {
            video = videoRef.current;
            video.srcObject = stream;
            video.setAttribute('playsinline', 'true');
            video.setAttribute('autoplay', 'true');
            video.setAttribute('muted', 'true');
            await video.play();
            const settings = stream.getVideoTracks()[0].getSettings();
            console.log('カメラストリーム取得成功:', {
              width: settings.width,
              height: settings.height,
              frameRate: settings.frameRate,
              deviceId: settings.deviceId
            });
          }

          isInitialized = true;
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

    const scanCode = async () => {
      if (!video || !canvasRef.current || !codeReaderRef.current || isScanningRef.current) return;
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { 
        alpha: false,
        willReadFrequently: true,
        desynchronized: true
      });
      if (!context) return;

      // 解像度を最適化（処理用）
      const width = Math.floor(video.videoWidth / 1.5);
      const height = Math.floor(video.videoHeight / 1.5);
      canvas.width = width;
      canvas.height = height;

      // 画像の前処理
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(video, 0, 0, width, height);

      // コントラストと明るさの調整
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // コントラスト調整
        data[i] = data[i] * 1.2;     // R
        data[i + 1] = data[i + 1] * 1.2; // G
        data[i + 2] = data[i + 2] * 1.2; // B
      }
      context.putImageData(imageData, 0, 0);

      const now = performance.now();
      const timeSinceLastScan = now - lastScanTimeRef.current;

      // フレームカウントを増やし、一定間隔でのみスキャン（間隔を500msに延長）
      frameCountRef.current++;
      if (frameCountRef.current % 3 === 0 && timeSinceLastScan >= 500) {
        isScanningRef.current = true;
        try {
          const result = await codeReaderRef.current.decodeFromCanvas(canvas);
          if (result) {
            const code = result.getText();
            processScannedCode(code);
          }
          lastScanTimeRef.current = now;
        } catch (error) {
          if (error instanceof Error && !error.message.includes('NotFoundException')) {
            console.error('スキャンエラー:', error);
          }
        } finally {
          isScanningRef.current = false;
        }
      }

      requestAnimationFrame(scanCode);
    };

    setupCamera().then(() => {
      if (isInitialized) {
        requestAnimationFrame(scanCode);
      }
    });

    return () => {
      stopCamera();
      isInitialized = false;
    };
  }, [initializeCamera, processScannedCode, stopCamera]);

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
            context.drawImage(img, 0, 0, width, height);

            try {
              const result = await codeReaderRef.current.decodeFromImageUrl(canvas.toDataURL());
              if (result) {
                const code = result.getText();
                console.log('画像から検出されたコード:', {
                  text: code,
                  format: result.getBarcodeFormat(),
                  imageSize: { width, height },
                  timestamp: new Date().toISOString()
                });
                processScannedCode(code);
                pauseScanning();
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
            <div className="bg-gray-800 p-4 rounded-lg shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-white">スキャン履歴:</h3>
                <button
                  onClick={() => {
                    setScannedCodes([]);
                    sessionScannedCodesRef.current = new Set();
                  }}
                  className="text-sm px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  履歴をクリア
                </button>
              </div>
              <ul className="space-y-2 max-h-[440px] overflow-y-auto pr-2">
                {scannedCodes.reverse().map((code, index) => (
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