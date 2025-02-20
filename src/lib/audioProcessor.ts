
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
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
    
    // Debug: Log original audio stats
    const originalChannel = audioBuffer.getChannelData(0);
    console.log('Original Audio Stats:', {
      length: originalChannel.length,
      max: Math.max(...originalChannel),
      min: Math.min(...originalChannel),
      rms: Math.sqrt(originalChannel.reduce((acc, val) => acc + val * val, 0) / originalChannel.length)
    });

    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    // First source node for input buffer
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    // Create gain node to control output volume
    const gainNode = offlineContext.createGain();
    gainNode.gain.value = 1.0;

    const analyser = offlineContext.createAnalyser();
    analyser.fftSize = 2048;
    
    // Change the signal flow to include gain node
    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(offlineContext.destination);

    // Create output buffer
    const outputBuffer = offlineContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    // Process each channel
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      const inputData = audioBuffer.getChannelData(channel);
      
      // Debug: Log channel stats
      console.log(`Channel ${channel} Stats:`, {
        length: inputData.length,
        max: Math.max(...inputData),
        min: Math.min(...inputData),
        rms: Math.sqrt(inputData.reduce((acc, val) => acc + val * val, 0) / inputData.length)
      });
      
      // Process in chunks to avoid large FFT computations
      const chunkSize = 2048;
      for (let i = 0; i < inputData.length; i += chunkSize) {
        const chunk = new Float32Array(chunkSize);
        const end = Math.min(i + chunkSize, inputData.length);
        chunk.set(inputData.slice(i, end));

        // Debug: Log chunk stats before FFT
        if (i === 0) {
          console.log('First Chunk Before FFT:', {
            max: Math.max(...chunk),
            min: Math.min(...chunk),
            rms: Math.sqrt(chunk.reduce((acc, val) => acc + val * val, 0) / chunk.length)
          });
        }

        const fft = new Float32Array(chunk);
        this.forwardFFT(fft);

        // Debug: Log FFT stats
        if (i === 0) {
          console.log('First Chunk After FFT:', {
            max: Math.max(...fft),
            min: Math.min(...fft),
            rms: Math.sqrt(fft.reduce((acc, val) => acc + val * val, 0) / fft.length)
          });
        }

        // Apply effects only if settings are enabled
        for (let j = 0; j < fft.length / 2; j++) {
          const real = fft[2 * j];
          const imag = fft[2 * j + 1];
          let magnitude = Math.sqrt(real * real + imag * imag);
          let phase = Math.atan2(imag, real);

          if (settings.useFrequencyScrambling || 
              settings.useAdditionalPhaseDistortion || 
              settings.useTimeDistortion) {
            
            // Phase inversion with configurable intensity
            phase = -phase * settings.phaseMultiplier + Math.PI / 2;
            
            // Frequency shifting
            const freqShift = (j / (fft.length / 2)) * 2 * Math.PI;
            phase += freqShift * settings.frequencyShiftMultiplier;
            
            // Harmonic distortion and noise
            magnitude *= (
              1 + Math.sin(j * settings.harmonicAmount) +
              Math.cos(j * settings.harmonicAmount) +
              (Math.random() * settings.noiseAmount)
            );

            if (settings.useFrequencyScrambling) {
              const targetBin = (j + Math.floor(j * 0.5)) % (fft.length / 2);
              fft[2 * targetBin] = magnitude * Math.cos(phase);
              fft[2 * targetBin + 1] = magnitude * Math.sin(phase);
            } else {
              fft[2 * j] = magnitude * Math.cos(phase);
              fft[2 * j + 1] = magnitude * Math.sin(phase);
            }

            if (settings.useAdditionalPhaseDistortion && j % 2 === 0) {
              fft[2 * j] *= -1;
              fft[2 * j + 1] *= -1;
            }
          } else {
            // If no effects are enabled, preserve original signal
            fft[2 * j] = real;
            fft[2 * j + 1] = imag;
          }
        }

        // Debug: Log FFT stats after effects
        if (i === 0) {
          console.log('First Chunk After Effects:', {
            max: Math.max(...fft),
            min: Math.min(...fft),
            rms: Math.sqrt(fft.reduce((acc, val) => acc + val * val, 0) / fft.length)
          });
        }

        this.inverseFFT(fft);

        // Debug: Log chunk stats after inverse FFT
        if (i === 0) {
          console.log('First Chunk After Inverse FFT:', {
            max: Math.max(...fft),
            min: Math.min(...fft),
            rms: Math.sqrt(fft.reduce((acc, val) => acc + val * val, 0) / fft.length)
          });
        }

        // Apply time domain effects and copy to output
        for (let j = 0; j < end - i; j++) {
          let sample = fft[j] / fft.length; // Normalize after inverse FFT
          
          if (settings.useTimeDistortion) {
            sample = Math.tanh(sample * settings.timeDistortionAmount);
          }
          
          outputData[i + j] = sample;
        }

        // Debug: Log output chunk stats
        if (i === 0) {
          console.log('First Output Chunk:', {
            max: Math.max(...outputData.slice(0, end - i)),
            min: Math.min(...outputData.slice(0, end - i)),
            rms: Math.sqrt(outputData.slice(0, end - i).reduce((acc, val) => acc + val * val, 0) / (end - i))
          });
        }
      }
    }

    // Create a new source node for the processed buffer
    const processedSource = offlineContext.createBufferSource();
    processedSource.buffer = outputBuffer;
    processedSource.connect(offlineContext.destination);
    processedSource.start();

    const renderedBuffer = await offlineContext.startRendering();

    // Debug: Log final output stats
    const finalChannel = renderedBuffer.getChannelData(0);
    console.log('Final Output Stats:', {
      length: finalChannel.length,
      max: Math.max(...finalChannel),
      min: Math.min(...finalChannel),
      rms: Math.sqrt(finalChannel.reduce((acc, val) => acc + val * val, 0) / finalChannel.length)
    });

    const wavBlob = this.audioBufferToWav(renderedBuffer);
    return wavBlob;
  }

  private forwardFFT(buffer: Float32Array) {
    const n = buffer.length;
    
    // Base case: arrays of length 1 are already transformed
    if (n <= 1) return;

    // Separate even and odd elements
    const even = new Float32Array(n / 2);
    const odd = new Float32Array(n / 2);
    
    for (let i = 0; i < n / 2; i++) {
      even[i] = buffer[i * 2];
      odd[i] = buffer[i * 2 + 1];
    }

    // Recursive calls
    this.forwardFFT(even);
    this.forwardFFT(odd);

    // Combine results
    for (let k = 0; k < n / 2; k++) {
      const kth = -2 * Math.PI * k / n;
      const wk = {
        re: Math.cos(kth),
        im: Math.sin(kth)
      };

      const p = even[k];
      const q = wk.re * odd[k] - wk.im * odd[k];

      buffer[k] = p + q;
      buffer[k + n/2] = p - q;
    }
  }

  private inverseFFT(buffer: Float32Array) {
    // Conjugate the complex numbers
    for (let i = 0; i < buffer.length; i += 2) {
      buffer[i + 1] = -buffer[i + 1];
    }

    // Forward FFT
    this.forwardFFT(buffer);

    // Conjugate the complex numbers again and scale
    for (let i = 0; i < buffer.length; i += 2) {
      buffer[i + 1] = -buffer[i + 1];
      buffer[i] /= buffer.length;
      buffer[i + 1] /= buffer.length;
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
