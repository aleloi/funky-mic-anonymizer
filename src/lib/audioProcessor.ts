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

  async anonymizeAudio(audioBlob: Blob): Promise<Blob> {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
    
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    const analyser = offlineContext.createAnalyser();
    analyser.fftSize = 2048;
    
    const scriptNode = offlineContext.createScriptProcessor(2048, 1, 1);
    
    source.connect(analyser);
    analyser.connect(scriptNode);
    scriptNode.connect(offlineContext.destination);

    const timeData = new Float32Array(analyser.fftSize);
    
    scriptNode.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const outputBuffer = audioProcessingEvent.outputBuffer;

      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);

        analyser.getFloatTimeDomainData(timeData);
        
        const fft = new Float32Array(timeData);
        this.forwardFFT(fft);

        // MUCH more aggressive frequency manipulation
        for (let i = 0; i < fft.length / 2; i++) {
          const real = fft[2 * i];
          const imag = fft[2 * i + 1];
          const magnitude = Math.sqrt(real * real + imag * imag);
          const phase = Math.atan2(imag, real);

          // Multiple frequency shifts and inversions
          const newPhase = -phase * 3 + Math.PI / 2;
          
          // Extreme frequency shifting
          const freqShift = (i / (fft.length / 2)) * 2 * Math.PI;
          const shiftedPhase = newPhase + freqShift * 5;
          
          // Non-linear magnitude scaling
          const newMagnitude = magnitude * (
            1 + Math.sin(i * 0.2) + // Add harmonics
            Math.cos(i * 0.3) + // More harmonics
            Math.random() * 0.5 // Add noise
          );

          // Frequency scrambling
          const targetBin = (i + Math.floor(i * 0.5)) % (fft.length / 2);
          fft[2 * targetBin] = newMagnitude * Math.cos(shiftedPhase);
          fft[2 * targetBin + 1] = newMagnitude * Math.sin(shiftedPhase);

          // Additional phase distortion
          if (i % 2 === 0) {
            fft[2 * i] *= -1;
            fft[2 * i + 1] *= -1;
          }
        }

        this.inverseFFT(fft);

        // Add some time-domain distortion as well
        for (let i = 0; i < outputData.length; i++) {
          const sample = fft[i] / analyser.fftSize;
          // Waveshaping distortion
          outputData[i] = Math.tanh(sample * 3) * 0.8;
        }
      }
    };

    source.start();

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = this.audioBufferToWav(renderedBuffer);
    
    return wavBlob;
  }

  // Fast Fourier Transform implementation
  private forwardFFT(buffer: Float32Array) {
    const n = buffer.length;
    if (n <= 1) return buffer;

    const halfN = n / 2;
    
    // Separate even and odd elements
    const even = new Float32Array(halfN);
    const odd = new Float32Array(halfN);
    for (let i = 0; i < halfN; i++) {
      even[i] = buffer[2 * i];
      odd[i] = buffer[2 * i + 1];
    }

    // Recursively compute FFT
    this.forwardFFT(even);
    this.forwardFFT(odd);

    // Combine results
    for (let k = 0; k < halfN; k++) {
      const theta = -2 * Math.PI * k / n;
      const re = Math.cos(theta);
      const im = Math.sin(theta);
      
      const evenK = even[k];
      const oddK = odd[k];
      
      buffer[k] = evenK + (re * oddK - im * oddK);
      buffer[k + halfN] = evenK - (re * oddK - im * oddK);
    }
  }

  private inverseFFT(buffer: Float32Array) {
    // Conjugate the complex numbers
    for (let i = 0; i < buffer.length; i += 2) {
      buffer[i + 1] = -buffer[i + 1];
    }

    // Forward FFT
    this.forwardFFT(buffer);

    // Conjugate the complex numbers again
    for (let i = 0; i < buffer.length; i += 2) {
      buffer[i + 1] = -buffer[i + 1];
    }

    // Scale the numbers
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] /= buffer.length;
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

    // Write WAV header
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

    // Write audio data
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
