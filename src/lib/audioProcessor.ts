export class AudioProcessor {
  private context: AudioContext;
  private analyser: AnalyserNode;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor() {
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => {
        this.chunks.push(e.data);
      };
      this.mediaRecorder.start();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return;
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.chunks = [];
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  async anonymizeAudio(audioBlob: Blob, settings: any): Promise<Blob> {
    // Provide default settings if not present:
    settings.phaseMultiplier = settings.phaseMultiplier ?? 1.0;
    settings.frequencyShiftMultiplier = settings.frequencyShiftMultiplier ?? 1.0;
    settings.harmonicAmount = settings.harmonicAmount ?? 0.0;
    settings.noiseAmount = settings.noiseAmount ?? 0.0;
    settings.timeDistortionAmount = settings.timeDistortionAmount ?? 1.0;
    // frequencyScrambleRange: fraction of FFT size (default: 0.2%).
    settings.frequencyScrambleRange = settings.frequencyScrambleRange ?? 0.002;
  
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
  
    // Debug: Log original audio stats for channel 0.
    const originalChannel = audioBuffer.getChannelData(0);
    console.log('Original Audio Stats:', {
      length: originalChannel.length,
      max: Math.max(...originalChannel),
      min: Math.min(...originalChannel),
      rms: Math.sqrt(originalChannel.reduce((acc, val) => acc + val * val, 0) / originalChannel.length),
    });
  
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
  
    // Create output buffer for processed audio.
    const outputBuffer = offlineContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
  
    // Process each channel iteratively.
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const inputData = audioBuffer.getChannelData(channel);
      const outputData = outputBuffer.getChannelData(channel);
  
      console.log(`Channel ${channel} Stats:`, {
        length: inputData.length,
        max: Math.max(...inputData),
        min: Math.min(...inputData),
        rms: Math.sqrt(inputData.reduce((acc, val) => acc + val * val, 0) / inputData.length),
      });
  
      const chunkSize = 2048;
      // Process the audio in sequential chunks.
      for (let i = 0; i < inputData.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, inputData.length);
        const currentChunkSize = end - i;
        // Create a complex array (length = 2 * chunkSize).
        const fft = new Float32Array(chunkSize * 2);
        for (let k = 0; k < currentChunkSize; k++) {
          fft[2 * k] = inputData[i + k];
          fft[2 * k + 1] = 0;
        }
        // Zero-pad any remaining samples.
        for (let k = currentChunkSize; k < chunkSize; k++) {
          fft[2 * k] = 0;
          fft[2 * k + 1] = 0;
        }
  
        // Debug: Log first chunk (real part) stats before FFT.
        if (i === 0) {
          const realPart: number[] = [];
          for (let k = 0; k < chunkSize; k++) {
            realPart.push(fft[2 * k]);
          }
          console.log('First Chunk Before FFT:', {
            max: Math.max(...realPart),
            min: Math.min(...realPart),
            rms: Math.sqrt(realPart.reduce((acc, val) => acc + val * val, 0) / realPart.length),
          });
        }
  
        this.forwardFFT(fft);
  
        // Debug: Log FFT magnitudes after FFT.
        if (i === 0) {
          const magnitudes: number[] = [];
          for (let j = 0; j < chunkSize; j++) {
            const real = fft[2 * j];
            const imag = fft[2 * j + 1];
            magnitudes.push(Math.sqrt(real * real + imag * imag));
          }
          console.log('First Chunk After FFT:', {
            max: Math.max(...magnitudes),
            min: Math.min(...magnitudes),
            rms: Math.sqrt(magnitudes.reduce((acc, val) => acc + val * val, 0) / magnitudes.length),
          });
        }
  
        // Apply frequency-domain effects.
        for (let j = 0; j < chunkSize; j++) {
          const real = fft[2 * j];
          const imag = fft[2 * j + 1];
          let magnitude = Math.sqrt(real * real + imag * imag);
          let phase = Math.atan2(imag, real);
  
          // Common modifications:
          phase = -phase * settings.phaseMultiplier + Math.PI / 2;
          const freqShift = (j / chunkSize) * 2 * Math.PI;
          phase += freqShift * settings.frequencyShiftMultiplier;
          magnitude *=
            1 +
            Math.sin(j * settings.harmonicAmount) +
            Math.cos(j * settings.harmonicAmount) +
            (Math.random() * settings.noiseAmount);
  
          // === DETERMINISTIC FREQUENCY SCRAMBLING FIX ===
          if (settings.useFrequencyScrambling) {
            const maxOffset = Math.floor(chunkSize * settings.frequencyScrambleRange);
  
            // Generate a deterministic offset in [-maxOffset, +maxOffset].
            // Here, (j * 8273) is just a simple way to change the offset per bin.
            const offset = ((j * 8273) % (2 * maxOffset + 1)) - maxOffset;
            const targetBin = (j + offset + chunkSize) % chunkSize;
  
            fft[2 * targetBin] = magnitude * Math.cos(phase);
            fft[2 * targetBin + 1] = magnitude * Math.sin(phase);
          } else {
            fft[2 * j] = magnitude * Math.cos(phase);
            fft[2 * j + 1] = magnitude * Math.sin(phase);
          }
  
          // Optional additional phase distortion.
          if (settings.useAdditionalPhaseDistortion && j % 2 === 0) {
            fft[2 * j] *= -1;
            fft[2 * j + 1] *= -1;
          }
        }
  
        // Debug: Log FFT stats after effects.
        if (i === 0) {
          const magnitudes: number[] = [];
          for (let j = 0; j < chunkSize; j++) {
            const real = fft[2 * j];
            const imag = fft[2 * j + 1];
            magnitudes.push(Math.sqrt(real * real + imag * imag));
          }
          console.log('First Chunk After Effects:', {
            max: Math.max(...magnitudes),
            min: Math.min(...magnitudes),
            rms: Math.sqrt(magnitudes.reduce((acc, val) => acc + val * val, 0) / magnitudes.length),
          });
        }
  
        this.inverseFFT(fft);
  
        // Debug: Log first chunk stats after inverse FFT.
        if (i === 0) {
          const recovered: number[] = [];
          for (let j = 0; j < chunkSize; j++) {
            recovered.push(fft[2 * j]);
          }
          console.log('First Chunk After Inverse FFT:', {
            max: Math.max(...recovered),
            min: Math.min(...recovered),
            rms: Math.sqrt(recovered.reduce((acc, val) => acc + val * val, 0) / recovered.length),
          });
        }
  
        // Copy the recovered time-domain samples into output.
        for (let j = 0; j < currentChunkSize; j++) {
          let sample = fft[2 * j];
          if (settings.useTimeDistortion) {
            // Normalize the tanh distortion so that ±1 stays ±1.
            sample = Math.tanh(sample * settings.timeDistortionAmount) / Math.tanh(settings.timeDistortionAmount);
          }
          outputData[i + j] = sample;
        }
  
        // Debug: Log output chunk stats.
        if (i === 0) {
          const outputChunk = outputData.slice(0, currentChunkSize);
          console.log('First Output Chunk:', {
            max: Math.max(...outputChunk),
            min: Math.min(...outputChunk),
            rms: Math.sqrt(outputChunk.reduce((acc, val) => acc + val * val, 0) / outputChunk.length),
          });
        }
      }
    }
  
    // Create a source node for the processed buffer and render it.
    const processedSource = offlineContext.createBufferSource();
    processedSource.buffer = outputBuffer;
    processedSource.connect(offlineContext.destination);
    processedSource.start();
  
    const renderedBuffer = await offlineContext.startRendering();
  
    console.log('Final Output Stats:', {
      length: renderedBuffer.getChannelData(0).length,
      max: Math.max(...renderedBuffer.getChannelData(0)),
      min: Math.min(...renderedBuffer.getChannelData(0)),
      rms: Math.sqrt(
        renderedBuffer
          .getChannelData(0)
          .reduce((acc, val) => acc + val * val, 0) / renderedBuffer.getChannelData(0).length
      ),
    });
  
    const wavBlob = this.audioBufferToWav(renderedBuffer);
    return wavBlob;
}

  private forwardFFT(buffer: Float32Array) {
    const N = buffer.length / 2; // Number of complex samples.
    const bits = Math.log2(N);
    // Bit reversal.
    for (let i = 0; i < N; i++) {
      const j = this.reverseBits(i, bits);
      if (j > i) {
        const index1 = 2 * i;
        const index2 = 2 * j;
        const tempReal = buffer[index1];
        const tempImag = buffer[index1 + 1];
        buffer[index1] = buffer[index2];
        buffer[index1 + 1] = buffer[index2 + 1];
        buffer[index2] = tempReal;
        buffer[index2 + 1] = tempImag;
      }
    }
    // Iterative Cooley–Tukey FFT.
    for (let size = 2; size <= N; size *= 2) {
      const halfSize = size / 2;
      const angle = -2 * Math.PI / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const re = Math.cos(angle * j);
          const im = Math.sin(angle * j);
          const evenIndex = i + j;
          const oddIndex = i + j + halfSize;
          const evenReal = buffer[2 * evenIndex];
          const evenImag = buffer[2 * evenIndex + 1];
          const oddReal = buffer[2 * oddIndex];
          const oddImag = buffer[2 * oddIndex + 1];
          const tempReal = oddReal * re - oddImag * im;
          const tempImag = oddReal * im + oddImag * re;
          buffer[2 * evenIndex] = evenReal + tempReal;
          buffer[2 * evenIndex + 1] = evenImag + tempImag;
          buffer[2 * oddIndex] = evenReal - tempReal;
          buffer[2 * oddIndex + 1] = evenImag - tempImag;
        }
      }
    }
  }

  private reverseBits(x: number, bits: number): number {
    let result = 0;
    for (let i = 0; i < bits; i++) {
      result = (result << 1) | (x & 1);
      x >>= 1;
    }
    return result;
  }

  private inverseFFT(buffer: Float32Array) {
    const N = buffer.length / 2;
    // Conjugate.
    for (let i = 0; i < buffer.length; i += 2) {
      buffer[i + 1] = -buffer[i + 1];
    }
    this.forwardFFT(buffer);
    // Conjugate again and scale.
    for (let i = 0; i < buffer.length; i += 2) {
      buffer[i + 1] = -buffer[i + 1];
      buffer[i] /= N;
      buffer[i + 1] /= N;
    }
  }

  async createAudioElement(blob: Blob): Promise<HTMLAudioElement> {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url);
    });
    return audio;
  }

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const length = buffer.length * buffer.numberOfChannels * 2;
    const view = new DataView(new ArrayBuffer(44 + length));
    // Write WAV header.
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, buffer.numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
    view.setUint16(32, buffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);
    // Write audio samples.
    const data = new Float32Array(buffer.length * buffer.numberOfChannels);
    let offset = 44;
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      data.set(buffer.getChannelData(i), buffer.length * i);
    }
    for (let i = 0; i < data.length; i++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
