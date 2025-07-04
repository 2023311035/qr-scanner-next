// @zxing/browserのBrowserMultiFormatReaderをimport
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

// Workerのメッセージ受信
self.onmessage = async (event: MessageEvent) => {
  const { imageData, width, height } = event.data;
  console.log('[Worker] 受信', { imageData, width, height });
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

    // imageDataがobject形式の場合も考慮して配列化
    const arr = Array.isArray(imageData)
      ? new Uint8ClampedArray(imageData)
      : new Uint8ClampedArray(Object.values(imageData));
    const imgData = new ImageData(arr, width, height);
    console.log('[Worker] ImageData作成', imgData);

    // HTMLCanvasElementを使ってImageDataを描画
    const htmlCanvas = document.createElement('canvas');
    htmlCanvas.width = width;
    htmlCanvas.height = height;
    const htmlCtx = htmlCanvas.getContext('2d');
    if (!htmlCtx) throw new Error('HTMLCanvas context取得失敗');
    htmlCtx.putImageData(imgData, 0, 0);
    console.log('[Worker] Canvas描画完了');

    // decodeFromCanvasでデコード
    const result = await codeReader.decodeFromCanvas(htmlCanvas);
    if (result) {
      console.log('[Worker] デコード成功', result.getText());
      self.postMessage({ result: result.getText(), format: result.getBarcodeFormat() });
    } else {
      console.log('[Worker] デコード失敗');
      self.postMessage({ result: null });
    }
  } catch (err) {
    console.log('[Worker] 例外発生', err);
    self.postMessage({ result: null });
  }
}; 