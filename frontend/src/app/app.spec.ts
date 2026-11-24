import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { App } from './app';
import { FfmpegVideoService } from './ffmpeg-video.service';

const createStoryVideo = vi.fn();
const videoRenderer = {
  createStoryVideo,
  terminate: vi.fn(),
};
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('App', () => {
  beforeEach(async () => {
    createStoryVideo.mockReset();
    videoRenderer.terminate.mockReset();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FfmpegVideoService, useValue: videoRenderer },
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
    compiled.querySelector('button')!.click();

    const speechRequest = httpTesting.expectOne('/v1/audio/speech');
    expect(speechRequest.request.body).toEqual({
      input: 'Xin chào! Đây là công cụ tạo giọng nói tiếng Việt bằng VieNeu-TTS.',
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
    const audioInput = compiled.querySelector<HTMLInputElement>('#narration-audio')!;
    const imageInput = compiled.querySelector<HTMLInputElement>('#story-images')!;
    Object.defineProperty(audioInput, 'files', { configurable: true, value: [narration] });
    Object.defineProperty(imageInput, 'files', { configurable: true, value: [image] });
    audioInput.dispatchEvent(new Event('change'));
    imageInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('.video-editor button')!.click();

    await fixture.whenStable();
    fixture.detectChanges();
    expect(createStoryVideo).toHaveBeenCalledWith(
      [image],
      narration,
      'story.wav',
      expect.any(Function)
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
    const audioInput = compiled.querySelector<HTMLInputElement>('#narration-audio')!;
    const imageInput = compiled.querySelector<HTMLInputElement>('#story-images')!;
    Object.defineProperty(audioInput, 'files', {
      configurable: true,
      value: [new File(['audio'], 'story.wav', { type: 'audio/wav' })],
    });
    Object.defineProperty(imageInput, 'files', {
      configurable: true,
      value: [new File(['image'], 'scene.png', { type: 'image/png' })],
    });
    audioInput.dispatchEvent(new Event('change'));
    imageInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('.video-editor button')!.click();

    await fixture.whenStable();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="alert"]')?.textContent).toContain(
      'FFmpeg core failed to initialize'
    );
    expect(compiled.querySelector('[role="status"]')).toBeNull();
    httpTesting.verify();
  });
});
