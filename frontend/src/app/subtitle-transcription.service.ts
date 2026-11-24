import { Injectable } from '@angular/core';
import type { ProgressInfo } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/whisper-small';
const SAMPLE_RATE = 16000;

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class SubtitleTranscriptionService {
  private transcriberPromise: ReturnType<typeof loadTranscriber> | null = null;

  async transcribe(audio: Blob, onStatus: (status: string) => void): Promise<SubtitleCue[]> {
    onStatus('Đang giải mã audio để nhận dạng...');
    const { samples, duration } = await decodeAudio(audio);
    let transcriber: Awaited<ReturnType<typeof loadTranscriber>>;
    try {
      this.transcriberPromise ??= loadTranscriber((progress) => {
        onStatus(formatModelProgress(progress));
      });
      transcriber = await this.transcriberPromise;
    } catch (error) {
      this.transcriberPromise = null;
      throw error;
    }

    onStatus('Đang nhận dạng tiếng Việt bằng Whisper...');
    const result = await transcriber(samples, {
      language: 'vietnamese',
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const cues = (result.chunks ?? [])
      .map(({ timestamp, text }) => ({
        start: Math.max(0, timestamp[0]),
        end: Math.min(duration, timestamp[1]),
        text: text.trim(),
      }))
      .filter(({ start, end, text }) =>
        Number.isFinite(start) && Number.isFinite(end) && end > start && text.length > 0
      );

    if (cues.length > 0) {
      return cues;
    }
    if (result.text.trim()) {
      return [{ start: 0, end: duration, text: result.text.trim() }];
    }
    throw new Error('Whisper không nhận dạng được lời nói trong audio này.');
  }
}

async function loadTranscriber(onProgress: (progress: ProgressInfo) => void) {
  const { pipeline } = await import('@huggingface/transformers');
  return pipeline('automatic-speech-recognition', MODEL_ID, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: onProgress,
  });
}

function formatModelProgress(progress: ProgressInfo): string {
  if (progress.status === 'progress_total') {
    return `Đang tải model Whisper: ${Math.floor(progress.progress)}%`;
  }
  if (progress.status === 'ready') {
    return 'Whisper đã sẵn sàng; bắt đầu nhận dạng...';
  }
  if (progress.status === 'download') {
    return 'Đang tải model Whisper lần đầu...';
  }
  return 'Đang khởi tạo model Whisper...';
}

async function decodeAudio(audio: Blob): Promise<{ samples: Float32Array; duration: number }> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await audio.arrayBuffer());
    const frameCount = Math.ceil(decoded.duration * SAMPLE_RATE);
    if (frameCount === 0) {
      throw new Error('File audio không có dữ liệu âm thanh.');
    }

    const resampler = new OfflineAudioContext(1, frameCount, SAMPLE_RATE);
    const source = resampler.createBufferSource();
    source.buffer = decoded;
    source.connect(resampler.destination);
    source.start();
    const resampled = await resampler.startRendering();
    return { samples: resampled.getChannelData(0), duration: decoded.duration };
  } finally {
    await context.close();
  }
}
