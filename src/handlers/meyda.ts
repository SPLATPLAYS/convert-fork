import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Meyda from "meyda";

class meydaHandler implements FormatHandler {

  public name: string = "meyda";
  public supportedFormats: FileFormat[] = [
    {
      name: "Portable Network Graphics",
      format: "png",
      extension: "png",
      mime: "image/png",
      from: false,
      to: true,
      internal: "png"
    },
    {
      name: "Joint Photographic Experts Group JFIF",
      format: "jpeg",
      extension: "jpg",
      mime: "image/jpeg",
      from: false,
      to: true,
      internal: "jpeg"
    },
    {
      name: "WebP",
      format: "webp",
      extension: "webp",
      mime: "image/webp",
      from: false,
      to: true,
      internal: "webp"
    }
  ];
  public ready: boolean = false;

  #audioContext?: AudioContext;
  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  async init () {

    const dummy = document.createElement("audio");
    if (dummy.canPlayType("audio/wav")) this.supportedFormats.push({
      name: "Waveform Audio File Format",
      format: "wav",
      extension: "wav",
      mime: "audio/wav",
      from: true,
      to: false,
      internal: "wav"
    });
    if (dummy.canPlayType("audio/mpeg")) this.supportedFormats.push({
      name: "MP3 Audio",
      format: "mp3",
      extension: "mp3",
      mime: "audio/mpeg",
      from: true,
      to: false,
      internal: "mp3"
    });
    if (dummy.canPlayType("audio/ogg")) this.supportedFormats.push({
      name: "Ogg Audio",
      format: "ogg",
      extension: "ogg",
      mime: "audio/ogg",
      from: true,
      to: false,
      internal: "ogg"
    });
    if (dummy.canPlayType("audio/flac")) this.supportedFormats.push({
      name: "Free Lossless Audio Codec",
      format: "flac",
      extension: "flac",
      mime: "audio/flac",
      from: true,
      to: false,
      internal: "flac"
    });
    dummy.remove();

    this.#audioContext = new AudioContext();

    this.#canvas = document.createElement("canvas");
    const ctx = this.#canvas.getContext("2d");
    if (!ctx) throw "Failed to create 2D rendering context.";
    this.#ctx = ctx;

    this.ready = true;

  }

  async doConvert (
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (
      !this.ready
      || !this.#audioContext
      || !this.#canvas
      || !this.#ctx
    ) {
      throw "Handler not initialized!";
    }
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {

      const inputBytes = new Uint8Array(inputFile.bytes);
      const audioData = await this.#audioContext.decodeAudioData(inputBytes.buffer);

      Meyda.bufferSize = 2048;
      Meyda.sampleRate = audioData.sampleRate;
      const samples = audioData.getChannelData(0);
      const imageWidth = Math.floor(samples.length / Meyda.bufferSize);
      const imageHeight = Meyda.bufferSize / 2;

      this.#canvas.width = imageWidth;
      this.#canvas.height = imageHeight;

      for (let i = 0; i < imageWidth; i ++) {
        const frame = samples.slice(i * Meyda.bufferSize, (i + 1) * Meyda.bufferSize);
        const filtered = Meyda.windowing(frame, "hanning");
        const spectrum = Meyda.extract("amplitudeSpectrum", filtered);
        if (!(spectrum instanceof Float32Array)) throw "Failed to extract audio features!";
        const pixels = new Uint8ClampedArray(spectrum.length * 4);
        for (let i = 0; i < spectrum.length; i ++) {
          const int = Math.floor(spectrum[i] * 16777215);
          pixels[i * 4] = int & 0xFF;
          pixels[i * 4 + 1] = (int >> 8) & 0xFF;
          pixels[i * 4 + 2] = (int >> 16) & 0xFF;
          pixels[i * 4 + 3] = 0xFF;
        }
        const imageData = new ImageData(pixels as ImageDataArray, 1, imageHeight);
        this.#ctx.putImageData(imageData, i, 0);
      }

      const bytes: Uint8Array = await new Promise((resolve, reject) => {
        this.#canvas!.toBlob((blob) => {
          if (!blob) return reject("Canvas output failed.");
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        }, outputFormat.mime);
      });
      const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;
      outputFiles.push({ bytes, name });

    }

    return outputFiles;
  }

}

export default meydaHandler;