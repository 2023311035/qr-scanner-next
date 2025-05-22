'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

interface CameraDevice {
  deviceId: string;
  label: string;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

        // カメラデバイスの一覧を取得
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices
          .filter(device => device.kind === 'videoinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `カメラ ${device.deviceId.slice(0, 5)}`
          }));

        setAvailableCameras(videoDevices);

        if (videoDevices.length === 0) {
          setCameraError('カメラが見つかりません。デバイスにカメラが接続されているか確認してください。');
          setIsInitializing(false);
          return;
        }

        // デフォルトで最初のカメラを選択
        setSelectedCamera(videoDevices[0].deviceId);
        setIsInitializing(false);
        return;
      } catch (error) {
        console.error(error);
        setCameraError('カメラの初期化に失敗しました');
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
    if (!selectedCamera) return;
    const startCamera = async () => {
      setIsInitializing(true);
      setCameraError('');
      try {
        const constraints = {
          video: {
            deviceId: { exact: selectedCamera },
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
      } catch (error) {
        console.error(error);
        setCameraError('カメラの起動に失敗しました。ブラウザの許可設定を確認してください。');
      }
      setIsInitializing(false);
    };
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedCamera]);

  useEffect(() => {
    let animationFrameId: number;

    const scanQRCode = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code) {
            console.log('QRコードを検出:', code.data);
            if (!scannedCodes.has(code.data)) {
              setScannedCodes(prev => new Set([...prev, code.data]));
              setLastScannedCode(code.data);
              onScanSuccess(code.data);
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(scanQRCode);
    };

    if (!isInitializing && !cameraError) {
      scanQRCode();
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
        {availableCameras.length > 1 && (
          <div className="mb-4">
            <label htmlFor="camera-select" className="block text-sm font-medium text-gray-300 mb-2">
              カメラを選択
            </label>
            <select
              id="camera-select"
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="w-full p-2 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-800 text-white"
            >
              {availableCameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label}
                </option>
              ))}
            </select>
          </div>
        )}
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
        <div className="relative rounded-lg overflow-hidden shadow-md bg-gray-800">
          <video
            ref={videoRef}
            className="w-full"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="hidden"
          />
        </div>
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
          <h3 className="text-lg font-semibold mb-3 text-white">スキャン履歴:</h3>
          <ul className="space-y-2">
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