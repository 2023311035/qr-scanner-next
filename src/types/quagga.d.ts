declare module 'quagga' {
  interface QuaggaConfig {
    inputStream: {
      name: string;
      type: string;
      target: HTMLVideoElement | null;
      constraints: {
        facingMode: string;
        width: { ideal: number };
        height: { ideal: number };
        frameRate: { ideal: number; min: number };
      };
      area?: {
        top: string;
        right: string;
        left: string;
        bottom: string;
      };
    };
    decoder: {
      readers: string[];
      multiple: boolean;
      debug?: {
        drawBoundingBox?: boolean;
        showFrequency?: boolean;
        drawScanline?: boolean;
        showPattern?: boolean;
      };
    };
    locate?: boolean;
    frequency?: number;
    numOfWorkers?: number;
    debug?: {
      drawBoundingBox?: boolean;
      showFrequency?: boolean;
      drawScanline?: boolean;
      showPattern?: boolean;
    };
  }

  interface QuaggaResult {
    codeResult: {
      code: string;
      format: string;
    };
    line: Array<{ x: number; y: number }>;
    angle: number;
    pattern: number[];
    box: Array<{ x: number; y: number }>;
    boxes: Array<Array<{ x: number; y: number }>>;
  }

  interface QuaggaStatic {
    init(config: QuaggaConfig): Promise<void>;
    start(): Promise<void>;
    stop(): void;
    onDetected(callback: (result: QuaggaResult) => void): void;
    onProcessed(callback: (result: QuaggaResult) => void): void;
    canvas: {
      dom: {
        overlay: HTMLCanvasElement;
        image: HTMLCanvasElement;
      };
      ctx: {
        overlay: CanvasRenderingContext2D;
      };
    };
    ImageDebug: {
      drawPath(path: Array<{ x: number; y: number }>, options: { x: number | string; y: number | string }, ctx: CanvasRenderingContext2D, options2: { color: string; lineWidth: number }): void;
    };
  }

  const Quagga: QuaggaStatic;
  export default Quagga;
} 