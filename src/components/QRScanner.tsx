'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import Quagga from 'quagga';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

interface QRCodeLocation {
  topLeftCorner: { x: number; y: number };
  topRightCorner: { x: number; y: number };
  bottomRightCorner: { x: number; y: number };
  bottomLeftCorner: { x: number; y: number };
}

interface ZBarResult {
  data: string;
  location?: QRCodeLocation;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedCodes, setLastScannedCodes] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zbarScannerRef = useRef<{ scanImageData: (imageData: ImageData) => Promise<ZBarResult[]> } | null>(null);

  useEffect(() => {
    // zbar.wasmのCDNスクリプトを動的に読み込む
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/zbar.wasm@latest/dist/zbar.js';
    script.async = true;
    document.body.appendChild(script);
    // スクリプト読み込み後にzbarScannerを初期化
    script.onload = async () => {
      if (window.ZBarWasm) {
        zbarScannerRef.current = await (window.ZBarWasm as { createScanner: () => Promise<{ scanImageData: (imageData: ImageData) => Promise<ZBarResult[]> }> }).createScanner();
      }
    };
    return () => {
      document.body.removeChild(script);
      zbarScannerRef.current = null;
    };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          if (context) {
            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            // まずjsQRでQRコードのスキャン
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });
            if (code) {
              if (!scannedCodes.has(code.data)) {
                setScannedCodes(prev => {
                  const arr = Array.from(prev);
                  arr.push(code.data);
                  return new Set(arr.slice(-10));
                });
                setLastScannedCodes([code.data]);
                onScanSuccess(code.data);
              }
            } else {
              // jsQRで見つからなければzbar.wasmで複数検出
              if (window.ZBarWasm) {
                const scanner = await (window.ZBarWasm as { createScanner: () => Promise<{ scanImageData: (imageData: ImageData) => Promise<ZBarResult[]> }> }).createScanner();
                const results = await scanner.scanImageData(imageData);
                const newCodes: string[] = [];
                if (results && results.length > 0) {
                  results.forEach((result: ZBarResult) => {
                    if (!scannedCodes.has(result.data)) {
                      setScannedCodes(prev => {
                        const arr = Array.from(prev);
                        arr.push(result.data);
                        return new Set(arr.slice(-10));
                      });
                      newCodes.push(result.data);
                      onScanSuccess(result.data);
                    }
                  });
                  if (newCodes.length > 0) {
                    setLastScannedCodes(newCodes);
                  }
                }
              }
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

  useEffect(() => {
    const initializeCamera = async () => {
      try {
        setIsInitializing(true);
        setCameraError('');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('お使いのブラウザはカメラへのアクセスをサポートしていません。');
          setIsInitializing(false);
          return;
        }

        // まずカメラのアクセス権限を確認
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 60, min: 30 }
            }
          });
          stream.getTracks().forEach(track => track.stop()); // テスト用のストリームを停止
        } catch {
          setCameraError('カメラへのアクセスが拒否されました。ブラウザの設定でカメラの使用を許可してください。');
          setIsInitializing(false);
          return;
        }

        // Quaggaの初期化
        try {
          await Quagga.init({
            inputStream: {
              name: "Live",
              type: "LiveStream",
              target: videoRef.current,
              constraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 60, min: 30 }
              },
            },
            decoder: {
              readers: [
                "ean_reader",
                "ean_8_reader",
                "code_128_reader",
                "code_39_reader",
                "upc_reader",
                "upc_e_reader"
              ],
              multiple: true
            }
          });

          // バーコード検出イベントのリスナー
          Quagga.onDetected((result) => {
            const code = result.codeResult.code;
            if (!scannedCodes.has(code)) {
              setScannedCodes(prev => {
                const arr = Array.from(prev);
                arr.push(code);
                return new Set(arr.slice(-10));
              });
              setLastScannedCodes([code]);
              onScanSuccess(code);
            }
          });

          // Quaggaの開始
          await Quagga.start();
          setIsInitializing(false);
        } catch (err) {
          console.error('Quagga initialization error:', err);
          setCameraError('カメラの初期化に失敗しました。ブラウザを再読み込みして再度お試しください。');
          setIsInitializing(false);
        }
      } catch (err) {
        console.error('Camera initialization error:', err);
        setCameraError('予期せぬエラーが発生しました。ブラウザを再読み込みして再度お試しください。');
        setIsInitializing(false);
      }
    };

    initializeCamera();

    return () => {
      Quagga.stop();
    };
  }, [scannedCodes, onScanSuccess]);

  useEffect(() => {
    let animationFrameId: number;
    let lastScanTime = 0;

    const scanCodes = async () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
          const currentTime = Date.now();
          if (currentTime - lastScanTime < 50) {
            animationFrameId = requestAnimationFrame(scanCodes);
            return;
          }
          lastScanTime = currentTime;

          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;
          const scale = Math.min(window.innerWidth / videoWidth, window.innerHeight / videoHeight) * 0.8;
          canvas.width = videoWidth * scale;
          canvas.height = videoHeight * scale;

          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

          const contrast = 1.15;
          const brightness = 1.08;
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = ((imageData.data[i] - 128) * contrast + 128) * brightness;
            imageData.data[i + 1] = ((imageData.data[i + 1] - 128) * contrast + 128) * brightness;
            imageData.data[i + 2] = ((imageData.data[i + 2] - 128) * contrast + 128) * brightness;
          }
          context.putImageData(imageData, 0, 0);

          const newCodes: string[] = [];
          const newLocations: QRCodeLocation[] = [];

          // QRコードの検出
          if (zbarScannerRef.current) {
            try {
              const results = await zbarScannerRef.current.scanImageData(imageData);
              if (results && results.length > 0) {
                results.forEach((result: ZBarResult) => {
                  if (!scannedCodes.has(result.data)) {
                    newCodes.push(result.data);
                  }
                  if (result.location) {
                    newLocations.push(result.location);
                  }
                });
              }
            } catch (error) {
              console.error('ZBar scanning error:', error);
            }
          }

          if (newCodes.length === 0) {
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });
            if (code && !scannedCodes.has(code.data)) {
              newCodes.push(code.data);
              if (code.location) {
                newLocations.push(code.location);
              }
            }
          }

          if (newCodes.length > 0) {
            setScannedCodes(prev => {
              const arr = Array.from(prev);
              arr.push(...newCodes);
              return new Set(arr.slice(-10));
            });
            setLastScannedCodes(newCodes);
            newCodes.forEach(code => onScanSuccess(code));
          }

          if (newLocations.length > 0) {
            context.save();
            newLocations.forEach((location: QRCodeLocation) => {
              context.strokeStyle = 'red';
              context.lineWidth = 4;
              context.beginPath();
              context.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
              context.lineTo(location.topRightCorner.x, location.topRightCorner.y);
              context.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
              context.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
              context.closePath();
              context.stroke();
            });
            context.restore();
          }
        }
      }
      animationFrameId = requestAnimationFrame(scanCodes);
    };

    if (!isInitializing && !cameraError) {
      scanCodes();
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isInitializing, cameraError, scannedCodes, onScanSuccess]);

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