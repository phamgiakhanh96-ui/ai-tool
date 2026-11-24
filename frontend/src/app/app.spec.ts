import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { App } from './app';
import { FfmpegVideoService } from './ffmpeg-video.service';
import { SubtitleTranscriptionService } from './subtitle-transcription.service';

const createStoryVideo = vi.fn();
const transcribeAudio = vi.fn();
const videoRenderer = {
  createStoryVideo,
  terminate: vi.fn(),
};
const subtitleTranscriber = { transcribe: transcribeAudio };
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('App', () => {
  beforeEach(async () => {
    createStoryVideo.mockReset();
    transcribeAudio.mockReset();
    videoRenderer.terminate.mockReset();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FfmpegVideoService, useValue: videoRenderer },
        { provide: SubtitleTranscriptionService, useValue: subtitleTranscriber },
      ],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should load preset voices and submit speech to VieNeu', () => {
    const httpTesting = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    httpTesting.expectOne('/v1/voices').flush({
      object: 'list',
      data: [{ id: 'Mai Anh', name: 'Mai Anh', description: 'Giọng nữ miền Bắc', gender: 'Nữ' }]
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('#generate-audio')!.click();

    const speechRequest = httpTesting.expectOne('/v1/audio/speech');
    expect(speechRequest.request.body).toEqual({
      input: 'Xin chào! Đây là công cụ Làm phim studio siêu đẹp bằng VieNeu-TTS.',
      voice: 'Mai Anh',
      response_format: 'wav'
    });
    speechRequest.flush(new Blob(), { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(compiled.querySelector('[role="alert"]')?.textContent).toContain('Không tạo được audio');
    httpTesting.verify();
  });

  it('should render a video using an uploaded audio file and selected images', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    createStoryVideo.mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }));

    const httpTesting = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    httpTesting.expectOne('/v1/voices').flush({ data: [] });

    const narration = new File(['audio'], 'story.wav', { type: 'audio/wav' });
    const image = new File(['image'], 'scene.png', { type: 'image/png' });
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('#audio-mode-upload')!.click();
    fixture.detectChanges();
    const audioInput = compiled.querySelector<HTMLInputElement>('#narration-audio')!;
    Object.defineProperty(audioInput, 'files', { configurable: true, value: [narration] });
    audioInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.progress-track li.is-complete')).toHaveLength(1);
    expect(compiled.querySelector('.progress-track li.is-current small')?.textContent).toContain('Ảnh');

    const imageInput = compiled.querySelector<HTMLInputElement>('#story-images')!;
    Object.defineProperty(imageInput, 'files', { configurable: true, value: [image] });
    imageInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.progress-track li.is-complete')).toHaveLength(2);
    compiled.querySelector<HTMLButtonElement>('#continue-to-video')!.click();
    fixture.detectChanges();
    expect(compiled.querySelector('.progress-track li.is-current small')?.textContent).toContain('video');
    compiled.querySelector<HTMLButtonElement>('#render-video')!.click();

    await fixture.whenStable();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.progress-track li.is-complete')).toHaveLength(3);
    expect(createStoryVideo).toHaveBeenCalledWith(
      [image],
      narration,
      'story.wav',
      expect.any(Function),
      null
    );
    expect(compiled.querySelector('video')).toBeTruthy();
    httpTesting.verify();
  });

  it('should show FFmpeg worker errors instead of a generic message', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    createStoryVideo.mockRejectedValue('FFmpeg core failed to initialize');

    const httpTesting = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    httpTesting.expectOne('/v1/voices').flush({ data: [] });

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('#audio-mode-upload')!.click();
    fixture.detectChanges();
    const audioInput = compiled.querySelector<HTMLInputElement>('#narration-audio')!;
    Object.defineProperty(audioInput, 'files', {
      configurable: true,
      value: [new File(['audio'], 'story.wav', { type: 'audio/wav' })],
    });
    audioInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const imageInput = compiled.querySelector<HTMLInputElement>('#story-images')!;
    Object.defineProperty(imageInput, 'files', {
      configurable: true,
      value: [new File(['image'], 'scene.png', { type: 'image/png' })],
    });
    imageInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('#continue-to-video')!.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('#render-video')!.click();

    await fixture.whenStable();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="alert"]')?.textContent).toContain(
      'FFmpeg core failed to initialize'
    );
    expect(compiled.querySelector('[role="status"]')).toBeNull();
    httpTesting.verify();
  });

  it('should transcribe audio automatically when subtitles are enabled', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    const cues = [{ start: 0, end: 1, text: 'Xin chào.' }];
    transcribeAudio.mockResolvedValue(cues);
    createStoryVideo.mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }));

    const httpTesting = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    httpTesting.expectOne('/v1/voices').flush({ data: [] });

    const narration = new File(['audio'], 'story.wav', { type: 'audio/wav' });
    const image = new File(['image'], 'scene.png', { type: 'image/png' });
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('#audio-mode-upload')!.click();
    fixture.detectChanges();
    const audioInput = compiled.querySelector<HTMLInputElement>('#narration-audio')!;
    Object.defineProperty(audioInput, 'files', { configurable: true, value: [narration] });
    audioInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const imageInput = compiled.querySelector<HTMLInputElement>('#story-images')!;
    Object.defineProperty(imageInput, 'files', { configurable: true, value: [image] });
    imageInput.dispatchEvent(new Event('change'));
    const subtitleToggle = compiled.querySelector<HTMLInputElement>('#include-subtitles')!;
    subtitleToggle.checked = true;
    subtitleToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('#continue-to-video')!.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('#render-video')!.click();

    await fixture.whenStable();
    fixture.detectChanges();
    expect(transcribeAudio).toHaveBeenCalledWith(narration, expect.any(Function));
    expect(createStoryVideo).toHaveBeenCalledWith(
      [image],
      narration,
      'story.wav',
      expect.any(Function),
      cues
    );
    httpTesting.verify();
  });
});
