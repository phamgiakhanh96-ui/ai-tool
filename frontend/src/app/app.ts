import { HttpClient } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
  protected text = 'Xin chào! Đây là công cụ tạo giọng nói tiếng Việt bằng VieNeu-TTS.';
  protected readonly voices = signal<Voice[]>([]);
  protected readonly selectedVoice = signal('');
  protected readonly loadingVoices = signal(true);
  protected readonly generating = signal(false);
  protected readonly error = signal('');
  protected readonly audioUrl = signal('');

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
  }

  protected generateSpeech(): void {
    const input = this.text.trim();
    const voice = this.selectedVoice();
    if (!input || !voice || this.generating()) {
      return;
    }

    this.error.set('');
    this.generating.set(true);
    this.clearAudio();
    this.http.post('/v1/audio/speech', { input, voice, response_format: 'wav' }, { responseType: 'blob' }).subscribe({
      next: (audio) => {
        this.audioUrl.set(URL.createObjectURL(audio));
        this.generating.set(false);
      },
      error: () => {
        this.error.set('Không tạo được audio. Hãy kiểm tra VieNeu server và thử lại.');
        this.generating.set(false);
      }
    });
  }

  private clearAudio(): void {
    const currentAudioUrl = this.audioUrl();
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      this.audioUrl.set('');
    }
  }
}
