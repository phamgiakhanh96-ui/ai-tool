# VieNeu Voice (Angular)

Angular-only frontend for VieNeu-TTS v3 Turbo preset voices and browser-based video assembly with FFmpeg.wasm. No Express backend is installed or required by this project.

## Run

The [VieNeu-TTS repository](https://github.com/pnnbao97/VieNeu-TTS) and its Python environment should be set up in the sibling `VieNeu-TTS` folder. Double-click `start.bat` or run it from PowerShell; it installs frontend packages if needed, starts the API when available, launches Angular, and opens the app in your browser:

```powershell
.\start.bat
```

If VieNeu-TTS is unavailable, the app still starts and you can upload narration audio to make a video; text-to-speech requires VieNeu-TTS. For a CUDA-capable NVIDIA GPU, run `uv sync --extra cuda` from the VieNeu-TTS folder; for CPU-only, use `uv sync`. The first run downloads the model.

The Angular development server proxies `/v1` requests to VieNeu on port 8000, avoiding browser CORS for local development. Keep the launcher window open while using the app.

The workflow has three collapsible steps: create or upload narration, select images and optionally enable Vietnamese automatic subtitles, then render the video. Subtitles use Whisper Small locally in the browser; its model downloads on first use (several hundred MB), and audio is not uploaded to a server. FFmpeg.wasm loads its single-thread core from jsDelivr on the first render (about 30 MB). Images receive a subtle zoom effect and are timed evenly to the audio. Processing happens in the browser and can be slow or memory-intensive for large files. Output is 720p H.264/AAC.

The VieNeu API is still required to synthesize audio; the browser frontend cannot load the model itself. The development proxy is not a production proxy.

## Check

```powershell
npm run build
npm test
```

Chay tool

Set-Location 'C:\Users\Admin\Desktop\source code\ai-tool\frontend'
.\start.bat
