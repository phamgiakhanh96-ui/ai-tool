import { Injectable } from '@angular/core';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

@Injectable({ providedIn: 'root' })
export class FfmpegVideoService {
  private ffmpeg: FFmpeg | null = null;

  async createStoryVideo(
    images: File[],
    audio: Blob,
    audioFileName: string,
    onStatus: (status: string) => void
  ): Promise<Blob> {
    if (images.length === 0) {
      throw new Error('Chọn ít nhất một ảnh để tạo video.');
    }

    const inputNames = images.map((image, index) => getInputName(image, index));
    const audioInputName = getAudioInputName(audioFileName);
    const audioDuration = await getAudioDuration(audio);
    const imageDuration = audioDuration / images.length;
    const ffmpeg = await this.load(onStatus);

    const filesToDelete: string[] = [];
    try {
      for (const [index, image] of images.entries()) {
        await ffmpeg.writeFile(inputNames[index], await fetchFile(image));
        filesToDelete.push(inputNames[index]);
      }
      await ffmpeg.writeFile(audioInputName, await fetchFile(audio));
      filesToDelete.push(audioInputName);

      onStatus('Đang tạo slideshow và mã hóa MP4...');
      const filters = images.map((_, index) =>
        `[${index}:v:0]scale=1280:720:force_original_aspect_ratio=increase,` +
        `crop=1280:720,zoompan=z='min(zoom+0.0005,1.12)':d=1:s=1280x720:fps=30,` +
        `trim=duration=${imageDuration.toFixed(3)},setpts=PTS-STARTPTS,` +
        `format=yuv420p[v${index}]`
      );
      filters.push(`${images.map((_, index) => `[v${index}]`).join('')}concat=n=${images.length}:v=1:a=0[outv]`);

      const args = ['-y', ...inputNames.flatMap((name) => [
        '-loop', '1',
        '-framerate', '30',
        '-t', imageDuration.toFixed(3),
        '-i', name
      ])];
      args.push(
        '-i', audioInputName,
        '-filter_complex', filters.join(';'),
        '-map', '[outv]',
        '-map', `${images.length}:a:0`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '26',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        'movie.mp4'
      );

      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error('FFmpeg không thể tạo video từ các ảnh này.');
      }
      filesToDelete.push('movie.mp4');

      const output = await ffmpeg.readFile('movie.mp4');
      if (typeof output === 'string') {
        throw new Error('FFmpeg trả về dữ liệu video không hợp lệ.');
      }
      const bytes = new Uint8Array(output.byteLength);
      bytes.set(output);
      return new Blob([bytes.buffer], { type: 'video/mp4' });
    } finally {
      for (const fileName of filesToDelete) {
        await ffmpeg.deleteFile(fileName);
      }
    }
  }

  terminate(): void {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
  }

  private async load(onStatus: (status: string) => void): Promise<FFmpeg> {
    if (this.ffmpeg?.loaded) {
      return this.ffmpeg;
    }

    onStatus('Đang tải FFmpeg.wasm (lần đầu khoảng 30 MB)...');
    const [{ FFmpeg }, { toBlobURL: createBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util')
    ]);
    const ffmpeg = new FFmpeg();
    try {
      await ffmpeg.load({
        coreURL: await createBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await createBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm')
      });
    } catch (error) {
      ffmpeg.terminate();
      throw error;
    }

    this.ffmpeg = ffmpeg;
    return ffmpeg;
  }
}

function getInputName(file: File, index: number): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
    throw new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.');
  }
  return `story-image-${index}.${extension}`;
}

async function getWavDuration(audio: Blob): Promise<number> {
  const buffer = await audio.arrayBuffer();
  const view = new DataView(buffer);
  if (readFourCC(view, 0) !== 'RIFF' || readFourCC(view, 8) !== 'WAVE') {
    return 0;
  }

  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const chunkName = readFourCC(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkData = offset + 8;

    if (chunkName === 'fmt ' && chunkSize >= 16) {
      channels = view.getUint16(chunkData + 2, true);
      sampleRate = view.getUint32(chunkData + 4, true);
      bitsPerSample = view.getUint16(chunkData + 14, true);
    } else if (chunkName === 'data') {
      dataBytes = chunkSize === 0xffffffff
        ? view.byteLength - chunkData
        : Math.min(chunkSize, view.byteLength - chunkData);
      break;
    }

    offset = chunkData + chunkSize + (chunkSize % 2);
  }

  const bytesPerSecond = sampleRate * channels * bitsPerSample / 8;
  return dataBytes && bytesPerSecond ? dataBytes / bytesPerSecond : 0;
}

async function getAudioDuration(audio: Blob): Promise<number> {
  const wavDuration = await getWavDuration(audio);
  if (Number.isFinite(wavDuration) && wavDuration > 0) {
    return wavDuration;
  }

  const url = URL.createObjectURL(audio);
  const player = new Audio();
  player.preload = 'metadata';
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      player.onloadedmetadata = null;
      player.onerror = null;
      player.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
    player.onloadedmetadata = () => {
      const duration = player.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error('Không đọc được thời lượng audio. Hãy dùng file WAV, MP3 hoặc M4A.'));
      }
    };
    player.onerror = () => {
      cleanup();
      reject(new Error('Không đọc được file audio. Hãy dùng WAV, MP3 hoặc M4A.'));
    };
    player.src = url;
  });
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function getAudioInputName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension || !['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac'].includes(extension)) {
    throw new Error('Chỉ hỗ trợ audio WAV, MP3, M4A, AAC, OGG hoặc FLAC.');
  }
  return `narration.${extension}`;
}
