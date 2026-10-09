import cvModule from '@techstark/opencv-js';
import { proposeWalls } from './recognition';

let loaded: Promise<{cv: any}> | undefined;
function getCV() {
  // Emscripten's module is a self-resolving thenable. Resolving it directly
  // causes infinite Promise assimilation; wrap it in an ordinary object.
  if (!loaded) loaded = new Promise(resolve => {
    const module = cvModule as any;
    const ready = (cv: any) => resolve({cv});
    if (module.Mat) ready(module);
    else if (typeof module.then === 'function') module.then(ready);
    else module.onRuntimeInitialized = () => ready(module);
  });
  return loaded;
}

self.onmessage = async ({ data }) => {
  const { id, operation, width, height, buffer, corners, outputWidth, outputHeight } = data;
  const owned: any[] = [];
  const keep = <T>(value: T): T => { owned.push(value); return value; };
  try {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 16_000_000) throw new Error('Afbeelding te groot. Gebruik een kleinere uitsnede.');
    const {cv} = await getCV();
    const src = keep(cv.matFromImageData({ data: new Uint8ClampedArray(buffer), width, height }));
    if (operation === 'rectify') {
      if (!corners || corners.length !== 4 || !Number.isInteger(outputWidth) || !Number.isInteger(outputHeight) || outputWidth <= 0 || outputHeight <= 0 || outputWidth * outputHeight > 16_000_000) throw new Error('Ongeldige uitsnede.');
      const from = keep(cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p: any) => [p.x, p.y])));
      const to = keep(cv.matFromArray(4, 1, cv.CV_32FC2, [0,0,outputWidth,0,outputWidth,outputHeight,0,outputHeight]));
      const matrix = keep(cv.getPerspectiveTransform(from, to)), output = keep(new cv.Mat());
      cv.warpPerspective(src, output, matrix, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255,255,255,255));
      const pixels = new Uint8ClampedArray(output.data);
      self.postMessage({ id, width: outputWidth, height: outputHeight, buffer: pixels.buffer }, { transfer: [pixels.buffer] });
    } else {
      const gray = keep(new cv.Mat()), binary = keep(new cv.Mat()), edges = keep(new cv.Mat()), lines = keep(new cv.Mat());
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 9);
      cv.Canny(binary, edges, 50, 160);
      const minLength = Math.max(14, Math.min(width,height)*.014);
      cv.HoughLinesP(edges, lines, 1, Math.PI/720, 22, minLength, 2);
      if (lines.rows > 8000) throw new Error('Te veel lijnen. Snijd de afbeelding bij tot de plattegrond.');
      const segments = [];
      for (let i=0;i<lines.rows;i++) { const [x1,y1,x2,y2] = lines.data32S.subarray(i*4,i*4+4); segments.push({start:{x:x1,y:y1},end:{x:x2,y:y2}}); }
      self.postMessage({ id, candidates: proposeWalls(segments,width,height) });
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Analyse mislukt. Je kunt de onderlegger handmatig overtrekken.' });
  } finally { for (const mat of owned.reverse()) mat.delete(); }
};
