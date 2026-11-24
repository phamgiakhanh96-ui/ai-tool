import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
});
