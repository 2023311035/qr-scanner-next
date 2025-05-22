'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { BrowserBarcodeReader, NotFoundException } from '@zxing/library';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const barcodeReaderRef = useRef<BrowserBarcodeReader | null>(null);

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
            
            // QRコードのスキャン
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
            if (qrCode) {
              if (!scannedCodes.has(qrCode.data)) {
                setScannedCodes(prev => {
                  const arr = Array.from(prev);
                  arr.push(qrCode.data);
                  return new Set(arr.slice(-10));
                });
                setLastScannedCode(qrCode.data);
                onScanSuccess(qrCode.data);
              }
            } else if (barcodeReaderRef.current) {
              // バーコードのスキャン
              try {
                const imageUrl = canvas.toDataURL();
                const result = await barcodeReaderRef.current.decodeFromImage(undefined, imageUrl);
                if (result && !scannedCodes.has(result.getText())) {
                  setScannedCodes(prev => {
                    const arr = Array.from(prev);
                    arr.push(result.getText());
                    return new Set(arr.slice(-10));
                  });
                  setLastScannedCode(result.getText());
                  onScanSuccess(result.getText());
                }
              } catch (e) {
                if (!(e instanceof NotFoundException)) {
                  console.error('バーコードの読み取りに失敗しました');
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

        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          await videoRef.current.play();
        }
        setIsInitializing(false);
      } catch {
        setCameraError('カメラの起動に失敗しました。ブラウザの許可設定を確認してください。');
        setIsInitializing(false);
      }
    };
    initializeCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    barcodeReaderRef.current = new BrowserBarcodeReader();
    return () => {
      barcodeReaderRef.current?.reset();
    };
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    const scanCodes = async () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          // まずjsQRでQRコードを試す
          const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
          if (qrCode) {
            if (!scannedCodes.has(qrCode.data)) {
              setScannedCodes(prev => {
                const arr = Array.from(prev);
                arr.push(qrCode.data);
                return new Set(arr.slice(-10));
              });
              setLastScannedCode(qrCode.data);
              onScanSuccess(qrCode.data);
            }
          } else if (barcodeReaderRef.current) {
            // QRコードがなければ1次元バーコードを試す
            try {
              const imageUrl = canvas.toDataURL();
              const result = await barcodeReaderRef.current.decodeFromImage(undefined, imageUrl);
              if (result && !scannedCodes.has(result.getText())) {
                setScannedCodes(prev => {
                  const arr = Array.from(prev);
                  arr.push(result.getText());
                  return new Set(arr.slice(-10));
                });
                setLastScannedCode(result.getText());
                onScanSuccess(result.getText());
              }
            } catch (e) {
              if (!(e instanceof NotFoundException)) {
                // 何か他のエラーがあれば無視
              }
            }
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
        <h2 className="text-2xl font-bold text-white mb-4">QRコードスキャナー</h2>
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
          <div className="relative rounded-lg overflow-hidden shadow-md bg-gray-800">
            <video
              ref={videoRef}
              className="w-full h-64 object-cover"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="hidden"
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
        {lastScannedCode && (
          <div className="p-4 bg-gray-800 border border-green-700 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-2 text-green-400">最新のスキャン結果:</h3>
            {isValidUrl(lastScannedCode) ? (
              <a 
                href={lastScannedCode} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 break-all hover:underline"
              >
                {lastScannedCode}
              </a>
            ) : (
              <p className="break-all text-gray-300">{lastScannedCode}</p>
            )}
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