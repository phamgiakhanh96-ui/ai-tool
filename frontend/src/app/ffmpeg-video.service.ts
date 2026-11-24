import { Injectable } from '@angular/core';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { SubtitleCue } from './subtitle-transcription.service';

const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

interface SubtitleFrame {
  name: string;
  image: Blob;
}

interface SubtitleTimeline {
  frames: SubtitleFrame[];
  manifest: string;
}

@Injectable({ providedIn: 'root' })
export class FfmpegVideoService {
  private ffmpeg: FFmpeg | null = null;

  async createStoryVideo(
    images: File[],
    audio: Blob,
    audioFileName: string,
    onStatus: (status: string) => void,
    subtitleCues: SubtitleCue[] | null = null
  ): Promise<Blob> {
    if (images.length === 0) {
      throw new Error('Chọn ít nhất một ảnh để tạo video.');
    }

    const inputNames = images.map((image, index) => getInputName(image, index));
    const audioInputName = getAudioInputName(audioFileName);
    const audioDuration = await getAudioDuration(audio);
    const imageDuration = audioDuration / images.length;
    const subtitleTimeline = subtitleCues?.length
      ? await createSubtitleTimeline(subtitleCues, audioDuration, onStatus)
      : null;
    const ffmpeg = await this.load(onStatus);

    const filesToDelete: string[] = [];
    try {
      for (const [index, image] of images.entries()) {
        await ffmpeg.writeFile(inputNames[index], await fetchFile(image));
        filesToDelete.push(inputNames[index]);
      }
      await ffmpeg.writeFile(audioInputName, await fetchFile(audio));
      filesToDelete.push(audioInputName);

      if (subtitleTimeline) {
        for (const frame of subtitleTimeline.frames) {
          await ffmpeg.writeFile(frame.name, await fetchFile(frame.image));
          filesToDelete.push(frame.name);
        }
        await ffmpeg.writeFile(
          'subtitle-timeline.ffconcat',
          new TextEncoder().encode(subtitleTimeline.manifest)
        );
        filesToDelete.push('subtitle-timeline.ffconcat');
      }

      onStatus('Đang tạo slideshow và mã hóa MP4...');
      const filters = images.map((_, index) =>
        `[${index}:v:0]scale=1280:720:force_original_aspect_ratio=increase,` +
        `crop=1280:720,zoompan=z='min(zoom+0.0005,1.12)':d=1:s=1280x720:fps=30,` +
        `trim=duration=${imageDuration.toFixed(3)},setpts=PTS-STARTPTS,` +
        `format=yuv420p[v${index}]`
      );
      filters.push(`${images.map((_, index) => `[v${index}]`).join('')}concat=n=${images.length}:v=1:a=0[outv]`);

      let videoOutput = 'outv';
      const args = ['-y', ...inputNames.flatMap((name) => [
        '-loop', '1',
        '-framerate', '30',
        '-t', imageDuration.toFixed(3),
        '-i', name
      ])];
      args.push(
        '-i', audioInputName,
      );
      if (subtitleTimeline) {
        const subtitleStreamIndex = images.length + 1;
        args.push('-f', 'concat', '-safe', '0', '-i', 'subtitle-timeline.ffconcat');
        filters.push(`[${subtitleStreamIndex}:v:0]fps=30,setpts=PTS-STARTPTS[subtitles]`);
        filters.push('[outv][subtitles]overlay=eof_action=pass:shortest=0:format=auto[outvsub]');
        videoOutput = 'outvsub';
      }
      args.push(
        '-filter_complex', filters.join(';'),
        '-map', `[${videoOutput}]`,
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

async function createSubtitleTimeline(
  cues: SubtitleCue[],
  audioDuration: number,
  onStatus: (status: string) => void
): Promise<SubtitleTimeline> {
  onStatus('Đang căn thời gian phụ đề...');
  const validCues = cues
    .map(({ start, end, text }) => ({
      start: Math.max(0, start),
      end: Math.min(audioDuration, end),
      text: text.trim(),
    }))
    .filter(({ start, end, text }) =>
      Number.isFinite(start) && Number.isFinite(end) && end > start && text.length > 0
    );
  if (validCues.length === 0) {
    throw new Error('Không có phụ đề hợp lệ để ghép vào video.');
  }

  const boundaries = [...new Set([0, audioDuration, ...validCues.flatMap(({ start, end }) => [start, end])])]
    .sort((left, right) => left - right);
  const frames: SubtitleFrame[] = [];
  const frameNames = new Map<string, string>();
  const manifestLines = ['ffconcat version 1.0'];
  let lastFrameName = '';

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const duration = Number((end - start).toFixed(3));
    if (duration <= 0) {
      continue;
    }

    const text = validCues
      .filter((cue) => cue.start <= start && cue.end > start)
      .map((cue) => cue.text)
      .join('\n');
    let frameName = frameNames.get(text);
    if (!frameName) {
      frameName = `subtitle-state-${frames.length}.png`;
      frames.push({ name: frameName, image: await renderSubtitleImage(text) });
      frameNames.set(text, frameName);
    }
    manifestLines.push(`file '${frameName}'`, `duration ${duration.toFixed(3)}`);
    lastFrameName = frameName;
  }

  if (!lastFrameName) {
    throw new Error('Không tạo được timeline phụ đề.');
  }
  manifestLines.push(`file '${lastFrameName}'`);
  return { frames, manifest: `${manifestLines.join('\n')}\n` };
}

async function renderSubtitleImage(text: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Không thể tạo hình phụ đề trong trình duyệt.');
  }
  if (text) {
    let fontSize = 40;
    context.font = `bold ${fontSize}px Arial, sans-serif`;
    let lines = wrapSubtitleText(context, text, 1120);
    if (lines.length > 4) {
      fontSize = 32;
      context.font = `bold ${fontSize}px Arial, sans-serif`;
      lines = wrapSubtitleText(context, text, 1120);
    }
    if (lines.length > 6) {
      throw new Error('Một dòng phụ đề quá dài để hiển thị rõ trên video.');
    }

    const lineHeight = fontSize * 1.25;
    const boxHeight = lines.length * lineHeight + 32;
    const boxTop = canvas.height - boxHeight - 28;
    context.fillStyle = 'rgba(0, 0, 0, 0.72)';
    context.fillRect(40, boxTop, canvas.width - 80, boxHeight);
    context.font = `bold ${fontSize}px Arial, sans-serif`;
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    lines.forEach((line, index) => {
      context.fillText(line, canvas.width / 2, boxTop + 16 + (index + 0.5) * lineHeight, 1120);
    });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((image) => {
      if (image) {
        resolve(image);
      } else {
        reject(new Error('Không thể mã hóa hình phụ đề.'));
      }
    }, 'image/png');
  });
}

function wrapSubtitleText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
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
