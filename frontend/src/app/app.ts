import { HttpClient } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FfmpegVideoService } from './ffmpeg-video.service';

interface Voice {
  id: string;
  name: string;
  description: string;
  gender: string;
  featured?: boolean;
}

interface VoiceListResponse {
  data: Voice[];
}

@Component({
  imports: [FormsModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly videoRenderer = inject(FfmpegVideoService);
  private narrationAudio: Blob | null = null;
  private narrationFileName = '';
  protected text = 'Xin chào! Đây là công cụ tạo giọng nói tiếng Việt bằng VieNeu-TTS.';
  protected readonly voices = signal<Voice[]>([]);
  protected readonly selectedVoice = signal('');
  protected readonly loadingVoices = signal(true);
  protected readonly generating = signal(false);
  protected readonly error = signal('');
  protected readonly audioUrl = signal('');
  protected readonly audioFileName = signal('');
  protected readonly storyImages = signal<File[]>([]);
  protected readonly rendering = signal(false);
  protected readonly renderStatus = signal('');
  protected readonly renderError = signal('');
  protected readonly movieUrl = signal('');

  protected get selectedVoiceDescription(): string {
    return this.voices().find((voice) => voice.id === this.selectedVoice())?.description ?? '';
  }

  ngOnInit(): void {
    this.http.get<VoiceListResponse>('/v1/voices').subscribe({
      next: ({ data: voices }) => {
        this.voices.set(voices);
        this.selectedVoice.set(voices[0]?.id ?? '');
        this.loadingVoices.set(false);
      },
      error: () => {
        this.error.set('Không kết nối được VieNeu-TTS. Hãy khởi động VieNeu server rồi tải lại trang.');
        this.loadingVoices.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.clearAudio();
    this.clearMovie();
    this.videoRenderer.terminate();
  }

  protected generateSpeech(): void {
    const input = this.text.trim();
    const voice = this.selectedVoice();
    if (!input || !voice || this.generating()) {
      return;
    }

    this.error.set('');
    this.generating.set(true);
    this.narrationAudio = null;
    this.narrationFileName = '';
    this.audioFileName.set('');
    this.clearAudio();
    this.clearMovie();
    this.http.post('/v1/audio/speech', { input, voice, response_format: 'wav' }, { responseType: 'blob' }).subscribe({
      next: (audio) => {
        this.setNarrationAudio(audio, 'vieneu-speech.wav');
        this.generating.set(false);
      },
      error: () => {
        this.error.set('Không tạo được audio. Hãy kiểm tra VieNeu server và thử lại.');
        this.generating.set(false);
      }
    });
  }

  protected onNarrationSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.setNarrationAudio(file, file.name);
    this.error.set('');
    this.renderError.set('');
  }

  protected onStoryImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.storyImages.set(Array.from(input.files ?? []));
    input.value = '';
    this.renderError.set('');
    this.clearMovie();
  }

  protected async renderMovie(): Promise<void> {
    const audio = this.narrationAudio;
    const images = this.storyImages();
    if (!audio || !this.narrationFileName || images.length === 0 || this.rendering()) {
      return;
    }

    this.rendering.set(true);
    this.renderError.set('');
    this.renderStatus.set('');
    this.clearMovie();
    try {
      const movie = await this.videoRenderer.createStoryVideo(
        images,
        audio,
        this.narrationFileName,
        (status) => this.renderStatus.set(status)
      );
      this.movieUrl.set(URL.createObjectURL(movie));
      this.renderStatus.set('Đã ghép xong video.');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Không thể tạo video. Hãy kiểm tra lỗi trong Console của trình duyệt.';
      this.renderStatus.set('');
      this.renderError.set(message);
    } finally {
      this.rendering.set(false);
    }
  }

  private setNarrationAudio(audio: Blob, fileName: string): void {
    this.narrationAudio = audio;
    this.narrationFileName = fileName;
    this.audioFileName.set(fileName);
    this.clearAudio();
    this.clearMovie();
    this.audioUrl.set(URL.createObjectURL(audio));
  }

  private clearAudio(): void {
    const currentAudioUrl = this.audioUrl();
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      this.audioUrl.set('');
    }
  }

  private clearMovie(): void {
    const currentMovieUrl = this.movieUrl();
    if (currentMovieUrl) {
      URL.revokeObjectURL(currentMovieUrl);
      this.movieUrl.set('');
    }
  }
}
