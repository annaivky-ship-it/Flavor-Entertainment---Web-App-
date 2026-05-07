/**
 * On-device liveness check using face-api.js.
 *
 * Captures three frames from the camera with 1-second gaps:
 *   1. eyes-open  (initial)
 *   2. eyes-closed (blink)
 *   3. eyes-open  (recover)
 *
 * Computes EAR (eye aspect ratio) per frame to confirm a real blink occurred,
 * extracts a 128-dim face descriptor on the final frame, and estimates age.
 *
 * Important guarantees:
 *   - Models are loaded from /models/ (committed in public/models/)
 *   - No image, frame, or canvas data ever leaves the device
 *   - Only `{ embedding, livenessScore, ageEstimate }` are returned
 *
 * Errors are typed so the UI can show specific copy:
 *   NoFaceDetected | MultipleFacesDetected | BlinkNotDetected | CameraPermissionDenied
 */

import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';
const FRAME_GAP_MS = 1000;
const EAR_BLINK_THRESHOLD = 0.21;     // < this means eyes mostly closed
const EAR_OPEN_THRESHOLD = 0.27;      // > this means eyes mostly open

export type LivenessErrorCode =
  | 'NoFaceDetected'
  | 'MultipleFacesDetected'
  | 'BlinkNotDetected'
  | 'CameraPermissionDenied'
  | 'ModelLoadFailed';

export class LivenessError extends Error {
  code: LivenessErrorCode;
  constructor(code: LivenessErrorCode, message?: string) {
    super(message || code);
    this.code = code;
    this.name = 'LivenessError';
  }
}

let modelsLoaded = false;

export async function loadLivenessModels(): Promise<void> {
  if (modelsLoaded) return;
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  } catch (err) {
    throw new LivenessError('ModelLoadFailed', `Failed to load face-api.js models: ${(err as Error).message}`);
  }
}

interface DetectionResult {
  detection: faceapi.WithFaceDescriptor<
    faceapi.WithAge<faceapi.WithGender<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>>
  >;
}

async function detectOnce(video: HTMLVideoElement): Promise<DetectionResult> {
  const detections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors()
    .withAgeAndGender();

  if (detections.length === 0) throw new LivenessError('NoFaceDetected');
  if (detections.length > 1) throw new LivenessError('MultipleFacesDetected');
  return { detection: detections[0] as DetectionResult['detection'] };
}

/**
 * Eye aspect ratio (Soukupová & Čech, 2016): geometric measure of how open
 * the eye is. Values around 0.30 = open, 0.10–0.15 = closed.
 */
function eyeAspectRatio(eyePoints: faceapi.Point[]): number {
  // 6 landmarks per eye (face-api.js 68-point model)
  const dist = (a: faceapi.Point, b: faceapi.Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const a = dist(eyePoints[1], eyePoints[5]);
  const b = dist(eyePoints[2], eyePoints[4]);
  const c = dist(eyePoints[0], eyePoints[3]);
  return (a + b) / (2.0 * c);
}

function averageEAR(landmarks: faceapi.FaceLandmarks68): number {
  const left = landmarks.getLeftEye();
  const right = landmarks.getRightEye();
  return (eyeAspectRatio(left) + eyeAspectRatio(right)) / 2;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface LivenessResult {
  embedding: number[];      // 128-dim face descriptor
  livenessScore: number;    // 0..1, derived from how clean the blink was
  ageEstimate: number;      // years
}

export async function runLivenessCheck(
  video: HTMLVideoElement,
  onProgress?: (step: 'open1' | 'blink' | 'open2', message: string) => void,
): Promise<LivenessResult> {
  await loadLivenessModels();

  // Frame 1: eyes open
  onProgress?.('open1', 'Look at the camera with eyes open');
  await delay(500);
  const f1 = await detectOnce(video);
  const ear1 = averageEAR(f1.detection.landmarks);

  // Frame 2: blink
  onProgress?.('blink', 'Now blink slowly');
  await delay(FRAME_GAP_MS);
  const f2 = await detectOnce(video);
  const ear2 = averageEAR(f2.detection.landmarks);

  // Frame 3: eyes open again
  onProgress?.('open2', 'Look at the camera again');
  await delay(FRAME_GAP_MS);
  const f3 = await detectOnce(video);
  const ear3 = averageEAR(f3.detection.landmarks);

  // Validate the blink pattern
  const openedThenClosedThenOpened =
    ear1 >= EAR_OPEN_THRESHOLD && ear2 <= EAR_BLINK_THRESHOLD && ear3 >= EAR_OPEN_THRESHOLD;

  if (!openedThenClosedThenOpened) {
    throw new LivenessError(
      'BlinkNotDetected',
      `Expected open→closed→open pattern; got EAR ${ear1.toFixed(2)} → ${ear2.toFixed(2)} → ${ear3.toFixed(2)}.`
    );
  }

  // Liveness score: how confident are we in the blink? 0 if EAR delta tiny, 1 if delta huge.
  const blinkDelta = Math.min(ear1, ear3) - ear2;
  const livenessScore = Math.max(0, Math.min(1, blinkDelta / 0.15));

  const finalDescriptor = Array.from(f3.detection.descriptor);
  const ageEstimate = Math.round(f3.detection.age);

  return { embedding: finalDescriptor, livenessScore, ageEstimate };
}

/**
 * Open the user's camera and attach to a <video> element. Caller must call
 * `.getTracks().forEach(t => t.stop())` to release the camera.
 */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise<void>(resolve => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });
    return stream;
  } catch (err) {
    const error = err as Error;
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new LivenessError('CameraPermissionDenied');
    }
    throw error;
  }
}
