// @zxing/browserのBrowserMultiFormatReaderをimport
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

// Workerのメッセージ受信
self.onmessage = async (event: MessageEvent) => {
  const { imageData, width, height } = event.data;
  try {
    // ZXingのリーダーを初期化
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

    // HTMLCanvasElementを使ってImageDataを描画
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context取得失敗');
    const imgData = new ImageData(new Uint8ClampedArray(imageData), width, height);
    ctx.putImageData(imgData, 0, 0);

    // OffscreenCanvasからHTMLCanvasElementへ変換
    const htmlCanvas = document.createElement('canvas');
    htmlCanvas.width = width;
    htmlCanvas.height = height;
    const htmlCtx = htmlCanvas.getContext('2d');
    if (!htmlCtx) throw new Error('HTMLCanvas context取得失敗');
    htmlCtx.drawImage(canvas as any, 0, 0);

    // decodeFromCanvasでデコード
    const result = await codeReader.decodeFromCanvas(htmlCanvas);
    if (result) {
      self.postMessage({ result: result.getText(), format: result.getBarcodeFormat() });
    } else {
      self.postMessage({ result: null });
    }
  } catch (e) {
    self.postMessage({ result: null });
  }
}; 