# VieNeu Voice (Angular)

Angular-only frontend for VieNeu-TTS v3 Turbo preset voices. No Express backend is installed or required by this project.

## Run

The [VieNeu-TTS repository](https://github.com/pnnbao97/VieNeu-TTS) and its Python environment must be set up in the sibling `VieNeu-TTS` folder. This tool's `start.bat` starts the API if it is not already running, waits for it to be ready, and then starts Angular:

```powershell
.\start.bat
```

If VieNeu-TTS has not been installed yet, follow its setup guide. For a CUDA-capable NVIDIA GPU, run `uv sync --extra cuda` from the VieNeu-TTS folder; for CPU-only, use `uv sync`. The first run downloads the model.

Open `http://localhost:4200`. The Angular development server proxies `/v1` requests to VieNeu on port 8000, avoiding browser CORS for local development.

The VieNeu API is still required to synthesize audio; the browser frontend cannot load the model itself. The development proxy is not a production proxy.

## Check

```powershell
npm run build
npm test
```
