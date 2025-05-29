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
    };
    decoder: {
      readers: string[];
      multiple: boolean;
    };
  }

  interface QuaggaResult {
    codeResult: {
      code: string;
      format: string;
    };
  }

  interface QuaggaStatic {
    init(config: QuaggaConfig): Promise<void>;
    start(): Promise<void>;
    stop(): void;
    onDetected(callback: (result: QuaggaResult) => void): void;
  }

  const Quagga: QuaggaStatic;
  export default Quagga;
} 